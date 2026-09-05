import { Schema, model, models, Model } from 'mongoose';

/**
 * Contador de almacenamiento por cuenta (cuota BASIC/PRO/PREMIUM,
 * 05/09/2026) — un documento por `usuarioId`, con el total de bytes
 * consumidos por sus propios archivos (fotos, adjuntos, facturas,
 * dibujos, modelos 3D, recursos, firmas...). Mismo patrón que
 * `ContadorPresupuesto`: un contador simple, actualizado con `$inc`
 * atómico (ver `almacenamiento-cuota.ts`), nunca "leer total, comparar,
 * escribir" en dos pasos.
 *
 * Índice único en `usuarioId`: solo hace falta un documento por cuenta
 * (a diferencia del contador de presupuestos, este no depende del año).
 */
const ContadorAlmacenamientoSchema = new Schema({
  usuarioId: { type: String, required: true, unique: true, index: true },
  bytesUsados: { type: Number, required: true, default: 0 },
});

export const ContadorAlmacenamientoModel: Model<any> =
  models.ContadorAlmacenamiento || model('ContadorAlmacenamiento', ContadorAlmacenamientoSchema);
