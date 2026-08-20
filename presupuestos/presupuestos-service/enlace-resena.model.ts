import { randomBytes, createHash } from 'node:crypto';
import { Schema, model, models, Model } from 'mongoose';

/**
 * Enlace individual de solicitud de reseña (uno por cliente) — mismo
 * patrón que `enlace-presupuesto.model.ts`: solo se guarda el hash SHA-256
 * del token, nunca el valor en claro (solo existe una vez, en la URL/QR que
 * se comparte con el cliente).
 *
 * A diferencia del enlace de presupuesto, este no "expira" ni "protege"
 * ningún contenido — el destino final (la ficha de reseñas de Google) es
 * siempre el mismo para todos los clientes, así que no hay nada que un
 * token filtrado pueda exponer. Su único propósito es poder revocar el
 * enlace/QR anterior al generar uno nuevo (p. ej. si el cartel impreso se
 * pierde o se quiere reiniciar el seguimiento) y saber si el cliente
 * concreto llegó a usarlo.
 */
const EnlaceResenaSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  clienteId: { type: String, required: true, index: true },
  usuarioId: { type: String, required: true, index: true },
  creadoEn: { type: Date, required: true },
  revocadoEn: { type: Date, default: null },
  /** Momento del primer clic/escaneo — `null` mientras el cliente no lo haya usado nunca. */
  primerUsoEn: { type: Date, default: null },
  /** Nº de veces que se ha resuelto este enlace (clics/escaneos), incluida la primera. */
  usos: { type: Number, default: 0 },
});

export const EnlaceResenaModel: Model<any> = models.EnlaceResena || model('EnlaceResena', EnlaceResenaSchema);

function hashearToken(tokenPlano: string): string {
  return createHash('sha256').update(tokenPlano).digest('hex');
}

/** Formato esperado de un token de enlace de reseña: 64 caracteres hex (`randomBytes(32).toString('hex')`). */
export function formatoTokenValidoResena(tokenPlano: string): boolean {
  return /^[a-f0-9]{64}$/.test(tokenPlano);
}

/**
 * Genera un enlace de reseña nuevo para un cliente y revoca (soft) cualquier
 * enlace anterior todavía activo del mismo cliente — solo uno válido a la
 * vez, para que un QR/cartel viejo que quede por ahí deje de funcionar en
 * cuanto se genera uno nuevo. Como solo se guarda el hash, un token ya
 * generado no se puede recuperar ni reutilizar: cada llamada crea uno nuevo.
 *
 * Crea el nuevo ANTES de revocar los anteriores (mismo orden deliberado que
 * `crearEnlacePresupuesto`) — si el proceso cae justo entre medias, deja
 * como mucho DOS enlaces válidos a la vez (inofensivo), nunca CERO.
 */
export async function crearEnlaceResena(params: { clienteId: string; usuarioId: string }): Promise<{ token: string }> {
  const ahora = new Date();
  const tokenPlano = randomBytes(32).toString('hex');
  const tokenHash = hashearToken(tokenPlano);

  await EnlaceResenaModel.create({
    tokenHash,
    clienteId: params.clienteId,
    usuarioId: params.usuarioId,
    creadoEn: ahora,
    revocadoEn: null,
    primerUsoEn: null,
    usos: 0,
  });

  await EnlaceResenaModel.updateMany(
    { clienteId: params.clienteId, usuarioId: params.usuarioId, revocadoEn: null, tokenHash: { $ne: tokenHash } },
    { $set: { revocadoEn: ahora } }
  ).exec();

  return { token: tokenPlano };
}

/** Busca un enlace de reseña por su token en claro (compara por hash). `null` si no existe. */
export async function buscarEnlaceResenaPorToken(tokenPlano: string): Promise<any | null> {
  return EnlaceResenaModel.findOne({ tokenHash: hashearToken(tokenPlano) }).exec();
}

/**
 * Registra un uso (clic/escaneo) del enlace — atómico vía pipeline de
 * actualización: incrementa `usos` y, solo si `primerUsoEn` seguía a
 * `null`, lo fija a ahora. Una sola escritura, sin condición de carrera
 * entre leer y decidir si es el primer uso.
 *
 * `updatePipeline: true` es obligatorio en esta versión de Mongoose (9.x)
 * para pasar un array (pipeline de agregación) como segundo argumento —
 * sin ella lanza "Cannot pass an array to query updates unless the
 * `updatePipeline` option is set" (confirmado en pruebas locales).
 */
export async function registrarUsoEnlaceResena(tokenPlano: string): Promise<void> {
  const ahora = new Date();
  await EnlaceResenaModel.updateOne(
    { tokenHash: hashearToken(tokenPlano) },
    [{ $set: { usos: { $add: ['$usos', 1] }, primerUsoEn: { $ifNull: ['$primerUsoEn', ahora] } } }],
    { updatePipeline: true }
  ).exec();
}
