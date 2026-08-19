import { randomUUID } from 'node:crypto';
import dns from 'node:dns';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { cargarVariablesEntornoLocal } from './entorno-local.js';
import { almacenamiento } from './almacenamiento.service.js';
import { logger } from './logger.service.js';
import { inicializarMotorDocumental } from './documento-motor-inicializar.js';
import { inicializarAutomatizaciones } from './automatizaciones-listener.js';
import { PresupuestosService, ErrorDeNegocio } from './presupuestos-service.js';
import { UsuarioModel, conectarUsuarios, migrarNombresNormalizados, asegurarIndiceNombreNormalizado, ACCESO_POR_DEFECTO, leerPreferenciaNotif } from './usuario.model.js';
import type { AccesoUsuario, EstadoUsuario } from './usuario.model.js';
import { CodigoPromocionalModel, conectarCodigos, canjearCodigo, generarIdCodigo, normalizarCodigo } from './codigo-promocional.model.js';
import { CosteInfraestructuraModel, conectarCostes, generarIdCoste } from './coste-infraestructura.model.js';
import { configurarVapid, enviarNotificacion } from './push.service.js';
import { iniciarRecordatorioHorasDiario } from './recordatorio-horas.service.js';
import { iniciarNotificacionesProgramadas } from './notificaciones-programadas.service.js';
import type { PushSub } from './push.service.js';
import { limitadorGeneral, limitadorAuth } from './rate-limit.middleware.js';
import { crearRouterIA } from './ia-rutas.js';
import { crearRouterWebAuthn } from './webauthn-rutas.js';
import { crearRouterPortal } from './portal-rutas.js';
import { validar } from './validacion.middleware.js';
import { hashPassword, verificarPassword, verificarPasswordLegado } from './password.service.js';
import { firmarAccessToken, verificarAccessToken } from './token.service.js';
import { crearRefreshToken, rotarRefreshToken, revocarRefreshToken, revocarTodosDeUsuario } from './refresh-token.model.js';
import {
  esquemaLogin,
  esquemaRegistro,
  esquemaCambiarEstadoUsuario,
  esquemaCanjearCodigo,
  esquemaCrearCodigo,
  esquemaActualizarCodigo,
  esquemaCambiarAccesoUsuario,
  esquemaCrearCoste,
  esquemaActualizarCoste,
  esquemaPerfil,
  esquemaCambiarAcceso,
  esquemaCliente,
  esquemaFactura,
  esquemaEmpresa,
  esquemaPushSubscribe,
  esquemaPaginacionClientes,
  esquemaPaginacionFacturas,
  esquemaProveedor,
  esquemaProducto,
  esquemaNotaMC,
  esquemaCodigoQRMC,
  esquemaPresupuestoMC,
  esquemaPlantillaMC,
  esquemaSubidaRecurso,
  esquemaActualizarRecurso,
  esquemaComponenteMC,
  esquemaAutomatizacionMC,
  esquemaContratoMC,
  esquemaDibujo,
  esquemaCarpeta,
  esquemaRenombrarCarpeta,
  esquemaGastoPeriodico,
  esquemaMovimientoEntrada,
  esquemaTareasEntrada,
  esquemaEstadoClienteEntrada,
  esquemaPresupuestoClienteEntrada,
  esquemaActualizarCobros,
  esquemaNotifPrefs,
  esquemaActualizarRecordatorios,
} from './esquemas-validacion.js';

// Debe ejecutarse antes de leer cualquier process.env.* de este módulo —
// ver entorno-local.ts para la explicación completa (sin efecto en producción).
cargarVariablesEntornoLocal();

// Bootstrap del Motor Documental — debe ejecutarse antes de que cualquier
// ruta pueda validar un `DocumentoMC` (ver documento-motor-inicializar.ts).
inicializarMotorDocumental();

// Bootstrap de automatización por eventos (Incremento 11) — se suscribe al
// bus de eventos ya existente; debe ejecutarse antes de que se publique
// cualquier evento (ver automatizaciones-listener.ts).
inicializarAutomatizaciones();

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
export function opcionesCookieRefresh(maxAgeMs?: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

export const REFRESH_TTL_MS = (Number(process.env.REFRESH_TOKEN_TTL_DIAS) || 30) * 24 * 60 * 60 * 1000;

/**
 * Caché en memoria de "¿sigue esta cuenta activa?" (usuarioId -> hasta
 * cuándo vale sin volver a preguntar) — antes `requireAuth` consultaba
 * MongoDB en TODAS Y CADA UNA de las peticiones autenticadas, no solo al
 * iniciar sesión. Con una app que lanza en paralelo una decena de
 * peticiones al cargar (clientes, facturas, resumen, proveedores...), cada
 * una pagando ese viaje redondo a Mongo antes de hacer su propio trabajo,
 * el efecto acumulado real observado fue una carga de 30+ segundos, hasta
 * casi 2 minutos (reporte real del usuario, 19/08/2026, con capturas del
 * panel Network confirmando ~1.5-2s por petición incluso en respuestas 304).
 * TTL corto (60s): una cuenta suspendida sigue quedando bloqueada casi de
 * inmediato, no es un relajamiento real de seguridad — solo evita repetir
 * la misma pregunta decenas de veces en el mismo segundo.
 */
const TTL_CACHE_ACTIVO_MS = 60_000;
const cacheUsuarioActivo = new Map<string, { activo: boolean; expira: number }>();

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
    const ahora = Date.now();
    const enCache = cacheUsuarioActivo.get(usuarioId);
    let activo: boolean;
    if (enCache && enCache.expira > ahora) {
      activo = enCache.activo;
    } else {
      await conectarUsuarios();
      const u = await UsuarioModel.findOne({ id: usuarioId }).select('estado').lean().exec() as any;
      activo = !!u && u.estado === 'activo';
      cacheUsuarioActivo.set(usuarioId, { activo, expira: ahora + TTL_CACHE_ACTIVO_MS });
    }
    if (!activo) { res.status(403).json({ error: 'Acceso denegado' }); return; }
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

// ── Servidor Express ──────────────────────────────────────────────────────────

/**
 * Arranca el servidor Express con la API REST de presupuestos.
 * Todos los datos (clientes, facturas, empresa) están aislados por usuarioId.
 */
export function run() {
  const app = express();
  const svc = PresupuestosService.from();
  const port = process.env.PORT || 3000;
  // Calculado ya aquí (no solo al final, donde se sirve el estático de
  // verdad) porque también decide si la ruta de salud puede quedarse en
  // '/' — ver más abajo.
  const frontendDistDir = process.env.FRONTEND_DIST_DIR;

  // Sin esto, `req.ip` es siempre la IP del último proxy para TODAS las
  // peticiones sin importar el dispositivo real, y los limitadores por IP
  // (`limitadorAuth`, etc.) comparten un único cupo entre todos los
  // usuarios en vez de aplicarse por dispositivo. El valor correcto
  // depende de dónde corre el proceso, así que es configurable por
  // entorno en vez de asumir uno fijo:
  // - Local (Bit): la petición pasa por varios saltos locales (proxy de
  //   Vite → gateway de la plataforma, ambos en localhost) — 'loopback'
  //   confía en cualquier número de saltos que vengan de 127.0.0.1/::1
  //   (nuestros propios proxies internos) y se detiene en la primera IP
  //   de la cadena que no sea loopback, sin depender de contar saltos a
  //   mano.
  // - Render (`TRUST_PROXY=1` en su panel): un único salto real (su propio
  //   balanceador) delante del proceso — no loopback, así que hay que
  //   decírselo explícitamente en vez de heredar el valor de desarrollo.
  const trustProxyEnv = process.env.TRUST_PROXY;
  // Express interpreta un string puramente numérico como IP/subred inválida,
  // no como número de saltos — hay que convertirlo explícitamente para que
  // `TRUST_PROXY=1` (Render) cuente saltos en vez de reventar.
  app.set('trust proxy', trustProxyEnv ? (/^\d+$/.test(trustProxyEnv) ? Number(trustProxyEnv) : trustProxyEnv) : 'loopback');

  configurarVapid();
  iniciarRecordatorioHorasDiario();
  iniciarNotificacionesProgramadas();
  asegurarAdmin()
    .then(migrarNombresNormalizados)
    .then(asegurarIndiceNombreNormalizado)
    .catch((err) => logger.error({ err }, 'Error inicializando admin / migrando nombres normalizados'));
  // `migrarDatosAdmin()` (backfill de usuarioId en documentos históricos de
  // antes del multiusuario) se ha retirado (19/08/2026): hacía un escaneo
  // COMPLETO sin índice de Clientes/Empresa/Facturas en cada arranque del
  // servidor — nunca encontraba nada que migrar desde hace tiempo (su log
  // de éxito nunca aparecía), pero sí competía por recursos justo al
  // arrancar. Causa real, confirmada con los logs de Render, de un aviso
  // "Operation `clientes.updateMany()` buffering timed out after 10000ms"
  // y de cargas de la app de varios minutos tras cada despliegue.

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
  // `limitadorAuth` (10 peticiones/15min) se aplica SOLO a `/auth/login` y
  // `/auth/registrar` — las únicas rutas donde tiene sentido frenar fuerza
  // bruta/credential stuffing, directamente en su propia declaración más
  // abajo. Antes se montaba en bloque con `app.use('/auth', limitadorAuth)`,
  // lo que aplicaba ese mismo cupo de 10 a TODA la superficie /auth/*, incluida
  // `/auth/verificar` (que `useLicencia` llama sola cada 2 minutos mientras la
  // app está abierta), `/auth/logout` y `/auth/yo` — con uso normal de la app
  // ese cupo se agotaba solo, dejando a un usuario legítimo completamente
  // bloqueado (ni podía volver a entrar ni cerrar sesión) sin que nadie
  // hubiera intentado adivinar ninguna contraseña. `limitadorGeneral` (300/15min,
  // ya montado justo arriba) sigue cubriendo el resto de /auth/* como red de
  // seguridad general, igual que cualquier otra ruta de la API.

  // ── Salud ──
  /**
   * Comprueba también la conexión a MongoDB (Incremento 1.6) — antes
   * devolvía `ok: true` de forma incondicional, así que un monitor de
   * uptime no habría detectado una base de datos caída mientras el
   * proceso Node siguiera vivo.
   */
  const responderSalud = (_req: express.Request, res: express.Response) => {
    const dbConectada = mongoose.connection.readyState === 1;
    res.status(dbConectada ? 200 : 503).json({
      ok: dbConectada,
      service: 'presupuestos',
      db: dbConectada ? 'conectada' : 'desconectada',
    });
  };
  // Siempre disponible en '/healthz' (para el monitor de salud de Render u
  // otro proveedor). En '/' solo cuando NO se sirve el frontend desde este
  // mismo proceso — con `FRONTEND_DIST_DIR` puesta, '/' tiene que devolver
  // la app real (`index.html`), no este JSON, así que esa ruta se cede al
  // bloque de frontend estático de más abajo.
  app.get('/healthz', responderSalud);
  if (!frontendDistDir) {
    app.get('/', responderSalud);
  }

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

  /**
   * Registra una suscripción push para el usuario autenticado. Antes tomaba
   * `usuarioId` del propio body sin exigir sesión — cualquiera que conociera
   * o adivinara el id de otra cuenta podía registrar su propio navegador
   * como destino de sus notificaciones push (aprobaciones de acceso,
   * avisos de automatización...). Ahora el id sale siempre de
   * `requireAuth`, nunca de lo que mande el cliente.
   */
  app.post('/push/subscribe', requireAuth, validar(esquemaPushSubscribe), async (req: AuthRequest, res) => {
    try {
      const usuarioId = req.usuarioId!;
      const { subscription } = req.body;
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

  /**
   * Envía una notificación de prueba a todos los dispositivos suscritos
   * del usuario autenticado, al instante — pedido explícito del usuario
   * (18/08/2026) para poder comprobar de verdad si las notificaciones le
   * llegan, sin tener que esperar a la hora de un recordatorio. Solo a
   * los propios dispositivos del usuario autenticado, nunca a otra
   * cuenta.
   */
  app.post('/push/probar', requireAuth, async (req: AuthRequest, res) => {
    try {
      await conectarUsuarios();
      const u = await UsuarioModel.findOne({ id: req.usuarioId }).lean().exec() as any;
      const subs = (u?.pushSubs ?? []) as PushSub[];
      if (subs.length === 0) { res.status(400).json({ error: 'No hay ninguna suscripción activa en este dispositivo.' }); return; }
      for (const sub of subs) {
        await enviarNotificacion(sub, 'Notificación de prueba', 'Si ves esto, las notificaciones te están llegando correctamente.', { tipo: 'prueba' });
      }
      res.json({ ok: true, dispositivos: subs.length });
    } catch (err) { responderError(req, res, err); }
  });

  // ── Auth ──

  /** Mensaje explicativo para cuando un código no se pudo canjear al registrarse — nunca bloquea el registro, solo informa. */
  function mensajeCodigoInvalido(razon: 'no_existe' | 'inactivo' | 'fuera_de_fecha' | 'agotado'): string {
    switch (razon) {
      case 'no_existe': return 'Ese código no existe.';
      case 'inactivo': return 'Ese código ya no está activo.';
      case 'agotado': return 'Ese código ya alcanzó su límite de usos.';
      case 'fuera_de_fecha': return 'Ese código no está disponible en este momento.';
    }
  }

  /**
   * Registro de nuevo usuario. Sin código (o con uno inválido), queda en
   * estado `pendiente` hasta que el admin lo apruebe — comportamiento sin
   * cambios. Con un código promocional válido, el canje se resuelve de
   * forma atómica (`canjearCodigo`) y la cuenta queda `activa` de inmediato
   * con el `acceso` que ese código concede — el código en sí no vuelve a
   * consultarse nunca más para decidir nada; a partir de aquí todo lo
   * decide el propio documento del usuario (ver `usuario.model.ts`).
   */
  app.post('/auth/registrar', limitadorAuth, validar(esquemaRegistro), async (req: AuthRequest, res) => {
    try {
      await conectarUsuarios();
      const { nombre, password, codigoPromocional } = req.body as { nombre: string; password: string; codigoPromocional?: string };
      const nombreNormalizado = nombre.toLowerCase();
      const existe = await UsuarioModel.findOne({ nombreNormalizado }).lean().exec();
      if (existe) { res.status(409).json({ error: 'Ese email ya está registrado.' }); return; }

      let estado: EstadoUsuario = 'pendiente';
      let acceso: AccesoUsuario = ACCESO_POR_DEFECTO;
      let avisoCodigo: string | undefined;

      if (codigoPromocional) {
        const resultado = await canjearCodigo(codigoPromocional);
        if (resultado.ok === true) {
          estado = 'activo';
          acceso = {
            tipo: resultado.tipoAcceso,
            plan: resultado.plan,
            activadoEn: new Date().toISOString(),
            expiraEn: resultado.expiraEn,
            origen: 'codigo',
            codigoUsado: resultado.codigo,
          };
        }
        if (resultado.ok === false) {
          avisoCodigo = mensajeCodigoInvalido(resultado.razon);
        }
      }

      const nuevo = await UsuarioModel.create({
        id: generarId(),
        nombre,
        nombreNormalizado,
        passwordHash: await hashPassword(password),
        hashAlgo: 'bcrypt',
        estado,
        esAdmin: false,
        creadoEn: new Date().toISOString(),
        acceso,
      });

      // Si el código ya dio acceso inmediato, no hay nada que aprobar — no se molesta al admin.
      if (estado === 'pendiente') {
        notificarAdminNuevoUsuario(nombre).catch((err) => logger.error({ err, requestId: req.requestId }, 'Error notificando al admin de nuevo usuario'));
      }
      res.json({ ok: true, id: nuevo.id, estado, avisoCodigo });
    } catch (err) { responderError(req, res, err); }
  });

  /** Login — devuelve token único por usuario. */
  app.post('/auth/login', limitadorAuth, validar(esquemaLogin), async (req, res) => {
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

  /**
   * Acceso biométrico (WebAuthn/passkeys) — registro y login mediante el
   * autenticador seguro del dispositivo (huella, Face ID, PIN del sistema).
   * Router aparte (mismo patrón que `crearRouterIA()`): cada ruta decide su
   * propia necesidad de `requireAuth` (el registro exige sesión ya iniciada
   * por contraseña; el login, no — es la propia forma de entrar) y su propio
   * límite de peticiones (ver `webauthn-rutas.ts` — `limitadorAuth` solo se
   * aplica ahí a `/login/*`, nunca a `/credenciales`, para no compartir el
   * mismo budget de 10 peticiones/15min entre "gestionar dispositivos" e
   * "intentos de login", que son superficies de abuso muy distintas).
   */
  app.use('/auth/webauthn', crearRouterWebAuthn());

  /**
   * Portal del cliente (enlace público para ver/aceptar un presupuesto) —
   * montado sin `requireAuth`, mismo patrón que WebAuthn: el token del
   * enlace es la autorización, no una sesión. Ver `portal-rutas.ts`.
   */
  app.use('/portal', crearRouterPortal());

  /**
   * Verifica si una sesión sigue activa. El id sale siempre de la sesión ya
   * autenticada (`requireAuth`), nunca de un campo que mande el cliente —
   * antes se aceptaba `usuarioId` en el body sin exigir sesión, así que
   * cualquiera que conociera el id de otra cuenta podía consultar su estado
   * (activo/suspendido) sin autenticarse. `useLicencia` en el frontend ya
   * solo llama a esta ruta una vez hay sesión iniciada, así que exigir
   * `requireAuth` no le quita nada.
   */
  app.post('/auth/verificar', requireAuth, async (req: AuthRequest, res) => {
    try {
      await conectarUsuarios();
      const usuarioId = req.usuarioId!;
      const u = await UsuarioModel.findOne({ id: usuarioId }).lean().exec() as any;
      if (!u) { res.status(404).json({ activo: false }); return; }
      res.json({ activo: u.estado === 'activo', estado: u.estado });
    } catch (err) { responderError(req, res, err); }
  });

  /**
   * Canjea un código promocional después del registro (por si el usuario no
   * lo tenía a mano al crear la cuenta). Un usuario solo puede canjear un
   * código una vez — si `acceso.codigoUsado` ya está relleno, se rechaza
   * antes de tocar el código, para no gastar un uso de un código válido en
   * un canje que de todas formas no iba a aplicarse.
   */
  app.post('/codigos/canjear', requireAuth, validar(esquemaCanjearCodigo), async (req: AuthRequest, res) => {
    try {
      await conectarUsuarios();
      const usuarioId = req.usuarioId!;
      const usuario = await UsuarioModel.findOne({ id: usuarioId }).lean().exec() as any;
      if (!usuario) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }
      if (usuario.acceso?.codigoUsado) { res.status(409).json({ error: 'Ya has canjeado un código con esta cuenta.' }); return; }

      const resultado = await canjearCodigo(req.body.codigo);
      if (resultado.ok === false) { res.status(400).json({ error: mensajeCodigoInvalido(resultado.razon) }); return; }

      const acceso: AccesoUsuario = {
        tipo: resultado.tipoAcceso,
        plan: resultado.plan,
        activadoEn: new Date().toISOString(),
        expiraEn: resultado.expiraEn,
        origen: 'codigo',
        codigoUsado: resultado.codigo,
      };
      await UsuarioModel.updateOne({ id: usuarioId }, { acceso, estado: 'activo' });
      res.json({ ok: true, acceso });
    } catch (err) { responderError(req, res, err); }
  });

  // ── Admin ──

  /** Lista todos los usuarios (solo admin). `?q=` filtra por nombre/email (subcadena, sin distinguir mayúsculas). */
  app.get('/admin/usuarios', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      await conectarUsuarios();
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const filtro = q ? { nombreNormalizado: { $regex: q.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } } : {};
      const usuarios = await UsuarioModel.find(filtro).lean().exec();
      res.json((usuarios as any[]).map((u) => ({
        id: u.id, nombre: u.nombre, email: u.nombre,
        estado: u.estado, esAdmin: u.esAdmin,
        creadoEn: u.creadoEn, ultimoAcceso: u.ultimoAcceso,
        acceso: u.acceso ?? ACCESO_POR_DEFECTO,
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

  /**
   * Cambia manualmente el tipo de acceso/plan de un usuario (solo admin) —
   * junto al canje de código, el ÚNICO lugar donde `acceso` puede cambiar.
   * Nunca a través de una ruta que el propio usuario pueda llamar sobre sí
   * mismo (ver `esquemaPerfil`/`esquemaCambiarAcceso`, que nunca incluyen
   * este campo).
   */
  app.put('/admin/usuarios/:id/acceso', requireAuth, requireAdmin, validar(esquemaCambiarAccesoUsuario), async (req, res) => {
    try {
      await conectarUsuarios();
      const { tipo, plan, expiraEn } = req.body as { tipo: string; plan: string; expiraEn: string | null };
      const acceso: AccesoUsuario = {
        tipo: tipo as AccesoUsuario['tipo'],
        plan: plan as AccesoUsuario['plan'],
        activadoEn: new Date().toISOString(),
        expiraEn,
        origen: 'admin',
        codigoUsado: null,
      };
      const u = await UsuarioModel.findOneAndUpdate({ id: req.params.id }, { acceso }, { new: true }).lean().exec() as any;
      if (!u) { res.status(404).json({ error: 'No encontrado' }); return; }
      res.json({ ok: true, id: u.id, acceso: u.acceso });
    } catch (err) { responderError(req, res, err); }
  });

  // ── Códigos promocionales (solo admin gestiona; el canje es la única escritura no-admin) ──

  /** Lista todos los códigos promocionales (solo admin). */
  app.get('/admin/codigos', requireAuth, requireAdmin, async (req, res) => {
    try {
      await conectarCodigos();
      const codigos = await CodigoPromocionalModel.find().sort({ creadoEn: -1 }).lean().exec();
      res.json(codigos);
    } catch (err) { responderError(req, res, err); }
  });

  /** Crea un código promocional nuevo (solo admin). */
  app.post('/admin/codigos', requireAuth, requireAdmin, validar(esquemaCrearCodigo), async (req, res) => {
    try {
      await conectarCodigos();
      const codigo = normalizarCodigo(req.body.codigo);
      const yaExiste = await CodigoPromocionalModel.findOne({ codigo }).lean().exec();
      if (yaExiste) { res.status(409).json({ error: 'Ya existe un código con ese nombre.' }); return; }
      const nuevo = await CodigoPromocionalModel.create({
        id: generarIdCodigo(),
        codigo,
        activo: true,
        tipoAccesoConcedido: req.body.tipoAccesoConcedido,
        planConcedido: req.body.planConcedido,
        duracionDias: req.body.duracionDias,
        usosMaximos: req.body.usosMaximos,
        usosActuales: 0,
        fechaInicio: req.body.fechaInicio,
        fechaExpiracion: req.body.fechaExpiracion,
        creadoEn: new Date().toISOString(),
        creadoPor: 'admin',
        notas: req.body.notas,
      });
      res.json(nuevo);
    } catch (err) { responderError(req, res, err); }
  });

  /** Actualiza un código promocional — activarlo/desactivarlo, cambiar fechas, cupo, etc. (solo admin). */
  app.put('/admin/codigos/:id', requireAuth, requireAdmin, validar(esquemaActualizarCodigo), async (req, res) => {
    try {
      await conectarCodigos();
      const actualizado = await CodigoPromocionalModel.findOneAndUpdate(
        { id: req.params.id },
        { $set: req.body },
        { new: true }
      ).lean().exec();
      if (!actualizado) { res.status(404).json({ error: 'No encontrado' }); return; }
      res.json(actualizado);
    } catch (err) { responderError(req, res, err); }
  });

  /** Elimina un código promocional (solo admin). No afecta a quien ya lo canjeó — su `acceso` ya quedó estampado en su propio usuario. */
  app.delete('/admin/codigos/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      await conectarCodigos();
      await CodigoPromocionalModel.deleteOne({ id: req.params.id });
      res.json({ ok: true });
    } catch (err) { responderError(req, res, err); }
  });

  // ── Costes de infraestructura (solo admin — nada de esto se aísla por usuarioId) ──

  /** Lista todas las herramientas/servicios con coste (solo admin). */
  app.get('/admin/costes', requireAuth, requireAdmin, async (req, res) => {
    try {
      await conectarCostes();
      const costes = await CosteInfraestructuraModel.find().sort({ creadoEn: -1 }).lean().exec();
      res.json(costes);
    } catch (err) { responderError(req, res, err); }
  });

  /** Da de alta una herramienta/servicio nuevo (solo admin). */
  app.post('/admin/costes', requireAuth, requireAdmin, validar(esquemaCrearCoste), async (req, res) => {
    try {
      await conectarCostes();
      const ahora = new Date().toISOString();
      const nuevo = await CosteInfraestructuraModel.create({
        id: generarIdCoste(),
        nombre: req.body.nombre,
        categoria: req.body.categoria,
        coste: req.body.coste,
        moneda: req.body.moneda,
        periodicidad: req.body.periodicidad,
        url: req.body.url,
        notas: req.body.notas,
        activo: true,
        creadoEn: ahora,
        actualizadoEn: ahora,
      });
      res.json(nuevo);
    } catch (err) { responderError(req, res, err); }
  });

  /** Actualiza una herramienta/servicio — precio, categoría, activo/inactivo, etc. (solo admin). */
  app.put('/admin/costes/:id', requireAuth, requireAdmin, validar(esquemaActualizarCoste), async (req, res) => {
    try {
      await conectarCostes();
      const actualizado = await CosteInfraestructuraModel.findOneAndUpdate(
        { id: req.params.id },
        { $set: { ...req.body, actualizadoEn: new Date().toISOString() } },
        { new: true }
      ).lean().exec();
      if (!actualizado) { res.status(404).json({ error: 'No encontrado' }); return; }
      res.json(actualizado);
    } catch (err) { responderError(req, res, err); }
  });

  /** Elimina una herramienta/servicio de la lista (solo admin). */
  app.delete('/admin/costes/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      await conectarCostes();
      await CosteInfraestructuraModel.deleteOne({ id: req.params.id });
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

  /**
   * Rutas quirúrgicas dedicadas para movimientos/tareas/estado/presupuesto
   * (Hardening Fase 2) — desde ahora son la ÚNICA forma de cambiar estos
   * campos tras crear el cliente; `guardarCliente` ya los ignora en
   * cualquier edición (ver comentario en `presupuestos-service.ts`).
   */
  app.post('/clientes/:id/movimientos', requireAuth, validar(esquemaMovimientoEntrada), async (req: AuthRequest, res) => {
    try { res.json(await svc.anadirMovimientoCliente(req.params.id, req.usuarioId!, req.body)); }
    catch (err) { responderError(req, res, err); }
  });

  app.put('/clientes/:id/movimientos/:movId', requireAuth, validar(esquemaMovimientoEntrada), async (req: AuthRequest, res) => {
    try { res.json(await svc.editarMovimientoCliente(req.params.id, req.usuarioId!, req.params.movId, req.body)); }
    catch (err) { responderError(req, res, err); }
  });

  app.delete('/clientes/:id/movimientos/:movId', requireAuth, async (req: AuthRequest, res) => {
    try { res.json(await svc.borrarMovimientoCliente(req.params.id, req.usuarioId!, req.params.movId)); }
    catch (err) { responderError(req, res, err); }
  });

  app.put('/clientes/:id/tareas', requireAuth, validar(esquemaTareasEntrada), async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarTareasCliente(req.params.id, req.usuarioId!, req.body.tareas)); }
    catch (err) { responderError(req, res, err); }
  });

  app.put('/clientes/:id/estado', requireAuth, validar(esquemaEstadoClienteEntrada), async (req: AuthRequest, res) => {
    try { res.json(await svc.cambiarEstadoCliente(req.params.id, req.usuarioId!, req.body.estado)); }
    catch (err) { responderError(req, res, err); }
  });

  app.put('/clientes/:id/presupuesto', requireAuth, validar(esquemaPresupuestoClienteEntrada), async (req: AuthRequest, res) => {
    try { res.json(await svc.cambiarPresupuestoCliente(req.params.id, req.usuarioId!, req.body.presupuesto)); }
    catch (err) { responderError(req, res, err); }
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

  // ── Mi perfil — nombre para mostrar y foto, siempre del propio usuario ──

  app.get('/perfil', requireAuth, async (req: AuthRequest, res) => {
    try {
      await conectarUsuarios();
      const u = await UsuarioModel.findOne({ id: req.usuarioId }).lean().exec() as any;
      if (!u) { res.status(404).json({ error: 'No encontrado' }); return; }
      res.json({ nombreMostrar: u.nombreMostrar || '', foto: u.foto || '' });
    } catch (err) { responderError(req, res, err); }
  });

  app.put('/perfil', requireAuth, validar(esquemaPerfil), async (req: AuthRequest, res) => {
    try {
      await conectarUsuarios();
      await UsuarioModel.updateOne({ id: req.usuarioId }, { nombreMostrar: req.body.nombreMostrar, foto: req.body.foto });
      res.json({ ok: true });
    } catch (err) { responderError(req, res, err); }
  });

  // ── Notificaciones — interruptores por tipo y recordatorios propios (18/08/2026) ──

  /**
   * `.lean()` no aplica los defaults de Mongoose a cuentas que no tengan
   * el campo en absoluto (mismo aviso que en el resto de esta base de
   * código) — de ahí el `?? true`/`?? []` explícito en vez de confiar en
   * el esquema.
   */
  app.get('/notificaciones/preferencias', requireAuth, async (req: AuthRequest, res) => {
    try {
      await conectarUsuarios();
      const u = await UsuarioModel.findOne({ id: req.usuarioId }).lean().exec() as any;
      if (!u) { res.status(404).json({ error: 'No encontrado' }); return; }
      const p = u.notifPrefs;
      res.json({
        preferencias: {
          horas: leerPreferenciaNotif(p, 'horas', 20),
          cobrosPendientes: leerPreferenciaNotif(p, 'cobrosPendientes', 8),
          margenBajo: leerPreferenciaNotif(p, 'margenBajo', 8),
          briefingDiario: leerPreferenciaNotif(p, 'briefingDiario', 8),
        },
        recordatorios: u.recordatoriosPersonalizados ?? [],
      });
    } catch (err) { responderError(req, res, err); }
  });

  app.put('/notificaciones/preferencias', requireAuth, validar(esquemaNotifPrefs), async (req: AuthRequest, res) => {
    try {
      await conectarUsuarios();
      await UsuarioModel.updateOne({ id: req.usuarioId }, { $set: { notifPrefs: req.body } });
      res.json({ ok: true });
    } catch (err) { responderError(req, res, err); }
  });

  app.put('/notificaciones/recordatorios', requireAuth, validar(esquemaActualizarRecordatorios), async (req: AuthRequest, res) => {
    try {
      await conectarUsuarios();
      await UsuarioModel.updateOne({ id: req.usuarioId }, { $set: { recordatoriosPersonalizados: req.body.recordatorios } });
      res.json({ ok: true });
    } catch (err) { responderError(req, res, err); }
  });

  /**
   * Cambia el usuario de acceso y/o la contraseña — nunca sin verificar la
   * contraseña actual primero (por si la sesión sigue abierta en un
   * dispositivo que ya no es de confianza). Al terminar, revoca todas las
   * sesiones existentes del usuario (incluida esta) y emite una sesión
   * nueva — mismo motivo que al suspender una cuenta (`revocarTodosDeUsuario`
   * más abajo): si alguien más tenía una sesión abierta con las credenciales
   * antiguas, deja de poder renovarla. La petición actual no se queda
   * desconectada porque se le entrega el access token + refresh token
   * nuevos en la misma respuesta, igual que `/auth/login`.
   */
  app.put('/perfil/acceso', limitadorAuth, requireAuth, validar(esquemaCambiarAcceso), async (req: AuthRequest, res) => {
    try {
      await conectarUsuarios();
      const u = await UsuarioModel.findOne({ id: req.usuarioId }).exec() as any;
      if (!u) { res.status(404).json({ error: 'No encontrado' }); return; }

      const { passwordActual, nombreNuevo, passwordNueva } = req.body;
      const passwordValida = u.hashAlgo === 'bcrypt'
        ? await verificarPassword(passwordActual, u.passwordHash)
        : verificarPasswordLegado(passwordActual, u.passwordHash);
      if (!passwordValida) { res.status(401).json({ error: 'La contraseña actual no es correcta.' }); return; }

      if (nombreNuevo) {
        const normalizado = nombreNuevo.toLowerCase();
        if (normalizado !== u.nombreNormalizado) {
          const yaExiste = await UsuarioModel.findOne({ nombreNormalizado: normalizado }).lean().exec();
          if (yaExiste) { res.status(409).json({ error: 'Ese nombre de usuario ya existe.' }); return; }
          u.nombre = nombreNuevo;
          u.nombreNormalizado = normalizado;
        }
      }
      if (passwordNueva) {
        u.passwordHash = await hashPassword(passwordNueva);
        u.hashAlgo = 'bcrypt';
      }
      await u.save();

      await revocarTodosDeUsuario(u.id);
      const accessToken = firmarAccessToken({ sub: u.id, esAdmin: u.esAdmin });
      const refreshToken = await crearRefreshToken(u.id);
      res.cookie('mc_refresh', refreshToken, opcionesCookieRefresh(REFRESH_TTL_MS));
      res.json({ ok: true, id: u.id, nombre: u.nombre, esAdmin: u.esAdmin, estado: u.estado, accessToken });
    } catch (err) { responderError(req, res, err); }
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
      const { pagina, limite, tipo, anio, trimestre, clienteId, proveedor } = req.query as unknown as {
        pagina: number; limite: number; tipo: 'ingreso' | 'gasto' | 'todas'; anio?: number; trimestre?: number;
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
        const items = trimestre !== undefined
          ? await svc.listarFacturasPorTrimestre(req.usuarioId!, anio, trimestre)
          : await svc.listarFacturasPorAnio(req.usuarioId!, anio);
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

  /**
   * ZIP con el PDF de varias facturas — por `ids` concretos (descarga
   * múltiple con selección) o por filtro `anio`/`trimestre`/`tipo`
   * (descargar todas). Debe registrarse antes de `/facturas/:id` para no
   * colisionar con él (mismo motivo que `resumen`/`resumen-proveedores`/`anios`).
   */
  app.post('/facturas/descargar-zip', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { ids, anio, trimestre, tipo } = req.body as { ids?: string[]; anio?: number; trimestre?: number; tipo?: 'ingreso' | 'gasto' };
      const zip = await svc.obtenerZipFacturas(req.usuarioId!, { ids, anio, trimestre, tipo });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="facturas.zip"');
      res.send(Buffer.from(zip));
    } catch (err) { responderError(req, res, err); }
  });

  /**
   * Documentación completa para el asesor de un trimestre (resumen + ZIP
   * de facturas organizadas). Debe registrarse antes de `/facturas/:id`.
   */
  app.get('/facturas/documentacion-asesor', requireAuth, async (req: AuthRequest, res) => {
    try {
      const anio = Number(req.query.anio);
      const trimestre = Number(req.query.trimestre);
      if (!anio || !trimestre || trimestre < 1 || trimestre > 4) { res.status(400).json({ error: 'anio y trimestre (1-4) son obligatorios' }); return; }
      const zip = await svc.obtenerDocumentacionAsesor(req.usuarioId!, anio, trimestre);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="documentacion-T${trimestre}-${anio}.zip"`);
      res.send(Buffer.from(zip));
    } catch (err) { responderError(req, res, err); }
  });

  app.get('/facturas/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const f = await svc.obtenerFactura(req.params.id, req.usuarioId!);
      if (!f) { res.status(404).json({ error: 'No encontrada' }); return; }
      res.json(f);
    } catch (err) { responderError(req, res, err); }
  });

  /** PDF real de una factura individual — descarga directa. */
  app.get('/facturas/:id/pdf', requireAuth, async (req: AuthRequest, res) => {
    try {
      const resultado = await svc.obtenerPdfFactura(req.params.id, req.usuarioId!);
      if (!resultado) { res.status(404).json({ error: 'No encontrada' }); return; }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${resultado.nombreArchivo.replace(/"/g, '')}"`);
      res.send(Buffer.from(resultado.bytes));
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

  // ── Gastos periódicos/estimados (Fase Facturas Profesional) ──

  app.get('/gastos-periodicos', requireAuth, async (req: AuthRequest, res) => {
    try { res.json(await svc.listarGastosPeriodicos(req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.put('/gastos-periodicos/:id', requireAuth, validar(esquemaGastoPeriodico), async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarGastoPeriodico({ ...req.body, id: req.params.id }, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.delete('/gastos-periodicos/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarGastoPeriodico(req.params.id, req.usuarioId!); res.json({ ok: true }); }
    catch (err) { responderError(req, res, err); }
  });

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

  // ── Códigos QR (sección propia del menú, 19/08/2026) ──

  app.get('/codigos-qr', requireAuth, async (req: AuthRequest, res) => {
    try { res.json(await svc.listarCodigosQR(req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.put('/codigos-qr/:id', requireAuth, validar(esquemaCodigoQRMC), async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarCodigoQR({ ...req.body, id: req.params.id }, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.delete('/codigos-qr/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarCodigoQR(req.params.id, req.usuarioId!); res.json({ ok: true }); }
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

  /**
   * Acepta un presupuesto (Fase 1 — "presupuesto aceptado"). Ruta de acción
   * dedicada en vez de una escritura implícita dentro del PUT genérico —
   * mismo patrón ya usado en la aplicación para acciones explícitas (ver
   * `/dibujos/:id/duplicar`). Toda la lógica (atomicidad, idempotencia,
   * evento, consecuencias) vive en `svc.aceptarPresupuesto`.
   */
  app.post('/presupuestos/:id/aceptar', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { presupuesto, transicionOcurrioAhora } = await svc.aceptarPresupuesto(req.params.id, req.usuarioId!);
      res.json({ ok: true, presupuesto, yaEstabaAceptado: !transicionOcurrioAhora });
    } catch (err) { responderError(req, res, err); }
  });

  /**
   * Genera el enlace público del Portal del cliente (Sección 8). Revoca
   * cualquier enlace anterior todavía activo del mismo presupuesto — ver
   * `crearEnlacePresupuesto` en `enlace-presupuesto.model.ts`.
   */
  app.post('/presupuestos/:id/enlace', requireAuth, async (req: AuthRequest, res) => {
    try {
      res.json(await svc.generarEnlacePresupuesto(req.params.id, req.usuarioId!));
    } catch (err) { responderError(req, res, err); }
  });

  app.delete('/presupuestos/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarPresupuesto(req.params.id, req.usuarioId!); res.json({ ok: true }); }
    catch (err) { responderError(req, res, err); }
  });

  /**
   * Sustituye la lista completa de cobros de un presupuesto (roadmap
   * "cobros pendientes"). Ruta de acción dedicada, fuera del PUT genérico
   * de presupuesto — mismo motivo que `estado`/`firmaClienteUrl`: así un
   * guardado normal del editor nunca puede pisar los cobros sin querer.
   */
  app.put('/presupuestos/:id/cobros', requireAuth, validar(esquemaActualizarCobros), async (req: AuthRequest, res) => {
    try {
      const presupuesto = await svc.actualizarCobros(req.params.id, req.usuarioId!, req.body.cobros);
      res.json({ ok: true, presupuesto });
    } catch (err) { responderError(req, res, err); }
  });

  // ── Plantillas (Motor Documental, Incremento 4) — aisladas por usuarioId ──

  app.get('/plantillas', requireAuth, async (req: AuthRequest, res) => {
    try { res.json(await svc.listarPlantillas(req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.put('/plantillas/:id', requireAuth, validar(esquemaPlantillaMC), async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarPlantilla({ ...req.body, id: req.params.id }, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.delete('/plantillas/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarPlantilla(req.params.id, req.usuarioId!); res.json({ ok: true }); }
    catch (err) { responderError(req, res, err); }
  });

  // ── Biblioteca de recursos (Motor Documental, Incremento 5) — aislada por usuarioId ──

  app.get('/recursos', requireAuth, async (req: AuthRequest, res) => {
    try { res.json(await svc.listarRecursos(req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.post('/recursos', requireAuth, validar(esquemaSubidaRecurso), async (req: AuthRequest, res) => {
    try { res.json(await svc.subirRecursoBiblioteca(req.body, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.put('/recursos/:id', requireAuth, validar(esquemaActualizarRecurso), async (req: AuthRequest, res) => {
    try { res.json(await svc.actualizarRecurso(req.params.id, req.body, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.delete('/recursos/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarRecurso(req.params.id, req.usuarioId!); res.json({ ok: true }); }
    catch (err) { responderError(req, res, err); }
  });

  // ── Componentes reutilizables (Motor Documental, Incremento 6) — aislados por usuarioId ──

  app.get('/componentes', requireAuth, async (req: AuthRequest, res) => {
    try { res.json(await svc.listarComponentes(req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.put('/componentes/:id', requireAuth, validar(esquemaComponenteMC), async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarComponente({ ...req.body, id: req.params.id }, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.delete('/componentes/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarComponente(req.params.id, req.usuarioId!); res.json({ ok: true }); }
    catch (err) { responderError(req, res, err); }
  });

  // ── Automatización por eventos (Motor Documental, Incremento 11) — aislada por usuarioId ──

  app.get('/automatizaciones', requireAuth, async (req: AuthRequest, res) => {
    try { res.json(await svc.listarAutomatizaciones(req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.put('/automatizaciones/:id', requireAuth, validar(esquemaAutomatizacionMC), async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarAutomatizacion({ ...req.body, id: req.params.id }, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.delete('/automatizaciones/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarAutomatizacion(req.params.id, req.usuarioId!); res.json({ ok: true }); }
    catch (err) { responderError(req, res, err); }
  });

  // ── Contratos (Motor Documental, Incremento 12 — segundo tipo de documento) — aislados por usuarioId ──

  app.get('/contratos', requireAuth, async (req: AuthRequest, res) => {
    try {
      const clienteId = typeof req.query.clienteId === 'string' ? req.query.clienteId : '';
      if (!clienteId) { res.status(400).json({ error: 'Falta clienteId.' }); return; }
      res.json(await svc.listarContratosDeCliente(req.usuarioId!, clienteId));
    } catch (err) { responderError(req, res, err); }
  });

  app.put('/contratos/:id', requireAuth, validar(esquemaContratoMC), async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarContrato({ ...req.body, id: req.params.id }, req.usuarioId!)); }
    catch (err) { responderError(req, res, err); }
  });

  app.delete('/contratos/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarContrato(req.params.id, req.usuarioId!); res.json({ ok: true }); }
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

  // ── Archivos de AlmacenamientoMemoria (solo desarrollo) ──
  // Sin autenticación a propósito: las claves son UUIDs aleatorios
  // impredecibles, igual que las URLs públicas de R2 en producción — un
  // `<img src>` del navegador no puede adjuntar el token de sesión, así que
  // esta ruta necesita ser accesible igual que lo sería un objeto público de
  // R2. No expone ningún dato salvo el propio archivo subido.
  app.get('/almacenamiento/:carpeta/:id', async (req, res) => {
    const archivo = await almacenamiento.obtener(`${req.params.carpeta}/${req.params.id}`);
    if (!archivo) { res.status(404).end(); return; }
    res.setHeader('Content-Type', archivo.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(archivo.datos);
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

  // ── Frontend estático (solo despliegue combinado fuera de Bit, p. ej. Render) ──
  // En local (`bit run`), el frontend lo sirve Vite en su propio proceso —
  // esta rama nunca se activa ahí porque `FRONTEND_DIST_DIR` no está puesta.
  // Va DESPUÉS de todas las rutas de la API a propósito: el comodín '*' solo
  // debe capturar lo que ninguna ruta anterior haya resuelto ya.
  if (frontendDistDir) {
    const dir = resolve(process.cwd(), frontendDistDir);
    const indexHtml = resolve(dir, 'index.html');
    if (existsSync(indexHtml)) {
      // El service worker vive en /assets/sw.js — por defecto un navegador
      // solo le deja controlar (`scope`) el directorio donde está el propio
      // script (/assets/), aunque el código de registro pida un scope más
      // amplio (rechaza la llamada con SecurityError, en silencio si el
      // registro va envuelto en un `.catch`). Sin esta cabecera, el service
      // worker nunca controla la raíz de la app y el navegador no la
      // reconoce como PWA instalable — solo ofrece un acceso directo simple.
      app.get('/assets/sw.js', (req, res, next) => {
        res.setHeader('Service-Worker-Allowed', '/');
        next();
      });
      app.use(express.static(dir));
      app.get('*', (req, res) => res.sendFile(indexHtml));
      logger.info({ dir }, 'Sirviendo frontend estático');
    } else {
      logger.warn({ dir }, 'FRONTEND_DIST_DIR puesta pero no contiene index.html — el frontend no se servirá');
    }
  }

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
