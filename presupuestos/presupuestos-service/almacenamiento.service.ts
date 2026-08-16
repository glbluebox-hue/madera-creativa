import type { AlmacenamientoArchivos, ResultadoSubida } from './almacenamiento-archivos.js';
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

/**
 * Instancia real, creada de forma perezosa (nunca en el momento de importar
 * este módulo). Bug real encontrado el 16/08/2026: `export const
 * almacenamiento = crearAlmacenamiento()` se ejecutaba en cuanto algo
 * importaba este archivo — y como los imports de un módulo ES/CJS se
 * resuelven ANTES que el cuerpo del módulo que los importa, eso pasaba antes
 * de que `cargarVariablesEntornoLocal()` (primera línea real de
 * `presupuestos-service.app-root.ts`) llegara a cargar el `.env`. Resultado:
 * `R2_ACCOUNT_ID` y compañía siempre estaban `undefined` en el momento de
 * decidir qué implementación usar, así que el servicio caía siempre en
 * `AlmacenamientoMemoria` — aunque el `.env` tuviera las 5 variables de R2
 * correctamente puestas. Confirmado en vivo: con las credenciales de R2 ya
 * en el `.env`, el arranque seguía mostrando "R2 no configurado". Al hacerlo
 * perezoso (se crea la primera vez que de verdad se sube/borra un archivo,
 * no al importar el módulo), `process.env` ya está completo para entonces.
 */
let instancia: AlmacenamientoArchivos | null = null;
function obtenerInstancia(): AlmacenamientoArchivos {
  if (!instancia) instancia = crearAlmacenamiento();
  return instancia;
}

export const almacenamiento: AlmacenamientoArchivos = {
  subir: (datos: Buffer, opciones: { contentType: string; carpeta: string }): Promise<ResultadoSubida> =>
    obtenerInstancia().subir(datos, opciones),
  borrar: (clave: string): Promise<void> => obtenerInstancia().borrar(clave),
  claveDesdeUrl: (url: string): string | null => obtenerInstancia().claveDesdeUrl(url),
  obtener: (clave: string): Promise<{ datos: Buffer; contentType: string } | null> => obtenerInstancia().obtener(clave),
};
