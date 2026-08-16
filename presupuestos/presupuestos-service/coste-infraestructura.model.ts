import { randomUUID } from 'node:crypto';
import { Schema, model, models, Model } from 'mongoose';
import { conectarUsuarios } from './usuario.model.js';

/**
 * Coste de una herramienta/servicio usado para operar la plataforma (Render,
 * MongoDB Atlas, Cloudflare, OpenAI...). Solo lo gestiona el admin desde su
 * propio panel — no tiene relación con los datos de ningún cliente ni con
 * `usuarioId`, así que no se aísla por usuario como clientes/facturas.
 */
const CosteInfraestructuraSchema = new Schema({
  id:            { type: String, required: true, unique: true, index: true },
  nombre:        { type: String, required: true },
  /** Texto libre (no enum): el admin debe poder inventar categorías nuevas sin tocar código. */
  categoria:     { type: String, default: '' },
  coste:         { type: Number, required: true },
  moneda:        { type: String, default: 'EUR' },
  periodicidad:  { type: String, enum: ['mensual', 'anual', 'unico'], required: true },
  url:           { type: String, default: '' },
  notas:         { type: String, default: '' },
  /** El admin lo apaga sin borrarlo cuando deja de usar una herramienta — conserva el histórico. */
  activo:        { type: Boolean, default: true },
  creadoEn:      { type: String, required: true },
  actualizadoEn: { type: String, required: true },
});

export const CosteInfraestructuraModel: Model<any> =
  models.CosteInfraestructura || model('CosteInfraestructura', CosteInfraestructuraSchema);

/** Reutiliza la misma conexión/pool que el resto de modelos de usuario/admin. */
export async function conectarCostes(): Promise<void> {
  await conectarUsuarios();
}

export function generarIdCoste(): string {
  return randomUUID();
}
