import { Schema, model, models, Model } from 'mongoose';

/**
 * Esquema Mongoose de una entrada de memoria de IA — mismo patrón que
 * `NotaSchema`/`NotaModel` (`cliente.model.ts`): `id` único indexado,
 * `usuarioId` con default `'admin'`.
 *
 * Fechas como `String` ISO, no `Date` — convención del resto del proyecto
 * (`creado`/`actualizado` en `NotaSchema`, `ClienteSchema`, etc.). Por eso
 * `caduca` (reservado para `ambito:'sesion'`, sin escritor todavía) se
 * comprueba de forma perezosa en `recuperar()` en vez de usar el TTL nativo
 * de Mongo, que exige un campo `Date`.
 */
const MemoriaSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  ambito: { type: String, enum: ['usuario', 'cliente', 'sesion', 'proyecto'], required: true },
  entidadId: { type: String, default: '' },
  tipo: { type: String, enum: ['preferencia', 'hecho', 'decision', 'aprendizaje'], required: true },
  clave: { type: String, default: '' },
  contenido: { type: String, required: true },
  capacidadOrigen: { type: String, required: true },
  origen: { type: String, enum: ['ia', 'usuario'], default: 'ia' },
  vecesUsado: { type: Number, default: 0 },
  ultimoUso: { type: String, default: '' },
  caduca: { type: String, default: '' },
  creado: { type: String, required: true },
  actualizado: { type: String, required: true },
});

/** Consulta principal: memoria de un ámbito+entidad concretos, más reciente primero. */
MemoriaSchema.index({ usuarioId: 1, ambito: 1, entidadId: 1, actualizado: -1 });
/** Evita duplicar la misma clave de memoria dentro de un mismo usuario (upsert por clave). */
MemoriaSchema.index({ usuarioId: 1, clave: 1 }, { unique: true, partialFilterExpression: { clave: { $ne: '' } } });

export const MemoriaModel: Model<any> = models.Memoria || model('Memoria', MemoriaSchema);
