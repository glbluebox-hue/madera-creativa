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

/**
 * Token de un solo propósito para servir un archivo del bucket PRIVADO de
 * facturas a través de nuestro propio dominio (`/almacenamiento-privado`,
 * `presupuestos-service.app-root.ts`) en vez de una URL firmada directa de
 * R2 — incidencia real, 29/08/2026: tanto el dominio público de R2
 * (`cdn.maderacreativa.com`) como una URL firmada de R2 pedida DIRECTAMENTE
 * por el navegador devuelven 503 de forma intermitente (mismo problema ya
 * documentado el 19/08/2026 en `imagen-fallback.ts` para el bucket
 * público); el servidor, en cambio, siempre ha podido leer el objeto sin
 * fallos por la API S3 autenticada. Este token traslada esa misma
 * fiabilidad al bucket privado: nunca lleva un usuarioId (no hace falta —
 * solo se firma para una `clave` ya verificada como propiedad del usuario
 * en el momento de construir la respuesta de la factura, ver
 * `resolverUrlsFactura`), tiene una vida corta (por defecto 15 min, igual
 * que la URL firmada de R2 a la que sustituye) y solo sirve para ESTA
 * clave concreta — nunca un proxy abierto a cualquier objeto del bucket.
 */
export type PayloadArchivoPrivado = { clave: string };

/** TTL por defecto — igual que `generarUrlTemporal()` en `almacenamiento-r2.ts`, al que sustituye para las facturas. */
export const TTL_TOKEN_ARCHIVO_SEGUNDOS = 900;

export function firmarTokenArchivo(clave: string, ttlSegundos: number = TTL_TOKEN_ARCHIVO_SEGUNDOS): string {
  const secreto = obtenerSecreto();
  return jwt.sign({ clave } satisfies PayloadArchivoPrivado, secreto, { expiresIn: ttlSegundos });
}

/** Devuelve la clave si el token es válido y no ha caducado, o `null` en cualquier otro caso — nunca lanza. */
export function verificarTokenArchivo(token: string): string | null {
  const secreto = obtenerSecreto();
  try {
    const payload = jwt.verify(token, secreto);
    if (typeof payload === 'string' || !('clave' in payload) || typeof (payload as { clave: unknown }).clave !== 'string') return null;
    return (payload as PayloadArchivoPrivado).clave;
  } catch {
    return null;
  }
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
