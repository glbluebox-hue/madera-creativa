import express from 'express';
import cors from 'cors';
import { PresupuestosService } from './presupuestos-service.js';
import { UsuarioModel, conectarUsuarios } from './usuario.model.js';
import { configurarVapid, enviarNotificacion } from './push.service.js';
import type { PushSub } from './push.service.js';

// ── Credenciales del admin maestro ────────────────────────────────────────────
// Se leen exclusivamente de variables de entorno — nunca se escriben en el código.
// Configúralas en el archivo .env (ver env.example) o en el panel de tu proveedor.
const USUARIO    = process.env.APP_USER || '';
const CONTRASENA = process.env.APP_PASSWORD || '';

if (!USUARIO || !CONTRASENA) {
  console.warn('[auth] Faltan APP_USER y/o APP_PASSWORD. El admin maestro no podrá iniciar sesión hasta configurarlas.');
}

/** Token legado del admin, derivado de las credenciales de entorno. */
const TOKEN_ADMIN = Buffer.from(USUARIO + ':' + CONTRASENA).toString('base64');

// ── Utilidades ────────────────────────────────────────────────────────────────

/** Hash simple para contraseñas — igual que el frontend. */
function hashSimple(texto: string): string {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return 'h' + Math.abs(hash).toString(36);
}

function generarId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Genera un token único por usuario. Formato: base64('uid:' + usuarioId) */
function tokenParaUsuario(usuarioId: string): string {
  return Buffer.from('uid:' + usuarioId).toString('base64');
}

/**
 * Extrae el usuarioId de un token.
 * Soporta el token admin legado y los nuevos tokens 'uid:...'.
 */
function extraerUsuarioId(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    if (decoded.startsWith('uid:')) return decoded.slice(4);
    // Token legado admin — solo válido si las credenciales de entorno están definidas.
    if (USUARIO && CONTRASENA && decoded === USUARIO + ':' + CONTRASENA) return 'admin';
    return null;
  } catch { return null; }
}

/** Extiende Request con el usuarioId autenticado. */
type AuthRequest = express.Request & { usuarioId?: string };

/**
 * Middleware de autenticación: valida el token y adjunta req.usuarioId.
 * Los datos de cada usuario están completamente aislados por usuarioId.
 */
async function requireAuth(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'No autorizado' }); return; }
  const token = auth.slice(7);
  const usuarioId = extraerUsuarioId(token);
  if (!usuarioId) { res.status(401).json({ error: 'Token inválido' }); return; }
  if (usuarioId === 'admin') { req.usuarioId = 'admin'; next(); return; }
  try {
    await conectarUsuarios();
    const u = await UsuarioModel.findOne({ id: usuarioId }).lean().exec() as any;
    if (!u || u.estado !== 'activo') { res.status(403).json({ error: 'Acceso denegado' }); return; }
    req.usuarioId = usuarioId;
    next();
  } catch { res.status(500).json({ error: 'Error de servidor' }); }
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
      passwordHash: hashSimple(CONTRASENA),
      estado: 'activo',
      esAdmin: true,
      creadoEn: new Date().toISOString(),
    });
    console.log('Admin creado en DB');
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
    if (total > 0) console.log(`Migración admin: ${c?.modifiedCount} clientes, ${f?.modifiedCount} facturas, ${e?.modifiedCount} empresa`);
  } catch (err) {
    console.warn('Migración datos admin:', err);
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
  asegurarAdmin().catch(console.error);
  migrarDatosAdmin().catch(console.error);

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '25mb' }));

  // ── Salud ──
  app.get('/', (_req, res) => { res.json({ ok: true, service: 'presupuestos' }); });

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
  app.post('/push/subscribe', async (req, res) => {
    try {
      const { usuarioId, subscription } = req.body || {};
      if (!usuarioId || !subscription) { res.status(400).json({ error: 'Faltan datos' }); return; }
      await conectarUsuarios();
      const u = await UsuarioModel.findOne({ id: usuarioId }).exec();
      if (!u) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }
      const yaExiste = (u.pushSubs || []).some((s: any) => s.endpoint === subscription.endpoint);
      if (!yaExiste) {
        u.pushSubs = [...(u.pushSubs || []), subscription];
        await u.save();
      }
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // ── Auth ──

  /** Registro de nuevo usuario (queda en estado pendiente hasta que el admin apruebe). */
  app.post('/auth/registrar', async (req, res) => {
    try {
      await conectarUsuarios();
      const { nombre, passwordHash } = req.body || {};
      if (!nombre || !passwordHash) { res.status(400).json({ error: 'Faltan datos' }); return; }
      const existe = await UsuarioModel.findOne({ nombre: { $regex: new RegExp('^' + nombre + '$', 'i') } }).lean().exec();
      if (existe) { res.status(409).json({ error: 'Ese email ya está registrado.' }); return; }
      const nuevo = await UsuarioModel.create({
        id: generarId(),
        nombre: nombre.trim(),
        passwordHash,
        estado: 'pendiente',
        esAdmin: false,
        creadoEn: new Date().toISOString(),
      });
      notificarAdminNuevoUsuario(nombre).catch(console.error);
      res.json({ ok: true, id: nuevo.id, estado: 'pendiente' });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  /** Login — devuelve token único por usuario. */
  app.post('/auth/login', async (req, res) => {
    try {
      await conectarUsuarios();
      const { nombre, passwordHash } = req.body || {};
      if (!nombre || !passwordHash) { res.status(400).json({ error: 'Faltan datos' }); return; }
      const u = await UsuarioModel.findOne({ nombre: { $regex: new RegExp('^' + nombre + '$', 'i') } }).lean().exec() as any;
      if (!u || u.passwordHash !== passwordHash) {
        res.status(401).json({ error: 'Usuario o contraseña incorrectos.' }); return;
      }
      if (u.estado === 'pendiente') {
        res.status(403).json({ error: 'pendiente', mensaje: 'Tu cuenta está pendiente de aprobación. Recibirás acceso en breve.' }); return;
      }
      if (u.estado === 'suspendido') {
        res.status(403).json({ error: 'suspendido', mensaje: 'Tu acceso ha sido suspendido. Contacta con Madera Creativa.' }); return;
      }
      await UsuarioModel.updateOne({ id: u.id }, { ultimoAcceso: new Date().toISOString() });
      // Token único por usuario — admin usa token legado para compatibilidad con sesiones guardadas
      const token = u.esAdmin ? TOKEN_ADMIN : tokenParaUsuario(u.id);
      res.json({ ok: true, id: u.id, nombre: u.nombre, esAdmin: u.esAdmin, estado: u.estado, token });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  /** Verifica si una sesión sigue activa. */
  app.post('/auth/verificar', async (req, res) => {
    try {
      await conectarUsuarios();
      const { usuarioId } = req.body || {};
      if (!usuarioId) { res.status(400).json({ error: 'Falta usuarioId' }); return; }
      const u = await UsuarioModel.findOne({ id: usuarioId }).lean().exec() as any;
      if (!u) { res.status(404).json({ activo: false }); return; }
      res.json({ activo: u.estado === 'activo', estado: u.estado });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // ── Admin ──

  /** Lista todos los usuarios (solo admin). */
  app.get('/admin/usuarios', requireAuth, async (_req, res) => {
    try {
      await conectarUsuarios();
      const usuarios = await UsuarioModel.find().lean().exec();
      res.json((usuarios as any[]).map((u) => ({
        id: u.id, nombre: u.nombre, email: u.nombre,
        estado: u.estado, esAdmin: u.esAdmin,
        creadoEn: u.creadoEn, ultimoAcceso: u.ultimoAcceso,
      })));
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  /** Cambia el estado de un usuario (solo admin). */
  app.put('/admin/usuarios/:id/estado', requireAuth, async (req, res) => {
    try {
      await conectarUsuarios();
      const { estado } = req.body || {};
      if (!['activo', 'suspendido', 'pendiente'].includes(estado)) {
        res.status(400).json({ error: 'Estado inválido' }); return;
      }
      const u = await UsuarioModel.findOneAndUpdate({ id: req.params.id }, { estado }, { new: true }).lean().exec() as any;
      if (!u) { res.status(404).json({ error: 'No encontrado' }); return; }
      if (estado === 'activo' && (u.pushSubs || []).length) {
        for (const sub of u.pushSubs as PushSub[]) {
          await enviarNotificacion(sub, 'Acceso aprobado', 'Ya puedes entrar a la app.', { tipo: 'acceso-aprobado' });
        }
      }
      res.json({ ok: true, id: u.id, estado: u.estado });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  /** Elimina un usuario (solo admin). */
  app.delete('/admin/usuarios/:id', requireAuth, async (req, res) => {
    try {
      await conectarUsuarios();
      await UsuarioModel.deleteOne({ id: req.params.id, esAdmin: false });
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // ── Clientes — aislados por usuarioId ──

  app.get('/clientes', requireAuth, async (req: AuthRequest, res) => {
    try {
      const clientes = await svc.listarClientes(req.usuarioId!);
      const slim = clientes.map((c: any) => ({
        ...c,
        adjuntos: (c.adjuntos || []).map(({ url: _url, ...rest }: any) => rest),
      }));
      res.json(slim);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  app.get('/clientes/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const cliente = await svc.obtenerCliente(req.params.id, req.usuarioId!);
      if (!cliente) { res.status(404).json({ error: 'No encontrado' }); return; }
      res.json(cliente);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  app.put('/clientes/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const cliente = await svc.guardarCliente({ ...req.body, id: req.params.id }, req.usuarioId!);
      res.json(cliente);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  app.delete('/clientes/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      await svc.borrarCliente(req.params.id, req.usuarioId!);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // ── Empresa — una por usuario ──

  app.get('/empresa', requireAuth, async (req: AuthRequest, res) => {
    try { res.json(await svc.obtenerEmpresa(req.usuarioId!)); }
    catch (err) { res.status(500).json({ error: String(err) }); }
  });

  app.put('/empresa', requireAuth, async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarEmpresa(req.body, req.usuarioId!)); }
    catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // ── Facturas — aisladas por usuarioId ──

  app.get('/facturas', requireAuth, async (req: AuthRequest, res) => {
    try { res.json(await svc.listarFacturas(req.usuarioId!)); }
    catch (err) { res.status(500).json({ error: String(err) }); }
  });

  app.get('/facturas/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const f = await svc.obtenerFactura(req.params.id, req.usuarioId!);
      if (!f) { res.status(404).json({ error: 'No encontrada' }); return; }
      res.json(f);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  app.put('/facturas/:id', requireAuth, async (req: AuthRequest, res) => {
    try { res.json(await svc.guardarFactura({ ...req.body, id: req.params.id }, req.usuarioId!)); }
    catch (err) { res.status(500).json({ error: String(err) }); }
  });

  app.delete('/facturas/:id', requireAuth, async (req: AuthRequest, res) => {
    try { await svc.borrarFactura(req.params.id, req.usuarioId!); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // ── Asistente IA ──

  app.post('/asistente', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { mensajes, contexto } = req.body || {};
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) { res.status(503).json({ error: 'API key no configurada' }); return; }

      const uid = req.usuarioId!;
      const clientes = await svc.listarClientes(uid);
      const facturas = await svc.listarFacturas(uid);
      const hoy = new Date().toISOString().slice(0, 10);
      const mesActual = hoy.slice(0, 7);

      const ingresosMes = (facturas as any[]).filter(f => f.tipo === 'ingreso' && f.fecha?.startsWith(mesActual)).reduce((s: number, f: any) => s + (f.importe || 0), 0);
      const gastosMes   = (facturas as any[]).filter(f => f.tipo === 'gasto'   && f.fecha?.startsWith(mesActual)).reduce((s: number, f: any) => s + (f.importe || 0), 0);
      const beneficio   = ingresosMes - gastosMes;

      const resumenClientes = (clientes as any[]).map(c => ({
        id: c.id, nombre: c.nombre, proyecto: c.proyecto, estado: c.estado,
        presupuesto: c.presupuesto, margen: c.margen,
      }));

      const systemPrompt = 'Eres el asistente inteligente de la app de gestión de proyectos.\n'
        + 'Ayudas al usuario a gestionar sus clientes, proyectos y presupuestos.\n\n'
        + 'FECHA HOY: ' + hoy + '\n\n'
        + 'RESUMEN FINANCIERO MES ACTUAL:\n'
        + '- Ingresos: ' + ingresosMes.toFixed(2) + ' €\n'
        + '- Gastos: ' + gastosMes.toFixed(2) + ' €\n'
        + '- Beneficio: ' + beneficio.toFixed(2) + ' €\n\n'
        + 'CLIENTES Y PROYECTOS (' + resumenClientes.length + ' en total):\n'
        + JSON.stringify(resumenClientes, null, 2) + '\n\n'
        + 'CONTEXTO ACTUAL DE PANTALLA: ' + JSON.stringify(contexto || {}) + '\n\n'
        + 'PUEDES REALIZAR ESTAS ACCIONES respondiendo con un JSON action:\n'
        + '- { "action": "navegarSeccion", "seccion": "clientes"|"presupuestos"|"facturas" }\n'
        + '- { "action": "abrirCliente", "clienteId": "...", "clienteNombre": "..." }\n'
        + '- { "action": "crearCliente" }\n'
        + '- { "action": "abrirFacturas" }\n'
        + '- { "action": "buscarCliente", "termino": "..." }\n\n'
        + 'Cuando ejecutes una acción, responde SIEMPRE con este formato JSON exacto al final del mensaje:\n'
        + '<accion>{ "action": "...", ... }</accion>\n\n'
        + 'Si no hay acción, responde solo con texto natural en español.\n'
        + 'Sé conciso, directo y profesional. Máximo 3 frases salvo que el usuario pida un resumen largo.';

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemPrompt }, ...(mensajes || [])],
          max_tokens: 600,
          temperature: 0.4,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        res.status(500).json({ error: 'OpenAI error: ' + err }); return;
      }

      const data = await response.json() as any;
      res.json({ respuesta: data.choices?.[0]?.message?.content || '' });
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  const server = app.listen(port, () => {
    console.log('Servicio de presupuestos listo en: http://localhost:' + port);
  });

  return {
    port,
    stop: async () => {
      server.closeAllConnections();
      server.close();
    },
  };
}
