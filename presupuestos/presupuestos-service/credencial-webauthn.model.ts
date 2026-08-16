import { Schema, model, models, Model } from 'mongoose';
import { conectarUsuarios } from './usuario.model.js';

/**
 * Credencial WebAuthn/Passkey de un usuario — una por dispositivo
 * registrado. Guarda exclusivamente la información pública que exige el
 * protocolo para verificar futuras autenticaciones (clave pública COSE,
 * contador anti-replay, id de credencial). **Nunca contiene huella, cara,
 * PIN ni ningún dato biométrico** — eso nunca sale del dispositivo del
 * usuario ni llega al navegador, y mucho menos a este servidor; es la
 * garantía de diseño del propio estándar WebAuthn, no algo que dependa de
 * cómo se implemente aquí.
 *
 * Colección separada de `Usuario` (en vez de un array embebido) por el
 * mismo motivo que `RefreshToken` vive aparte: un usuario puede tener
 * varias credenciales (móvil, portátil, tablet) y cada una debe poder
 * eliminarse individualmente sin tocar el documento de usuario.
 */
const CredencialWebAuthnSchema = new Schema({
  id:                { type: String, required: true, unique: true, index: true },
  usuarioId:         { type: String, required: true, index: true },
  /** Id de credencial en base64url, tal como lo genera el autenticador — único en toda la colección (WebAuthn lo garantiza). */
  credentialId:      { type: String, required: true, unique: true, index: true },
  /** Clave pública COSE en base64url. Solo sirve para VERIFICAR firmas — no permite suplantar al usuario ni reconstruir ningún dato biométrico. */
  publicKey:         { type: String, required: true },
  /**
   * Contador de firmas que reporta el autenticador. Debe crecer en cada
   * uso; si el servidor recibe un valor igual o menor al guardado, es
   * indicio de una credencial clonada — ver `verificarLoginWebAuthn` en
   * `webauthn-rutas.ts`.
   */
  counter:           { type: Number, required: true, default: 0 },
  transports:        { type: [String], default: [] },
  deviceType:        { type: String, enum: ['singleDevice', 'multiDevice'], required: true },
  backedUp:          { type: Boolean, default: false },
  /** Etiqueta legible ("iPhone de Juan", "Este dispositivo") — nunca usada para verificar, solo para que el usuario reconozca sus dispositivos en Ajustes. */
  nombreDispositivo: { type: String, required: true },
  creadoEn:          { type: String, required: true },
  ultimoUso:         { type: String, default: '' },
});

export const CredencialWebAuthnModel: Model<any> =
  models.CredencialWebAuthn || model('CredencialWebAuthn', CredencialWebAuthnSchema);

/** Reutiliza la misma conexión/pool que el resto de modelos de usuario. */
export async function conectarCredencialesWebAuthn(): Promise<void> {
  await conectarUsuarios();
}
