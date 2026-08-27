#!/usr/bin/env node
/**
 * Backfill de `claveAlmacenamiento` en facturas guardadas ANTES del
 * Incremento "Facturas privadas" (27/08/2026).
 *
 * Esas facturas guardan la URL pública permanente del bucket histórico,
 * pero no la clave interna del objeto (campo nuevo: `imagenClave` /
 * `pdfOriginalClave` / `imagenesClaves` / `paginas[].clave`). Este script
 * la deriva de la propia URL (mismo cálculo que `claveDesdeUrl()` en
 * `almacenamiento-r2.ts`) y la escribe en Mongo — no mueve NINGÚN archivo
 * de bucket, no borra nada, solo completa un dato que faltaba.
 *
 * Por qué importa completarlo: sin la clave, esas facturas seguirán
 * sirviéndose con su URL pública de siempre (comportamiento sin cambios) —
 * pero tenerla ya guardada es lo que permitiría, en el futuro, migrar
 * también estos archivos al bucket privado (P2, no forma parte de este
 * script).
 *
 * Idempotente: solo rellena los campos que estén vacíos; ejecutarlo varias
 * veces no repite ni deshace nada.
 *
 * Uso:
 *   MONGO_URL="mongodb+srv://.../<bd_de_prueba>" R2_PUBLIC_URL_BASE="https://..." node backfill-clave-facturas.mjs
 *
 * Si la URL apunta a la base de datos de producción conocida
 * (`madera.qvszsal.mongodb.net/test`), el script se niega a continuar salvo
 * que se pase `--confirmar-produccion` explícitamente.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as cargarDotenv } from 'dotenv';
import mongoose from 'mongoose';

const carpetaScript = dirname(fileURLToPath(import.meta.url));
cargarDotenv({ path: resolve(carpetaScript, '../presupuestos-platform/.env'), quiet: true });

const url = process.env.MONGO_URL;
const urlPublicaBase = process.env.R2_PUBLIC_URL_BASE;

if (!url) {
  console.error('Falta MONGO_URL — pásala como variable de entorno (ver cabecera de este archivo).');
  process.exit(1);
}
if (!urlPublicaBase) {
  console.error('Falta R2_PUBLIC_URL_BASE — hace falta para derivar la clave a partir de las URLs antiguas.');
  process.exit(1);
}

const esProduccionConocida = url.includes('madera.qvszsal.mongodb.net') && /\/test(\?|$)/.test(url);
if (esProduccionConocida && !process.argv.includes('--confirmar-produccion')) {
  console.error(
    'Esta MONGO_URL apunta a la base de datos de PRODUCCIÓN (madera.qvszsal.mongodb.net/test).\n' +
    'Vuelve a ejecutar con --confirmar-produccion si de verdad quieres completar datos reales\n' +
    '(hazlo solo después de haber probado este script en un entorno aislado).'
  );
  process.exit(1);
}

/** Mismo cálculo que `AlmacenamientoR2.claveDesdeUrl()` — ver `almacenamiento-r2.ts`. */
function claveDesdeUrl(valor) {
  if (typeof valor !== 'string' || !valor) return null;
  const prefijo = `${urlPublicaBase.replace(/\/$/, '')}/`;
  return valor.startsWith(prefijo) ? valor.slice(prefijo.length) : null;
}

async function main() {
  await mongoose.connect(url, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection;
  console.log(`Conectado a la base de datos "${db.name}" en ${url.split('@')[1]?.split('/')[0] ?? '(local)'}.`);

  const facturas = db.collection('facturas');
  const cursor = facturas.find({});
  let vistas = 0;
  let actualizadas = 0;

  for await (const f of cursor) {
    vistas++;
    const cambios = {};

    if (!f.imagenClave && f.imagen) {
      const c = claveDesdeUrl(f.imagen);
      if (c) cambios.imagenClave = c;
    }
    if (!f.pdfOriginalClave && f.pdfOriginalUrl) {
      const c = claveDesdeUrl(f.pdfOriginalUrl);
      if (c) cambios.pdfOriginalClave = c;
    }
    if ((!Array.isArray(f.imagenesClaves) || f.imagenesClaves.length === 0) && Array.isArray(f.imagenes) && f.imagenes.length > 0) {
      const claves = f.imagenes.map((u) => claveDesdeUrl(u) || '');
      if (claves.some(Boolean)) cambios.imagenesClaves = claves;
    }
    if (Array.isArray(f.paginas) && f.paginas.some((p) => !p.clave && p.url)) {
      cambios.paginas = f.paginas.map((p) => (!p.clave && p.url ? { ...p, clave: claveDesdeUrl(p.url) || '' } : p));
    }

    if (Object.keys(cambios).length > 0) {
      await facturas.updateOne({ _id: f._id }, { $set: cambios });
      actualizadas++;
    }
  }

  console.log('\nResumen del backfill:');
  console.log(`  Facturas revisadas:                 ${vistas}`);
  console.log(`  Facturas completadas con su clave:  ${actualizadas}`);
  console.log('\nNingún archivo se ha movido ni borrado del bucket — solo se ha completado el dato en Mongo.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Backfill fallido:', err);
  process.exit(1);
});
