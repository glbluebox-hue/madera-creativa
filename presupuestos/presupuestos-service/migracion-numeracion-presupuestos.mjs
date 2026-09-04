#!/usr/bin/env node
/**
 * Migración "Numeración oficial de presupuestos" (encargo del usuario,
 * 05/09/2026) — asigna `numeroPresupuesto` (p. ej. `PRV-0001/26`) a todo
 * presupuesto existente que todavía no lo tenga.
 *
 * Algoritmo, tal como lo pidió el usuario:
 * 1. Agrupar los presupuestos por `usuarioId`.
 * 2. Dentro de cada usuario, agrupar por año de CREACIÓN en `Europe/Madrid`
 *    (nunca UTC — ver `anioMadrid`, duplicada aquí a propósito: este
 *    script es un `.mjs` autónomo sin build, no puede importar
 *    `numeracion-presupuestos.ts` directamente; debe cambiarse a la vez
 *    si esa función cambia). El bucle de asignación de más abajo es el
 *    mismo algoritmo, probado, de `calcularNumerosHistoricos()` en
 *    `numeracion-presupuestos.ts` — si uno cambia, el otro debe cambiar
 *    igual.
 * 3. Dentro de cada año, ordenar por `creado` ascendente — empate
 *    (idéntico `creado`) se resuelve por `id` ascendente, estable y
 *    determinista, nunca al azar.
 * 4. Numerar empezando por 0001, saltando cualquier número que ya
 *    estuviera asignado (idempotencia — ver más abajo).
 *
 * Idempotente: un presupuesto con `numeroPresupuesto` ya asignado NUNCA se
 * toca ni se recalcula — se lee su número para no repetirlo, y punto.
 * Ejecutar este script dos veces (o después de que la app ya haya
 * numerado presupuestos nuevos en producción) es seguro: la segunda vez
 * no encuentra nada que numerar y no cambia nada.
 *
 * NO modifica `creado`, `actualizado`, ni ningún otro campo — cada
 * actualización toca EXCLUSIVAMENTE `numeroPresupuesto`.
 *
 * Al terminar, sincroniza `ContadorPresupuesto` (`usuarioId`+`anio`) para
 * que los presupuestos NUEVOS (creados por la app después de esta
 * migración) continúen la secuencia sin colisionar con el histórico —
 * usa `$max` (nunca reduce `ultimoNumero`) y nunca toca `huecos` de un
 * contador ya existente (por si la app ya llevaba un tiempo en producción
 * con gente borrando presupuestos numerados antes de correr esto).
 *
 * Uso:
 *   MONGO_URL="mongodb+srv://.../<bd_de_prueba>" node migracion-numeracion-presupuestos.mjs
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
if (!url) {
  console.error('Falta MONGO_URL — pásala como variable de entorno (ver cabecera de este archivo).');
  process.exit(1);
}

const esProduccionConocida = url.includes('madera.qvszsal.mongodb.net') && /\/test(\?|$)/.test(url);
if (esProduccionConocida && !process.argv.includes('--confirmar-produccion')) {
  console.error(
    'Esta MONGO_URL apunta a la base de datos de PRODUCCIÓN (madera.qvszsal.mongodb.net/test).\n' +
    'Vuelve a ejecutar con --confirmar-produccion si de verdad quieres migrar datos reales\n' +
    '(hazlo solo después de haber pasado todos los tests en un entorno aislado).'
  );
  process.exit(1);
}

/** Copia exacta de `anioMadrid()` en `numeracion-presupuestos.ts` — ver el comentario de cabecera. */
function anioMadrid(fechaIso) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric' }).formatToParts(new Date(fechaIso));
  return Number(partes.find((p) => p.type === 'year')?.value);
}

function formatearNumeroPresupuesto(numero, anio) {
  return `PRV-${String(numero).padStart(4, '0')}/${String(anio % 100).padStart(2, '0')}`;
}

function parsearNumeroPresupuesto(numeroPresupuesto) {
  const m = /^PRV-(\d{4})\/(\d{2})$/.exec(numeroPresupuesto ?? '');
  if (!m) return null;
  return { numero: Number(m[1]), anio: 2000 + Number(m[2]) };
}

async function main() {
  await mongoose.connect(url, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection;
  console.log(`Conectado a la base de datos "${db.name}" en ${url.split('@')[1]?.split('/')[0] ?? '(local)'}.`);

  const presupuestosCol = db.collection('presupuestos');
  const contadorCol = db.collection('contadorpresupuestos'); // nombre de colección real de ContadorPresupuestoModel (plural en minúsculas, convención de Mongoose)

  const todos = await presupuestosCol.find({}, { projection: { id: 1, usuarioId: 1, creado: 1, numeroPresupuesto: 1 } }).toArray();
  console.log(`${todos.length} presupuesto(s) encontrado(s) en total.`);

  const contadores = { migrados: 0, yaNumerados: 0, sinFechaValida: 0, empatesResueltosPorId: 0 };
  const usuariosAfectados = new Set();
  const aniosAfectados = new Set();
  const casosAmbiguos = [];
  const sinFechaValida = [];

  // Agrupar por usuarioId, luego por año Madrid de `creado`.
  const porUsuario = new Map(); // usuarioId -> Map(anio -> { yaNumerados: [...], sinNumerar: [...] })
  for (const doc of todos) {
    const usuarioId = doc.usuarioId ?? 'admin';
    if (!doc.creado || Number.isNaN(new Date(doc.creado).getTime())) {
      sinFechaValida.push({ id: doc.id, usuarioId });
      contadores.sinFechaValida++;
      continue; // nunca se inventa una fecha — se deja fuera de esta migración, se informa al final.
    }
    const anio = anioMadrid(doc.creado);
    if (!porUsuario.has(usuarioId)) porUsuario.set(usuarioId, new Map());
    const porAnio = porUsuario.get(usuarioId);
    if (!porAnio.has(anio)) porAnio.set(anio, { yaNumerados: [], sinNumerar: [] });
    const grupo = porAnio.get(anio);
    if (doc.numeroPresupuesto) {
      const parseado = parsearNumeroPresupuesto(doc.numeroPresupuesto);
      if (parseado && parseado.anio !== anio) {
        // Nunca debería pasar con datos generados por la app — se deja tal
        // cual (no se sobrescribe un número ya asignado, pedido explícito),
        // pero se informa como caso ambiguo para revisión manual.
        casosAmbiguos.push({ id: doc.id, usuarioId, motivo: `numeroPresupuesto "${doc.numeroPresupuesto}" no coincide con el año de creado (${anio})` });
      }
      grupo.yaNumerados.push(doc);
      contadores.yaNumerados++;
    } else {
      grupo.sinNumerar.push(doc);
    }
  }

  for (const [usuarioId, porAnio] of porUsuario) {
    for (const [anio, { yaNumerados, sinNumerar }] of porAnio) {
      if (sinNumerar.length === 0 && yaNumerados.length === 0) continue;

      const numerosUsados = new Set();
      for (const doc of yaNumerados) {
        const parseado = parsearNumeroPresupuesto(doc.numeroPresupuesto);
        if (parseado) numerosUsados.add(parseado.numero);
      }

      // Orden estable: `creado` ascendente, empate por `id` ascendente.
      sinNumerar.sort((a, b) => {
        const porFecha = a.creado.localeCompare(b.creado);
        if (porFecha !== 0) return porFecha;
        contadores.empatesResueltosPorId++;
        return String(a.id).localeCompare(String(b.id));
      });

      let candidato = 1;
      for (const doc of sinNumerar) {
        while (numerosUsados.has(candidato)) candidato++;
        const numeroPresupuesto = formatearNumeroPresupuesto(candidato, anio);
        await presupuestosCol.updateOne({ _id: doc._id }, { $set: { numeroPresupuesto } });
        numerosUsados.add(candidato);
        contadores.migrados++;
        usuariosAfectados.add(usuarioId);
        aniosAfectados.add(anio);
        candidato++;
      }

      if (numerosUsados.size > 0) {
        const ultimoNumero = Math.max(...numerosUsados);
        await contadorCol.updateOne(
          { usuarioId, anio },
          { $max: { ultimoNumero }, $setOnInsert: { huecos: [] } },
          { upsert: true }
        );
      }
    }
  }

  console.log('\nResumen de la migración:');
  console.log(`  Presupuestos migrados (numerados ahora):     ${contadores.migrados}`);
  console.log(`  Presupuestos que ya tenían número (omitidos): ${contadores.yaNumerados}`);
  console.log(`  Usuarios afectados:                           ${usuariosAfectados.size}`);
  console.log(`  Años afectados:                                ${[...aniosAfectados].sort().join(', ') || '(ninguno)'}`);
  console.log(`  Empates de fecha resueltos por id:             ${contadores.empatesResueltosPorId}`);
  console.log(`  Presupuestos sin fecha de creación válida:     ${contadores.sinFechaValida}`);
  if (sinFechaValida.length > 0) {
    console.log('    (no numerados — requieren revisión manual):');
    for (const c of sinFechaValida) console.log(`      - id=${c.id} usuarioId=${c.usuarioId}`);
  }
  if (casosAmbiguos.length > 0) {
    console.log(`  Casos ambiguos detectados (${casosAmbiguos.length}):`);
    for (const c of casosAmbiguos) console.log(`    - id=${c.id} usuarioId=${c.usuarioId}: ${c.motivo}`);
  }
  console.log('\nSolo se ha escrito el campo "numeroPresupuesto" — ningún otro campo se ha tocado.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Migración fallida:', err);
  process.exit(1);
});
