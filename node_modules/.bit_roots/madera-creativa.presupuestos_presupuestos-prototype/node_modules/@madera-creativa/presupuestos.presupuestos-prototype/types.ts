/**
 * Tipos de dominio para la app de presupuestos de cliente.
 */
import type { FotoProyecto } from './galeria-fotos.js';
import type { DibujoGuardado } from './pizarra-medidas.js';

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
};

/** Ficha completa de un cliente / proyecto. */
export type Cliente = {
  /** Identificador único del cliente. */
  id: string;
  /** Nombre del cliente. */
  nombre: string;
  /** Nombre o descripción del proyecto. */
  proyecto: string;
  /** Teléfono de contacto. */
  telefono: string;
  /** Email de contacto. */
  email: string;
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
  /** Dibujos de medidas guardados en la pizarra. */
  dibujos?: import('./pizarra-medidas.js').DibujoGuardado[];
};
