import mongoose, { Schema, model, models, Model } from 'mongoose';

/** Subdocumento de un movimiento económico (gasto o ingreso). */
const MovimientoSchema = new Schema(
  {
    id: { type: String, required: true },
    fecha: { type: String, required: true },
    concepto: { type: String, required: true },
    categoria: { type: String, default: 'General' },
    tipo: { type: String, enum: ['gasto', 'ingreso'], required: true },
    importe: { type: Number, required: true },
  },
  { _id: false }
);

/** Subdocumento de un registro de horas trabajadas. */
const HorasSchema = new Schema(
  {
    id: { type: String, required: true },
    fecha: { type: String, required: true },
    tarea: { type: String, required: true },
    horas: { type: Number, required: true },
  },
  { _id: false }
);

/**
 * Metadatos comunes de un archivo subido a almacenamiento externo
 * (Incremento 1.7) — `claveAlmacenamiento` es interna (se usa para poder
 * borrar el archivo) y nunca se envía al frontend, ver `limpiarBlob()` en
 * `presupuestos-service.ts`. `tamano`/`tipoMime`/`subidoEn` quedan vacíos
 * en archivos guardados antes de este incremento (seguían embebidos en
 * Base64, sin subida a almacenamiento que registrar).
 */
const metadatosArchivo = {
  claveAlmacenamiento: { type: String, default: '' },
  tamano: { type: Number, default: 0 },
  tipoMime: { type: String, default: '' },
  subidoEn: { type: String, default: '' },
};

/** Subdocumento de una foto del proyecto acabado. */
const FotoSchema = new Schema(
  {
    id: { type: String, required: true },
    url: { type: String, required: true },
    descripcion: { type: String, default: '' },
    fecha: { type: String, required: true },
    ...metadatosArchivo,
  },
  { _id: false }
);

/** Subdocumento de un archivo adjunto del proyecto. */
const AdjuntoSchema = new Schema(
  {
    id: { type: String, required: true },
    nombre: { type: String, required: true },
    tipo: { type: String, required: true },
    tamano: { type: Number, required: true },
    url: { type: String, required: true },
    claveAlmacenamiento: { type: String, default: '' },
    subidoEn: { type: String, default: '' },
  },
  { _id: false }
);

/** Subdocumento de un dibujo guardado en la pizarra de medidas. */
const DibujoGuardadoSchema = new Schema(
  {
    id: { type: String, required: true },
    nombre: { type: String, required: true },
    dataUrl: { type: String, required: true },
    fecha: { type: String, required: true },
    ...metadatosArchivo,
  },
  { _id: false }
);

/** Esquema principal de una ficha de cliente / proyecto. */
const ClienteSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  /** ID del usuario propietario — aísla los datos por cuenta. */
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  nombre: { type: String, required: true },
  proyecto: { type: String, default: '' },
  telefono: { type: String, default: '' },
  email: { type: String, default: '' },
  direccion: { type: String, default: '' },
  presupuesto: { type: Number, default: 0 },
  tarifaHora: { type: Number, default: 0 },
  creado: { type: String, required: true },
  estado: {
    type: String,
    enum: ['presupuestado', 'en_curso', 'finalizado', 'rechazado'],
    default: 'presupuestado',
  },
  movimientos: { type: [MovimientoSchema], default: [] },
  horas: { type: [HorasSchema], default: [] },
  adjuntos: { type: [AdjuntoSchema], default: [] },
  fotos: { type: [FotoSchema], default: [] },
  dibujos: { type: [DibujoGuardadoSchema], default: [] },
});

/** Esquema de configuración de empresa — uno por usuario. */
const EmpresaSchema = new Schema({
  /** ID del usuario propietario (reemplaza la clave fija 'empresa'). */
  usuarioId: { type: String, required: true, unique: true, index: true, default: 'admin' },
  nombre: { type: String, default: '' },
  eslogan: { type: String, default: '' },
  logo: { type: String, default: '' },
  /** Datos de contacto mostrados en la cabecera de los presupuestos con plantilla (Fase 6). */
  telefono: { type: String, default: '' },
  email: { type: String, default: '' },
  /** IBAN mostrado en los presupuestos con plantilla (Fase 6) — solo texto, sin validar formato. */
  iban: { type: String, default: '' },
  /** Valores por defecto que se copian (y quedan congelados) al crear un presupuesto en modo lienzo (Fase 6). */
  condicionesPagoDefecto: { type: String, default: '60% al aceptar el presupuesto / 40% al finalizar el trabajo.' },
  validezDiasDefecto: { type: Number, default: 30 },
});

/**
 * Esquema de proveedor (Fase "Integración completa"). Antes solo vivía en
 * el `localStorage` del navegador, sin persistencia real ni compartida —
 * este modelo recupera el patrón ya usado por Cliente/Factura.
 */
const ProveedorSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  nombre: { type: String, required: true },
  contacto: { type: String, default: '' },
  telefono: { type: String, default: '' },
  email: { type: String, default: '' },
  direccion: { type: String, default: '' },
  notas: { type: String, default: '' },
  creado: { type: String, required: true },
});

/** Esquema de producto/material del catálogo (mismo motivo que Proveedor). */
const ProductoSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  nombre: { type: String, required: true },
  descripcion: { type: String, default: '' },
  unidad: { type: String, required: true },
  precio: { type: Number, required: true, default: 0 },
  proveedorId: { type: String, default: '' },
  fechaPrecio: { type: String, default: '' },
  categoria: { type: String, default: '' },
});

/**
 * Esquema de nota (rediseño del módulo de Notas) — colección propia, no
 * embebida en Cliente como antes (`Cliente.notas`, sin ni siquiera un
 * esquema declarado). Una nota puede existir sola (`clienteId`/`proyectoId`
 * vacíos) o asociada a un cliente y, en el futuro, a un proyecto —
 * `proyectoId` se deja preparado aunque hoy no exista todavía una entidad
 * "Proyecto" propia en la aplicación (`Cliente.proyecto` es solo texto).
 */
const NotaSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  titulo: { type: String, default: '' },
  contenido: { type: String, required: true },
  prioridad: { type: String, enum: ['alta', 'media', 'baja'], default: 'media' },
  estado: { type: String, enum: ['abierta', 'hecha'], default: 'abierta' },
  clienteId: { type: String, default: '' },
  proyectoId: { type: String, default: '' },
  etiquetas: { type: [String], default: [] },
  origen: { type: String, enum: ['texto', 'voz'], default: 'texto' },
  creado: { type: String, required: true },
  actualizado: { type: String, required: true },
});
NotaSchema.index({ usuarioId: 1, clienteId: 1 });
NotaSchema.index({ usuarioId: 1, creado: -1 });

/** Elemento de precio individual dentro del alcance de un presupuesto (Fase 5, IA agente). */
const ElementoPresupuestoSchema = new Schema(
  {
    id: { type: String, required: true },
    concepto: { type: String, required: true },
    precio: { type: Number, required: true },
  },
  { _id: false }
);

/**
 * Esquema de presupuesto — dos formatos conviven en la misma colección
 * (Fase 6, `formato` explícito, nunca inferido):
 * - `'simple'` (Fase 5, sin cambios): descripción + alcance (bullets sin
 *   precio) + items con precio propio + precio total editable a mano. Es
 *   el único formato que crean/modifican las herramientas de IA
 *   (`crearPresupuesto`/`anadirElementoPresupuesto`, `ia-herramientas-presupuestos.ts`)
 *   — no se toca nada de este modo.
 * - `'lienzo'` (Fase 6): documento con plantilla libre, varias hojas
 *   (frames de Excalidraw) con texto/imágenes/archivos colocados donde
 *   quiera el usuario. `contenidoLienzo` es del mismo tipo `Mixed` sin
 *   forma fija que `Dibujo.contenido` — mismo motivo: su estructura interna
 *   es responsabilidad de Excalidraw, no de este esquema.
 * Asociado siempre a un cliente ya existente (`clienteId` obligatorio, a
 * diferencia de Nota que puede vivir sin cliente).
 */
const PresupuestoSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  clienteId: { type: String, required: true, index: true },
  titulo: { type: String, required: true },
  formato: { type: String, enum: ['simple', 'lienzo'], default: 'simple' },
  descripcion: { type: String, default: '' },
  alcance: { type: [String], default: [] },
  items: { type: [ElementoPresupuestoSchema], default: [] },
  /** Escena de Excalidraw ({ elements, files }) — solo con contenido cuando `formato === 'lienzo'`. */
  contenidoLienzo: { type: Schema.Types.Mixed, default: {} },
  /** Copiadas desde `Empresa.condicionesPagoDefecto`/`validezDiasDefecto` al crear, y congeladas a partir de ahí (Fase 6). */
  condicionesPago: { type: String, default: '' },
  validezDias: { type: Number, default: 30 },
  condicionesGenerales: { type: String, default: '' },
  precioTotal: { type: Number, default: 0 },
  creado: { type: String, required: true },
  actualizado: { type: String, required: true },
});
PresupuestoSchema.index({ usuarioId: 1, clienteId: 1, creado: -1 });

/**
 * Índice compuesto para `listarClientes` paginado (Incremento 1.5), que
 * filtra por `usuarioId` y ordena por `creado` descendente — la misma
 * consulta de Factura que ya se indexó en el Incremento 1.1. Se dejó
 * pendiente entonces porque `listarClientes` no tenía `sort`; ahora que la
 * paginación lo necesita, aplica exactamente el mismo criterio.
 */
ClienteSchema.index({ usuarioId: 1, creado: -1 });

/** Modelo Mongoose de Cliente (reutiliza el existente si ya está registrado). */
export const ClienteModel: Model<any> = models.Cliente || model('Cliente', ClienteSchema);

/**
 * Modelo Mongoose de Proveedor. Sin nombre de colección explícito: Mongoose
 * la llama `proveedors` (pluralización automática de "Proveedor") — se
 * mantiene así a propósito para que coincida exactamente con la colección
 * real ya existente en la base de datos (verificado antes de escribir este
 * modelo), no una elección de estilo.
 */
export const ProveedorModel: Model<any> = models.Proveedor || model('Proveedor', ProveedorSchema);

/** Modelo Mongoose de Nota — colección nueva, sin nombre de colección heredado que respetar. */
export const NotaModel: Model<any> = models.Nota || model('Nota', NotaSchema);

/** Modelo Mongoose de Presupuesto (Fase 5) — colección nueva. */
export const PresupuestoModel: Model<any> = models.Presupuesto || model('Presupuesto', PresupuestoSchema);

/** Modelo Mongoose de Producto/material del catálogo. */
export const ProductoModel: Model<any> = models.Producto || model('Producto', ProductoSchema);

/** Modelo Mongoose de Empresa. */
export const EmpresaModel: Model<any> = models.Empresa || model('Empresa', EmpresaSchema);

/** Esquema de una factura (gasto o ingreso). */
const FacturaSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  /** ID del usuario propietario. */
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  tipo: { type: String, enum: ['ingreso', 'gasto'], required: true },
  fecha: { type: String, required: true },
  concepto: { type: String, default: '' },
  importe: { type: Number, required: true },
  proveedor: { type: String, default: '' },
  clienteId: { type: String, default: '' },
  imagen: { type: String, default: '' },
  creado: { type: String, required: true },
});

/**
 * Índice compuesto para `listarFacturas`, que filtra por `usuarioId` y
 * ordena por `creado` descendente — sin este índice, Mongo debe ordenar
 * los resultados en memoria tras el filtrado.
 */
FacturaSchema.index({ usuarioId: 1, creado: -1 });

/** Modelo Mongoose de Factura. */
export const FacturaModel: Model<any> = models.Factura || model('Factura', FacturaSchema);

/**
 * Esquema de un dibujo del módulo profesional de dibujo (Fase 2.1).
 * Colección propia, independiente del cliente — antes los dibujos vivían
 * como subdocumentos dentro de `Cliente.dibujos[]` (base64 embebido, ver
 * `DibujoGuardadoSchema` arriba, que se mantiene solo para no romper los
 * dibujos ya guardados con la pizarra antigua). `contenido` es el snapshot
 * vectorial de tldraw: se guarda tal cual devuelve la librería (`Mixed`, sin
 * forma fija) porque su estructura interna no es responsabilidad de este
 * esquema — la valida `esquemaDibujo` en tamaño total, no campo a campo.
 */
const DibujoSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  /** Ficha de cliente a la que pertenece — vacío para un dibujo "temporal". */
  clienteId: { type: String, default: '', index: true },
  /** Carpeta del cliente que lo contiene — vacío si aún no se ha archivado. */
  carpetaId: { type: String, default: '', index: true },
  /** Reservado para agrupar dibujos por proyecto en una fase futura. */
  proyectoId: { type: String, default: '' },
  nombre: { type: String, required: true },
  /** URL en almacenamiento externo tras subir el Base64 recibido (Incremento 1.7). */
  miniatura: { type: String, default: '' },
  contenido: { type: Schema.Types.Mixed, default: {} },
  version: { type: Number, default: 1 },
  /** Reservado: aún sin interfaz para gestionarlas. */
  etiquetas: { type: [String], default: [] },
  creadoEn: { type: String, required: true },
  actualizadoEn: { type: String, required: true },
});

/** Consulta principal de la galería: dibujos del usuario, más recientes primero. */
DibujoSchema.index({ usuarioId: 1, actualizadoEn: -1 });
/** Consulta del apartado "Dibujos" de una ficha de cliente concreta. */
DibujoSchema.index({ usuarioId: 1, clienteId: 1, actualizadoEn: -1 });
/** Consulta del contenido de una carpeta concreta. */
DibujoSchema.index({ usuarioId: 1, carpetaId: 1, actualizadoEn: -1 });

/** Modelo Mongoose de Dibujo (módulo profesional de dibujo, Fase 2.1). */
export const DibujoModel: Model<any> = models.Dibujo || model('Dibujo', DibujoSchema);

/**
 * Carpeta de dibujos dentro de la ficha de un cliente (Fase 2.2) — agrupa
 * dibujos como lo haría un carpintero con carpetas físicas de planos
 * ("Cocina", "Armarios", "Exterior"...). Colección propia, agnóstica al
 * tipo de contenido: cuando en el futuro se añadan fotos de obra, PDFs o
 * imágenes generadas por IA, cada una añadirá su propio `carpetaId` sin
 * tener que tocar este esquema.
 */
const CarpetaSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  clienteId: { type: String, required: true, index: true },
  nombre: { type: String, required: true },
  creadoEn: { type: String, required: true },
  actualizadoEn: { type: String, required: true },
});

/** Consulta principal: carpetas de un cliente concreto. */
CarpetaSchema.index({ usuarioId: 1, clienteId: 1, actualizadoEn: -1 });
/** No se repiten nombres de carpeta dentro del mismo cliente. */
CarpetaSchema.index({ usuarioId: 1, clienteId: 1, nombre: 1 }, { unique: true });

/** Modelo Mongoose de Carpeta (carpetas de dibujos por cliente, Fase 2.2). */
export const CarpetaModel: Model<any> = models.Carpeta || model('Carpeta', CarpetaSchema);

/**
 * Conecta a MongoDB usando la variable de entorno MONGO_URL.
 * Reutiliza la conexión existente si ya está abierta.
 */
export async function conectar(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  const url = process.env.MONGO_URL || 'mongodb://localhost:27017/madera-creativa';
  await mongoose.connect(url);
}
