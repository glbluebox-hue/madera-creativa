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
  tamano: z.number().finite().nonnegative().optional(),
  tipoMime: z.string().max(120).optional(),
  ...camposAlmacenamiento,
});

// ── Cliente ───────────────────────────────────────────────────────────────────

/**
 * Límite defensivo del total de bytes en fotos + adjuntos + dibujos de un
 * mismo cliente (Incremento 1.3). No es una regla de negocio: es una red de
 * seguridad frente al límite duro de 16 MB por documento de MongoDB, con
 * margen amplio incluso para el resto de campos del documento. La
 * compresión de imágenes en el cliente (`procesamiento-imagenes.ts`) reduce
 * el riesgo de llegar aquí en el uso normal; este límite cubre el caso
 * extremo que la compresión por sí sola no puede garantizar (ver auditoría
 * del Incremento 1.3: los adjuntos pueden ser PDF, no solo imágenes, y no
 * hay tope de cantidad de archivos por cliente).
 */
export const LIMITE_BLOBS_CLIENTE_BYTES = 8 * 1024 * 1024;

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
}).refine(
  (cliente) => {
    const total =
      (cliente.fotos ?? []).reduce((suma, f) => suma + tamanoBytesAlmacenados(f.url), 0) +
      (cliente.adjuntos ?? []).reduce((suma, a) => suma + tamanoBytesAlmacenados(a.url), 0) +
      (cliente.dibujos ?? []).reduce((suma, d) => suma + tamanoBytesAlmacenados(d.dataUrl), 0);
    return total <= LIMITE_BLOBS_CLIENTE_BYTES;
  },
  { message: `El total de fotos, adjuntos y dibujos supera el límite de ${LIMITE_BLOBS_CLIENTE_BYTES / (1024 * 1024)} MB por proyecto.` }
);

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

// ── Proveedores y productos (Fase "Integración completa") ──────────────────────

export const esquemaProveedor = z.object({
  id: z.string().min(1).max(64),
  nombre: z.string().trim().min(1).max(200),
  contacto: z.string().max(200).optional().default(''),
  telefono: z.string().max(50).optional().default(''),
  email: z.string().max(254).optional().default(''),
  direccion: z.string().max(500).optional().default(''),
  notas: z.string().max(2000).optional().default(''),
  creado: z.string().min(1).max(64),
});

/**
 * Nota (rediseño del módulo de Notas) — entidad propia, puede existir sola
 * o asociada a un cliente/proyecto. `titulo` es opcional (una nota rápida
 * puede ser solo contenido); `contenido` es lo único obligatorio.
 */
export const esquemaNotaMC = z.object({
  id: z.string().min(1).max(64),
  titulo: z.string().max(200).optional().default(''),
  contenido: z.string().trim().min(1, 'La nota no puede estar vacía.').max(10000),
  prioridad: z.enum(['alta', 'media', 'baja']).optional().default('media'),
  estado: z.enum(['abierta', 'hecha']).optional().default('abierta'),
  clienteId: z.string().max(64).optional().default(''),
  proyectoId: z.string().max(64).optional().default(''),
  etiquetas: z.array(z.string().max(50)).max(20).optional().default([]),
  origen: z.enum(['texto', 'voz']).optional().default('texto'),
  creado: z.string().min(1).max(64),
  actualizado: z.string().min(1).max(64),
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
  titulo: z.string().trim().min(1).max(200),
  formato: z.enum(['simple', 'lienzo']).optional().default('simple'),
  descripcion: z.string().max(10000).optional().default(''),
  alcance: z.array(z.string().max(300)).max(50).optional().default([]),
  items: z.array(esquemaElementoPresupuesto).max(100).optional().default([]),
  /** Escena de Excalidraw ({ elements, files }) — estructura interna de la librería, no se valida campo a campo. */
  contenidoLienzo: z.record(z.string(), z.unknown()).optional().default({}),
  condicionesPago: z.string().max(2000).optional().default(''),
  validezDias: z.number().int().min(1).max(365).optional().default(30),
  condicionesGenerales: z.string().max(5000).optional().default(''),
  precioTotal: z.number().finite().optional().default(0),
  creado: z.string().min(1).max(64),
  actualizado: z.string().min(1).max(64),
}).refine(
  (p) => tamanoBytesAlmacenados(JSON.stringify(p.contenidoLienzo)) <= LIMITE_CONTENIDO_PRESUPUESTO_BYTES,
  { message: `El contenido del presupuesto supera el límite de ${LIMITE_CONTENIDO_PRESUPUESTO_BYTES / (1024 * 1024)} MB.` }
);

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
  /** Devuelve, sin paginar, las facturas de un cliente concreto (p. ej. los gastos de un proyecto en su ficha). */
  clienteId: z.string().max(128).optional(),
  /** Devuelve, sin paginar, las facturas cuyo proveedor coincide (búsqueda difusa) con este nombre. */
  proveedor: z.string().max(300).optional(),
});

// ── Empresa ───────────────────────────────────────────────────────────────────

export const esquemaEmpresa = z.object({
  nombre: z.string().max(200).optional().default(''),
  eslogan: z.string().max(300).optional().default(''),
  logo: z.string().optional().default(''),
  telefono: z.string().max(50).optional().default(''),
  email: z.string().max(254).optional().default(''),
  iban: z.string().max(34).optional().default(''),
  condicionesPagoDefecto: z.string().max(2000).optional().default('60% al aceptar el presupuesto / 40% al finalizar el trabajo.'),
  validezDiasDefecto: z.number().int().min(1).max(365).optional().default(30),
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

// ── Núcleo de IA (Fase 3) ────────────────────────────────────────────────────

export const esquemaMensajeChat = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(4000),
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
});
