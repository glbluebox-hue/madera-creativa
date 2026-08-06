import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

/** Duración del access token — corta a propósito: si se filtra, la ventana de uso es mínima. */
export const ACCESS_TOKEN_TTL = '15m';

/** Payload firmado dentro del access token. */
export type PayloadAcceso = {
  sub: string; // usuarioId
  esAdmin: boolean;
};

/** Secreto generado en memoria solo cuando falta JWT_SECRET en desarrollo. */
let secretoEfimeroDev: string | null = null;

function obtenerSecreto(): string {
  const secreto = process.env.JWT_SECRET;
  if (secreto) return secreto;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET no está configurada. Es obligatoria en producción.');
  }
  if (!secretoEfimeroDev) {
    secretoEfimeroDev = randomBytes(48).toString('hex');
    console.warn(
      '[token.service] JWT_SECRET no configurada — usando un secreto temporal solo para esta sesión de desarrollo. ' +
        'Todas las sesiones se invalidarán al reiniciar el servicio. Añade JWT_SECRET a tu .env para persistencia real.'
    );
  }
  return secretoEfimeroDev;
}

/** Firma un access token JWT de corta duración. */
export function firmarAccessToken(payload: PayloadAcceso): string {
  return jwt.sign(payload, obtenerSecreto(), { expiresIn: ACCESS_TOKEN_TTL });
}

/**
 * Verifica un access token JWT. Devuelve el payload si la firma y la
 * expiración son válidas, o `null` si no lo son (token inválido, caducado
 * o manipulado) — nunca lanza, para que `requireAuth` pueda tratarlo como
 * un simple "no autorizado".
 */
export function verificarAccessToken(token: string): PayloadAcceso | null {
  try {
    const payload = jwt.verify(token, obtenerSecreto());
    if (typeof payload === 'string' || !('sub' in payload)) return null;
    return { sub: String(payload.sub), esAdmin: Boolean((payload as { esAdmin?: unknown }).esAdmin) };
  } catch {
    return null;
  }
}
