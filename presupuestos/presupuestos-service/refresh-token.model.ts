import { randomBytes, createHash } from 'node:crypto';
import { Schema, model, models, Model } from 'mongoose';

/** Días de validez de un refresh token, configurable por entorno. */
const TTL_DIAS = Number(process.env.REFRESH_TOKEN_TTL_DIAS) || 30;

/**
 * Refresh token de rotación. Solo se almacena el hash (SHA-256) — el valor
 * en claro únicamente vive en la cookie `httpOnly` del navegador y nunca se
 * persiste. Esto es lo que permite revocar sesiones de verdad (algo que el
 * esquema de token Base64 anterior no podía hacer nunca).
 */
const RefreshTokenSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true },
  creadoEn: { type: Date, required: true },
  expiraEn: { type: Date, required: true, index: true },
  revocadoEn: { type: Date, default: null },
});

export const RefreshTokenModel: Model<any> = models.RefreshToken || model('RefreshToken', RefreshTokenSchema);

function hashearToken(tokenPlano: string): string {
  return createHash('sha256').update(tokenPlano).digest('hex');
}

/** Genera un refresh token opaco (256 bits) y lo persiste hasheado. */
export async function crearRefreshToken(usuarioId: string): Promise<string> {
  const tokenPlano = randomBytes(32).toString('hex');
  const ahora = new Date();
  await RefreshTokenModel.create({
    tokenHash: hashearToken(tokenPlano),
    usuarioId,
    creadoEn: ahora,
    expiraEn: new Date(ahora.getTime() + TTL_DIAS * 24 * 60 * 60 * 1000),
    revocadoEn: null,
  });
  return tokenPlano;
}

/**
 * Rota un refresh token: si el token recibido es válido (existe, no
 * revocado, no expirado), lo revoca y crea uno nuevo para el mismo
 * usuario — así un token robado y reutilizado solo funciona una vez.
 * Devuelve `null` si el token no es válido por cualquier motivo.
 */
export async function rotarRefreshToken(tokenPlano: string): Promise<{ usuarioId: string; nuevoToken: string } | null> {
  const tokenHash = hashearToken(tokenPlano);
  // `findOneAndUpdate` con el filtro `revocadoEn: null` incluido: la lectura
  // ("¿sigue sin revocar?") y la escritura ("revócalo") son una sola
  // operación atómica en MongoDB, no dos pasos separados. Con
  // `findOne` + `doc.save()` (como estaba antes), dos peticiones casi
  // simultáneas con el mismo token (p. ej. un token robado reutilizado
  // justo cuando el usuario legítimo también renueva) podían leer las dos
  // `revocadoEn: null` antes de que ninguna escribiera, y las dos generaban
  // un token nuevo válido a partir del mismo token viejo — rompiendo la
  // garantía de "un token robado y reutilizado solo funciona una vez" que
  // este mecanismo existe para dar. Con la operación atómica, como mucho
  // una de las dos peticiones concurrentes puede "ganar" el `revocadoEn: null`.
  const doc = await RefreshTokenModel.findOneAndUpdate(
    { tokenHash, revocadoEn: null },
    { revocadoEn: new Date() }
  ).exec();
  if (!doc || doc.expiraEn.getTime() < Date.now()) return null;
  const nuevoToken = await crearRefreshToken(doc.usuarioId);
  return { usuarioId: doc.usuarioId, nuevoToken };
}

/** Revoca un refresh token concreto (logout). No falla si ya no existe o ya estaba revocado. */
export async function revocarRefreshToken(tokenPlano: string): Promise<void> {
  await RefreshTokenModel.updateOne({ tokenHash: hashearToken(tokenPlano) }, { revocadoEn: new Date() }).exec();
}

/**
 * Revoca todos los refresh tokens activos de un usuario — se usa al
 * suspender o eliminar una cuenta, para que dejen de poder renovar su
 * sesión aunque su access token todavía no haya caducado.
 */
export async function revocarTodosDeUsuario(usuarioId: string): Promise<void> {
  await RefreshTokenModel.updateMany({ usuarioId, revocadoEn: null }, { revocadoEn: new Date() }).exec();
}
