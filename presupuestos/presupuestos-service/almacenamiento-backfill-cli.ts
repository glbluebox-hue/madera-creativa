import mongoose from 'mongoose';
import { ejecutarBackfillAlmacenamiento } from './almacenamiento-backfill.js';
import { logger } from './logger.service.js';

/**
 * Ejecución de un solo uso del backfill de cuota de almacenamiento
 * (05/09/2026) — rellena los `tamano` que faltan en documentos guardados
 * antes de esa función y recalcula el contador de cada usuario. Ver el
 * porqué completo en `almacenamiento-backfill.ts`.
 *
 * Uso (tras `npm run build`, tal como arranca el propio servidor —
 * `render-entry.js` — para que las variables de entorno de `.env`/del
 * panel del proveedor ya estén cargadas):
 *
 *   node dist/almacenamiento-backfill-cli.js
 *
 * Seguro de ejecutar más de una vez (idempotente, ver cabecera de
 * `almacenamiento-backfill.ts`) — no hace falta ninguna bandera de
 * "dry-run": solo LEE tamaños ya existentes en el almacenamiento y
 * escribe números en Mongo, nunca sube, borra ni modifica ningún archivo.
 */
ejecutarBackfillAlmacenamiento()
  .then((resumen) => {
    logger.info(resumen, '[backfill-almacenamiento] Completado.');
    console.log(JSON.stringify(resumen, null, 2));
  })
  .catch((err) => {
    logger.error({ err }, '[backfill-almacenamiento] Fallo durante la ejecución.');
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.disconnect();
  });
