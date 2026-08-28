import type { TrabajoAnalizado } from './inteligencia-precios.js';

/**
 * Métricas por Tipo de Trabajo (Fase 2D, 28/08/2026) — funciones puras,
 * deterministas, sin IA, sin Mongo: consumen directamente el
 * `TrabajoAnalizado[]` que ya trae `api.analizarInteligenciaPrecios()`
 * para el Histórico (2B), así que no hace falta ningún endpoint nuevo ni
 * ninguna consulta adicional (autorización, sección 13 — "no crear
 * nuevas consultas innecesarias, utilizar los datos que ya obtiene el
 * histórico"). El aislamiento por `usuarioId` ya está garantizado aguas
 * arriba por ese mismo endpoint — este módulo nunca toca la red.
 *
 * Flujo conceptual (autorización, sección 1):
 *   analizarTrabajos(usuarioId) [backend, ya existe]
 *   → agruparPorTipo() [aquí]
 *   → calcularMetricasGrupo() [aquí]
 *   → métricas + confianza
 *
 * No duplica `analizarTrabajos()` ni `calcularComparables()` (2C) — es
 * una pregunta distinta ("¿cómo me va con este tipo en conjunto?" en vez
 * de "¿qué se parece a este trabajo nuevo?"), sobre los mismos datos.
 */

/** Un trabajo cuenta para las métricas solo si tiene tipoTrabajo Y un margen/precio calculable — sin eso no hay nada que agregar. */
type TrabajoConMetrica = TrabajoAnalizado & { tipoTrabajo: string; principal: Extract<TrabajoAnalizado['principal'], { disponible: true }> };

export type NivelConfianzaGrupo = 'alta' | 'media' | 'baja';

export type MetricasGrupo = {
  tipoTrabajo: string;
  numTrabajos: number;
  margenMedio: number;
  margenMediana: number;
  precioMinimo: number;
  precioMaximo: number;
  numConMargenReal: number;
  numSoloConMargenPrevisto: number;
  /** `false` con menos de `UMBRAL_MINIMO_TRABAJOS` — el grupo se muestra igual (nunca se oculta), pero marcado como insuficiente. */
  historicoSuficiente: boolean;
  nivelConfianza: NivelConfianzaGrupo;
  /** Justificación en texto llano, generada por código — nunca por IA (autorización, sección 5). */
  senales: string[];
};

/** Trabajos necesarios como mínimo para considerar el grupo representativo (autorización, sección 4 — mismo umbral que "confianza alta" ya usa Comparables en 2C). */
export const UMBRAL_MINIMO_TRABAJOS = 3;

/**
 * Agrupa por COINCIDENCIA EXACTA de `tipoTrabajo` — nunca fuzzy matching,
 * sinónimos, mayúsculas/minúsculas como inferencia, ni plural/singular
 * (autorización, sección 6, deliberado). Un trabajo sin `tipoTrabajo`
 * (`null`) o sin margen/precio calculable no entra en ningún grupo — no
 * existe ningún grupo "sin tipo".
 */
export function agruparPorTipo(trabajos: TrabajoAnalizado[]): Map<string, TrabajoConMetrica[]> {
  const grupos = new Map<string, TrabajoConMetrica[]>();
  for (const t of trabajos) {
    if (!t.tipoTrabajo) continue;
    if (!t.principal.disponible) continue;
    const lista = grupos.get(t.tipoTrabajo) ?? [];
    lista.push(t as TrabajoConMetrica);
    grupos.set(t.tipoTrabajo, lista);
  }
  return grupos;
}

function media(valores: number[]): number {
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}

function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 !== 0 ? ordenados[mitad] : (ordenados[mitad - 1] + ordenados[mitad]) / 2;
}

/**
 * Dispersión de precios "baja" cuando el coeficiente de variación
 * (desviación típica / media) no supera el 50% — umbral razonable de
 * producto, no una ley física (mismo criterio de transparencia que
 * `UMBRAL_CERCA_OBJETIVO_PUNTOS` en el motor de márgenes). Con 0-1
 * precio no hay dispersión que medir — se trata como "no penaliza",
 * nunca como "muy disperso" por falta de datos.
 */
function dispersionBaja(precios: number[]): boolean {
  if (precios.length < 2) return true;
  const m = media(precios);
  if (m === 0) return true;
  const varianza = media(precios.map((p) => (p - m) ** 2));
  const coefVariacion = Math.sqrt(varianza) / m;
  return coefVariacion <= 0.5;
}

/**
 * Calcula las métricas de un grupo ya formado — señales de confianza
 * exactamente las ya acordadas en la auditoría de 2C (sección S): nº de
 * trabajos, proporción de margen real, dispersión de precios. Nunca
 * inventa una señal nueva, nunca usa IA/embeddings/ML.
 */
export function calcularMetricasGrupo(tipoTrabajo: string, trabajos: TrabajoConMetrica[]): MetricasGrupo {
  const margenes = trabajos.map((t) => t.principal.margenPorcentaje);
  const precios = trabajos.map((t) => t.principal.precio);
  const numConMargenReal = trabajos.filter((t) => t.origenPrincipal === 'real').length;
  const numSoloConMargenPrevisto = trabajos.length - numConMargenReal;
  const historicoSuficiente = trabajos.length >= UMBRAL_MINIMO_TRABAJOS;

  const senales: string[] = [];
  if (historicoSuficiente) senales.push(`${trabajos.length} trabajos`);
  if (numConMargenReal > numSoloConMargenPrevisto) senales.push(`${numConMargenReal} con margen real`);
  const pocaDispersion = dispersionBaja(precios);
  if (pocaDispersion) senales.push('precios poco dispersos');

  let nivelConfianza: NivelConfianzaGrupo;
  if (!historicoSuficiente) nivelConfianza = 'baja';
  else if (senales.length >= 3) nivelConfianza = 'alta';
  else if (senales.length >= 1) nivelConfianza = 'media';
  else nivelConfianza = 'baja';

  return {
    tipoTrabajo,
    numTrabajos: trabajos.length,
    margenMedio: media(margenes),
    margenMediana: mediana(margenes),
    precioMinimo: Math.min(...precios),
    precioMaximo: Math.max(...precios),
    numConMargenReal,
    numSoloConMargenPrevisto,
    historicoSuficiente,
    nivelConfianza,
    senales,
  };
}

/**
 * Punto de entrada único — agrupa, calcula cada grupo y ordena (grupos
 * con histórico suficiente primero, autorización sección 10; dentro de
 * cada bloque, los más numerosos primero — sin ninguna clasificación de
 * "mejor tipo de trabajo", solo tamaño de muestra).
 */
export function calcularMetricasPorTipo(trabajos: TrabajoAnalizado[]): MetricasGrupo[] {
  const grupos = agruparPorTipo(trabajos);
  const metricas = [...grupos.entries()].map(([tipo, lista]) => calcularMetricasGrupo(tipo, lista));
  metricas.sort((a, b) => {
    if (a.historicoSuficiente !== b.historicoSuficiente) return a.historicoSuficiente ? -1 : 1;
    return b.numTrabajos - a.numTrabajos;
  });
  return metricas;
}
