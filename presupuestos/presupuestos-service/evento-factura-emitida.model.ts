import { Schema, model, models, Model } from 'mongoose';

/**
 * Registro de auditoría de facturas emitidas (SIF, Fase 1-5, 26/10/2026) —
 * APPEND-ONLY: nunca se actualiza una fila existente, solo se añaden
 * nuevas. Un evento por cada hecho relevante del ciclo de vida de una
 * factura emitida (creada/emitida/anulada/rectificada) — sirve para poder
 * demostrar, en una inspección, qué pasó y cuándo con cada documento, sin
 * depender solo del estado actual.
 */
const EventoFacturaEmitidaSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true },
  facturaEmitidaId: { type: String, required: true, index: true },
  tipo: { type: String, enum: ['creada', 'emitida', 'anulada', 'rectificada'], required: true },
  detalle: { type: String, default: '' },
  creado: { type: String, required: true },
});

EventoFacturaEmitidaSchema.index({ usuarioId: 1, facturaEmitidaId: 1, creado: 1 });

export const EventoFacturaEmitidaModel: Model<any> =
  models.EventoFacturaEmitida || model('EventoFacturaEmitida', EventoFacturaEmitidaSchema);
