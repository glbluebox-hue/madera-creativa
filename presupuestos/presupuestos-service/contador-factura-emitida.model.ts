import { Schema, model, models, Model } from 'mongoose';

/**
 * Contador de numeración legal de facturas emitidas (SIF, Fase 1-5,
 * 26/10/2026) — un documento por `usuarioId`+`anio`, mismo patrón que
 * `ContadorPresupuestoModel`.
 *
 * Diferencia deliberada e importante frente a `ContadorPresupuestoModel`:
 * NO tiene campo `huecos`. Un presupuesto puede reutilizar el número de
 * uno borrado (decisión de negocio); una factura emitida nunca puede
 * reutilizar un número, ni siquiera si se anula después — la numeración
 * legal exige una secuencia estrictamente creciente, sin huecos
 * "reparados" por reutilización (ver `numeracion-facturas-emitidas.ts`).
 */
const ContadorFacturaEmitidaSchema = new Schema({
  usuarioId: { type: String, required: true, index: true },
  anio: { type: Number, required: true },
  /** Último número asignado — siempre crece, nunca retrocede ni se libera. */
  ultimoNumero: { type: Number, required: true, default: 0 },
});
ContadorFacturaEmitidaSchema.index({ usuarioId: 1, anio: 1 }, { unique: true });

export const ContadorFacturaEmitidaModel: Model<any> =
  models.ContadorFacturaEmitida || model('ContadorFacturaEmitida', ContadorFacturaEmitidaSchema);
