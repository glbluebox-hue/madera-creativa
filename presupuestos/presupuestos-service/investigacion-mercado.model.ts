import { Schema, model, models, Model } from 'mongoose';

/**
 * Registro de cada investigación de mercado con IA (Fase "Investigación de
 * Mercado con IA", 30/08/2026) — una sola colección para dos propósitos
 * (encargo, punto 10):
 *
 * 1. Caché de 24h: antes de llamar a OpenAI, se busca una fila con la misma
 *    clave (`usuarioId`+`tipoTrabajo`+`zona`+`alcance`+`nivelCalidad`+
 *    `contextoHash`) de menos de 24h — si existe, se reutiliza su
 *    `candidatos` sin repetir la llamada real.
 * 2. Auditoría: append-only, nunca se borra ni se actualiza (mismo
 *    criterio que `IaUsoModel`) — deja trazabilidad de cada búsqueda
 *    (parámetros, resultado, coste) y una base lista para que, el día que
 *    exista un sistema de planes/límites, se puedan contar filas por
 *    usuario/periodo SIN rehacer esta funcionalidad (encargo, punto 11:
 *    ningún límite se implementa todavía).
 */
const InvestigacionMercadoSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true },
  tipoTrabajo: { type: String, required: true },
  zona: { type: String, required: true },
  alcance: { type: String, enum: ['solo_mobiliario', 'mobiliario_encimera', 'reforma_completa'], required: true },
  nivelCalidad: { type: String, enum: ['economico', 'estandar', 'alto', null], default: null },
  /** Hash de la descripción libre usada (si la hubo) — un cambio en el texto del presupuesto invalida la caché en vez de reutilizar una investigación de un trabajo distinto con la misma etiqueta. */
  contextoHash: { type: String, default: '' },
  sinResultadosFiables: { type: Boolean, default: false },
  motivoSinResultados: { type: String, default: '' },
  /** El resultado tal cual se le mostró al usuario — auditable después, y lo que se reutiliza en un acierto de caché. */
  candidatos: { type: [Schema.Types.Mixed], default: [] },
  proveedor: { type: String, required: true },
  modelo: { type: String, required: true },
  tokensEntrada: { type: Number, default: 0 },
  tokensSalida: { type: Number, default: 0 },
  exito: { type: Boolean, required: true },
  error: { type: String, default: '' },
  creado: { type: String, required: true },
});
InvestigacionMercadoSchema.index({ usuarioId: 1, tipoTrabajo: 1, zona: 1, alcance: 1, nivelCalidad: 1, contextoHash: 1, creado: -1 });

export const InvestigacionMercadoModel: Model<any> =
  models.InvestigacionMercado || model('InvestigacionMercado', InvestigacionMercadoSchema);
