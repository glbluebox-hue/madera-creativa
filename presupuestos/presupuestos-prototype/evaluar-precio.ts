import type { AnalisisPrecio, EstadoAnalisisPrecio, MotivoSinAnalisis, Comparable } from './inteligencia-precios.js';
import type { MetricasGrupo, NivelConfianzaGrupo } from './metricas-por-tipo.js';
import type { ResultadoMercadoLocal, NivelConfianzaMercado } from './mercado-local.js';

/**
 * Consejero Inteligente de Precios (Fase 2E, 28/08/2026 — ampliado en
 * Fase 2F "Consenso de Precio", 29/08/2026) — función pura, determinista,
 * SIN IA: ensambla lo que 2A-2D ya calculan (margen vs. objetivo de Fase
 * 1, mediana/rango de 2D, comparables de 2C) más el mercado local de 2F
 * en un conjunto de comprobaciones independientes y transparentes —
 * nunca un score compuesto con pesos inventados.
 *
 * Principio del encargo: DATOS REALES → CÓDIGO CALCULA → USUARIO DECIDE.
 * Este módulo es entero la parte "código calcula" — no llama a ninguna
 * IA, no envía nada a ningún proveedor.
 *
 * Fase 2F añade un RANGO de precio recomendado (`precioRecomendado`) —
 * antes (2E) estaba prohibido dar una cifra porque no había ningún
 * cálculo verificable detrás; ahora sí lo hay (coste+margen objetivo,
 * histórico, comparables, mercado), así que un rango construido con
 * reglas explícitas de precedencia (nunca un promedio ponderado) es
 * coherente con el mismo principio, no una excepción a él.
 */

export type PosicionRango = 'dentro' | 'por_debajo' | 'por_encima';

/** Cada comprobación es independiente y señala su propio dato de origen — nunca se combinan en un número. */
export type ComprobacionPrecio =
  | { tipo: 'margen_vs_objetivo'; estado: EstadoAnalisisPrecio; margenPorcentaje: number; margenObjetivoPorcentaje: number }
  | { tipo: 'precio_vs_rango_historico'; posicion: PosicionRango; precio: number; precioMinimo: number; precioMaximo: number; tipoTrabajo: string }
  | { tipo: 'margen_vs_mediana_historica'; margenPorcentaje: number; margenMediana: number; tipoTrabajo: string }
  | { tipo: 'comparables_fuertes'; numFuertes: number; numTotal: number }
  | { tipo: 'mercado_local'; nivelGeografico: 'local' | 'regional' | 'nacional'; zona: string; precioMin: number; precioMax: number };

/** `'insuficiente'` es un cuarto estado, distinto de `'baja'` — significa "no hay ningún grupo histórico de este tipo todavía" (ni siquiera 1 trabajo), nunca se confunde con "hay pocos trabajos" (eso ya es `'baja'`, decidido por 2D). */
export type NivelConfianzaConsejo = NivelConfianzaGrupo | 'insuficiente';

/** De dónde sale cada extremo del rango recomendado — provenance visible, nunca una caja negra (Fase 2F, condición 3). */
export type OrigenAncla = 'suelo_margen' | 'historico' | 'comparables' | 'mercado';

export type AnclaPrecio = { origen: OrigenAncla; min: number; max: number };

export type RangoRecomendado = {
  min: number;
  max: number;
  /** Todas las anclas que participaron en el cálculo, en el orden en que se evaluaron — para poder explicar "de dónde sale" el rango. */
  anclas: AnclaPrecio[];
};

export type ResultadoConsejo =
  | {
      disponible: true;
      comprobaciones: ComprobacionPrecio[];
      conclusion: string;
      /** Discrepancias explícitas entre fuentes (Fase 2F, condición 4) — nunca se ocultan ni se funden en el resto del texto. Vacío cuando las fuentes coinciden. */
      contradicciones: string[];
      nivelConfianza: NivelConfianzaConsejo;
      notaConfianza: string;
      /** `null` cuando no aplica (sin proyecto, o proyecto ya finalizado) — nunca un texto genérico si no hace falta. */
      notaCostesProvisionales: string | null;
      /** `null` cuando no hay ninguna ancla con la que construir un rango (caso degenerado, ver `calcularPrecioRecomendado`). */
      precioRecomendado: RangoRecomendado | null;
    }
  | { disponible: false; motivo: MotivoSinAnalisis };

export type OpcionesEvaluarPrecio = {
  /** `Proyecto.estado`, o `null` si no hay proyecto vinculado. */
  proyectoEstado: string | null;
  /** `true` si `analisis` es el snapshot congelado de un presupuesto ya aceptado (en vez del cálculo en vivo de un borrador). */
  esSnapshot: boolean;
};

/** Diferencia relativa a partir de la cual dos anclas se consideran "en desacuerdo" — umbral de producto, no ley física (mismo criterio de transparencia que `UMBRAL_CERCA_OBJETIVO_PUNTOS`). */
const UMBRAL_CONTRADICCION = 0.15;

/**
 * Evalúa el precio de un presupuesto frente a lo que la empresa ya sabe
 * de sí misma y de su mercado local — nunca inventa un precio de la
 * nada: el rango siempre sale de coste+margen objetivo, histórico,
 * comparables y/o mercado, cada uno con su propia procedencia visible.
 * Cuando `analisis` no está disponible (sin precio/proyecto/costes/objetivo,
 * ya decidido por `analizarPrecioPresupuesto` en Fase 1), no hay nada que
 * evaluar — se devuelve el mismo motivo, sin inventar ningún dato.
 */
export function evaluarPrecio(
  analisis: AnalisisPrecio,
  metricasGrupo: MetricasGrupo | null,
  comparables: Comparable[],
  mercadoLocal: ResultadoMercadoLocal | null,
  opciones: OpcionesEvaluarPrecio
): ResultadoConsejo {
  if (analisis.disponible === false) {
    return { disponible: false, motivo: analisis.motivo };
  }

  const comprobaciones: ComprobacionPrecio[] = [
    { tipo: 'margen_vs_objetivo', estado: analisis.estado, margenPorcentaje: analisis.margenPorcentaje, margenObjetivoPorcentaje: analisis.margenObjetivoPorcentaje },
  ];

  // El rango y la mediana solo se usan como comprobación cuando el grupo
  // tiene histórico suficiente (2D, ≥3 trabajos) — con 1-2 trabajos, un
  // "rango" no es información fiable (auditoría aprobada, Ejemplo C).
  const historicoUtilizable = metricasGrupo !== null && metricasGrupo.historicoSuficiente;
  if (historicoUtilizable && metricasGrupo) {
    const posicion: PosicionRango =
      analisis.precio < metricasGrupo.precioMinimo ? 'por_debajo' :
      analisis.precio > metricasGrupo.precioMaximo ? 'por_encima' : 'dentro';
    comprobaciones.push({ tipo: 'precio_vs_rango_historico', posicion, precio: analisis.precio, precioMinimo: metricasGrupo.precioMinimo, precioMaximo: metricasGrupo.precioMaximo, tipoTrabajo: metricasGrupo.tipoTrabajo });
    comprobaciones.push({ tipo: 'margen_vs_mediana_historica', margenPorcentaje: analisis.margenPorcentaje, margenMediana: metricasGrupo.margenMediana, tipoTrabajo: metricasGrupo.tipoTrabajo });
  }

  if (comparables.length > 0) {
    const numFuertes = comparables.filter((c) => c.nivel === 'muy_comparable').length;
    comprobaciones.push({ tipo: 'comparables_fuertes', numFuertes, numTotal: comparables.length });
  }

  if (mercadoLocal?.disponible) {
    comprobaciones.push({ tipo: 'mercado_local', nivelGeografico: mercadoLocal.nivelUsado, zona: mercadoLocal.zona, precioMin: mercadoLocal.precioMin, precioMax: mercadoLocal.precioMax });
  }

  const nivelConfianza = combinarConfianza(metricasGrupo, mercadoLocal);
  const notaConfianza = construirNotaConfianza(nivelConfianza, metricasGrupo, mercadoLocal);
  const conclusion = construirConclusion(comprobaciones);
  const { rango: precioRecomendado, contradicciones } = calcularPrecioRecomendado(analisis, metricasGrupo, comparables, mercadoLocal);

  const proyectoEnCurso = opciones.proyectoEstado !== null && opciones.proyectoEstado !== 'finalizado';
  const notaCostesProvisionales = !proyectoEnCurso ? null : (
    opciones.esSnapshot
      ? 'Este margen se calculó al aceptar el presupuesto — el proyecto sigue en obra y puede haber cambiado desde entonces.'
      : 'Con los costes registrados hasta ahora — este proyecto sigue en curso, la cifra puede cambiar cuando se registren más gastos u horas.'
  );

  return { disponible: true, comprobaciones, conclusion, contradicciones, nivelConfianza, notaConfianza, notaCostesProvisionales, precioRecomendado };
}

/** Escala de comparación entre niveles de confianza — para poder tomar el mínimo entre dos fuentes sin una cadena de `if` por cada combinación. */
const RANGO_CONFIANZA: Record<NivelConfianzaConsejo, number> = { insuficiente: 0, baja: 1, media: 2, alta: 3 };

/**
 * Confianza global = la más baja de las fuentes que realmente se están
 * usando (Fase 2F, condición 7 y diseño aprobado, sección I) — nunca deja
 * que un histórico sólido tape un mercado débil, ni al revés. Si solo hay
 * una fuente, se usa la suya; si no hay ninguna, "insuficiente".
 */
function combinarConfianza(metricasGrupo: MetricasGrupo | null, mercadoLocal: ResultadoMercadoLocal | null): NivelConfianzaConsejo {
  const confianzaHistorico: NivelConfianzaConsejo | null = metricasGrupo ? metricasGrupo.nivelConfianza : null;
  const confianzaMercado: NivelConfianzaMercado | null = mercadoLocal?.disponible ? mercadoLocal.confianza : null;

  if (confianzaHistorico && confianzaMercado) {
    return RANGO_CONFIANZA[confianzaHistorico] <= RANGO_CONFIANZA[confianzaMercado] ? confianzaHistorico : confianzaMercado;
  }
  if (confianzaHistorico) return confianzaHistorico;
  if (confianzaMercado) return confianzaMercado;
  return 'insuficiente';
}

function construirNotaConfianza(nivel: NivelConfianzaConsejo, metricasGrupo: MetricasGrupo | null, mercadoLocal: ResultadoMercadoLocal | null): string {
  const partes: string[] = [];
  if (metricasGrupo) {
    partes.push(nivel === 'insuficiente' && !metricasGrupo
      ? ''
      : metricasGrupo.historicoSuficiente
        ? `Basado en: ${metricasGrupo.senales.join(', ')}.`
        : `Tu histórico de ${metricasGrupo.tipoTrabajo} todavía es limitado (${metricasGrupo.numTrabajos} trabajo${metricasGrupo.numTrabajos === 1 ? '' : 's'}).`);
  }
  if (mercadoLocal?.disponible) {
    partes.push(`Mercado de ${mercadoLocal.zona}: ${mercadoLocal.numReferencias} referencia${mercadoLocal.numReferencias === 1 ? '' : 's'}.`);
  }
  if (partes.filter(Boolean).length === 0) {
    return 'Todavía no tengo suficiente información de tus trabajos anteriores ni de tu mercado local para aconsejarte un precio con fiabilidad.';
  }
  return partes.filter(Boolean).join(' ');
}

function construirConclusion(comprobaciones: ComprobacionPrecio[]): string {
  const frases: string[] = [];

  const rango = comprobaciones.find((c): c is Extract<ComprobacionPrecio, { tipo: 'precio_vs_rango_historico' }> => c.tipo === 'precio_vs_rango_historico');
  if (rango) {
    if (rango.posicion === 'dentro') {
      frases.push(`El precio está dentro del rango que normalmente has utilizado para trabajos de tipo ${rango.tipoTrabajo} (entre ${formatoEuroSimple(rango.precioMinimo)} y ${formatoEuroSimple(rango.precioMaximo)}).`);
    } else if (rango.posicion === 'por_debajo') {
      frases.push(`El precio está por debajo de lo que sueles cobrar en trabajos de tipo ${rango.tipoTrabajo} (tu mínimo histórico es ${formatoEuroSimple(rango.precioMinimo)}).`);
    } else {
      frases.push(`El precio está por encima de lo que sueles cobrar en trabajos de tipo ${rango.tipoTrabajo} (tu máximo histórico es ${formatoEuroSimple(rango.precioMaximo)}).`);
    }
  }

  const margenObjetivo = comprobaciones.find((c): c is Extract<ComprobacionPrecio, { tipo: 'margen_vs_objetivo' }> => c.tipo === 'margen_vs_objetivo')!;
  if (margenObjetivo.estado === 'por_debajo') {
    frases.push(`El margen previsto (${margenObjetivo.margenPorcentaje.toFixed(1)}%) está por debajo de tu objetivo (${margenObjetivo.margenObjetivoPorcentaje.toFixed(1)}%).`);
  } else if (margenObjetivo.estado === 'cerca') {
    frases.push(`El margen previsto (${margenObjetivo.margenPorcentaje.toFixed(1)}%) está cerca de tu objetivo (${margenObjetivo.margenObjetivoPorcentaje.toFixed(1)}%).`);
  } else {
    frases.push(`El margen previsto (${margenObjetivo.margenPorcentaje.toFixed(1)}%) alcanza tu objetivo (${margenObjetivo.margenObjetivoPorcentaje.toFixed(1)}%).`);
  }

  const mediana = comprobaciones.find((c): c is Extract<ComprobacionPrecio, { tipo: 'margen_vs_mediana_historica' }> => c.tipo === 'margen_vs_mediana_historica');
  if (mediana) {
    if (mediana.margenPorcentaje >= mediana.margenMediana) {
      frases.push(`También supera tu margen habitual en este tipo de trabajo (${mediana.margenMediana.toFixed(1)}%).`);
    } else {
      frases.push(`Queda por debajo de tu margen habitual en este tipo de trabajo (${mediana.margenMediana.toFixed(1)}%).`);
    }
  }

  const comparablesFuertes = comprobaciones.find((c): c is Extract<ComprobacionPrecio, { tipo: 'comparables_fuertes' }> => c.tipo === 'comparables_fuertes');
  if (comparablesFuertes && comparablesFuertes.numFuertes > 0) {
    frases.push(`Cuentas con ${comparablesFuertes.numFuertes} trabajo${comparablesFuertes.numFuertes === 1 ? '' : 's'} especialmente parecido${comparablesFuertes.numFuertes === 1 ? '' : 's'} en tu histórico.`);
  }

  const mercado = comprobaciones.find((c): c is Extract<ComprobacionPrecio, { tipo: 'mercado_local' }> => c.tipo === 'mercado_local');
  if (mercado) {
    const etiquetaNivel = mercado.nivelGeografico === 'local' ? '' : mercado.nivelGeografico === 'regional' ? ' (nivel regional, sin datos locales)' : ' (nivel nacional, sin datos locales ni regionales)';
    frases.push(`El mercado de ${mercado.zona}${etiquetaNivel} se mueve entre ${formatoEuroSimple(mercado.precioMin)} y ${formatoEuroSimple(mercado.precioMax)}.`);
  }

  return frases.join(' ');
}

/**
 * Construye el rango de precio recomendado (Fase 2F, condición 3) a
 * partir de anclas independientes, con precedencia explícita — nunca un
 * promedio ponderado con pesos inventados:
 *
 *   1. Suelo: coste + margen objetivo (siempre que haya datos para calcularlo).
 *   2. Histórico propio: mediana de margen del grupo, traducida al coste actual.
 *   3. Comparables propios muy comparables: su precio real, tal cual.
 *   4. Mercado local: solo AMPLÍA el máximo del rango, nunca sustituye
 *      ni baja el suelo — el suelo de margen objetivo nunca se cruza en
 *      silencio.
 *
 * Cuando dos anclas discrepan más de `UMBRAL_CONTRADICCION`, se genera una
 * frase explícita nombrando la discrepancia (condición 4: "no ocultes la
 * discrepancia") — nunca se resuelve promediando en silencio.
 */
function calcularPrecioRecomendado(
  analisis: Extract<AnalisisPrecio, { disponible: true }>,
  metricasGrupo: MetricasGrupo | null,
  comparables: Comparable[],
  mercadoLocal: ResultadoMercadoLocal | null
): { rango: RangoRecomendado | null; contradicciones: string[] } {
  const anclas: AnclaPrecio[] = [];

  const precioSuelo = calcularPrecioPorMargen(analisis.costeEstimado, analisis.margenObjetivoPorcentaje);
  if (precioSuelo !== null) anclas.push({ origen: 'suelo_margen', min: precioSuelo, max: precioSuelo });

  if (metricasGrupo && metricasGrupo.historicoSuficiente) {
    const precioImplicito = calcularPrecioPorMargen(analisis.costeEstimado, metricasGrupo.margenMediana);
    if (precioImplicito !== null) anclas.push({ origen: 'historico', min: precioImplicito, max: precioImplicito });
  }

  const preciosComparables = comparables
    .filter((c) => c.nivel === 'muy_comparable' && c.trabajo.principal.disponible)
    .map((c) => (c.trabajo.principal as Extract<AnalisisPrecio, { disponible: true }>).precio);
  if (preciosComparables.length > 0) {
    anclas.push({ origen: 'comparables', min: Math.min(...preciosComparables), max: Math.max(...preciosComparables) });
  }

  const propias = anclas.filter((a) => a.origen === 'historico' || a.origen === 'comparables');
  const suelo = anclas.find((a) => a.origen === 'suelo_margen') ?? null;

  if (anclas.length === 0) {
    return { rango: null, contradicciones: [] };
  }

  let min = propias.length > 0 ? Math.min(...propias.map((a) => a.min)) : suelo!.min;
  let max = propias.length > 0 ? Math.max(...propias.map((a) => a.max)) : suelo!.max;

  // El suelo nunca se cruza en silencio: si el histórico/comparables
  // quedaban por debajo de lo que exige el margen objetivo, el mínimo
  // sube hasta el suelo (la contradicción se explica aparte, no se oculta).
  if (suelo) {
    if (min < suelo.min) min = suelo.min;
    if (max < suelo.min) max = suelo.min;
  }

  if (mercadoLocal?.disponible) {
    anclas.push({ origen: 'mercado', min: mercadoLocal.precioMin, max: mercadoLocal.precioMax });
    if (mercadoLocal.precioMax > max) max = mercadoLocal.precioMax;
  }

  const contradicciones = detectarContradicciones(anclas);
  return { rango: { min, max, anclas }, contradicciones };
}

/** `null` cuando el margen objetivo es inválido para esta fórmula (100% o más no tiene un precio finito que lo resuelva) — caso degenerado, se descarta la ancla en vez de devolver Infinity/NaN. */
function calcularPrecioPorMargen(costeEstimado: number, margenPorcentaje: number): number | null {
  if (margenPorcentaje >= 100) return null;
  const precio = costeEstimado / (1 - margenPorcentaje / 100);
  return Number.isFinite(precio) && precio > 0 ? precio : null;
}

function centro(ancla: AnclaPrecio): number {
  return (ancla.min + ancla.max) / 2;
}

function detectarContradicciones(anclas: AnclaPrecio[]): string[] {
  const notas: string[] = [];
  const suelo = anclas.find((a) => a.origen === 'suelo_margen');
  const historico = anclas.find((a) => a.origen === 'historico' || a.origen === 'comparables');
  const mercado = anclas.find((a) => a.origen === 'mercado');

  if (suelo && historico && centro(historico) < suelo.min * (1 - UMBRAL_CONTRADICCION)) {
    notas.push(`Tu histórico (${formatoEuroSimple(centro(historico))}) queda por debajo de lo que necesitas para tu margen objetivo (${formatoEuroSimple(suelo.min)}).`);
  }
  if (suelo && mercado) {
    if (centro(mercado) > suelo.min * (1 + UMBRAL_CONTRADICCION)) {
      notas.push(`El mercado de tu zona (${formatoEuroSimple(centro(mercado))}) sugiere que hay margen para cobrar más de lo mínimo que necesitas para tu objetivo (${formatoEuroSimple(suelo.min)}).`);
    } else if (centro(mercado) < suelo.min * (1 - UMBRAL_CONTRADICCION)) {
      notas.push(`El mercado de tu zona (${formatoEuroSimple(centro(mercado))}) está por debajo de lo que necesitas para tu margen objetivo — podría interesarte revisar tus costes.`);
    }
  }
  if (historico && mercado && Math.abs(centro(mercado) - centro(historico)) > centro(historico) * UMBRAL_CONTRADICCION) {
    notas.push(`Tu histórico (${formatoEuroSimple(centro(historico))}) y el mercado de tu zona (${formatoEuroSimple(centro(mercado))}) no coinciden.`);
  }
  return notas;
}

function formatoEuroSimple(valor: number): string {
  return `${valor.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€`;
}
