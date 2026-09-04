import { conectar } from './cliente.model.js';
import { ContadorPresupuestoModel } from './contador-presupuesto.model.js';

/**
 * Numeración oficial de presupuestos (05/09/2026) — encargo del usuario:
 * "PRV-0001/26", correlativo por `usuarioId` y año de creación, con
 * reutilización de huecos al borrar. Motivo de vivir en su propio archivo:
 * son funciones puras/atómicas que se prueban directamente contra
 * `MongoMemoryServer`, sin levantar Express — mismo criterio que
 * `planes.ts`.
 *
 * NO es un contador creciente simple (`$inc` sin más) — decisión explícita
 * del usuario tras corregir la especificación inicial: un número liberado
 * por un borrado debe poder reutilizarse, así que la asignación tiene dos
 * caminos:
 * 1. Si hay algún hueco libre (`huecos` no vacío) → reclamar el MÁS BAJO.
 * 2. Si no hay ninguno → incrementar `ultimoNumero` (comportamiento de
 *    contador de toda la vida).
 * Ambos caminos son atómicos por separado (un único `findOneAndUpdate` por
 * intento, nunca "leer máximo + 1" en dos pasos) — ver `reclamarNumeroPresupuesto`.
 */

const PREFIJO = 'PRV';
/** Límite de reintentos ante una carrera real por el mismo hueco — con más de unos pocos usuarios creando presupuestos en el mismo instante exacto es prácticamente imposible agotarlos; existe solo para no bloquear jamás en un bug real en vez de fallar con un error claro. */
const MAX_REINTENTOS = 20;

/**
 * Año de calendario en `Europe/Madrid` de una fecha ISO — NUNCA
 * `fechaIso.slice(0,4)` ni `new Date(fechaIso).getFullYear()` (ambos leen
 * el año en UTC). España está siempre por delante o igual a UTC (CET/CEST,
 * nunca detrás): un presupuesto creado a las 00:30 hora de Madrid el 1 de
 * enero puede seguir siendo "31 de diciembre" en UTC — con `getFullYear()`
 * ese presupuesto numeraría con el año anterior, el error exacto que pidió
 * evitar el encargo. `Intl.DateTimeFormat` con `timeZone:'Europe/Madrid'`
 * da el año de calendario real que vería un usuario en España, sea
 * invierno (CET, UTC+1) o verano (CEST, UTC+2), sin hardcodear el offset.
 */
export function anioMadrid(fechaIso: string): number {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric' }).formatToParts(new Date(fechaIso));
  const anio = partes.find((p) => p.type === 'year')?.value;
  return Number(anio);
}

/** `PRV-0001/26` — cuatro dígitos con ceros a la izquierda, año en dos cifras. Nunca incluye `usuarioId` ni ningún identificador de cuenta (decisión explícita del usuario). */
export function formatearNumeroPresupuesto(numero: number, anio: number): string {
  const numeroTexto = String(numero).padStart(4, '0');
  const anioCorto = String(anio % 100).padStart(2, '0');
  return `${PREFIJO}-${numeroTexto}/${anioCorto}`;
}

/** Inversa de `formatearNumeroPresupuesto` — `null` si el texto no tiene ese formato exacto (defensivo: nunca debería ocurrir con un número que la propia app generó, pero un dato corrupto/manual no debe hacer explotar el borrado). El año se devuelve en 4 cifras asumiendo el siglo actual (20XX) — coherente con `formatearNumeroPresupuesto`, que solo se usa desde 2025 en adelante. */
export function parsearNumeroPresupuesto(numeroPresupuesto: string): { numero: number; anio: number } | null {
  const m = /^PRV-(\d{4})\/(\d{2})$/.exec(numeroPresupuesto);
  if (!m) return null;
  return { numero: Number(m[1]), anio: 2000 + Number(m[2]) };
}

/**
 * Reclama, de forma atómica, el número más bajo disponible para
 * `usuarioId`+`anio`. Reutiliza un hueco si lo hay; si no, incrementa el
 * contador. Ver la cabecera del archivo para el porqué de este diseño en
 * dos caminos en vez de un `$inc` simple.
 *
 * Concurrencia:
 * - Reutilizar un hueco: `findOneAndUpdate({..., huecos: candidato}, {$pull:
 *   {huecos: candidato}})` — el filtro exige que ESE valor concreto siga
 *   presente en el array en el momento exacto de la operación atómica; si
 *   dos peticiones leen el mismo hueco casi a la vez, la segunda pierde la
 *   carrera (su `findOneAndUpdate` no encuentra ya ese valor, porque la
 *   primera ya lo quitó) y reintenta con el estado real actualizado —
 *   nunca las dos se llevan el mismo número.
 * - Incrementar: mismo patrón atómico de contador ya usado en este código
 *   (`codigo-promocional.model.ts`, `borrado-pendiente.service.ts`) —
 *   `$inc` en un único `findOneAndUpdate` es atómico por documento en
 *   MongoDB. La primera vez que se crea el documento del contador
 *   (`upsert`), dos peticiones simultáneas pueden chocar contra el índice
 *   único `{usuarioId, anio}` — se detecta el `E11000` y se reintenta (la
 *   segunda vuelta ya encuentra el documento creado por la primera y usa
 *   el `$inc` normal, sin upsert-race).
 */
export async function reclamarNumeroPresupuesto(usuarioId: string, anio: number): Promise<number> {
  await conectar();
  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    const actual = await ContadorPresupuestoModel.findOne({ usuarioId, anio }).lean().exec() as any;
    const huecos: number[] = actual?.huecos ?? [];

    if (huecos.length > 0) {
      const candidato = Math.min(...huecos);
      const resultado = await ContadorPresupuestoModel.findOneAndUpdate(
        { usuarioId, anio, huecos: candidato },
        { $pull: { huecos: candidato } }
      ).exec();
      if (resultado) return candidato; // ganamos la carrera por este hueco
      continue; // otra petición se adelantó — reintenta con el estado real
    }

    try {
      const actualizado = await ContadorPresupuestoModel.findOneAndUpdate(
        { usuarioId, anio },
        { $inc: { ultimoNumero: 1 }, $setOnInsert: { huecos: [] } },
        { upsert: true, new: true }
      ).exec() as any;
      return actualizado.ultimoNumero;
    } catch (err: any) {
      if (err?.code === 11000) continue; // otra petición creó el documento en el mismo instante — reintenta, ya existe
      throw err;
    }
  }
  throw new Error(`No se pudo asignar un número de presupuesto para ${usuarioId}/${anio} tras ${MAX_REINTENTOS} intentos.`);
}

export type PresupuestoParaNumerarHistorico = { id: string; creado: string; numeroPresupuesto?: string };

/**
 * Núcleo puro del algoritmo de migración histórica (encargo del usuario,
 * 05/09/2026: "los presupuestos que ya existen también deben numerarse").
 * Agrupa por año (`Europe/Madrid`, nunca UTC), ordena cada grupo por
 * `creado` ascendente — empate (mismo `creado` exacto) resuelto por `id`
 * ascendente, estable y determinista — y asigna el número más bajo libre
 * a cada presupuesto sin numerar, sin tocar los que ya lo tienen (permite
 * ejecutar la migración más de una vez sin reasignar nada).
 *
 * Recibe los presupuestos de UN SOLO usuario — el agrupado por `usuarioId`
 * lo hace el llamante (mismo criterio que el resto de este archivo: nunca
 * mezclar el aislamiento por cuenta dentro de la función pura). Función
 * sin I/O, sin Mongo — se prueba sola, y es la referencia con la que debe
 * coincidir la lógica de `migracion-numeracion-presupuestos.mjs` (ese
 * script no puede importar este archivo TS sin un paso de build previo,
 * así que duplica el mismo algoritmo a mano — si uno cambia, el otro debe
 * cambiar igual).
 */
export function calcularNumerosHistoricos(presupuestos: PresupuestoParaNumerarHistorico[]): Map<string, string> {
  const resultado = new Map<string, string>();
  const porAnio = new Map<number, PresupuestoParaNumerarHistorico[]>();
  for (const p of presupuestos) {
    const anio = anioMadrid(p.creado);
    if (!porAnio.has(anio)) porAnio.set(anio, []);
    porAnio.get(anio)!.push(p);
  }

  for (const [anio, grupo] of porAnio) {
    const numerosUsados = new Set<number>();
    for (const p of grupo) {
      if (!p.numeroPresupuesto) continue;
      const parseado = parsearNumeroPresupuesto(p.numeroPresupuesto);
      if (parseado) numerosUsados.add(parseado.numero);
    }

    const sinNumerar = grupo
      .filter((p) => !p.numeroPresupuesto)
      .sort((a, b) => a.creado.localeCompare(b.creado) || a.id.localeCompare(b.id));

    let candidato = 1;
    for (const p of sinNumerar) {
      while (numerosUsados.has(candidato)) candidato++;
      resultado.set(p.id, formatearNumeroPresupuesto(candidato, anio));
      numerosUsados.add(candidato);
      candidato++;
    }
  }

  return resultado;
}

/**
 * Libera un número al borrar el presupuesto que lo tenía — queda
 * disponible para el siguiente `reclamarNumeroPresupuesto` de ese mismo
 * `usuarioId`+`anio`. `$addToSet` (no `$push`): idempotente ante un
 * reintento del borrado (nunca duplica el mismo hueco dos veces).
 */
export async function liberarNumeroPresupuesto(usuarioId: string, anio: number, numero: number): Promise<void> {
  await conectar();
  await ContadorPresupuestoModel.updateOne({ usuarioId, anio }, { $addToSet: { huecos: numero } }).exec();
}
