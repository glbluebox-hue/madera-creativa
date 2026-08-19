import { randomBytes, createHash } from 'node:crypto';
import { hostname } from 'node:os';
import jwt from 'jsonwebtoken';
import { logger } from './logger.service.js';

/** Duración del access token — corta a propósito: si se filtra, la ventana de uso es mínima. */
export const ACCESS_TOKEN_TTL = '15m';

/** Payload firmado dentro del access token. */
export type PayloadAcceso = {
  sub: string; // usuarioId
  esAdmin: boolean;
};

/** Secreto generado en memoria solo cuando falta JWT_SECRET en desarrollo. */
let secretoEfimeroDev: string | null = null;

/** Longitud mínima recomendada (256 bits en hexadecimal/base64 típico). */
const LONGITUD_MINIMA_SECRETO = 32;

function obtenerSecreto(): string {
  const secreto = process.env.JWT_SECRET;
  const esProduccion = process.env.NODE_ENV === 'production';

  if (secreto) {
    if (secreto.length < LONGITUD_MINIMA_SECRETO) {
      if (esProduccion) {
        throw new Error(
          `JWT_SECRET tiene ${secreto.length} caracteres; en producción se exigen al menos ${LONGITUD_MINIMA_SECRETO}.`
        );
      }
      logger.warn(
        { longitud: secreto.length, minima: LONGITUD_MINIMA_SECRETO },
        '[token.service] JWT_SECRET más corto que lo recomendado — se acepta porque no estás en producción, pero un secreto corto es más fácil de adivinar por fuerza bruta.'
      );
    }
    return secreto;
  }

  if (esProduccion) {
    throw new Error('JWT_SECRET no está configurada. Es obligatoria en producción.');
  }
  if (!secretoEfimeroDev) {
    secretoEfimeroDev = randomBytes(48).toString('hex');
    logger.warn(
      '[token.service] JWT_SECRET no configurada — usando un secreto temporal solo para esta sesión de desarrollo. ' +
        'Todas las sesiones se invalidarán al reiniciar el servicio. Añade JWT_SECRET a tu .env para persistencia real.'
    );
  }
  return secretoEfimeroDev;
}

/**
 * Huella corta (no reversible) del secreto realmente en uso — para poder
 * comparar en los logs si dos procesos distintos (dos instancias, o antes
 * y después de un reinicio) están usando el MISMO secreto sin necesidad de
 * exponer el secreto en sí. Si esta huella difiere entre el log de
 * `firmarAccessToken` y el de un `verificarAccessToken` fallido, confirma
 * que hay más de un secreto en juego.
 */
function huellaSecreto(secreto: string): string {
  return createHash('sha256').update(secreto).digest('hex').slice(0, 10);
}

/** Firma un access token JWT de corta duración. */
export function firmarAccessToken(payload: PayloadAcceso): string {
  const secreto = obtenerSecreto();
  const token = jwt.sign(payload, secreto, { expiresIn: ACCESS_TOKEN_TTL });
  logger.info(
    {
      hostname: hostname(),
      pid: process.pid,
      huellaSecreto: huellaSecreto(secreto),
      huellaToken: huellaSecreto(token),
      longitudToken: token.length,
      usuarioId: payload.sub,
    },
    '[token] Access token firmado'
  );
  return token;
}

/**
 * Verifica un access token JWT. Devuelve el payload si la firma y la
 * expiración son válidas, o `null` si no lo son (token inválido, caducado
 * o manipulado) — nunca lanza, para que `requireAuth` pueda tratarlo como
 * un simple "no autorizado".
 *
 * 19/08/2026: se añade registro detallado en el fallo (bug real en
 * investigación — un token recién firmado, usado en el segundo siguiente,
 * era rechazado como inválido de forma intermitente). El motivo exacto que
 * da `jsonwebtoken` (firma no coincide, caducado, formato roto...) y la
 * huella del secreto usado para verificar permiten comparar directamente
 * contra el log de `firmarAccessToken` del mismo token.
 */
export function verificarAccessToken(token: string): PayloadAcceso | null {
  const secreto = obtenerSecreto();
  try {
    const payload = jwt.verify(token, secreto);
    if (typeof payload === 'string' || !('sub' in payload)) {
      logger.warn(
        { hostname: hostname(), pid: process.pid, huellaToken: huellaSecreto(token), longitudToken: token.length },
        '[token] Verificación fallida: payload sin "sub" o es un string plano'
      );
      return null;
    }
    return { sub: String(payload.sub), esAdmin: Boolean((payload as { esAdmin?: unknown }).esAdmin) };
  } catch (err) {
    let decodificadoSinVerificar: unknown = null;
    try { decodificadoSinVerificar = jwt.decode(token); } catch { /* token ni siquiera bien formado */ }
    logger.warn(
      {
        hostname: hostname(),
        pid: process.pid,
        huellaSecreto: huellaSecreto(secreto),
        huellaToken: huellaSecreto(token),
        longitudToken: token.length,
        errorNombre: err instanceof Error ? err.name : typeof err,
        errorMensaje: err instanceof Error ? err.message : String(err),
        decodificadoSinVerificar,
        ahoraUnix: Math.floor(Date.now() / 1000),
      },
      '[token] Verificación de access token fallida'
    );
    return null;
  }
}
