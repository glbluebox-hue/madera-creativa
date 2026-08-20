#!/usr/bin/env node
/**
 * Migración "Cliente ≠ Proyecto" (especificación del usuario, 20/08/2026).
 *
 * Copia cada ficha de la colección `clientes` (que hoy mezcla identidad +
 * datos de un único trabajo) a un `Proyecto` nuevo con el MISMO `id`, y
 * añade `proyectoId` (= ese mismo id) a las Facturas/Notas/Dibujos/
 * Presupuestos/Contratos/Carpetas que ya apuntaban a esa ficha por
 * `clienteId`. NUNCA borra ni modifica un documento de `clientes` — sigue
 * sirviendo como identidad (nombre/teléfono/email) exactamente con el
 * mismo id, así que ningún `clienteId` existente en ninguna otra colección
 * necesita reescribirse.
 *
 * Idempotente: si un `Proyecto` con ese id ya existe, se salta esa ficha
 * (no duplica); las actualizaciones de `proyectoId` solo tocan documentos
 * que todavía lo tengan vacío/ausente.
 *
 * Uso:
 *   MONGO_URL="mongodb+srv://.../<bd_de_prueba>" node migracion-proyectos.mjs
 *
 * Si la URL apunta a la base de datos de producción conocida
 * (`madera.qvszsal.mongodb.net/test`), el script se niega a continuar salvo
 * que se pase `--confirmar-produccion` explícitamente — a propósito, para
 * que probar este script contra un entorno aislado sea la ruta por
 * defecto, y tocar datos reales requiera una decisión explícita.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as cargarDotenv } from 'dotenv';
import mongoose from 'mongoose';

const carpetaScript = dirname(fileURLToPath(import.meta.url));
cargarDotenv({ path: resolve(carpetaScript, '../presupuestos-platform/.env'), quiet: true });

const url = process.env.MONGO_URL;
if (!url) {
  console.error('Falta MONGO_URL — pásala como variable de entorno (ver cabecera de este archivo).');
  process.exit(1);
}

const esProduccionConocida = url.includes('madera.qvszsal.mongodb.net') && /\/test(\?|$)/.test(url);
if (esProduccionConocida && !process.argv.includes('--confirmar-produccion')) {
  console.error(
    'Esta MONGO_URL apunta a la base de datos de PRODUCCIÓN (madera.qvszsal.mongodb.net/test).\n' +
    'Vuelve a ejecutar con --confirmar-produccion si de verdad quieres migrar datos reales\n' +
    '(hazlo solo después de haber pasado las 11 pruebas en un entorno aislado).'
  );
  process.exit(1);
}

async function main() {
  await mongoose.connect(url, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection;
  console.log(`Conectado a la base de datos "${db.name}" en ${url.split('@')[1]?.split('/')[0] ?? '(local)'}.`);

  const clientesRaw = await db.collection('clientes').find({}).toArray();
  console.log(`${clientesRaw.length} ficha(s) encontrada(s) en 'clientes'.`);

  const contadores = {
    proyectosCreados: 0, proyectosOmitidos: 0,
    facturas: 0, notas: 0, dibujos: 0, presupuestos: 0, contratos: 0, carpetas: 0,
  };

  const proyectosCol = db.collection('proyectos');
  const colecciones = [
    { nombre: 'facturas', col: db.collection('facturas'), contador: 'facturas' },
    { nombre: 'notas', col: db.collection('notas'), contador: 'notas' },
    { nombre: 'dibujos', col: db.collection('dibujos'), contador: 'dibujos' },
    { nombre: 'presupuestos', col: db.collection('presupuestos'), contador: 'presupuestos' },
    { nombre: 'contratos', col: db.collection('contratos'), contador: 'contratos' },
    { nombre: 'carpetas', col: db.collection('carpetas'), contador: 'carpetas' },
  ];

  for (const doc of clientesRaw) {
    const yaExiste = await proyectosCol.findOne({ id: doc.id }, { projection: { _id: 1 } });
    if (yaExiste) {
      contadores.proyectosOmitidos++;
    } else {
      await proyectosCol.insertOne({
        id: doc.id,
        usuarioId: doc.usuarioId ?? 'admin',
        clienteId: doc.id,
        proyecto: doc.proyecto ?? '',
        direccion: doc.direccion ?? '',
        presupuesto: doc.presupuesto ?? 0,
        tarifaHora: doc.tarifaHora ?? 0,
        creado: doc.creado,
        estado: doc.estado ?? 'presupuestado',
        whatsapp: doc.whatsapp ?? undefined,
        ubicacion: doc.ubicacion ?? undefined,
        codigoPuerta: doc.codigoPuerta ?? undefined,
        planta: doc.planta ?? undefined,
        ascensor: doc.ascensor ?? undefined,
        zonaCarga: doc.zonaCarga ?? undefined,
        observacionesAcceso: doc.observacionesAcceso ?? undefined,
        fechaMedicion: doc.fechaMedicion ?? undefined,
        fechaMontaje: doc.fechaMontaje ?? undefined,
        estancias: doc.estancias ?? [],
        tareas: doc.tareas ?? [],
        movimientos: doc.movimientos ?? [],
        horas: doc.horas ?? [],
        adjuntos: doc.adjuntos ?? [],
        fotos: doc.fotos ?? [],
        dibujos: doc.dibujos ?? [],
        margenAvisado: doc.margenAvisado ?? false,
      });
      contadores.proyectosCreados++;
    }

    for (const { col, contador } of colecciones) {
      const resultado = await col.updateMany(
        { clienteId: doc.id, $or: [{ proyectoId: { $exists: false } }, { proyectoId: '' }] },
        { $set: { proyectoId: doc.id } }
      );
      contadores[contador] += resultado.modifiedCount;
    }
  }

  console.log('\nResumen de la migración:');
  console.log(`  Proyectos creados:            ${contadores.proyectosCreados}`);
  console.log(`  Proyectos ya existentes (omitidos): ${contadores.proyectosOmitidos}`);
  console.log(`  Facturas con proyectoId añadido:    ${contadores.facturas}`);
  console.log(`  Notas con proyectoId añadido:       ${contadores.notas}`);
  console.log(`  Dibujos con proyectoId añadido:     ${contadores.dibujos}`);
  console.log(`  Presupuestos con proyectoId añadido: ${contadores.presupuestos}`);
  console.log(`  Contratos con proyectoId añadido:   ${contadores.contratos}`);
  console.log(`  Carpetas con proyectoId añadido:    ${contadores.carpetas}`);
  console.log('\nLa colección "clientes" original NO se ha modificado ni borrado.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migración fallida:', err);
  process.exit(1);
});
