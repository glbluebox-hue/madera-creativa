import type { AnalisisPrecio } from './inteligencia-precios.js';

/**
 * Motor determinista de Comparables Inteligentes (Fase 2C) — SIN IA, sin
 * acceso a Mongo: función pura sobre el histórico ya aislado que devuelve
 * `svc.analizarTrabajos(usuarioId)` (Fase 2B). Ver la auditoría aprobada
 * ("https://claude.ai/code/artifact/0d72fe0f-4fea-458b-8c42-2bfe5061e6b2") —
 * este módulo es exactamente la arquitectura ahí propuesta:
 *
 *   analizarTrabajos(usuarioId)  →  calcularComparables()  →  top N con desglose
 *
 * Nunca copia el histórico a una colección nueva, nunca decide por su
 * cuenta qué usuario mirar (recibe los trabajos ya filtrados), nunca
 * mezcla margen con similitud (el margen se muestra, no puntúa).
 */

/** Mismo tipo/forma que `TrabajoAnalizado` del frontend — la unidad que ya produce `svc.analizarTrabajos`. */
export type TrabajoParaComparar = {
  id: string;
  titulo: string;
  clienteId: string;
  actualizado: string;
  tipoTrabajo: string | null;
  real: AnalisisPrecio | null;
  previsto: AnalisisPrecio | null;
  principal: AnalisisPrecio;
  origenPrincipal: 'real' | 'previsto' | null;
};

export type NivelComparable = 'muy_comparable' | 'comparable' | 'poco_comparable';

/**
 * Motivo por el que un trabajo se considera comparable — SIEMPRE generado
 * por una regla determinista, nunca por una IA (principio 3 de la
 * autorización). Unión discriminada a propósito: añadir un motivo nuevo en
 * el futuro (p. ej. `{tipo:'mismos_modulos'}`) es un caso nuevo de esta
 * unión, nunca reescribir los existentes.
 */
export type MotivoComparable =
  | { tipo: 'mismo_tipo_trabajo' }
  | { tipo: 'precio_similar'; diferenciaPorcentaje: number }
  | { tipo: 'reciente'; mesesAntiguedad: number };

export type Comparable = {
  trabajo: TrabajoParaComparar;
  /** 0-100, SOLO para ordenar internamente — nunca se muestra al usuario (principio 2 de la autorización). */
  puntuacion: number;
  nivel: NivelComparable;
  motivos: MotivoComparable[];
  /** true si el componente de tipo de trabajo se omitió (falta en el trabajo nuevo o en este candidato) — "comparable secundario", principio 6. */
  esSecundario: boolean;
};

export type ResultadoComparables =
  | { disponible: true; comparables: Comparable[]; totalEvaluados: number }
  | { disponible: false; motivo: 'sin_historico' | 'sin_precio_referencia' };

/** Trabajo que se está presupuestando ahora mismo — la referencia contra la que se comparan todos los candidatos. */
export type TrabajoNuevo = {
  precio: number;
  tipoTrabajo: string | null;
  /** Id de trabajo a excluir del propio histórico (p. ej. al reanalizar un trabajo ya finalizado, para que no se compare consigo mismo). */
  excluirId?: string;
};

export type OpcionesComparables = {
  /** Cuántos comparables devolver como máximo (por defecto 5 — "top 5", ampliable a 10 con "Ver más"). */
  top?: number;
  /** Fecha de referencia para calcular recencia — inyectable para tests deterministas; por defecto `new Date()`. */
  ahora?: Date;
};

const TOP_POR_DEFECTO = 5;

// ── Pesos y umbrales (Fase 2C, primera versión — ver sección D de la auditoría) ──
const PESO_TIPO = 50;
const PESO_PRECIO = 35;
const PESO_FECHA = 15;

/** Diferencia de precio (%) por debajo de la cual se puntúa al máximo. */
const PRECIO_DIFERENCIA_MAXIMA = 20;
/** Diferencia de precio (%) a partir de la cual se puntúa 0. */
const PRECIO_DIFERENCIA_CERO = 100;
/** Meses de antigüedad por debajo de los cuales se puntúa al máximo. */
const FECHA_MESES_MAXIMO = 12;
/** Meses de antigüedad a partir de los cuales se puntúa 0 (5 años). */
const FECHA_MESES_CERO = 60;

/** Umbral de puntuación (0-100) a partir del cual un comparable es "muy comparable". */
const UMBRAL_MUY_COMPARABLE = 70;
/** Umbral de puntuación a partir del cual un comparable es "comparable" (por debajo, "poco comparable"). */
const UMBRAL_COMPARABLE = 40;

/**
 * Interpola linealmente entre `pesoMax` (cuando `valor <= umbralMax`) y `0`
 * (cuando `valor >= umbralCero`) — la misma forma de "función decreciente"
 * para cualquier señal futura basada en distancia (precio, fecha, y
 * cualquier magnitud nueva que se añada más adelante).
 */
function escalaLineal(valor: number, umbralMax: number, umbralCero: number, pesoMax: number): number {
  if (valor <= umbralMax) return pesoMax;
  if (valor >= umbralCero) return 0;
  const fraccion = (umbralCero - valor) / (umbralCero - umbralMax);
  return pesoMax * fraccion;
}

/** Resultado de un componente de puntuación individual — `null` significa "omitido" (dato ausente en alguno de los dos lados), no "0 puntos". */
type ResultadoComponente = { puntos: number; pesoMax: number; motivo?: MotivoComparable } | null;

/**
 * Componente "tipo de trabajo" — señal fuerte pero binaria. Se OMITE (no
 * puntúa 0 ni el máximo) cuando falta en cualquiera de los dos lados, para
 * no inventar una coincidencia ni penalizar injustamente un proyecto
 * antiguo sin la etiqueta (principio 6 de la autorización).
 */
function componenteTipo(nuevo: TrabajoNuevo, candidato: TrabajoParaComparar): ResultadoComponente {
  if (!nuevo.tipoTrabajo || !candidato.tipoTrabajo) return null;
  if (nuevo.tipoTrabajo === candidato.tipoTrabajo) {
    return { puntos: PESO_TIPO, pesoMax: PESO_TIPO, motivo: { tipo: 'mismo_tipo_trabajo' } };
  }
  return { puntos: 0, pesoMax: PESO_TIPO };
}

/** Componente "cercanía de precio" — siempre presente (ya se filtró antes que el candidato tenga un precio disponible). */
function componentePrecio(precioNuevo: number, precioCandidato: number): ResultadoComponente {
  const diferenciaPorcentaje = (Math.abs(precioCandidato - precioNuevo) / precioNuevo) * 100;
  const puntos = escalaLineal(diferenciaPorcentaje, PRECIO_DIFERENCIA_MAXIMA, PRECIO_DIFERENCIA_CERO, PESO_PRECIO);
  const motivo: MotivoComparable | undefined = diferenciaPorcentaje <= PRECIO_DIFERENCIA_MAXIMA
    ? { tipo: 'precio_similar', diferenciaPorcentaje }
    : undefined;
  return { puntos, pesoMax: PESO_PRECIO, motivo };
}

/** Componente "recencia" — siempre presente (`actualizado` es un campo obligatorio de todo trabajo). */
function componenteFecha(mesesAntiguedad: number): ResultadoComponente {
  const meses = Math.max(0, mesesAntiguedad); // nunca negativo, ni con desfases de reloj
  const puntos = escalaLineal(meses, FECHA_MESES_MAXIMO, FECHA_MESES_CERO, PESO_FECHA);
  const motivo: MotivoComparable | undefined = meses <= FECHA_MESES_MAXIMO ? { tipo: 'reciente', mesesAntiguedad: meses } : undefined;
  return { puntos, pesoMax: PESO_FECHA, motivo };
}

function nivelDePuntuacion(puntuacion: number): NivelComparable {
  if (puntuacion >= UMBRAL_MUY_COMPARABLE) return 'muy_comparable';
  if (puntuacion >= UMBRAL_COMPARABLE) return 'comparable';
  return 'poco_comparable';
}

/** El precio a usar para comparar — REAL siempre que exista, si no PREVISTO (principio 8, misma prioridad ya vigente desde la Fase 2B). `null` si el trabajo no tiene ningún precio disponible. */
function precioDelTrabajo(t: TrabajoParaComparar): number | null {
  if (t.real?.disponible) return t.real.precio;
  if (t.previsto?.disponible) return t.previsto.precio;
  return null;
}

/**
 * Calcula los trabajos más comparables a `trabajoNuevo` dentro de
 * `historico` — función pura, determinista, sin IA y sin acceso a Mongo
 * (recibe el histórico ya aislado por `usuarioId`, ver principio 11 de la
 * autorización). Compone la puntuación como SUMA de componentes
 * independientes (`componenteTipo`/`componentePrecio`/`componenteFecha`):
 * añadir una señal futura (módulos, material...) es escribir una función
 * `componenteX` más con la misma forma y añadirla al array `componentes`
 * de aquí abajo — nunca reescribir el resto (principio 14).
 *
 * La redistribución de peso cuando un componente se omite es genérica:
 * la puntuación final es la suma de puntos obtenidos sobre la suma de
 * pesos de los componentes que SÍ participaron, escalada a 100 — funciona
 * igual sin importar cuántos componentes se omitan ni cuántos se añadan
 * en el futuro, sin necesitar un caso especial por cada combinación.
 */
export function calcularComparables(
  trabajoNuevo: TrabajoNuevo,
  historico: TrabajoParaComparar[],
  opciones: OpcionesComparables = {}
): ResultadoComparables {
  const top = opciones.top ?? TOP_POR_DEFECTO;
  const ahora = opciones.ahora ?? new Date();

  if (typeof trabajoNuevo.precio !== 'number' || !Number.isFinite(trabajoNuevo.precio) || trabajoNuevo.precio <= 0) {
    return { disponible: false, motivo: 'sin_precio_referencia' };
  }

  const candidatos = historico.filter((t) => t.id !== trabajoNuevo.excluirId && precioDelTrabajo(t) !== null);
  if (candidatos.length === 0) {
    return { disponible: false, motivo: 'sin_historico' };
  }

  const comparables: Comparable[] = candidatos.map((candidato) => {
    const precioCandidato = precioDelTrabajo(candidato)!; // ya filtrado arriba
    const mesesAntiguedad = (ahora.getTime() - new Date(candidato.actualizado).getTime()) / (1000 * 60 * 60 * 24 * 30.44);

    const resultadoTipo = componenteTipo(trabajoNuevo, candidato);
    const componentes = [
      resultadoTipo,
      componentePrecio(trabajoNuevo.precio, precioCandidato),
      componenteFecha(mesesAntiguedad),
    ].filter((c): c is NonNullable<ResultadoComponente> => c !== null);

    const pesoActivo = componentes.reduce((s, c) => s + c.pesoMax, 0);
    const puntosObtenidos = componentes.reduce((s, c) => s + c.puntos, 0);
    const puntuacion = pesoActivo > 0 ? Math.round((puntosObtenidos / pesoActivo) * 100) : 0;

    return {
      trabajo: candidato,
      puntuacion,
      nivel: nivelDePuntuacion(puntuacion),
      motivos: componentes.map((c) => c.motivo).filter((m): m is MotivoComparable => m !== undefined),
      esSecundario: resultadoTipo === null,
    };
  });

  comparables.sort((a, b) => b.puntuacion - a.puntuacion);

  return { disponible: true, comparables: comparables.slice(0, top), totalEvaluados: candidatos.length };
}
