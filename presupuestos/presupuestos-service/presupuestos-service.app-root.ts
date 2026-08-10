import { randomUUID } from 'node:crypto';
import dns from 'node:dns';
import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { cargarVariablesEntornoLocal } from './entorno-local.js';
import { logger } from './logger.service.js';
import { PresupuestosService, ErrorDeNegocio } from './presupuestos-service.js';
import { UsuarioModel, conectarUsuarios, migrarNombresNormalizados, asegurarIndiceNombreNormalizado } from './usuario.model.js';
import { configurarVapid, enviarNotificacion } from './push.service.js';
import type { PushSub } from './push.service.js';
import { limitadorGeneral, limitadorAuth } from './rate-limit.middleware.js';
import { crearRouterIA } from './ia-rutas.js';
import { validar } from './validacion.middleware.js';
import { hashPassword, verificarPassword, verificarPasswordLegado } from './password.service.js';
import { firmarAccessToken, verificarAccessToken } from './token.service.js';
import { crearRefreshToken, rotarRefreshToken, revocarRefreshToken, revocarTodosDeUsuario } from './refresh-token.model.js';
import {
  esquemaLogin,
  esquemaRegistro,
  esquemaVerificarSesion,
  esquemaCambiarEstadoUsuario,
  esquemaCliente,
  esquemaFactura,
  esquemaEmpresa,
  esquemaPushSubscribe,
  esquemaPaginacionClientes,
  esquemaPaginacionFacturas,
  esquemaProveedor,
  esquemaProducto,
  esquemaNotaMC,
  esquemaPresupuestoMC,
  esquemaDibujo,
  esquemaCarpeta,
  esquemaRenombrarCarpeta,
} from './esquemas-validacion.js';

// Debe ejecutarse antes de leer cualquier process.env.* de este módulo —
// ver entorno-local.ts para la explicación completa (sin efecto en producción).
cargarVariablesEntornoLocal();

/**
 * Fuerza servidores DNS públicos y fiables antes de cualquier conexión a
 * MongoDB (Fase "Integración completa"). Causa raíz diagnosticada: en
 * algunos entornos, el resolutor DNS que Node toma por defecto del sistema
 * apunta a `127.0.0.1` sin nada escuchando ahí, lo que hace fallar la
 * resolución del registro SRV de MongoDB Atlas (`querySrv ECONNREFUSED`)
 * — no es un problema de MongoDB, Bit ni del código de la app, sino de qué
 * servidor DNS coge Node según el entorno. Fijarlo explícitamente hace que
 * la app no dependa de esa configuración externa, en cualquier entorno.
 */
dns.setServers(['1.1.1.1', '1.0.0.1']);

// ── Credenciales del admin maestro ────────────────────────────────────────────
// Se leen exclusivamente de variables de entorno — nunca se escriben en el código.
// Configúralas en el archivo .env (ver env.example) o en el panel de tu proveedor.
const USUARIO    = process.env.APP_USER || '';
const CONTRASENA = process.env.APP_PASSWORD || '';

if (!USUARIO || !CONTRASENA) {
  logger.warn('[auth] Faltan APP_USER y/o APP_PASSWORD. El admin maestro no podrá iniciar sesión hasta configurarlas.');
}

// ── CORS ──────────────────────────────────────────────────────────────────────
// Lista de orígenes explícitamente permitidos, en vez de reflejar cualquier
// origen (que es lo que hacía `cors({ origin: true })`). En producción,
// ALLOWED_ORIGINS es obligatoria: sin ella no se permite ningún origen.
// En desarrollo, si no está configurada, se permite cualquier puerto de
// localhost (el rango de puertos 3000-3100 que asigna la plataforma Bit).
const ORIGENES_PERMITIDOS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const LOCALHOST_DEV = /^http:\/\/localhost:\d+$/;

function origenPermitido(origen: string | undefined): boolean {
  if (!origen) return true; // peticiones sin cabecera Origin (same-origin, curl, health checks)
  if (ORIGENES_PERMITIDOS.includes(origen)) return true;
  // El acceso a localhost en desarrollo se comprueba siempre, no solo
  // cuando ALLOWED_ORIGINS está vacía — así se puede añadir un origen
  // adicional (p. ej. un túnel HTTPS para probar en el móvil,
  // Instalación móvil) sin perder el acceso normal desde el propio
  // ordenador de desarrollo.
  if (process.env.NODE_ENV !== 'production' && LOCALHOST_DEV.test(origen)) return true;
  return false;
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function generarId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Extiende Request con el usuarioId autenticado y el requestId de la
 * petición (ver `middlewareLogPeticion`). Exportado para que el router de IA
 * (`ia-rutas.ts`, Fase 3) pueda tipar sus propios handlers sin duplicar el
 * tipo — es el único consumidor fuera de este archivo.
 */
export type AuthRequest = express.Request & { usuarioId?: string; requestId?: string };

/**
 * Registra un error no controlado con el contexto necesario para
 * diagnosticarlo (requestId, ruta, método, usuario) y responde al cliente
 * con un mensaje genérico — el detalle completo del error queda solo en el
 * log estructurado, nunca en la respuesta HTTP (Incremento 1.4). Exportada
 * para que el router de IA (`ia-rutas.ts`, Fase 3) reutilice el mismo
 * manejo de errores que el resto de la API, en vez de duplicarlo.
 */
export function responderError(req: AuthRequest, res: express.Response, err: unknown): void {
  if (err instanceof ErrorDeNegocio) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  logger.error(
    { err, requestId: req.requestId, metodo: req.method, ruta: req.originalUrl, usuarioId: req.usuarioId },
    'Error no controlado en la petición'
  );
  res.status(500).json({ error: 'Error de servidor. Inténtalo de nuevo más tarde.' });
}

/**
 * Adjunta un requestId único a cada petición y registra método, ruta,
 * código HTTP, duración y usuario autenticado (si lo hay) al terminar.
 * Nunca registra contraseñas, tokens, cookies ni cabeceras de autorización
 * (ver también el `redact` de `logger.service.ts`, como defensa adicional).
 */
function middlewareLogPeticion(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const r = req as AuthRequest;
  r.requestId = randomUUID();
  const inicio = Date.now();
  res.on('finish', () => {
    logger.info({
      requestId: r.requestId,
      metodo: r.method,
      ruta: r.originalUrl,
      status: res.statusCode,
      duracionMs: Date.now() - inicio,
      usuarioId: r.usuarioId,
    }, 'Petición HTTP');
  });
  next();
}

/**
 * Opciones de la cookie del refresh token. `path: '/'` a propósito: el
 * navegador solo ve rutas bajo el prefijo `/api/<servicio>/...` (o el que
 * imponga el proxy de turno), que no coincide con las rutas internas del
 * servicio (`/auth/...`) — fijar el Path a la ruta interna haría que el
 * navegador nunca reenviara la cookie. `path: '/'` evita ese desajuste en
 * cualquier capa de proxy, presente o futura.
 */
function opcionesCookieRefresh(maxAgeMs?: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

const REFRESH_TTL_MS = (Number(process.env.REFRESH_TOKEN_TTL_DIAS) || 30) * 24 * 60 * 60 * 1000;

/**
 * Middleware de autenticación: valida el access token (JWT firmado) y
 * adjunta req.usuarioId. Los datos de cada usuario están completamente
 * aislados por usuarioId.
 */
export async function requireAuth(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'No autorizado' }); return; }
  const token = auth.slice(7);

  const payload = verificarAccessToken(token);
  if (!payload) { res.status(401).json({ error: 'Token inválido' }); return; }
  const usuarioId = payload.sub;
  if (usuarioId === 'admin') { req.usuarioId = 'admin'; next(); return; }
  try {
    await conectarUsuarios();
    const u = await UsuarioModel.findOne({ id: usuarioId }).lean().exec() as any;
    if (!u || u.estado !== 'activo') { res.status(403).json({ error: 'Acceso denegado' }); return; }
    req.usuarioId = usuarioId;
    next();
  } catch (err) { responderError(req, res, err); }
}

/**
 * Middleware de autorización: exige que `requireAuth` ya haya identificado
 * al admin (`req.usuarioId === 'admin'`). Debe usarse siempre después de
 * `requireAuth`, nunca solo. Sin esto, cualquier cuenta activa —no solo la
 * del administrador— podía llamar a las rutas `/admin/*`.
 */
export function requireAdmin(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (req.usuarioId !== 'admin') { res.status(403).json({ error: 'Requiere permisos de administrador' }); return; }
  next();
}

/** Suscripciones push del administrador. */
async function getPushSubsAdmin(): Promise<PushSub[]> {
  await conectarUsuarios();
  const admin = await UsuarioModel.findOne({ esAdmin: true }).lean().exec() as any;
  return (admin?.pushSubs || []) as PushSub[];
}

/** Notifica al admin cuando un nuevo usuario se registra. */
async function notificarAdminNuevoUsuario(nombre: string): Promise<void> {
  const subs = await getPushSubsAdmin();
  for (const sub of subs) {
    await enviarNotificacion(
      sub,
      'Nuevo usuario pendiente',
      nombre + ' quiere acceder a la app. Entra para aprobar o rechazar.',
      { tipo: 'nuevo-usuario', nombre }
    );
  }
}

/** Asegura que el usuario admin existe en la DB al arrancar. */
async function asegurarAdmin(): Promise<void> {
  await conectarUsuarios();
  const existe = await UsuarioModel.findOne({ esAdmin: true }).lean().exec();
  if (!existe) {
    await UsuarioModel.create({
      id: 'admin',
      nombre: USUARIO,
      nombreNormalizado: USUARIO.toLowerCase(),
      passwordHash: await hashPassword(CONTRASENA),
      hashAlgo: 'bcrypt',
      estado: 'activo',
      esAdmin: true,
      creadoEn: new Date().toISOString(),
    });
    logger.info('Admin creado en DB');
  }
}

/**
 * Migra documentos históricos (sin usuarioId) asignándolos al admin.
 * Se ejecuta al arrancar y solo toca registros que no tienen usuarioId.
 */
async function migrarDatosAdmin(): Promise<void> {
  try {
    const { ClienteModel, EmpresaModel, FacturaModel, conectar } = await import('./cliente.model.js');
    await conectar();
    const [c, e, f] = await Promise.all([
      ClienteModel.updateMany({ usuarioId: { $exists: false } }, { $set: { usuarioId: 'admin' } }),
      EmpresaModel.updateMany({ usuarioId: { $exists: false } }, { $set: { usuarioId: 'admin' } }),
      FacturaModel.updateMany({ usuarioId: { $exists: false } }, { $set: { usuarioId: 'admin' } }),
    ]);
    const total = (c?.modifiedCount || 0) + (e?.modifiedCount || 0) + (f?.modifiedCount || 0);
    if (total > 0) {
      logger.info(
        { clientes: c?.modifiedCount, facturas: f?.modifiedCount, empresa: e?.modifiedCount },
        'Migración admin de datos históricos'
      );
    }
  } catch (err) {
    logger.warn({ err }, 'Migración datos admin');
  }
}

// ── Servidor Express ──────────────────────────────────────────────────────────

/**
 * Arranca el servidor Express con la API REST de presupuestos.
 * Todos los datos (clientes, facturas, empresa) están aislados por usuarioId.
 */
export function run() {
  const app = express();
  const svc = PresupuestosService.from();
  const port = process.env.PORT || 3000;

  configurarVapid();
  asegurarAdmin()
    .then(migrarNombresNormalizados)
    .then(asegurarIndiceNombreNormalizado)
    .catch((err) => logger.error({ err }, 'Error inicializando admin / migrando nombres normalizados'));
  migrarDatosAdmin().catch((err) => logger.error({ err }, 'Error en migración de datos admin'));

  app.use(middlewareLogPeticion);
  app.use(helmet());
  app.use(cors({
    origin: (origen, callback) => {
      if (origenPermitido(origen)) { callback(null, true); return; }
      callback(new Error('Origen no permitido por CORS: ' + origen));
    },
    credentials: true,
  }));
  app.use(limitadorGeneral);
  app.use(express.json({ limit: '25mb' }));
  app.use(cookieParser());
  // Limitador estricto para toda la superficie de autenticación: frena
  // fuerza bruta y credential stuffing sin afectar el uso normal. Debe
  // registrarse antes que cualquier ruta /auth/*, incluida /auth/yo.
  //
  // DESACTIVADO temporalmente (fase "Integración completa", a petición
  // explícita del usuario): mientras se está probando y desarrollando en
  // local, este límite compartido de 10 peticiones/15min entre login,
  // refresh, logout y verificar-licencia bloqueaba el acceso normal.
  // Reactivar (quitar el comentario de la línea siguiente) antes de
  // exponer la aplicación fuera del entorno de desarrollo/pruebas.
  // app.use('/auth', limitadorAuth);

  // ── Salud ──
  /**
   * Comprueba también la conexión a MongoDB (Incremento 1.6) — antes
   * devolvía `ok: true` de forma incondicional, así que un monitor de
   * uptime no habría detectado una base de datos caída mientras el
   * proceso Node siguiera vivo.
   */
  app.get('/', (_req, res) => {
    const dbConectada = mongoose.connection.readyState === 1;
    res.status(dbConectada ? 200 : 503).json({
      ok: dbConectada,
      service: 'presupuestos',
      db: dbConectada ? 'conectada' : 'desconectada',
    });
  });

  /**
   * Comprueba si el token guardado en el cliente es válido.
   * El frontend llama a esto al arrancar para detectar sesiones con token antiguo.
   */
  app.get('/auth/yo', requireAuth, (req: AuthRequest, res) => {
    res.json({ ok: true, usuarioId: req.usuarioId });
  });

  // ── Push ──

  /** Devuelve la clave pública VAPID. */
  app.get('/push/vapid-public-key', (_req, res) => {
    res.json({ key: (process.env.VAPID_PUBLIC_KEY || '').trim() });
  });

  /** Registra una suscripción push para un usuario. */
  app.post('/push/subscribe', validar(esquemaPushSubscribe), async (req, res) => {
    try {
      const { usuarioId, subscription } = req.body;
      await conectarUsuarios();
      const u = await UsuarioModel.findOne({ id: usuarioId }).exec();
      if (!u) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }
      const yaExiste = (u.pushSubs || []).some((s: any) => s.endpoint === subscription.endpoint);
      if (!yaExiste) {
        u.pushSubs = [...(u.pushSubs || []), subscription];
        await u.save();
      }
      res.json({ ok: true });
    } catch (err) { responderError(req, res, err); }
  });

  // ── Auth ──

  /** Registro de nuevo usuario (queda en estado pendiente hasta que el admin apruebe). */
  app.post('/auth/registrar', validar(esquemaRegistro), async (req: AuthRequest, res) => {
    try {
      await conectarUsuarios();
      const { nombre, password } = req.body;
      const nombreNormalizado = nombre.toLowerCase();
      const existe = await UsuarioModel.findOne({ nombreNormalizado }).lean().exec();
      if (existe) { res.status(409).json({ error: 'Ese email ya está registrado.' }); return; }
      const nuevo = await UsuarioModel.create({
        id: generarId(),
        nombre,
        nombreNormalizado,
        passwordHash: await hashPassword(password),
        hashAlgo: 'bcrypt',
        estado: 'pendiente',
        esAdmin: false,
        creadoEn: new Date().toISOString(),
      });
      notificarAdminNuevoUsuario(nombre).catch((err) => logger.error({ err, requestId: req.requestId }, 'Error notificando al admin de nuevo usuario'));
      res.json({ ok: true, id: nuevo.id, estado: 'pendiente' });
    } catch (err) { responderError(req, res, err); }
  });

  /** Login — devuelve token único por usuario. */
  app.post('/auth/login', validar(esquemaLogin), async (req, res) => {
    try {
      await conectarUsuarios();
      const { nombre, password } = req.body;
      const u = await UsuarioModel.findOne({ nombreNormalizado: nombre.toLowerCase() }).lean().exec() as any;
      if (!u) { res.status(401).json({ error: 'Usuario o contraseña incorrectos.' }); return; }

      let credencialesValidas: boolean;
      if (u.hashAlgo === 'bcrypt') {
        credencialesValidas = await verificarPassword(password, u.passwordHash);
      } else {
        // Cuenta creada antes de la migración a bcrypt: se verifica con el
        // algoritmo legado y, si es correcta, se re-hashea de forma
        // transparente — sin pedir al usuario que cambie su contraseña.
        credencialesValidas = verificarPasswordLegado(password, u.passwordHash);
        if (credencialesValidas) {
          const passwordHash = await hashPassword(password);
          await UsuarioModel.updateOne({ id: u.id }, { passwordHash, hashAlgo: 'bcrypt' });
        }
      }
      if (!credencialesValidas) {
        res.status(401).json({ error: 'Usuario o contraseña incorrectos.' }); return;
      }
      if (u.estado === 'pendiente') {
        res.status(403).json({ error: 'pendiente', mensaje: 'Tu cuenta está pendiente de aprobación. Recibirás acceso en breve.' }); return;
      }
      if (u.estado === 'suspendido') {
        res.status(403).json({ error: 'suspendido', mensaje: 'Tu acceso ha sido suspendido. Contacta con Madera Creativa.' }); return;
      }
      await UsuarioModel.updateOne({ id: u.id }, { ultimoAcceso: new Date().toISOString() });

      const accessToken = firmarAccessToken({ sub: u.id, esAdmin: u.esAdmin });
      const refreshToken = await crearRefreshToken(u.id);
      res.cookie('mc_refresh', refreshToken, opcionesCookieRefresh(REFRESH_TTL_MS));
      res.json({ ok: true, id: u.id, nombre: u.nombre, esAdmin: u.esAdmin, estado: u.estado, accessToken });
    } catch (err) { responderError(req, res, err); }
  });

  /**
   * Renueva la sesión: rota el refresh token de la cookie `mc_refresh` y
   * devuelve un access token nuevo. El frontend lo llama automáticamente
   * cuando una petición autenticada recibe 401 (ver `fetchConAuth` en
   * `presupuestos-prototype/api.ts`) y al arrancar la app para restaurar
   * la sesión sin pedir credenciales de nuevo.
   */
  app.post('/auth/refresh', async (req, res) => {
    try {
      const tokenPlano = req.cookies?.mc_refresh as string | undefined;
      if (!tokenPlano) { res.status(401).json({ error: 'Sin sesión' }); return; }

      const rotado = await rotarRefreshToken(tokenPlano);
      if (!rotado) {
        res.clearCookie('mc_refresh', opcionesCookieRefresh());
        res.status(401).json({ error: 'Sesión caducada' });
        return;
      }

      await conectarUsuarios();
      const u = await UsuarioModel.findOne({ id: rotado.usuarioId }).lean().exec() as any;
      if (!u || u.estado !== 'activo') {
        res.clearCookie('mc_refresh', opcionesCookieRefresh());
        res.status(403).json({ error: 'Acceso denegado' });
        return;
      }

      res.cookie('mc_refresh', rotado.nuevoToken, opcionesCookieRefresh(REFRESH_TTL_MS));
      const accessToken = firmarAccessToken({ sub: u.id, esAdmin: u.esAdmin });
      res.json({ ok: true, accessToken });
    } catch (err) { responderError(req, res, err); }
  });

  /**
   * Cierra sesión revocando el refresh token — a diferencia del esquema
   * Base64 anterior, esto sí invalida la sesión de verdad en el servidor.
   */
  app.post('/auth/logout', async (req, res) => {
    try {
      const tokenPlano = req.cookies?.mc_refresh as string | undefined;
      if (tokenPlano) await revocarRefreshToken(tokenPlano);
      res.clearCookie('mc_refresh', opcionesCookieRefresh());
      res.json({ ok: true });
    } catch (err) { responderError(req, res, err); }
  });

  /** Verifica si una sesión sigue activa. */
  app.post('/auth/verificar', validar(esquemaVerificarSesion), async (req, res) => {
    try {
      await conectarUsuarios();
      const { usuarioId } = req.body;
      const u = await UsuarioModel.findOne({ id: usuarioId }).lean().exec() as any;
      if (!u) { res.status(404).json({ activo: false }); return; }
      res.json({ activo: u.estado === 'activo', estado: u.estado });
    } catch (err) { responderError(req, res, err); }
  });

  // ── Admin ──

  /** Lista todos los usuarios (solo admin). */
  app.get('/admin/usuarios', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      await conectarUsuarios();
      const usuarios = await UsuarioModel.find().lean().exec();
      res.json((usuarios as any[]).map((u) => ({
        id: u.id, nombre: u.nombre, email: u.nombre,
        estado: u.estado, esAdmin: u.esAdmin,
        creadoEn: u.creadoEn, ultimoAcceso: u.ultimoAcceso,
      })));
    } catch (err) { responderError(req, res, err); }
  });

  /** Cambia el estado de un usuario (solo admin). */
  app.put('/admin/usuarios/:id/estado', requireAuth, requireAdmin, validar(esquemaCambiarEstadoUsuario), async (req, res) => {
    try {
      await conectarUsuarios();
      const { estado } = req.body;
      const u = await UsuarioModel.findOneAndUpdate({ id: req.params.id }, { estado }, { new: true }).lean().exec() as any;
      if (!u) { res.status(404).json({ error: 'No encontrado' }); return; }
      if (estado === 'suspendido') {
        // Invalida la sesión de verdad: sin refresh token válido, el
        // access token deja de poder renovarse en cuanto caduque (máx. 15 min).
        await revocarTodosDeUsuario(u.id);
      }
      if (estado === 'activo' && (u.pushSubs || []).length) {
        for (const sub of u.pushSubs as PushSub[]) {
          await enviarNotificacion(sub, 'Acceso aprobado', 'Ya puedes entrar a la app.', { tipo: 'acceso-aprobado' });
        }
      }
      res.json({ ok: true, id: u.id, estado: u.estado });
    } catch (err) { responderError(req, res, err); }
  });

  /** Elimina un usuario (solo admin). */
  app.delete('/admin/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      await conectarUsuarios();
      await UsuarioModel.deleteOne({ id: req.params.id, esAdmin: false });
      await revocarTodosDeUsuario(req.params.id);
      res.json({ ok: true });
    } catch (err) { responderError(req, res, err); }
  });

  // ── Clientes — aislados por usuarioId ──

  /**
   * Lista clientes paginada (Incremento 1.5). Registrada antes de
   * `/clientes/nombres` y `/clientes/:id` no aplica aquí porque no colisiona
   * con ellas, pero mantenemos el orden explícito: rutas específicas antes
   * de rutas con parámetro.
   */
  app.get('/clientes', requireAuth, validar(esquemaPaginacionClientes, 'query'), async (req: AuthRequest, res) => {
    try {
      const { pagina, limite } = req.query as unknown as { pagina: number; limite: number };
      const { items, total } = await svc.listarClientes(req.usuarioId!, { pagina, limite });
      const slim = items.map((c: any) => ({
        ...c,
        adjuntos: (c.adjuntos || []).map(({ url: _url, ...rest }: any) => rest),
      }));
      res.json({ items: slim, pagina, limite, total, totalPaginas: Math.max(1, Math.ceil(total / limite)) });
    } catch (err) { responderError(req, res, err); }
  });

  /**
   * Solo `id`+`nombre` de todos los clientes, sin paginar — para selectores
   * (p. ej. el desplegable de cliente al crear una factura), que necesitan
   * poder referenciar cualquier cliente, no solo los de la página cargada.
   * Debe registrarse antes de `/clientes/:id` para no colisionar con él.
   */
  app.get('/clientes/nombres', requireAuth, async (req: AuthRequest, res) => {
    try {
      res.json(await svc.listarClientesNombres(req.usuarioId!));
    } catch (err) { responderError(req, res, err); }
  });

  /**
   * Resumen ligero (sin fotos/adjuntos/dibujos) de todos los clientes, sin
   * paginar — para vistas que necesitan organizar el conjunto completo
   * (p. ej. `SeccionPresupuestos`, por año y carpeta). Debe registrarse
   * antes de `/clientes/:id` para no colisionar con él.
   */
  app.get('/clientes/resumen', requireAuth, async (req: AuthRequest, res) => {
    try {
      res.json(await svc.listarClientesResumen(req.usuarioId!));
    } catch (err) { responderError(req, res, err); }
  });

  app.get('/clientes/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const cliente = await svc.obtenerCliente(req.params.id, req.usuarioId!);
      if (!cliente) { res.status(404).json({ error: 'No encontrado' }); return; }
      res.json(cliente);
    } catch (err) { responderError(req, res, err); }
  });

  // Adjuntos pedidos aparte de la ficha — ver comentario de `obtenerCliente`.
  app.get('/clientes/:id/adjuntos', requireAuth, async (req: AuthRequest, res) => {
    try {
      res.json(await svc.obtenerAdjuntosCliente(req.params.id, req.usuarioId!));
    } catch (err) { responderError(req, res, err); }
  });

  app.put('/clientes/:id', requireAuth, validar(esquemaCliente), async (req: AuthRequest, res) => {
    try {
      const cliente = await svc.guardarCliente({ ...req.body, id: req.params.id }, req.usuarioId!);
      res.json(cliente);
    } catch (err) { responderError(req, res, err); }
  });

  app.delete('/clientes/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      await svc.borrarCliente(req.params.id, req.usuarioId!);
      res.json({ ok: true });
    } catch (err) { responderError(req, res, err); }
  });

  // ── Empresa — una por usuario ──

  app.get('/empresa', requireAuth, async (req: AuthRequest, res) => {
    try { res.json(await svc.obtenerEmpresa(req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.put('/empresa', requireAuth, validar(esquemaEmpresa), async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarEmpresa(req.body, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  // ── Facturas — aisladas por usuarioId ──

  /**
   * Lista facturas paginada, con filtro de tipo opcional resuelto en la
   * consulta (Incremento 1.5). Si se pasa `anio`, se ignoran `pagina`/
   * `limite` y se devuelve el año completo — lo usa `Trimestres`, que
   * necesita el año entero para calcular bien los totales trimestrales.
   */
  app.get('/facturas', requireAuth, validar(esquemaPaginacionFacturas, 'query'), async (req: AuthRequest, res) => {
    try {
      const { pagina, limite, tipo, anio, clienteId, proveedor } = req.query as unknown as {
        pagina: number; limite: number; tipo: 'ingreso' | 'gasto' | 'todas'; anio?: number;
        clienteId?: string; proveedor?: string;
      };
      // clienteId/proveedor/anio devuelven un conjunto completo sin paginar
      // (acotado por diseño: las facturas de un proyecto, de un proveedor o
      // de un año concreto) — se comprueban en este orden porque son usos
      // mutuamente excluyentes en la práctica.
      if (clienteId !== undefined) {
        const items = await svc.listarFacturasDeCliente(req.usuarioId!, clienteId);
        res.json({ items, pagina: 1, limite: items.length, total: items.length, totalPaginas: 1 });
        return;
      }
      if (proveedor !== undefined) {
        const items = await svc.listarFacturasDeProveedor(req.usuarioId!, proveedor);
        res.json({ items, pagina: 1, limite: items.length, total: items.length, totalPaginas: 1 });
        return;
      }
      if (anio !== undefined) {
        const items = await svc.listarFacturasPorAnio(req.usuarioId!, anio);
        res.json({ items, pagina: 1, limite: items.length, total: items.length, totalPaginas: 1 });
        return;
      }
      const { items, total } = await svc.listarFacturas(req.usuarioId!, { pagina, limite, tipo });
      res.json({ items, pagina, limite, total, totalPaginas: Math.max(1, Math.ceil(total / limite)) });
    } catch (err) { responderError(req, res, err); }
  });

  /**
   * Totales de ingresos/gastos/balance calculados en la base de datos
   * (Incremento 1.5) — no depende de qué página esté cargada en el cliente.
   * Debe registrarse antes de `/facturas/:id` para no colisionar con él.
   */
  app.get('/facturas/resumen', requireAuth, async (req: AuthRequest, res) => {
    try {
      res.json(await svc.resumenFacturas(req.usuarioId!));
    } catch (err) { responderError(req, res, err); }
  });

  /**
   * Total gastado y número de facturas por proveedor (texto tal como
   * aparece en cada factura), calculado en la base de datos — antes se
   * sumaba recorriendo todas las facturas en memoria. Debe registrarse
   * antes de `/facturas/:id` para no colisionar con él.
   */
  app.get('/facturas/resumen-proveedores', requireAuth, async (req: AuthRequest, res) => {
    try {
      res.json(await svc.resumenPorProveedorTexto(req.usuarioId!));
    } catch (err) { responderError(req, res, err); }
  });

  /**
   * Años para los que el usuario tiene alguna factura — alimenta el
   * selector de año de `Trimestres`. Debe registrarse antes de
   * `/facturas/:id` para no colisionar con él.
   */
  app.get('/facturas/anios', requireAuth, async (req: AuthRequest, res) => {
    try {
      res.json(await svc.aniosConFacturas(req.usuarioId!));
    } catch (err) { responderError(req, res, err); }
  });

  app.get('/facturas/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const f = await svc.obtenerFactura(req.params.id, req.usuarioId!);
      if (!f) { res.status(404).json({ error: 'No encontrada' }); return; }
      res.json(f);
    } catch (err) { responderError(req, res, err); }
  });

  app.put('/facturas/:id', requireAuth, validar(esquemaFactura), async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarFactura({ ...req.body, id: req.params.id }, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.delete('/facturas/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarFactura(req.params.id, req.usuarioId!); res.json({ ok: true }); }
    catch (err) { responderError(req, res, err); }
  });

  // ── Proveedores — aislados por usuarioId (Fase "Integración completa") ──

  app.get('/proveedores', requireAuth, async (req: AuthRequest, res) => {
    try { res.json(await svc.listarProveedores(req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.put('/proveedores/:id', requireAuth, validar(esquemaProveedor), async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarProveedor({ ...req.body, id: req.params.id }, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.delete('/proveedores/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarProveedor(req.params.id, req.usuarioId!); res.json({ ok: true }); }
    catch (err) { responderError(req, res, err); }
  });

  // ── Notas — aisladas por usuarioId (rediseño del módulo de Notas) ──

  app.get('/notas', requireAuth, async (req: AuthRequest, res) => {
    try { res.json(await svc.listarNotas(req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.put('/notas/:id', requireAuth, validar(esquemaNotaMC), async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarNota({ ...req.body, id: req.params.id }, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.delete('/notas/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarNota(req.params.id, req.usuarioId!); res.json({ ok: true }); }
    catch (err) { responderError(req, res, err); }
  });

  // ── Presupuestos (Fase 5 — copiloto de Presupuestos) — aislados por usuarioId ──

  app.get('/presupuestos', requireAuth, async (req: AuthRequest, res) => {
    try {
      const clienteId = typeof req.query.clienteId === 'string' ? req.query.clienteId : '';
      res.json(
        clienteId
          ? await svc.listarPresupuestosDeCliente(req.usuarioId!, clienteId)
          : await svc.listarPresupuestos(req.usuarioId!)
      );
    } catch (err) { responderError(req, res, err); }
  });

  app.put('/presupuestos/:id', requireAuth, validar(esquemaPresupuestoMC), async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarPresupuesto({ ...req.body, id: req.params.id }, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.delete('/presupuestos/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarPresupuesto(req.params.id, req.usuarioId!); res.json({ ok: true }); }
    catch (err) { responderError(req, res, err); }
  });

  // ── Productos / catálogo — aislados por usuarioId ──

  app.get('/productos', requireAuth, async (req: AuthRequest, res) => {
    try { res.json(await svc.listarProductos(req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.put('/productos/:id', requireAuth, validar(esquemaProducto), async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarProducto({ ...req.body, id: req.params.id }, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.delete('/productos/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarProducto(req.params.id, req.usuarioId!); res.json({ ok: true }); }
    catch (err) { responderError(req, res, err); }
  });

  // ── Dibujos (módulo profesional de dibujo, Fase 2.1) ──
  // Colección propia — ver auditoría: los dibujos ya no viven embebidos en
  // el documento del cliente. `GET /dibujos` es la lista ligera (sin
  // contenido vectorial) que usan la galería y la ficha de cliente;
  // `GET /dibujos/:id` es la única ruta que trae el contenido completo,
  // pedida solo al abrir un dibujo concreto para editar.

  app.get('/dibujos', requireAuth, async (req: AuthRequest, res) => {
    try {
      // `temporales=1` fuerza clienteId a '' (la bandeja de dibujos sin
      // cliente asignado) — distinto de omitir el filtro por completo.
      const clienteId = req.query.temporales === '1' ? '' : (typeof req.query.clienteId === 'string' ? req.query.clienteId : undefined);
      const carpetaId = typeof req.query.carpetaId === 'string' ? req.query.carpetaId : undefined;
      res.json(await svc.listarDibujos(req.usuarioId!, { clienteId, carpetaId }));
    } catch (err) { responderError(req, res, err); }
  });

  app.get('/dibujos/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const dibujo = await svc.obtenerDibujo(req.params.id, req.usuarioId!);
      if (!dibujo) { res.status(404).json({ error: 'Dibujo no encontrado' }); return; }
      res.json(dibujo);
    } catch (err) { responderError(req, res, err); }
  });

  app.put('/dibujos/:id', requireAuth, validar(esquemaDibujo), async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarDibujo({ ...req.body, id: req.params.id }, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.delete('/dibujos/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarDibujo(req.params.id, req.usuarioId!); res.json({ ok: true }); }
    catch (err) { responderError(req, res, err); }
  });

  app.post('/dibujos/:id/duplicar', requireAuth, async (req: AuthRequest, res) => {
    try {
      const copia = await svc.duplicarDibujo(req.params.id, req.usuarioId!);
      if (!copia) { res.status(404).json({ error: 'Dibujo no encontrado' }); return; }
      res.json(copia);
    } catch (err) { responderError(req, res, err); }
  });

  // ── Carpetas de dibujos por cliente (Fase 2.2) ──

  app.get('/carpetas', requireAuth, async (req: AuthRequest, res) => {
    try {
      const clienteId = typeof req.query.clienteId === 'string' ? req.query.clienteId : '';
      if (!clienteId) { res.status(400).json({ error: 'clienteId es obligatorio' }); return; }
      res.json(await svc.listarCarpetas(req.usuarioId!, clienteId));
    } catch (err) { responderError(req, res, err); }
  });

  app.post('/carpetas', requireAuth, validar(esquemaCarpeta), async (req: AuthRequest, res) => {
    try { res.json(await svc.crearCarpeta(req.body, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.put('/carpetas/:id', requireAuth, validar(esquemaRenombrarCarpeta), async (req: AuthRequest, res) => {
    try {
      const carpeta = await svc.renombrarCarpeta(req.params.id, req.body.nombre, req.usuarioId!);
      if (!carpeta) { res.status(404).json({ error: 'Carpeta no encontrada' }); return; }
      res.json(carpeta);
    } catch (err) { responderError(req, res, err); }
  });

  app.delete('/carpetas/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarCarpeta(req.params.id, req.usuarioId!); res.json({ ok: true }); }
    catch (err) { responderError(req, res, err); }
  });

  // ── Núcleo de IA (Fase 3) ──
  // Único punto de entrada de IA de toda la app — ningún otro módulo debe
  // llamar a un proveedor de IA directamente. Sustituye al antiguo
  // `POST /asistente` (fetch crudo a OpenAI, contexto sin acotar, acciones
  // parseadas con una regex) — retirado tras confirmar que el frontend ya
  // usa `POST /ia/generar` (Incremento IA.11).

  // Los límites de peticiones de IA se aplican por ruta dentro de
  // `crearRouterIA()` (Fase 5) — el sondeo asíncrono (`GET /generar/:id`)
  // necesita un budget muy distinto al de disparar una generación real.
  app.use('/ia', requireAuth, crearRouterIA());

  const server = app.listen(port, () => {
    logger.info(`Servicio de presupuestos listo en: http://localhost:${port}`);
  });

  return {
    port,
    stop: async () => {
      server.closeAllConnections();
      server.close();
    },
  };
}
