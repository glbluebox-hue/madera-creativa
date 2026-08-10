import type { AlmacenamientoArchivos } from './almacenamiento-archivos.js';
import { AlmacenamientoMemoria } from './almacenamiento-memoria.js';
import { AlmacenamientoR2 } from './almacenamiento-r2.js';
import { logger } from './logger.service.js';

/**
 * Punto único de acceso al almacenamiento de archivos (Incremento 1.7).
 * `presupuestos-service.ts` importa únicamente `almacenamiento` de aquí —
 * nunca `AlmacenamientoR2` ni el SDK de S3 directamente, para que la lógica
 * de negocio no dependa de un proveedor concreto.
 */
function crearAlmacenamiento(): AlmacenamientoArchivos {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL_BASE } = process.env;
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_PUBLIC_URL_BASE) {
    return new AlmacenamientoR2({
      accountId: R2_ACCOUNT_ID,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      bucket: R2_BUCKET_NAME,
      urlPublicaBase: R2_PUBLIC_URL_BASE,
    });
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Faltan variables de entorno de Cloudflare R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL_BASE). Son obligatorias en producción.');
  }
  logger.warn('R2 no configurado — usando almacenamiento en memoria (solo válido en desarrollo, los archivos no persisten entre reinicios).');
  return new AlmacenamientoMemoria();
}

export const almacenamiento: AlmacenamientoArchivos = crearAlmacenamiento();
