import type express from 'express';

/**
 * Configuración de RP ID / origen esperado para WebAuthn — deriva de las
 * mismas variables de entorno que ya gobiernan CORS (`ALLOWED_ORIGINS`,
 * `NODE_ENV`), sin introducir un segundo lugar donde declarar el dominio de
 * producción.
 *
 * `origenEsperado()` reproduce exactamente la misma lógica que
 * `origenPermitido()` (CORS, en `presupuestos-service.app-root.ts`): un
 * origen es válido si está en `ALLOWED_ORIGINS` (en cualquier entorno) o si
 * es `http://localhost:<puerto>` fuera de producción. Antes esta función
 * solo miraba `ALLOWED_ORIGINS` cuando `NODE_ENV === 'production'` — pero
 * `entorno-local.ts` deja claro que `NODE_ENV` nunca vale `'production'` en
 * desarrollo local, ni siquiera probando contra el túnel de Cloudflare
 * permanente (`https://estudio.maderacreativa.com` → `localhost:3000`, ver
 * memoria del proyecto). Con la lógica antigua, cualquier intento de
 * registrar o entrar con el autenticador del móvil a través de ese túnel
 * fallaba con "Origen no permitido" aunque CORS sí lo aceptara — una
 * ceremonia de WebAuthn nunca llegaba a completarse en el único escenario
 * real en que tiene sentido probar biometría de verdad (un dispositivo
 * físico, no el navegador de escritorio). Ahora WebAuthn nunca es ni más ni
 * menos permisivo que CORS sobre qué orígenes acceden.
 */

const RP_NAME = 'Madera Creativa';
const LOCALHOST_DEV = /^http:\/\/localhost:\d+$/;

function origenesPermitidos(): string[] {
  return (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
}

export const rpName = RP_NAME;

/**
 * Origen esperado de la petición actual, en el formato exacto que exige
 * `@simplewebauthn/server` (`https://estudio.maderacreativa.com`, sin barra
 * final). Devuelve `null` si el origen no es uno de los permitidos — el
 * llamante debe rechazar la ceremonia en ese caso, nunca asumir un origen
 * por defecto.
 */
export function origenEsperado(req: express.Request): string | null {
  const origen = req.headers.origin;
  if (!origen) return null;
  if (origenesPermitidos().includes(origen)) return origen;
  if (process.env.NODE_ENV !== 'production' && LOCALHOST_DEV.test(origen)) return origen;
  return null;
}

/**
 * Dominio RP (Relying Party) — el `id` que WebAuthn asocia a cada
 * credencial. Se deriva del origen YA VALIDADO de la petición actual
 * (`origenEsperado()`), nunca de una única variable global fija: la misma
 * app, en la misma sesión de desarrollo, puede probarse tanto desde
 * `localhost` (ordenador) como desde el túnel de producción (móvil, para
 * usar un autenticador real) — un RP ID fijo rompería una de las dos vías,
 * porque WebAuthn ata cada credencial al RP ID exacto usado al registrarla:
 * una credencial registrada con `rpID: 'localhost'` nunca sirve para entrar
 * desde `estudio.maderacreativa.com`, y viceversa. Cada dominio tiene sus
 * propias credenciales, igual que en cualquier sitio real.
 */
export function rpID(origenValidado: string): string {
  return new URL(origenValidado).hostname;
}
