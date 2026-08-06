import { z } from 'zod';

/**
 * Esquemas Zod para validar el cuerpo/parámetros de cada endpoint de
 * `presupuestos-service`. Se conectan a las rutas en `presupuestos-service.app-root.ts`
 * a través del middleware `validar()` (ver `validacion.middleware.ts`).
 *
 * Los límites de longitud son defensivos (evitar payloads abusivos), no
 * reglas de negocio — se basan en los tipos de dominio de `presupuestos-prototype/types.ts`.
 */

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Login: la contraseña viaja en claro sobre HTTPS: el hashing con sal
 * (bcrypt) ocurre exclusivamente en el servidor — ver `password.service.ts`.
 * Antes de la migración de seguridad, el hash se calculaba en el cliente y
 * viajaba como si fuera la contraseña misma; ver `MIGRACION.md`.
 */
export const esquemaLogin = z.object({
  nombre: z.string().trim().min(3, 'El usuario debe tener al menos 3 caracteres.').max(254),
  password: z.string().min(1, 'Falta la contraseña.').max(256),
});

/**
 * Registro: mínimo de 8 caracteres — más estricto que el login (que debe
 * admitir contraseñas de cuentas ya existentes, creadas antes de este mínimo).
 */
export const esquemaRegistro = z.object({
  nombre: z.string().trim().min(3, 'El usuario debe tener al menos 3 caracteres.').max(254),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(256),
});

export const esquemaVerificarSesion = z.object({
  usuarioId: z.string().min(1).max(128),
});

// ── Admin ─────────────────────────────────────────────────────────────────────

export const esquemaCambiarEstadoUsuario = z.object({
  estado: z.enum(['pendiente', 'activo', 'suspendido']),
});

// ── Subdocumentos de Cliente ──────────────────────────────────────────────────

const esquemaMovimiento = z.object({
  id: z.string().min(1).max(64),
  fecha: z.string().min(1).max(32),
  concepto: z.string().max(500),
  categoria: z.string().max(120).default('General'),
  tipo: z.enum(['gasto', 'ingreso']),
  importe: z.number().finite(),
});

const esquemaRegistroHoras = z.object({
  id: z.string().min(1).max(64),
  fecha: z.string().min(1).max(32),
  tarea: z.string().max(500),
  horas: z.number().finite(),
});

const esquemaAdjunto = z.object({
  id: z.string().min(1).max(64),
  nombre: z.string().max(255),
  tipo: z.string().max(120),
  tamano: z.number().finite().nonnegative(),
  url: z.string(),
});

const esquemaFotoProyecto = z.object({
  id: z.string().min(1).max(64),
  url: z.string(),
  descripcion: z.string().max(500).optional().default(''),
  fecha: z.string().min(1).max(32),
});

const esquemaEstancia = z.object({
  id: z.string().min(1).max(64),
  nombre: z.string().max(200),
  ancho: z.number().finite().optional(),
  alto: z.number().finite().optional(),
  fondo: z.number().finite().optional(),
  altura: z.number().finite().optional(),
  anchura: z.number().finite().optional(),
  profundidad: z.number().finite().optional(),
  angulos: z.string().max(300).optional(),
  desniveles: z.string().max(300).optional(),
  escuadra: z.string().max(300).optional(),
  observaciones: z.string().max(1000).optional(),
});

const esquemaNota = z.object({
  id: z.string().min(1).max(64),
  fecha: z.string().min(1).max(32),
  texto: z.string().max(5000),
});

const esquemaTarea = z.object({
  id: z.string().min(1).max(64),
  texto: z.string().max(500),
  hecha: z.boolean(),
});

const esquemaDibujoGuardado = z.object({
  id: z.string().min(1).max(64),
  nombre: z.string().max(200),
  dataUrl: z.string(),
  fecha: z.string().min(1).max(64),
});

// ── Cliente ───────────────────────────────────────────────────────────────────

export const esquemaCliente = z.object({
  id: z.string().min(1).max(128),
  nombre: z.string().trim().min(1).max(200),
  proyecto: z.string().max(300).optional().default(''),
  telefono: z.string().max(50).optional().default(''),
  email: z.string().max(254).optional().default(''),
  direccion: z.string().max(500).optional().default(''),
  presupuesto: z.number().finite().optional().default(0),
  tarifaHora: z.number().finite().optional().default(0),
  creado: z.string().min(1).max(64),
  estado: z.enum(['presupuestado', 'en_curso', 'finalizado', 'rechazado']).optional().default('presupuestado'),
  whatsapp: z.string().max(50).optional(),
  ubicacion: z.string().max(500).optional(),
  codigoPuerta: z.string().max(50).optional(),
  planta: z.string().max(50).optional(),
  ascensor: z.boolean().optional(),
  zonaCarga: z.string().max(300).optional(),
  observacionesAcceso: z.string().max(1000).optional(),
  fechaMedicion: z.string().max(32).optional(),
  fechaMontaje: z.string().max(32).optional(),
  estancias: z.array(esquemaEstancia).optional(),
  notas: z.array(esquemaNota).optional(),
  tareas: z.array(esquemaTarea).optional(),
  movimientos: z.array(esquemaMovimiento).optional().default([]),
  horas: z.array(esquemaRegistroHoras).optional().default([]),
  adjuntos: z.array(esquemaAdjunto).optional().default([]),
  fotos: z.array(esquemaFotoProyecto).optional().default([]),
  dibujos: z.array(esquemaDibujoGuardado).optional(),
});

// ── Factura ───────────────────────────────────────────────────────────────────

export const esquemaFactura = z.object({
  id: z.string().min(1).max(128),
  tipo: z.enum(['ingreso', 'gasto']),
  fecha: z.string().min(1).max(32),
  concepto: z.string().max(500).optional().default(''),
  importe: z.number().finite(),
  proveedor: z.string().max(300).optional().default(''),
  clienteId: z.string().max(128).optional().default(''),
  imagen: z.string().optional().default(''),
  imagenes: z.array(z.string()).optional(),
  creado: z.string().min(1).max(64),
});

// ── Empresa ───────────────────────────────────────────────────────────────────

export const esquemaEmpresa = z.object({
  nombre: z.string().max(200).optional().default(''),
  eslogan: z.string().max(300).optional().default(''),
  logo: z.string().optional().default(''),
});

// ── Notificaciones push ───────────────────────────────────────────────────────

export const esquemaPushSubscribe = z.object({
  usuarioId: z.string().min(1).max(128),
  subscription: z.object({
    endpoint: z.string().min(1),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

// ── Asistente IA ──────────────────────────────────────────────────────────────

const esquemaMensajeChat = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(4000),
});

export const esquemaAsistente = z.object({
  mensajes: z.array(esquemaMensajeChat).max(50).optional().default([]),
  contexto: z.record(z.string(), z.unknown()).optional(),
});
