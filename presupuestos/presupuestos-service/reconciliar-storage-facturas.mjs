#!/usr/bin/env node
/**
 * Reconciliación del bucket privado de facturas (Incremento "Facturas
 * privadas", 27/08/2026) — detecta objetos que existen en R2 pero ya no
 * están referenciados por ninguna factura en Mongo ("huérfanos": quedaron
 * así por un borrado que falló silenciosamente antes de este incremento,
 * o por cualquier fallo no previsto).
 *
 * SOLO INFORMA. No borra nada — ver "REGLA DE ORO" en el encargo original:
 * un objeto recién subido (la propia petición de guardado todavía en
 * vuelo, entre el `PutObjectCommand` y el `findOneAndUpdate` de Mongo) no
 * es un huérfano real, así que cualquier objeto de menos de 24h se excluye
 * del informe a propósito — border un falso positivo así sería mucho peor
 * que tardar un día más en detectar un huérfano de verdad.
 *
 * Uso:
 *   MONGO_URL="..." R2_ACCOUNT_ID="..." R2_ACCESS_KEY_ID="..." \
 *   R2_SECRET_ACCESS_KEY="..." R2_BUCKET_NAME_FACTURAS="..." \
 *   node reconciliar-storage-facturas.mjs
 *
 * Si la URL apunta a la base de datos de producción conocida
 * (`madera.qvszsal.mongodb.net/test`), hace falta `--confirmar-produccion`
 * — aunque este script no escribe nada, lee credenciales reales de R2 y
 * conviene el mismo criterio explícito que el resto de scripts de mantenimiento.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as cargarDotenv } from 'dotenv';
import mongoose from 'mongoose';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const carpetaScript = dirname(fileURLToPath(import.meta.url));
cargarDotenv({ path: resolve(carpetaScript, '../presupuestos-platform/.env'), quiet: true });

const { MONGO_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME_FACTURAS } = process.env;
const faltantes = ['MONGO_URL', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME_FACTURAS']
  .filter((v) => !process.env[v]);
if (faltantes.length) {
  console.error(`Faltan variables de entorno: ${faltantes.join(', ')}`);
  process.exit(1);
}

const esProduccionConocida = MONGO_URL.includes('madera.qvszsal.mongodb.net') && /\/test(\?|$)/.test(MONGO_URL);
if (esProduccionConocida && !process.argv.includes('--confirmar-produccion')) {
  console.error(
    'Esta MONGO_URL apunta a la base de datos de PRODUCCIÓN (madera.qvszsal.mongodb.net/test).\n' +
    'Vuelve a ejecutar con --confirmar-produccion si de verdad quieres reconciliar contra datos reales.'
  );
  process.exit(1);
}

/** Ningún objeto de menos de 24h se considera huérfano — ver comentario de cabecera. */
const ANTIGUEDAD_MINIMA_MS = 24 * 60 * 60 * 1000;

async function main() {
  await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection;
  console.log(`Conectado a la base de datos "${db.name}".`);

  // Todas las claves que Mongo conoce, de cualquier campo posible.
  const facturas = await db.collection('facturas').find({}, {
    projection: { imagenClave: 1, pdfOriginalClave: 1, imagenesClaves: 1, paginas: 1 },
  }).toArray();
  const clavesConocidas = new Set();
  for (const f of facturas) {
    if (f.imagenClave) clavesConocidas.add(f.imagenClave);
    if (f.pdfOriginalClave) clavesConocidas.add(f.pdfOriginalClave);
    for (const c of f.imagenesClaves ?? []) if (c) clavesConocidas.add(c);
    for (const p of f.paginas ?? []) if (p?.clave) clavesConocidas.add(p.clave);
  }
  console.log(`Claves referenciadas en Mongo: ${clavesConocidas.size}.`);

  const cliente = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });

  const huerfanos = [];
  let totalObjetos = 0;
  let continuationToken;
  const ahora = Date.now();

  do {
    const pagina = await cliente.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME_FACTURAS,
      ContinuationToken: continuationToken,
    }));
    for (const obj of pagina.Contents ?? []) {
      totalObjetos++;
      const antiguedadMs = ahora - new Date(obj.LastModified).getTime();
      if (antiguedadMs < ANTIGUEDAD_MINIMA_MS) continue; // Podría ser una subida todavía en curso — se excluye a propósito.
      if (!clavesConocidas.has(obj.Key)) {
        huerfanos.push({ clave: obj.Key, tamano: obj.Size, ultimaModificacion: obj.LastModified });
      }
    }
    continuationToken = pagina.IsTruncated ? pagina.NextContinuationToken : undefined;
  } while (continuationToken);

  console.log(`\nObjetos totales en el bucket: ${totalObjetos}.`);
  console.log(`Huérfanos detectados (sin referencia en Mongo, con más de 24h de antigüedad): ${huerfanos.length}.\n`);

  if (huerfanos.length > 0) {
    console.log('clave\ttamaño (bytes)\túltima modificación');
    for (const h of huerfanos) {
      console.log(`${h.clave}\t${h.tamano}\t${h.ultimaModificacion.toISOString()}`);
    }
    console.log('\nEste informe NO ha borrado nada. Revisa la lista a mano antes de decidir si borrar alguno de estos objetos.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Reconciliación fallida:', err);
  process.exit(1);
});
