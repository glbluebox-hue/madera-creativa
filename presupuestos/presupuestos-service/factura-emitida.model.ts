import { Schema, model, models, Model } from 'mongoose';

/**
 * Factura EMITIDA por el propio sistema (SIF, Fase 1-5, 26/10/2026) —
 * entidad nueva y deliberadamente separada de `FacturaSchema`
 * (`cliente.model.ts`), que guarda facturas RECIBIDAS (gastos) e ingresos
 * ya facturados por otro medio, con `numeroFactura` como texto libre sin
 * ningún control. Una factura que el propio sistema emite necesita
 * numeración gestionada (`numeracion-facturas-emitidas.ts`), un estado que
 * congele su contenido al emitir, y una cadena de integridad
 * (`cadena-facturas-emitidas.ts`) — nada de eso tiene sentido para una
 * factura recibida, así que NO se añade a `FacturaSchema`, se crea esta
 * colección aparte. `FacturaSchema`/`FacturaModel` no se tocan.
 *
 * Aislada por `usuarioId` exactamente igual que el resto de la
 * aplicación — Madera Creativa Estudio es una app SaaS que se vende a
 * otros carpinteros; cada cuenta numera y ve solo sus propias facturas.
 *
 * Solo SIF, sin VERI*FACTU — `indicadorVerifactu` es un literal fijo por
 * ahora, no hay ningún envío a AEAT en este archivo ni en ningún otro de
 * esta fase (fuera de alcance explícito, Fase 6 futura).
 */

/** Misma forma exacta que `ElementoPresupuestoSchema` (cliente.model.ts) — id + concepto + precio, sin reinventar un segundo formato de línea en la misma aplicación. */
const LineaFacturaEmitidaSchema = new Schema(
  {
    id: { type: String, required: true },
    concepto: { type: String, required: true },
    /** Precio UNITARIO — el subtotal de la línea es `precio * cantidad`, nunca `precio` a secas. */
    precio: { type: Number, required: true },
    cantidad: { type: Number, default: 1 },
  },
  { _id: false }
);

/** Mismo esquema exacto que `lineasFiscales` en `FacturaSchema` (cliente.model.ts ~997-1006) — un único formato fiscal en toda la aplicación. */
const LineaFiscalFacturaEmitidaSchema = new Schema(
  {
    id: String,
    tipo: { type: String, enum: ['igic', 'iva', 'exento', 'sin_impuesto'] },
    porcentaje: Number,
    baseImponible: Number,
    cuota: Number,
  },
  { _id: false }
);

const FacturaEmitidaSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true },
  clienteId: { type: String, required: true, index: true },
  proyectoId: { type: String, default: '', index: true },

  /** `borrador` (editable, sin número) → `emitida` (numerada, sellada, solo lectura salvo anular) → `anulada` (evento sobre una emitida, nunca un borrado). */
  estado: { type: String, enum: ['borrador', 'emitida', 'anulada'], required: true, default: 'borrador' },

  titulo: { type: String, default: '' },
  lineas: { type: [LineaFacturaEmitidaSchema], default: [] },

  // ── Fiscal — mismo esquema exacto que FacturaSchema, ver comentario arriba ──
  tipoImpuesto: { type: String, enum: ['igic', 'iva', 'exento', 'sin_impuesto', ''], default: '' },
  porcentajeImpuesto: { type: Number },
  baseImponible: { type: Number },
  importeImpuesto: { type: Number },
  lineasFiscales: { type: [LineaFiscalFacturaEmitidaSchema], default: [] },
  importeTotal: { type: Number, required: true, default: 0 },

  // ── Numeración legal — solo se rellenan al emitir, nunca en borrador ──
  serie: { type: String, default: '' },
  numero: { type: Number, default: null },
  numeroFormateado: { type: String, default: '' },

  // ── Rectificativas/anulaciones — mismos nombres y semántica exactos que
  // `FacturaSchema` (cliente.model.ts ~1091-1096), para que
  // `motor-fiscal.ts` → `signoPorNaturaleza()` funcione igual sin cambios. ──
  naturaleza: { type: String, enum: ['normal', 'rectificativa'], default: 'normal' },
  facturaOriginalId: { type: String, default: '' },
  numeroFacturaOriginal: { type: String, default: '' },
  motivoRectificacion: { type: String, enum: ['devolucion_mercancia', 'error_facturacion', 'descuento_posterior', 'otro'] },

  motivoAnulacion: { type: String, default: '' },
  anuladaEn: { type: String, default: '' },

  // ── Campos del documento (diseño de PDF, 26/10/2026) ──
  /** Fecha ISO (AAAA-MM-DD), opcional. */
  vencimiento: { type: String, default: '' },
  /** Texto libre, ej. "Transferencia bancaria" — opcional. */
  metodoPago: { type: String, default: '' },
  /**
   * Texto libre que el PROFESIONAL escribe a mano para casos fiscales
   * concretos (exención, no sujeción, inversión del sujeto pasivo,
   * intracomunitario, exportación…) — nunca se genera automáticamente a
   * partir de `tipoImpuesto`. La auditoría SIF ya señaló que hoy
   * `tipoImpuesto` no distingue estos casos entre sí (todos caen en
   * `'exento'`/`'sin_impuesto'`), así que afirmar un artículo legal
   * concreto de forma automática podría ser incorrecto en algún caso real.
   * Vacío = no se imprime ninguna leyenda en el PDF.
   */
  leyendaFiscal: { type: String, default: '' },

  // ── Cadena de integridad — solo se rellenan al emitir, ver cadena-facturas-emitidas.ts ──
  hash: { type: String, default: '' },
  hashAnterior: { type: String, default: '' },
  /**
   * Posición de ESTA factura en la cadena de hash, por `usuarioId` — un
   * contador propio, independiente de `numero` (que resetea cada año).
   * `hashAnterior` se busca por `secuenciaCadena - 1`, nunca por fecha ni
   * por `numero`, para que el orden de la cadena sea inequívoco incluso en
   * el cambio de año o ante una emisión concurrente.
   */
  secuenciaCadena: { type: Number, default: null },

  // ── Identificación del sistema (placeholder de código, NO una
  // certificación legal real — eso es un trámite, no código) ──
  sistemaGenerador: {
    nombre: { type: String, default: 'Madera Creativa Estudio' },
    version: { type: String, default: '0.1.0-no-verifactu' },
  },
  /** Siempre 'NO_VERIFACTU' en esta fase — no hay ningún envío a AEAT (Fase 6, fuera de alcance). */
  indicadorVerifactu: { type: String, enum: ['NO_VERIFACTU', 'VERIFACTU'], default: 'NO_VERIFACTU' },

  fechaEmision: { type: String, default: '' },
  creado: { type: String, required: true },
  actualizado: { type: String, required: true },
});

FacturaEmitidaSchema.index({ usuarioId: 1, creado: -1 });
/** Para `cadena-facturas-emitidas.ts`: localizar la factura anterior en la cadena por posición exacta. */
FacturaEmitidaSchema.index({ usuarioId: 1, secuenciaCadena: 1 });

export const FacturaEmitidaModel: Model<any> = models.FacturaEmitida || model('FacturaEmitida', FacturaEmitidaSchema);
