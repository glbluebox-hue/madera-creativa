import { Schema, model, models, Model } from 'mongoose';

/**
 * Contador de numeración oficial de presupuestos (05/09/2026) — un
 * documento por `usuarioId`+`anio`. Deliberadamente NO es un contador
 * creciente simple: el negocio exige reutilizar el número de un
 * presupuesto eliminado (encargo explícito), así que además del último
 * número usado (`ultimoNumero`, para cuando no hay ningún hueco que
 * reutilizar) se guarda la lista de números liberados por un borrado
 * (`huecos`) — ver `numeracion-presupuestos.ts` para el algoritmo atómico
 * que los usa, nunca aquí (este archivo es solo el esquema, mismo criterio
 * que `investigacion-mercado.model.ts`/`investigacion-mercado.ts`).
 *
 * Índice único en `{usuarioId, anio}`: es lo que hace atómica la
 * asignación — dos peticiones simultáneas de creación del PRIMER
 * presupuesto de un usuario/año chocan aquí (una gana el `upsert`, la otra
 * recibe `E11000` y reintenta), nunca ambas crean el documento por
 * separado.
 */
const ContadorPresupuestoSchema = new Schema({
  usuarioId: { type: String, required: true, index: true },
  anio: { type: Number, required: true },
  /** Último número asignado por incremento simple — se usa SOLO cuando `huecos` está vacío. */
  ultimoNumero: { type: Number, required: true, default: 0 },
  /** Números liberados por un borrado, pendientes de reutilizar — siempre <= `ultimoNumero`. */
  huecos: { type: [Number], default: [] },
});
ContadorPresupuestoSchema.index({ usuarioId: 1, anio: 1 }, { unique: true });

export const ContadorPresupuestoModel: Model<any> =
  models.ContadorPresupuesto || model('ContadorPresupuesto', ContadorPresupuestoSchema);
