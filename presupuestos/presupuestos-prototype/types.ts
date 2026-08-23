/**
 * Tipos de dominio para la app de presupuestos de cliente.
 */
import type { FotoProyecto } from './galeria-fotos.js';

/** Una estancia con dimensiones para el despiece. */
export type Estancia = {
  id: string;
  nombre: string;
  ancho?: number;
  alto?: number;
  fondo?: number;
  altura?: number;
  anchura?: number;
  profundidad?: number;
  angulos?: string;
  desniveles?: string;
  escuadra?: string;
  observaciones?: string;
};

/** Una nota libre del proyecto. */
export type Nota = { id: string; fecha: string; texto: string };

/** Un producto del catálogo de materiales. */
export type Producto = {
  id: string;
  /** Nombre del producto o material. */
  nombre: string;
  /** Descripción o referencia. */
  descripcion?: string;
  /** Unidad de medida (m², ml, ud, kg…). */
  unidad: string;
  /** Precio por unidad en euros. */
  precio: number;
  /** ID del proveedor habitual. */
  proveedorId?: string;
  /** Fecha de última actualización del precio (ISO). */
  fechaPrecio?: string;
  /** Categoría del material (tableros, herrajes, barnices…). */
  categoria?: string;
};

/** Un proveedor de materiales. */
export type Proveedor = {
  id: string;
  /** Nombre comercial del proveedor. */
  nombre: string;
  /** Persona de contacto. */
  contacto?: string;
  /** Teléfono. */
  telefono?: string;
  /** Email. */
  email?: string;
  /** Dirección. */
  direccion?: string;
  /** Notas libres. */
  notas?: string;
  /** Fecha de alta (ISO). */
  creado: string;
};

/** Una tarea del checklist del proyecto. */
export type Tarea = { id: string; texto: string; hecha: boolean };

/** Tipo de movimiento económico dentro de una ficha de cliente. */
export type TipoMovimiento = 'gasto' | 'ingreso';

/** Un movimiento económico (gasto o ingreso) asociado a un proyecto. */
export type Movimiento = {
  /** Identificador único del movimiento. */
  id: string;
  /** Fecha del movimiento en formato ISO (YYYY-MM-DD). */
  fecha: string;
  /** Descripción breve del movimiento. */
  concepto: string;
  /** Categoría libre (materiales, transporte, mano de obra, etc.). */
  categoria: string;
  /** Tipo: gasto o ingreso. */
  tipo: TipoMovimiento;
  /** Importe en euros. */
  importe: number;
  /**
   * Id de la Factura que generó este movimiento automáticamente (Fase 2).
   * Ausente en movimientos creados a mano desde la tabla de gastos e
   * ingresos — no asumir que siempre está presente.
   */
  facturaId?: string;
};

/** Un archivo adjunto al proyecto (diseño técnico, foto, medidas). */
export type Adjunto = {
  /** Identificador único del adjunto. */
  id: string;
  /** Nombre del archivo. */
  nombre: string;
  /** Tipo MIME del archivo. */
  tipo: string;
  /** Tamaño en bytes. */
  tamano: number;
  /** Contenido en base64 (data URL) para previsualizar. */
  url: string;
};

/** Una entrada de horas trabajadas en el proyecto. */
export type RegistroHoras = {
  /** Identificador único. */
  id: string;
  /** Fecha en formato ISO. */
  fecha: string;
  /** Descripción de la tarea. */
  tarea: string;
  /** Número de horas trabajadas. */
  horas: number;
};

/** Una factura escaneada o añadida manualmente. */
export type Factura = {
  /** Identificador único. */
  id: string;
  /** Tipo: ingreso (nos pagan) o gasto (pagamos). */
  tipo: 'ingreso' | 'gasto';
  /** Fecha de la factura en formato ISO (YYYY-MM-DD). */
  fecha: string;
  /** Descripción o concepto. */
  concepto: string;
  /** Importe total en euros. */
  importe: number;
  /** Proveedor o cliente emisor. */
  proveedor: string;
  /** Cliente al que se asocia (solo facturas de gasto vinculadas a proyecto). */
  clienteId: string;
  /** Imagen principal de la factura en base64. */
  imagen?: string;
  /** Páginas adicionales del documento (dataURLs) para facturas multihoja. */
  imagenes?: string[];
  /** Fecha de creación en ISO. */
  creado: string;

  // ── Ampliación documental/fiscal (Fase Facturas Profesional) ──
  /** Número de factura del proveedor/cliente, si consta. */
  numeroFactura?: string;
  /** CIF/NIF del emisor, si consta. */
  cifNif?: string;
  /** Base imponible (importe sin impuesto). */
  baseImponible?: number;
  /** Impuesto indirecto aplicado — depende de la región fiscal de la empresa. */
  tipoImpuesto?: 'igic' | 'iva' | '';
  /** Porcentaje del impuesto aplicado (p. ej. 7 para IGIC general, 21 para IVA general). */
  porcentajeImpuesto?: number;
  /** Cuota del impuesto en euros. */
  importeImpuesto?: number;
  /** Categoría libre del gasto/ingreso (materiales, herramientas, combustible…). */
  categoria?: string;
  /** Proyecto al que se asocia, si aplica. */
  proyectoId?: string;
  /** Relación real al proveedor (ver `Proveedor.id`) — `proveedor` (texto) se mantiene como respaldo/compatibilidad. */
  proveedorId?: string;
  /** Cómo entró el documento al sistema. */
  origen?: 'escaner' | 'foto' | 'pdf' | 'manual' | '';
  /** PDF generado a partir de las páginas escaneadas/fotografiadas. */
  pdfUrl?: string;
  /** PDF original, si la factura se subió directamente como PDF. */
  pdfOriginalUrl?: string;
  /** Páginas del documento en orden, cada una con su tipo — sustituye gradualmente a `imagenes` para poder mezclar imagen y PDF en un mismo documento. */
  paginas?: { tipo: 'imagen' | 'pdf'; url: string }[];
  /** Solo presente en el listado paginado (`GET /facturas`): indica si hay algún documento adjunto sin exponer su contenido, que se omite ahí por peso. */
  tieneDocumento?: boolean;
};

/**
 * Gasto periódico o estimado (Fase Facturas Profesional) — gastos
 * deducibles reales que no llegan como una factura puntual: amortizaciones
 * (vehículos, maquinaria, herramientas), cuota de autónomos (RETA),
 * suministros de vivienda con uso parcial como taller, provisión por
 * impagos. El usuario los introduce con el dato que le confirme su
 * asesor — la app nunca infiere `coeficiente` ni `afectacionExclusiva`.
 */
export type GastoPeriodico = {
  id: string;
  tipo: 'amortizacion' | 'reta' | 'suministro' | 'provision' | 'otro';
  descripcion: string;
  /** Importe ya calculado a aplicar por periodicidad. */
  importe: number;
  periodicidad: 'mensual' | 'trimestral';
  /** Solo para `tipo: 'amortizacion'`. */
  valorAdquisicion?: number;
  categoriaBien?: string;
  coeficiente?: number;
  fechaInicio?: string;
  /**
   * Solo relevante para bienes indivisibles como un vehículo — en IRPF no
   * existe un % de afectación intermedio: o exclusivo (deducible al 100%)
   * o no afecto (no deducible). `null` hasta que el usuario lo confirma.
   */
  afectacionExclusiva?: boolean | null;
  /** P. ej. "según mi asesor, 12/2026". */
  nota?: string;
  activo: boolean;
  creado: string;
};

/**
 * Un dibujo del módulo profesional de dibujo (Fase 2.1) — colección propia,
 * independiente de la ficha de cliente. Versión ligera (sin `contenido`)
 * para la galería; `obtenerDibujo` en `api.ts` devuelve la versión completa.
 */
export type Dibujo = {
  /** Identificador único. */
  id: string;
  /** Ficha de cliente a la que pertenece — vacío si es un dibujo "temporal". */
  clienteId: string;
  /** Carpeta del cliente que lo contiene — vacío si aún no se ha archivado. */
  carpetaId: string;
  /** Reservado para agrupar dibujos por proyecto en una fase futura. */
  proyectoId: string;
  nombre: string;
  /** Miniatura PNG (URL en almacenamiento externo una vez guardado). */
  miniatura: string;
  /** Escena de Excalidraw (elements/files) — solo presente en `obtenerDibujo`, no en los listados. */
  contenido?: Record<string, unknown>;
  version: number;
  /** Reservado: aún sin interfaz para gestionarlas. */
  etiquetas: string[];
  creadoEn: string;
  actualizadoEn: string;
};

/** Carpeta de dibujos dentro de la ficha de un cliente (Fase 2.2). */
export type Carpeta = {
  id: string;
  clienteId: string;
  nombre: string;
  creadoEn: string;
  actualizadoEn: string;
};

/**
 * Identidad de un cliente — solo datos de contacto. Hasta el incremento
 * "Cliente ≠ Proyecto" (especificación del usuario, 20/08/2026) este tipo
 * tenía además todos los campos de un trabajo concreto; ahora esos viven
 * en `Proyecto` (justo abajo) — un cliente puede tener tantos proyectos
 * como trabajos reales tenga, cada uno con su propia gestión económica y
 * documental, sin mezclarse entre sí.
 */
export type Cliente = {
  /** Identificador único del cliente. */
  id: string;
  /** Nombre del cliente. */
  nombre: string;
  /** Teléfono de contacto. */
  telefono: string;
  /** Email de contacto. */
  email: string;
  /** Fecha de alta en formato ISO. */
  creado: string;
};

/**
 * Un proyecto/expediente de trabajo — mismo shape que el antiguo `Cliente`
 * menos los campos de identidad, más `clienteId`. Gastos, ingresos,
 * mediciones, tareas, fotos, adjuntos y dibujos son exclusivos de CADA
 * proyecto: crear un proyecto nuevo para un cliente ya existente nunca
 * copia nada de otro proyecto suyo.
 */
export type Proyecto = {
  /** Identificador único del proyecto. */
  id: string;
  /** Cliente (identidad) al que pertenece. */
  clienteId: string;
  /** Nombre o descripción del proyecto. */
  proyecto: string;
  /** Dirección del lugar del trabajo. */
  direccion: string;
  /** Presupuesto estimado acordado con el cliente (en euros). */
  presupuesto: number;
  /** Tarifa por hora del trabajador (en euros). */
  tarifaHora: number;
  /** Fecha de creación de la ficha en formato ISO. */
  creado: string;
  /** Estado del proyecto. */
  estado: 'presupuestado' | 'en_curso' | 'finalizado' | 'rechazado';
  /** WhatsApp de contacto. */
  whatsapp?: string;
  /** Enlace de Google Maps o dirección GPS. */
  ubicacion?: string;
  /** Código de acceso a la puerta del edificio. */
  codigoPuerta?: string;
  /** Planta del inmueble. */
  planta?: string;
  /** Si el edificio tiene ascensor. */
  ascensor?: boolean;
  /** Zona de carga y descarga. */
  zonaCarga?: string;
  /** Observaciones de acceso al domicilio. */
  observacionesAcceso?: string;
  /** Fecha de medición prevista (ISO). */
  fechaMedicion?: string;
  /** Fecha de montaje prevista (ISO). */
  fechaMontaje?: string;
  /** Estancias con medidas para el despiece. */
  estancias?: Estancia[];
  /** Notas libres del proyecto. */
  notas?: Nota[];
  /** Checklist de tareas del proyecto. */
  tareas?: Tarea[];
  /** Movimientos económicos del proyecto. */
  movimientos: Movimiento[];
  /** Registros de horas trabajadas. */
  horas: RegistroHoras[];
  /** Archivos adjuntos del proyecto. */
  adjuntos: Adjunto[];
  /** Fotos del proyecto acabado. */
  fotos: FotoProyecto[];
};
