import { z } from 'zod';
import { validarDocumentoMC, validarElementoMC } from './documento-registro-tipos.js';
import { esquemaTema } from './documento-modelo.js';
import { NOMBRES_EVENTO } from './eventos.service.js';
// El registro de tipos del Motor Documental (Texto, Imagen...) se inicializa
// explícitamente en el bootstrap del servidor — ver
// documento-motor-inicializar.ts / presupuestos-service.app-root.ts. Este
// archivo solo consume `validarDocumentoMC`, nunca inicializa el registro.

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
  /** Opcional — "¿Tienes un código de acceso?" en el registro. Se valida y canjea siempre en el servidor (ver `codigo-promocional.model.ts`), nunca se confía en nada más que en el propio texto del código. */
  codigoPromocional: z.string().trim().max(40).optional(),
});

/** Abrir un hilo de soporte (comentarios/sugerencias/incidencias, 26/08/2026). */
export const esquemaCrearHiloSoporte = z.object({
  tipo: z.enum(['mejora', 'incidencia', 'problema']),
  texto: z.string().trim().min(1, 'Escribe algo antes de enviar.').max(4000),
});

/** Añadir un mensaje a un hilo de soporte ya existente (usuario o admin). */
export const esquemaMensajeSoporte = z.object({
  texto: z.string().trim().min(1, 'Escribe algo antes de enviar.').max(4000),
});

/** Recuperación de contraseña por email (26/08/2026) — pedir el enlace. */
export const esquemaSolicitarRecuperacion = z.object({
  nombre: z.string().trim().min(3).max(254),
});

/** Recuperación de contraseña por email — consumir el token y fijar la contraseña nueva. */
export const esquemaRestablecerPassword = z.object({
  token: z.string().min(10).max(128),
  passwordNueva: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(256),
});

// ── Acceso biométrico (WebAuthn/passkeys) ───────────────────────────────────────
// Verifica solo la forma del payload (tamaños razonables, campos presentes) —
// la seguridad real de la ceremonia (firma, challenge, origin, RP ID) la
// comprueba `@simplewebauthn/server` en `webauthn-rutas.ts`, nunca aquí.

const esquemaBase64URL = z.string().min(1).max(4000);

const esquemaRespuestaAtestacionWebAuthn = z.object({
  clientDataJSON: esquemaBase64URL,
  attestationObject: esquemaBase64URL,
  authenticatorData: esquemaBase64URL.optional(),
  transports: z.array(z.string().max(30)).max(10).optional(),
  publicKeyAlgorithm: z.number().optional(),
  publicKey: esquemaBase64URL.optional(),
});

const esquemaRespuestaAsercionWebAuthn = z.object({
  clientDataJSON: esquemaBase64URL,
  authenticatorData: esquemaBase64URL,
  signature: esquemaBase64URL,
  userHandle: esquemaBase64URL.optional(),
});

/** Body de `POST /auth/webauthn/registro/verificar` — registra un autenticador nuevo para la sesión ya iniciada. */
export const esquemaWebAuthnRegistroVerificar = z.object({
  nombreDispositivo: z.string().trim().min(1, 'Falta el nombre del dispositivo.').max(80),
  respuesta: z.object({
    id: esquemaBase64URL,
    rawId: esquemaBase64URL,
    response: esquemaRespuestaAtestacionWebAuthn,
    authenticatorAttachment: z.string().max(30).optional(),
    clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
    type: z.literal('public-key'),
  }),
});

/** Body de `POST /auth/webauthn/login/verificar` — sin sesión previa: el usuario se resuelve por `credentialId`. */
export const esquemaWebAuthnLoginVerificar = z.object({
  respuesta: z.object({
    id: esquemaBase64URL,
    rawId: esquemaBase64URL,
    response: esquemaRespuestaAsercionWebAuthn,
    authenticatorAttachment: z.string().max(30).optional(),
    clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
    type: z.literal('public-key'),
  }),
});

// ── Admin ─────────────────────────────────────────────────────────────────────

export const esquemaCambiarEstadoUsuario = z.object({
  estado: z.enum(['pendiente', 'activo', 'suspendido']),
});

// ── Códigos promocionales / tipo de acceso ──────────────────────────────────────
// Ningún esquema de esta sección acepta el body tal cual (pass-through): cada
// campo se lista explícitamente, así que un usuario nunca puede colar
// `esAdmin`, `estado` ni nada fuera de esta lista blanca por esta vía.

const TIPOS_ACCESO = ['trial', 'promotional', 'free', 'paid'] as const;
const PLANES_ACCESO = ['NONE', 'LIFETIME_FREE', 'BASIC', 'PRO', 'PREMIUM'] as const;

/** Body de `POST /codigos/canjear` (usuario ya autenticado, canje posterior al registro). */
export const esquemaCanjearCodigo = z.object({
  codigo: z.string().trim().min(1, 'Falta el código.').max(40),
});

/** Body de `POST /admin/codigos` — crear un código promocional nuevo. */
export const esquemaCrearCodigo = z.object({
  codigo: z.string().trim().min(3, 'El código debe tener al menos 3 caracteres.').max(40),
  tipoAccesoConcedido: z.enum(TIPOS_ACCESO),
  planConcedido: z.enum(PLANES_ACCESO),
  duracionDias: z.number().int().positive().max(3650).nullable().optional().default(null),
  usosMaximos: z.number().int().positive().max(1_000_000).nullable().optional().default(null),
  fechaInicio: z.string().max(40).nullable().optional().default(null),
  fechaExpiracion: z.string().max(40).nullable().optional().default(null),
  notas: z.string().max(500).optional().default(''),
});

/** Body de `PUT /admin/codigos/:id` — todo opcional, solo se tocan los campos enviados. */
export const esquemaActualizarCodigo = z.object({
  activo: z.boolean().optional(),
  tipoAccesoConcedido: z.enum(TIPOS_ACCESO).optional(),
  planConcedido: z.enum(PLANES_ACCESO).optional(),
  duracionDias: z.number().int().positive().max(3650).nullable().optional(),
  usosMaximos: z.number().int().positive().max(1_000_000).nullable().optional(),
  fechaInicio: z.string().max(40).nullable().optional(),
  fechaExpiracion: z.string().max(40).nullable().optional(),
  notas: z.string().max(500).optional(),
});

/** Body de `PUT /admin/usuarios/:id/acceso` — cambio manual del tipo de acceso/plan de una cuenta. */
export const esquemaCambiarAccesoUsuario = z.object({
  tipo: z.enum(TIPOS_ACCESO),
  plan: z.enum(PLANES_ACCESO),
  expiraEn: z.string().max(40).nullable().optional().default(null),
});

// ── Costes de infraestructura (panel admin) ─────────────────────────────────────

const PERIODICIDADES_COSTE = ['mensual', 'anual', 'unico'] as const;

/** Body de `POST /admin/costes` — dar de alta una herramienta/servicio nuevo. */
export const esquemaCrearCoste = z.object({
  nombre: z.string().trim().min(1, 'Falta el nombre.').max(80),
  categoria: z.string().trim().max(60).optional().default(''),
  coste: z.number().nonnegative().max(1_000_000),
  moneda: z.string().trim().max(10).optional().default('EUR'),
  periodicidad: z.enum(PERIODICIDADES_COSTE),
  url: z.string().trim().max(300).optional().default(''),
  notas: z.string().trim().max(500).optional().default(''),
});

/** Body de `PUT /admin/costes/:id` — todo opcional, solo se tocan los campos enviados. */
export const esquemaActualizarCoste = z.object({
  nombre: z.string().trim().min(1).max(80).optional(),
  categoria: z.string().trim().max(60).optional(),
  coste: z.number().nonnegative().max(1_000_000).optional(),
  moneda: z.string().trim().max(10).optional(),
  periodicidad: z.enum(PERIODICIDADES_COSTE).optional(),
  url: z.string().trim().max(300).optional(),
  notas: z.string().trim().max(500).optional(),
  activo: z.boolean().optional(),
});

/** "Mi perfil" — nombre para mostrar y foto, siempre del propio usuario autenticado (nunca de otro). */
export const esquemaPerfil = z.object({
  nombreMostrar: z.string().trim().max(200).optional().default(''),
  foto: z.string().optional().default(''),
});

/**
 * Cambiar usuario de acceso y/o contraseña — exige siempre la contraseña
 * actual (verificada en el servidor antes de tocar nada) y al menos uno de
 * los dos cambios; no tiene sentido llamar a esta ruta sin ninguno.
 */
export const esquemaCambiarAcceso = z.object({
  passwordActual: z.string().min(1, 'Falta tu contraseña actual.').max(256),
  nombreNuevo: z.string().trim().min(3, 'El usuario debe tener al menos 3 caracteres.').max(254).optional(),
  passwordNueva: z.string().min(8, 'La contraseña nueva debe tener al menos 8 caracteres.').max(256).optional(),
}).refine((d) => d.nombreNuevo || d.passwordNueva, { message: 'Indica un usuario nuevo, una contraseña nueva, o ambos.' });

// ── Subdocumentos de Cliente ──────────────────────────────────────────────────

const esquemaMovimiento = z.object({
  id: z.string().min(1).max(64),
  fecha: z.string().min(1).max(32),
  concepto: z.string().max(500),
  categoria: z.string().max(120).default('General'),
  tipo: z.enum(['gasto', 'ingreso']),
  importe: z.number().finite(),
  /**
   * Id de la Factura que generó este movimiento (Fase 2). Sin esto, Zod lo
   * quita en silencio de cualquier guardado genérico del cliente (p. ej.
   * editar la pestaña Datos), rompiendo el vínculo con la factura.
   */
  facturaId: z.string().max(128).optional().default(''),
});

/**
 * Cuerpo de las rutas dedicadas para añadir/editar un movimiento manual
 * (POST/PUT /clientes/:id/movimientos...) — Hardening (Fase 2). Sin `id` ni
 * `facturaId`: el id lo genera el servidor, y un movimiento creado por
 * estas rutas nunca lleva factura de origen.
 */
export const esquemaMovimientoEntrada = z.object({
  fecha: z.string().min(1).max(32),
  concepto: z.string().max(500),
  categoria: z.string().max(120).optional().default('General'),
  tipo: z.enum(['gasto', 'ingreso']),
  importe: z.number().finite(),
});

const esquemaRegistroHoras = z.object({
  id: z.string().min(1).max(64),
  fecha: z.string().min(1).max(32),
  tarea: z.string().max(500),
  horas: z.number().finite(),
});

/**
 * Metadatos opcionales de almacenamiento (Incremento 1.7). Nunca los rellena
 * el cliente al subir un archivo nuevo (Base64) — solo viajan de vuelta al
 * editar un cliente cuyos archivos ya se subieron a almacenamiento externo
 * en un guardado anterior, para que el round-trip no los pierda.
 */
const camposAlmacenamiento = {
  claveAlmacenamiento: z.string().max(300).optional(),
  subidoEn: z.string().max(64).optional(),
};

const esquemaAdjunto = z.object({
  id: z.string().min(1).max(64),
  nombre: z.string().max(255),
  tipo: z.string().max(120),
  tamano: z.number().finite().nonnegative(),
  url: z.string(),
  ...camposAlmacenamiento,
});

const esquemaFotoProyecto = z.object({
  id: z.string().min(1).max(64),
  url: z.string(),
  descripcion: z.string().max(500).optional().default(''),
  fecha: z.string().min(1).max(32),
  tamano: z.number().finite().nonnegative().optional(),
  tipoMime: z.string().max(120).optional(),
  ...camposAlmacenamiento,
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

/**
 * Característica estructurada del trabajo (Histórico Inteligente, Fase
 * 2A) — ver `CaracteristicaTrabajoSchema` en `cliente.model.ts`. `clave`
 * no se restringe a un enum a propósito: nuevas características futuras
 * son valores nuevos de `clave`, nunca un cambio de esquema.
 */
const esquemaCaracteristica = z.object({
  clave: z.string().min(1).max(60),
  valor: z.string().min(1).max(300),
  origen: z.enum(['usuario', 'ia']),
  confirmadoPorUsuario: z.boolean(),
  confianza: z.enum(['alta', 'media', 'baja']).nullable().optional().default(null),
  fecha: z.string().min(1).max(64),
});

/** Cuerpo de PUT /proyectos/:id/caracteristica — el usuario solo aporta `clave`/`valor`; `origen`/`confirmadoPorUsuario`/`confianza` los decide siempre el servidor (ver `guardarCaracteristicaProyecto`), nunca el cliente. */
export const esquemaCaracteristicaEntrada = z.object({
  clave: z.string().min(1).max(60),
  valor: z.string().trim().min(1).max(300),
});

const esquemaNota = z.object({
  id: z.string().min(1).max(64),
  fecha: z.string().min(1).max(32),
  texto: z.string().max(5000),
});

export const esquemaTarea = z.object({
  id: z.string().min(1).max(64),
  texto: z.string().max(500),
  hecha: z.boolean(),
});

/** Cuerpo de PUT /clientes/:id/tareas — Hardening (Fase 2). */
export const esquemaTareasEntrada = z.object({
  tareas: z.array(esquemaTarea),
});

/** Cuerpo de PUT /clientes/:id/estado — Hardening (Fase 2). */
export const esquemaEstadoClienteEntrada = z.object({
  estado: z.enum(['presupuestado', 'en_curso', 'finalizado', 'rechazado']),
});

/** Cuerpo de PUT /clientes/:id/presupuesto — Hardening (Fase 2). */
export const esquemaPresupuestoClienteEntrada = z.object({
  presupuesto: z.number().finite(),
});

// ── Cliente ───────────────────────────────────────────────────────────────────

/**
 * Límite defensivo del total de bytes en fotos + adjuntos de un mismo
 * proyecto (Incremento 1.3), medido sobre el Base64 de ENTRADA (antes de
 * `procesarFotos`/`procesarAdjuntos` subirlos a almacenamiento externo y
 * sustituir `url` por un enlace corto) — así que en la práctica solo pesan
 * aquí las fotos/adjuntos NUEVOS de este guardado; los ya subidos antes
 * llegan como URL corta y apenas cuentan.
 *
 * Bug real, 26/08/2026: 8 MB bastaba para 1-2 fotos de móvil ya
 * comprimidas, pero no para un lote real (varias fotos de una obra
 * terminada subidas de una vez) — la petición fallaba la validación con
 * 400 antes de llegar a `guardarProyecto`, y el fallo se perdía en
 * silencio en el cliente (`use-proyectos.ts` solo revertía la lista, sin
 * avisar), así que las fotos parecían subir pero desaparecían al volver a
 * abrir el proyecto. Subido a 24 MB, con margen bajo el límite de 25 MB de
 * `express.json` (`presupuestos-service.app-root.ts`).
 */
export const LIMITE_BLOBS_CLIENTE_BYTES = 24 * 1024 * 1024;

/**
 * Tamaño en bytes de una cadena tal como se almacenará en MongoDB (BSON
 * codifica los strings en UTF-8). Es el tamaño real del campo, no una
 * aproximación: no incluye el pequeño overhead fijo de BSON por campo
 * (marcador de tipo, nombre de campo, prefijo de longitud — del orden de
 * decenas de bytes por subdocumento), despreciable frente al margen de este
 * límite.
 */
function tamanoBytesAlmacenados(valor: string): number {
  return Buffer.byteLength(valor, 'utf8');
}

/**
 * Identidad de un cliente — desde el incremento "Cliente ≠ Proyecto"
 * (especificación del usuario, 20/08/2026) ya no lleva ningún dato de un
 * trabajo concreto (eso vive en `esquemaProyecto`, más abajo). Un cliente
 * puede tener muchos proyectos; sus datos de contacto se editan una sola
 * vez y valen para todos.
 */
export const esquemaCliente = z.object({
  id: z.string().min(1).max(128),
  nombre: z.string().trim().min(1).max(200),
  telefono: z.string().max(50).optional().default(''),
  email: z.string().max(254).optional().default(''),
  /** DNI/NIE del cliente — dato de identidad (24/08/2026). */
  dni: z.string().max(20).optional().default(''),
  creado: z.string().min(1).max(64),
});

/** Cuerpo de POST /clientes — crea solo la identidad; el primer proyecto se crea aparte con `esquemaProyectoEntrada`. */
export const esquemaClienteEntrada = z.object({
  nombre: z.string().trim().min(1).max(200),
  telefono: z.string().max(50).optional().default(''),
  email: z.string().max(254).optional().default(''),
  dni: z.string().max(20).optional().default(''),
});

/**
 * Un proyecto/expediente de trabajo — mismo shape que el `Cliente` de
 * antes de este incremento, menos los campos de identidad, más
 * `clienteId`. La gestión económica y documental de cada proyecto es
 * exclusiva suya: crear un proyecto nuevo para un cliente ya existente
 * nunca copia gastos/ingresos/documentos/mediciones/fotos de otro proyecto
 * suyo (petición explícita del usuario).
 */
/**
 * Bug real, 26/08/2026: `.optional()`/`.default()` en zod solo cubren
 * `undefined` — un proyecto real (guardado antes de que este campo
 * existiera, o tocado por un script/migración) puede tener el campo
 * literalmente a `null` en Mongo, y eso rechazaba TODO el guardado con
 * "Invalid input: expected string, received null" mucho antes de llegar
 * al `refine` de más abajo. `.nullish()` (nullable + optional) + un
 * `transform` que sustituye `null`/`undefined` por el valor por defecto
 * cubre los dos casos a la vez.
 */
const textoOpcional = (max: number) => z.string().max(max).nullish().transform((v) => v ?? '');
const numeroOpcional = (porDefecto: number) => z.number().finite().nullish().transform((v) => v ?? porDefecto);
const arrayOpcional = <T extends z.ZodTypeAny>(esquema: T) => z.array(esquema).nullish().transform((v) => v ?? []);

export const esquemaProyecto = z.object({
  id: z.string().min(1).max(128),
  clienteId: z.string().min(1).max(128),
  proyecto: textoOpcional(300),
  direccion: textoOpcional(500),
  presupuesto: numeroOpcional(0),
  tarifaHora: numeroOpcional(0),
  creado: z.string().min(1).max(64),
  estado: z.enum(['presupuestado', 'en_curso', 'finalizado', 'rechazado']).nullish().transform((v) => v ?? 'presupuestado'),
  whatsapp: textoOpcional(50),
  ubicacion: textoOpcional(500),
  codigoPuerta: textoOpcional(50),
  planta: textoOpcional(50),
  ascensor: z.boolean().nullish().transform((v) => v ?? false),
  zonaCarga: textoOpcional(300),
  observacionesAcceso: textoOpcional(1000),
  fechaMedicion: textoOpcional(32),
  fechaMontaje: textoOpcional(32),
  /** Histórico Inteligente (Fase 2A) — sin esto, el PUT genérico de proyecto borraría en silencio las características ya guardadas al no reconocer el campo. */
  caracteristicas: arrayOpcional(esquemaCaracteristica),
  estancias: arrayOpcional(esquemaEstancia),
  tareas: arrayOpcional(esquemaTarea),
  movimientos: arrayOpcional(esquemaMovimiento),
  horas: arrayOpcional(esquemaRegistroHoras),
  adjuntos: arrayOpcional(esquemaAdjunto),
  fotos: arrayOpcional(esquemaFotoProyecto),
}).refine(
  (proyecto) => {
    const total =
      (proyecto.fotos ?? []).reduce((suma, f) => suma + tamanoBytesAlmacenados(f.url), 0) +
      (proyecto.adjuntos ?? []).reduce((suma, a) => suma + tamanoBytesAlmacenados(a.url), 0);
    return total <= LIMITE_BLOBS_CLIENTE_BYTES;
  },
  { message: `El total de fotos y adjuntos supera el límite de ${LIMITE_BLOBS_CLIENTE_BYTES / (1024 * 1024)} MB por proyecto.` }
);

/**
 * Cuerpo de POST /proyectos — crea un proyecto nuevo (para un cliente
 * nuevo o ya existente, da igual: `clienteId` siempre lo decide quien
 * llama). Deliberadamente SIN `movimientos`/`horas`/`adjuntos`/`fotos`/
 * `dibujos`/`estancias`/`tareas`/`margenAvisado`: un proyecto nuevo
 * siempre empieza completamente en cero (especificación del usuario,
 * punto 4) — esos campos ni se aceptan aquí, los pone el servidor a `[]`.
 */
export const esquemaProyectoEntrada = z.object({
  clienteId: z.string().min(1).max(128),
  proyecto: z.string().max(300).optional().default(''),
  direccion: z.string().max(500).optional().default(''),
  presupuesto: z.number().finite().optional().default(0),
  tarifaHora: z.number().finite().optional().default(0),
  whatsapp: z.string().max(50).optional(),
  ubicacion: z.string().max(500).optional(),
  codigoPuerta: z.string().max(50).optional(),
  planta: z.string().max(50).optional(),
  ascensor: z.boolean().optional(),
  zonaCarga: z.string().max(300).optional(),
  observacionesAcceso: z.string().max(1000).optional(),
  fechaMedicion: z.string().max(32).optional(),
  fechaMontaje: z.string().max(32).optional(),
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

  // ── Ampliación documental/fiscal (Fase Facturas Profesional) ──
  numeroFactura: z.string().max(100).optional().default(''),
  cifNif: z.string().max(20).optional().default(''),
  baseImponible: z.number().finite().optional(),
  tipoImpuesto: z.enum(['igic', 'iva', '']).optional().default(''),
  porcentajeImpuesto: z.number().finite().optional(),
  importeImpuesto: z.number().finite().optional(),
  categoria: z.string().max(100).optional().default(''),
  proyectoId: z.string().max(128).optional().default(''),
  proveedorId: z.string().max(128).optional().default(''),
  origen: z.enum(['escaner', 'foto', 'pdf', 'manual', '']).optional().default(''),
  pdfUrl: z.string().optional().default(''),
  pdfOriginalUrl: z.string().optional().default(''),
  paginas: z.array(z.object({ tipo: z.enum(['imagen', 'pdf']), url: z.string() })).optional(),
});

// ── Gastos periódicos/estimados (Fase Facturas Profesional) ────────────────────

export const esquemaGastoPeriodico = z.object({
  id: z.string().min(1).max(128),
  tipo: z.enum(['amortizacion', 'reta', 'suministro', 'provision', 'otro']),
  descripcion: z.string().min(1).max(300),
  importe: z.number().finite(),
  periodicidad: z.enum(['mensual', 'trimestral']).optional().default('mensual'),
  valorAdquisicion: z.number().finite().optional(),
  categoriaBien: z.string().max(100).optional().default(''),
  coeficiente: z.number().finite().optional(),
  fechaInicio: z.string().max(32).optional().default(''),
  afectacionExclusiva: z.boolean().nullable().optional().default(null),
  nota: z.string().max(500).optional().default(''),
  activo: z.boolean().optional().default(true),
  creado: z.string().min(1).max(64),
});

// ── Proveedores y productos (Fase "Integración completa") ──────────────────────

export const esquemaProveedor = z.object({
  id: z.string().min(1).max(64),
  nombre: z.string().trim().min(1).max(200),
  contacto: z.string().max(200).optional().default(''),
  cifNif: z.string().max(20).optional().default(''),
  telefono: z.string().max(50).optional().default(''),
  email: z.string().max(254).optional().default(''),
  direccion: z.string().max(500).optional().default(''),
  codigoPostal: z.string().max(12).optional().default(''),
  notas: z.string().max(2000).optional().default(''),
  creado: z.string().min(1).max(64),
});

/** Un elemento de una nota de tipo "lista" — parecido a `Tarea` (`Proyecto.tareas`), embebido en la nota, pero con prioridad propia (petición explícita del usuario, 26/08/2026). */
const esquemaItemLista = z.object({
  id: z.string().min(1).max(64),
  texto: z.string().trim().min(1).max(500),
  hecha: z.boolean().optional().default(false),
  prioridad: z.enum(['alta', 'media', 'baja']).optional().default('media'),
});

/**
 * Nota (rediseño del módulo de Notas) — entidad propia, puede existir sola
 * o asociada a un cliente/proyecto. `titulo` es opcional (una nota rápida
 * puede ser solo contenido).
 *
 * `tipo: 'lista'` (26/08/2026) la convierte en un checklist: `items` lleva
 * el contenido real y `contenido` puede quedar vacío — al revés que una
 * nota de texto normal, donde `contenido` es lo único obligatorio.
 */
export const esquemaNotaMC = z.object({
  id: z.string().min(1).max(64),
  titulo: z.string().max(200).optional().default(''),
  contenido: z.string().trim().max(10000).optional().default(''),
  tipo: z.enum(['nota', 'lista']).optional().default('nota'),
  items: z.array(esquemaItemLista).max(200).optional().default([]),
  prioridad: z.enum(['alta', 'media', 'baja']).optional().default('media'),
  estado: z.enum(['abierta', 'hecha']).optional().default('abierta'),
  clienteId: z.string().max(64).optional().default(''),
  proyectoId: z.string().max(64).optional().default(''),
  etiquetas: z.array(z.string().max(50)).max(20).optional().default([]),
  origen: z.enum(['texto', 'voz']).optional().default('texto'),
  creado: z.string().min(1).max(64),
  actualizado: z.string().min(1).max(64),
}).refine(
  (n) => (n.tipo === 'lista' ? n.items.length > 0 : n.contenido.length > 0),
  { message: 'La nota no puede estar vacía.' }
);

/** Código QR guardado (sección propia del menú, 19/08/2026) — imagen ya subida a la biblioteca de recursos, aquí solo el nombre y a qué url apunta. */
export const esquemaCodigoQRMC = z.object({
  id: z.string().min(1).max(64),
  nombre: z.string().trim().min(1, 'Ponle un nombre al código QR.').max(200),
  imagenUrl: z.string().min(1).max(2000),
  creado: z.string().min(1).max(64),
});

/** Un elemento de precio individual dentro del alcance de un presupuesto (Fase 5). */
const esquemaElementoPresupuesto = z.object({
  id: z.string().min(1).max(64),
  concepto: z.string().trim().min(1).max(300),
  precio: z.number().finite(),
});

/**
 * Presupuesto (Fase 5 — copiloto de Presupuestos, primera versión mínima):
 * presupuestos narrativos, no listas de materiales. `alcance` son
 * descriptores del trabajo sin precio individual; `items` son añadidos
 * posteriores con su propio precio (p. ej. "cuatro cajones interiores,
 * 480€"), que se suman a `precioTotal`.
 */
/**
 * Límite defensivo del contenido de un presupuesto en modo lienzo — mismo
 * criterio que `LIMITE_CONTENIDO_DIBUJO_BYTES`. Las imágenes insertadas en
 * el lienzo se suben a almacenamiento externo (no quedan embebidas como
 * Base64), así que este límite cubre el propio JSON de la escena de
 * Excalidraw (posiciones, texto, referencias a archivos), no las fotos.
 */
export const LIMITE_CONTENIDO_PRESUPUESTO_BYTES = 4 * 1024 * 1024;

export const esquemaPresupuestoMC = z.object({
  id: z.string().min(1).max(64),
  clienteId: z.string().min(1).max(128),
  /** Proyecto/expediente al que pertenece (incremento "Cliente ≠ Proyecto", 20/08/2026) — `''` si se creó fuera de la ficha de un proyecto (p. ej. el asistente global). */
  proyectoId: z.string().max(128).optional().default(''),
  titulo: z.string().trim().min(1).max(200),
  formato: z.enum(['simple', 'lienzo', 'documento']).optional().default('simple'),
  descripcion: z.string().max(10000).optional().default(''),
  alcance: z.array(z.string().max(300)).max(50).optional().default([]),
  items: z.array(esquemaElementoPresupuesto).max(100).optional().default([]),
  /** LEGADO — escena de Excalidraw ({ elements, files }), estructura interna de la librería, no se valida campo a campo. Ver ARQUITECTURA-MOTOR-DOCUMENTAL.md. */
  contenidoLienzo: z.record(z.string(), z.unknown()).optional().default({}),
  /** `DocumentoMC` real cuando `formato === 'documento'` — validado estrictamente más abajo, a diferencia de `contenidoLienzo`. */
  contenidoDocumento: z.record(z.string(), z.unknown()).optional().default({}),
  condicionesPago: z.string().max(2000).optional().default(''),
  validezDias: z.number().int().min(1).max(365).optional().default(30),
  condicionesGenerales: z.string().max(5000).optional().default(''),
  precioTotal: z.number().finite().optional().default(0),
  creado: z.string().min(1).max(64),
  actualizado: z.string().min(1).max(64),
}).refine(
  (p) => tamanoBytesAlmacenados(JSON.stringify(p.contenidoLienzo)) <= LIMITE_CONTENIDO_PRESUPUESTO_BYTES,
  { message: `El contenido del presupuesto supera el límite de ${LIMITE_CONTENIDO_PRESUPUESTO_BYTES / (1024 * 1024)} MB.` }
).refine(
  (p) => tamanoBytesAlmacenados(JSON.stringify(p.contenidoDocumento)) <= LIMITE_CONTENIDO_PRESUPUESTO_BYTES,
  { message: `El contenido del documento supera el límite de ${LIMITE_CONTENIDO_PRESUPUESTO_BYTES / (1024 * 1024)} MB.` }
).superRefine((p, ctx) => {
  if (p.formato !== 'documento') return;
  try {
    validarDocumentoMC(p.contenidoDocumento);
  } catch (err) {
    ctx.addIssue({ code: 'custom', path: ['contenidoDocumento'], message: err instanceof Error ? err.message : 'contenidoDocumento no es un DocumentoMC válido.' });
  }
});

/**
 * Cuerpo de POST /portal/presupuestos/:token/aceptar (Portal del cliente) —
 * la firma es obligatoria (aceptar = firmar). Límite de longitud del propio
 * data URL en base64 (~400 KB de imagen decodificada) como primera defensa
 * barata contra un payload enorme, antes de gastar trabajo decodificándolo
 * o subiéndolo a almacenamiento — ver `aceptarPresupuestoPublico`, que
 * además comprueba la cabecera PNG real tras decodificar.
 */
export const esquemaAceptarPortalPublico = z.object({
  firma: z.string().min(100).max(600_000).regex(/^data:image\/png;base64,/, 'La firma debe ser una imagen PNG.'),
});

/** Un hito de cobro editado a mano (roadmap "cobros pendientes", 18/08/2026). */
const esquemaCobro = z.object({
  id: z.string().min(1).max(64),
  concepto: z.string().trim().min(1).max(300),
  importe: z.number().finite(),
  /** Fecha ISO de cobro, o cadena vacía si sigue pendiente — nunca `null` (Mongoose ya usa `''` como default). */
  cobradoEn: z.string().max(40).optional().default(''),
});

/** Lista completa de cobros de un presupuesto — se sustituye entera, no por hito individual (más simple, y el usuario puede añadir/quitar filas libremente en el mismo guardado). */
export const esquemaActualizarCobros = z.object({
  cobros: z.array(esquemaCobro).max(50),
});

/** Un tipo de notificación: activo/inactivo + su propia hora (18/08/2026 — antes horas/margen/cobros/briefing compartían una hora fija de servidor, sin poder cambiarla). */
const esquemaPreferenciaNotifTipo = z.object({
  activo: z.boolean().optional().default(true),
  hora: z.number().int().min(0).max(23),
  minuto: z.number().int().min(0).max(59).optional().default(0),
});

/** Interruptores + hora por tipo de notificación (panel de notificaciones, 18/08/2026). */
export const esquemaNotifPrefs = z.object({
  horas: esquemaPreferenciaNotifTipo,
  cobrosPendientes: esquemaPreferenciaNotifTipo,
  margenBajo: esquemaPreferenciaNotifTipo,
  briefingDiario: esquemaPreferenciaNotifTipo,
  /**
   * Aviso push al admin cuando alguien nuevo se registra (25/08/2026,
   * reporte real: un usuario se registró y el admin no se enteró porque el
   * push no estaba activo en su dispositivo en ese momento). Sin hora
   * propia a propósito — es un aviso al momento del evento, no algo
   * programado a una hora fija del día como el resto de tipos de arriba.
   */
  nuevoUsuario: z.boolean().optional().default(true),
  /** Aviso push al admin cuando un usuario abre/responde un hilo de soporte (26/08/2026) — mismo criterio que `nuevoUsuario`. */
  mensajeSoporte: z.boolean().optional().default(true),
});

const esquemaRecordatorioPersonalizado = z.object({
  id: z.string().min(1).max(64),
  texto: z.string().trim().min(1).max(200),
  hora: z.number().int().min(0).max(23),
  activo: z.boolean().optional().default(true),
});

/** Lista completa de recordatorios propios — mismo criterio que `esquemaActualizarCobros`: se sustituye entera. */
export const esquemaActualizarRecordatorios = z.object({
  recordatorios: z.array(esquemaRecordatorioPersonalizado).max(20),
});

/** Límite defensivo de una plantilla — mismo criterio que un presupuesto en formato documento. */
export const LIMITE_CONTENIDO_PLANTILLA_BYTES = 4 * 1024 * 1024;

export const esquemaPlantillaMC = z.object({
  id: z.string().min(1).max(64),
  nombre: z.string().trim().min(1).max(200),
  ambito: z.enum(['corporativa', 'usuario', 'compartida', 'ia']).optional().default('usuario'),
  documentoBase: z.record(z.string(), z.unknown()),
  creadoEn: z.string().min(1).max(64),
  actualizadoEn: z.string().min(1).max(64),
}).refine(
  (p) => tamanoBytesAlmacenados(JSON.stringify(p.documentoBase)) <= LIMITE_CONTENIDO_PLANTILLA_BYTES,
  { message: `El contenido de la plantilla supera el límite de ${LIMITE_CONTENIDO_PLANTILLA_BYTES / (1024 * 1024)} MB.` }
).superRefine((p, ctx) => {
  try {
    validarDocumentoMC(p.documentoBase);
  } catch (err) {
    ctx.addIssue({ code: 'custom', path: ['documentoBase'], message: err instanceof Error ? err.message : 'documentoBase no es un DocumentoMC válido.' });
  }
});

/** Límite defensivo de un recurso subido a la biblioteca — mismo criterio que el logo de Empresa (Incremento 5). */
export const LIMITE_RECURSO_BYTES = 8 * 1024 * 1024;

export const esquemaSubidaRecurso = z.object({
  nombre: z.string().trim().min(1).max(200),
  tipo: z.enum(['logo', 'icono', 'imagen', 'fondo', 'sello', 'otro']).optional().default('otro'),
  ambito: z.enum(['corporativa', 'usuario']).optional().default('usuario'),
  etiquetas: z.array(z.string().max(50)).max(20).optional().default([]),
  dataUrl: z.string().refine((v) => /^data:[^;]+;base64,/.test(v), 'dataUrl debe ser un data URL en base64.'),
}).refine(
  (r) => tamanoBytesAlmacenados(r.dataUrl) <= LIMITE_RECURSO_BYTES,
  { message: `El archivo supera el límite de ${LIMITE_RECURSO_BYTES / (1024 * 1024)} MB.` }
);

export const esquemaActualizarRecurso = z.object({
  nombre: z.string().trim().min(1).max(200).optional(),
  etiquetas: z.array(z.string().max(50)).max(20).optional(),
});

/** Límite defensivo de un componente — mismo criterio que una plantilla (Incremento 6). */
export const LIMITE_CONTENIDO_COMPONENTE_BYTES = 4 * 1024 * 1024;

export const esquemaComponenteMC = z.object({
  id: z.string().min(1).max(64),
  nombre: z.string().trim().min(1).max(200),
  tipo: z.enum(['cabecera', 'pie', 'firma', 'condiciones', 'bloqueCorporativo', 'libre']).optional().default('libre'),
  elementos: z.array(z.record(z.string(), z.unknown())).default([]),
  ambito: z.enum(['corporativa', 'usuario']).optional().default('usuario'),
  creadoEn: z.string().min(1).max(64),
  actualizadoEn: z.string().min(1).max(64),
}).refine(
  (c) => tamanoBytesAlmacenados(JSON.stringify(c.elementos)) <= LIMITE_CONTENIDO_COMPONENTE_BYTES,
  { message: `El contenido del componente supera el límite de ${LIMITE_CONTENIDO_COMPONENTE_BYTES / (1024 * 1024)} MB.` }
).superRefine((c, ctx) => {
  for (let i = 0; i < c.elementos.length; i++) {
    try {
      validarElementoMC(c.elementos[i]);
    } catch (err) {
      ctx.addIssue({ code: 'custom', path: ['elementos', i], message: err instanceof Error ? err.message : 'Elemento no válido.' });
    }
  }
});

/**
 * `AutomatizacionMC` (Motor Documental, Incremento 11, sección 11.2) — se
 * suscribe a un evento ya existente del bus (`NOMBRES_EVENTO`), y si
 * `condicion` coincide con `evento.datos` (igualdad exacta por clave;
 * `{}` coincide siempre), ejecuta `accion`. `crearDocumento` está aceptada
 * en el tipo por completitud con la arquitectura, pero no tiene
 * implementación todavía (ver `automatizaciones-listener.ts`) — la propia
 * arquitectura la deja como "ejemplo de uso futuro, no se implementa
 * ahora", así que una automatización con esa acción se registra pero no
 * hace nada hasta un incremento futuro (se avisa en el log, nunca falla
 * en silencio).
 */
export const esquemaAutomatizacionMC = z.object({
  id: z.string().min(1).max(64),
  nombre: z.string().trim().min(1).max(200),
  evento: z.enum(NOMBRES_EVENTO),
  activa: z.boolean().optional().default(true),
  /** Coincidencia exacta por clave contra `EventoDominio.datos` — `{}` (por defecto) coincide con cualquier evento de ese nombre. */
  condicion: z.record(z.string(), z.unknown()).optional().default({}),
  accion: z.enum(['crearDocumento', 'modificarElemento', 'notificar']),
  configuracionAccion: z.record(z.string(), z.unknown()).optional().default({}),
  creadoEn: z.string().min(1).max(64),
  actualizadoEn: z.string().min(1).max(64),
});

/**
 * Contrato (Motor Documental, Incremento 12 — segundo tipo de documento) —
 * a diferencia de `esquemaPresupuestoMC`, nace ya como `DocumentoMC` puro:
 * sin `formato` ni `contenidoLienzo` (esa dualidad es transición histórica
 * propia de Presupuesto), `contenidoDocumento` se valida siempre, no solo
 * condicionalmente. Mismo límite defensivo de tamaño que un presupuesto en
 * modo documento.
 */
export const esquemaContratoMC = z.object({
  id: z.string().min(1).max(64),
  clienteId: z.string().min(1).max(128),
  titulo: z.string().trim().min(1).max(200),
  contenidoDocumento: z.record(z.string(), z.unknown()).optional().default({}),
  creado: z.string().min(1).max(64),
  actualizado: z.string().min(1).max(64),
}).refine(
  (c) => tamanoBytesAlmacenados(JSON.stringify(c.contenidoDocumento)) <= LIMITE_CONTENIDO_PRESUPUESTO_BYTES,
  { message: `El contenido del contrato supera el límite de ${LIMITE_CONTENIDO_PRESUPUESTO_BYTES / (1024 * 1024)} MB.` }
).superRefine((c, ctx) => {
  try {
    validarDocumentoMC(c.contenidoDocumento);
  } catch (err) {
    ctx.addIssue({ code: 'custom', path: ['contenidoDocumento'], message: err instanceof Error ? err.message : 'contenidoDocumento no es un DocumentoMC válido.' });
  }
});

export const esquemaProducto = z.object({
  id: z.string().min(1).max(64),
  nombre: z.string().trim().min(1).max(300),
  descripcion: z.string().max(1000).optional().default(''),
  unidad: z.string().min(1).max(20),
  precio: z.number().finite().nonnegative(),
  proveedorId: z.string().max(64).optional().default(''),
  fechaPrecio: z.string().max(64).optional().default(''),
  categoria: z.string().max(120).optional().default(''),
});

// ── Dibujos (Módulo profesional de dibujo, Fase 2.1) ────────────────────────────

/**
 * Límites defensivos por dibujo — mismo criterio que
 * LIMITE_BLOBS_CLIENTE_BYTES, pero aplicados al documento propio de cada
 * dibujo: al vivir en su propia colección (no dentro del cliente), el
 * límite compartido de ese documento ya no los cubre. `contenido` es el
 * snapshot vectorial de tldraw (JSON, normalmente ligero); `miniatura`
 * llega en Base64 y se sube a almacenamiento externo al guardar (mismo
 * patrón que fotos/adjuntos, Incremento 1.7) — el límite aquí es sobre el
 * Base64 de entrada, no sobre lo que queda finalmente en Mongo.
 */
export const LIMITE_CONTENIDO_DIBUJO_BYTES = 4 * 1024 * 1024;
export const LIMITE_MINIATURA_DIBUJO_BYTES = 1 * 1024 * 1024;

export const esquemaDibujo = z.object({
  id: z.string().min(1).max(128),
  /** Ficha de cliente a la que pertenece — vacío para un dibujo "temporal". */
  clienteId: z.string().max(128).optional().default(''),
  /** Carpeta del cliente que lo contiene — vacío si aún no se ha archivado. */
  carpetaId: z.string().max(128).optional().default(''),
  /** Reservado para agrupar dibujos por proyecto en una fase futura. */
  proyectoId: z.string().max(128).optional().default(''),
  nombre: z.string().trim().min(1).max(200),
  miniatura: z.string().optional().default(''),
  /** Escena de Excalidraw (elements/files) — estructura interna de la librería, no se valida campo a campo. */
  contenido: z.record(z.string(), z.unknown()).optional().default({}),
  version: z.number().int().min(1).optional().default(1),
  /** Reservado: aún sin interfaz para gestionarlas. */
  etiquetas: z.array(z.string().max(50)).max(20).optional().default([]),
}).refine(
  (d) => tamanoBytesAlmacenados(JSON.stringify(d.contenido)) <= LIMITE_CONTENIDO_DIBUJO_BYTES,
  { message: `El contenido del dibujo supera el límite de ${LIMITE_CONTENIDO_DIBUJO_BYTES / (1024 * 1024)} MB.` }
).refine(
  (d) => tamanoBytesAlmacenados(d.miniatura) <= LIMITE_MINIATURA_DIBUJO_BYTES,
  { message: `La miniatura del dibujo supera el límite de ${LIMITE_MINIATURA_DIBUJO_BYTES / (1024 * 1024)} MB.` }
);

/** Carpeta de dibujos dentro de la ficha de un cliente (Fase 2.2). */
export const esquemaCarpeta = z.object({
  id: z.string().min(1).max(128),
  clienteId: z.string().min(1).max(128),
  nombre: z.string().trim().min(1).max(100),
});

/** Renombrar una carpeta — el id va en la URL, aquí solo el nuevo nombre. */
export const esquemaRenombrarCarpeta = z.object({
  nombre: z.string().trim().min(1).max(100),
});

// ── Paginación (Incremento 1.5) ─────────────────────────────────────────────────

/** Tamaño de página por defecto para listados paginados. */
export const TAMANO_PAGINA_DEFECTO = 30;

/** Tamaño de página máximo aceptado, para evitar que un cliente pida páginas abusivamente grandes. */
export const TAMANO_PAGINA_MAXIMO = 100;

/** Query de `GET /clientes`. */
export const esquemaPaginacionClientes = z.object({
  pagina: z.coerce.number().int().min(1).optional().default(1),
  limite: z.coerce.number().int().min(1).max(TAMANO_PAGINA_MAXIMO).optional().default(TAMANO_PAGINA_DEFECTO),
});

/**
 * Query de `GET /facturas`. Si se indica `anio`, se ignoran `pagina`/`limite`
 * y se devuelve el año completo sin paginar — pensado para el resumen
 * trimestral (`Trimestres`), que necesita el año entero para ser correcto,
 * un volumen que en un negocio pequeño está acotado por diseño.
 */
export const esquemaPaginacionFacturas = z.object({
  pagina: z.coerce.number().int().min(1).optional().default(1),
  limite: z.coerce.number().int().min(1).max(TAMANO_PAGINA_MAXIMO).optional().default(TAMANO_PAGINA_DEFECTO),
  tipo: z.enum(['ingreso', 'gasto', 'todas']).optional().default('todas'),
  anio: z.coerce.number().int().min(2000).max(2200).optional(),
  /** Junto con `anio`, acota el año completo a un único trimestre (1-4) — para navegar las facturas por carpetas. */
  trimestre: z.coerce.number().int().min(1).max(4).optional(),
  /** Devuelve, sin paginar, las facturas de un cliente concreto — incluye las de TODOS sus proyectos; para una ficha de proyecto usa `proyectoId`. */
  clienteId: z.string().max(128).optional(),
  /** Devuelve, sin paginar, las facturas de UN proyecto concreto (incremento "Cliente ≠ Proyecto", 20/08/2026) — nunca mezcla las de otro proyecto del mismo cliente. */
  proyectoId: z.string().max(128).optional(),
  /** Devuelve, sin paginar, las facturas cuyo proveedor coincide (búsqueda difusa) con este nombre. */
  proveedor: z.string().max(300).optional(),
});

// ── Empresa ───────────────────────────────────────────────────────────────────

export const esquemaEmpresa = z.object({
  nombre: z.string().max(200).optional().default(''),
  /** Nombre y apellidos del titular real (autónomo) — ver `EmpresaSchema.titular` en `cliente.model.ts`. */
  titular: z.string().max(200).optional().default(''),
  eslogan: z.string().max(300).optional().default(''),
  logo: z.string().optional().default(''),
  nifCif: z.string().max(20).optional().default(''),
  telefono: z.string().max(50).optional().default(''),
  email: z.string().max(254).optional().default(''),
  iban: z.string().max(34).optional().default(''),
  condicionesPagoDefecto: z.string().max(2000).optional().default('60% al aceptar el presupuesto / 40% al finalizar el trabajo.'),
  validezDiasDefecto: z.number().int().min(1).max(365).optional().default(30),
  temaPorDefecto: esquemaTema.nullable().optional().default(null),
  regionFiscal: z.enum(['canarias', 'peninsula', '']).optional().default(''),
  repepActivo: z.boolean().optional().default(false),
  /** Ancho en píxeles del logo en la barra lateral — ajustable a mano por el usuario, ver `sidebarLogoImg`. */
  logoTamano: z.number().min(40).max(400).optional().default(187),
  /** Minutos de inactividad antes de cerrar sesión sola — `null` = nunca. Ver `EmpresaSchema.tiempoInactividadMin` en `cliente.model.ts`. */
  tiempoInactividadMin: z.number().int().min(1).max(1440).nullable().optional().default(null),
  /** Margen objetivo (%) del negocio (Inteligencia de Precios, Fase 1) — `null` = sin configurar, nunca se asume un valor por defecto. Ver `EmpresaSchema.margenObjetivoPorcentaje` en `cliente.model.ts`. */
  margenObjetivoPorcentaje: z.number().min(0).max(100).nullable().optional().default(null),
  /**
   * Enlace de Google My Business — destino de "Pedir reseña" (ver
   * `enlace-resena.model.ts`). Se sirve dentro de un atributo `href` en
   * HTML generado a mano (`resena-rutas.ts`, sin React) — exigir un
   * esquema http(s) descarta `javascript:` y similares antes de guardarlo,
   * además del escapado de HTML al servirlo.
   */
  enlaceResenaGoogle: z.string().max(500).optional().default('').refine(
    (v) => v === '' || /^https?:\/\//i.test(v),
    'El enlace debe empezar por http:// o https://'
  ),
  /** Cartel de agradecimiento en base64, mismo patrón sin límite que `logo`. */
  imagenResena: z.string().optional().default(''),
  /** Firma de la empresa en base64, mismo patrón que `logo` — ver `firmaEmpresa` en `cliente.model.ts`. */
  firmaEmpresa: z.string().optional().default(''),
});

// ── Notificaciones push ───────────────────────────────────────────────────────

export const esquemaPushSubscribe = z.object({
  subscription: z.object({
    endpoint: z.string().min(1),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

// ── Núcleo de IA (Fase 3) ────────────────────────────────────────────────────

export const esquemaMensajeChat = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(4000),
  /** Imágenes adjuntas (data URL) — solo las usa la capacidad `extraer-datos-factura` (perfil `vision`, Fase Facturas Profesional). */
  imagenes: z.array(z.string()).max(5).optional(),
});

/** Body de `POST /ia/generar` — parametrizado por `capacidad`, nunca un endpoint por capacidad. */
export const esquemaGenerarIA = z.object({
  capacidad: z.string().min(1).max(100),
  mensajes: z.array(esquemaMensajeChat).max(50).optional().default([]),
  /** Solo identificadores/estado de pantalla (p. ej. `{ clienteAbierto, seccionActual }`) — nunca datos completos. */
  referencias: z.record(z.string(), z.unknown()).optional().default({}),
});

/**
 * Body de `POST /ia/herramientas/ejecutar` — confirma una propuesta de
 * escritura pendiente. `mensajesPrevios`/`referencias` son opcionales: si
 * se indican, tras ejecutar la herramienta se le pide al modelo una
 * segunda vuelta (asíncrona, con su propio `trabajoId`) para redactar la
 * respuesta final usando el resultado real — si se omiten, la confirmación
 * solo devuelve el resultado en crudo, sin redacción de la IA.
 */
export const esquemaEjecutarHerramientaIA = z.object({
  capacidad: z.string().min(1).max(100),
  nombre: z.string().min(1).max(100),
  argumentos: z.record(z.string(), z.unknown()).optional().default({}),
  mensajesPrevios: z.array(esquemaMensajeChat).max(50).optional().default([]),
  referencias: z.record(z.string(), z.unknown()).optional().default({}),
  /** Id de la llamada a herramienta original (la que propuso el modelo) — necesario para reconstruir una conversación válida al pedir la redacción final. */
  toolCallId: z.string().max(200).optional(),
});
