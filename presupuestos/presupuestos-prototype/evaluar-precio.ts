import type { AnalisisPrecio, EstadoAnalisisPrecio, MotivoSinAnalisis, Comparable } from './inteligencia-precios.js';
import type { MetricasGrupo, NivelConfianzaGrupo } from './metricas-por-tipo.js';

/**
 * Consejero Inteligente de Precios (Fase 2E, 28/08/2026) — función pura,
 * determinista, SIN IA: ensambla lo que 2A-2D ya calculan (margen vs.
 * objetivo de Fase 1, mediana/rango de 2D, comparables de 2C) en un
 * conjunto de comprobaciones independientes y transparentes — nunca un
 * score compuesto con pesos inventados (ver la auditoría aprobada,
 * sección F: "un score único inventado" queda explícitamente rechazado).
 *
 * Principio del encargo: DATOS REALES → CÓDIGO CALCULA → (IA opcional
 * interpreta) → USUARIO DECIDE. Este módulo es entero la parte "código
 * calcula" — no llama a ninguna IA, no envía nada a ningún proveedor.
 */

export type PosicionRango = 'dentro' | 'por_debajo' | 'por_encima';

/** Cada comprobación es independiente y señala su propio dato de origen — nunca se combinan en un número. */
export type ComprobacionPrecio =
  | { tipo: 'margen_vs_objetivo'; estado: EstadoAnalisisPrecio; margenPorcentaje: number; margenObjetivoPorcentaje: number }
  | { tipo: 'precio_vs_rango_historico'; posicion: PosicionRango; precio: number; precioMinimo: number; precioMaximo: number; tipoTrabajo: string }
  | { tipo: 'margen_vs_mediana_historica'; margenPorcentaje: number; margenMediana: number; tipoTrabajo: string }
  | { tipo: 'comparables_fuertes'; numFuertes: number; numTotal: number };

/** `'insuficiente'` es un cuarto estado, distinto de `'baja'` — significa "no hay ningún grupo histórico de este tipo todavía" (ni siquiera 1 trabajo), nunca se confunde con "hay pocos trabajos" (eso ya es `'baja'`, decidido por 2D). */
export type NivelConfianzaConsejo = NivelConfianzaGrupo | 'insuficiente';

export type ResultadoConsejo =
  | {
      disponible: true;
      comprobaciones: ComprobacionPrecio[];
      conclusion: string;
      nivelConfianza: NivelConfianzaConsejo;
      notaConfianza: string;
      /** `null` cuando no aplica (sin proyecto, o proyecto ya finalizado) — nunca un texto genérico si no hace falta. */
      notaCostesProvisionales: string | null;
    }
  | { disponible: false; motivo: MotivoSinAnalisis };

export type OpcionesEvaluarPrecio = {
  /** `Proyecto.estado`, o `null` si no hay proyecto vinculado. */
  proyectoEstado: string | null;
  /** `true` si `analisis` es el snapshot congelado de un presupuesto ya aceptado (en vez del cálculo en vivo de un borrador). */
  esSnapshot: boolean;
};

/**
 * Evalúa el precio de un presupuesto frente a lo que la empresa ya sabe
 * de sí misma — nunca inventa un precio, nunca dice "deberías cobrar X".
 * Cuando `analisis` no está disponible (sin precio/proyecto/costes/objetivo,
 * ya decidido por `analizarPrecioPresupuesto` en Fase 1), no hay nada que
 * evaluar — se devuelve el mismo motivo, sin inventar ningún dato.
 */
export function evaluarPrecio(
  analisis: AnalisisPrecio,
  metricasGrupo: MetricasGrupo | null,
  comparables: Comparable[],
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

  const nivelConfianza: NivelConfianzaConsejo = metricasGrupo ? metricasGrupo.nivelConfianza : 'insuficiente';
  const notaConfianza = construirNotaConfianza(nivelConfianza, metricasGrupo);
  const conclusion = construirConclusion(comprobaciones);

  const proyectoEnCurso = opciones.proyectoEstado !== null && opciones.proyectoEstado !== 'finalizado';
  const notaCostesProvisionales = !proyectoEnCurso ? null : (
    opciones.esSnapshot
      ? 'Este margen se calculó al aceptar el presupuesto — el proyecto sigue en obra y puede haber cambiado desde entonces.'
      : 'Con los costes registrados hasta ahora — este proyecto sigue en curso, la cifra puede cambiar cuando se registren más gastos u horas.'
  );

  return { disponible: true, comprobaciones, conclusion, nivelConfianza, notaConfianza, notaCostesProvisionales };
}

function construirNotaConfianza(nivel: NivelConfianzaConsejo, metricasGrupo: MetricasGrupo | null): string {
  if (nivel === 'insuficiente') {
    return 'Todavía no tengo suficiente información de tus trabajos anteriores para aconsejarte un precio con fiabilidad.';
  }
  if (!metricasGrupo) return ''; // no debería ocurrir (nivel!=='insuficiente' implica metricasGrupo!==null), guarda defensiva
  if (nivel === 'baja') {
    return `Tu histórico de ${metricasGrupo.tipoTrabajo} todavía es limitado (${metricasGrupo.numTrabajos} trabajo${metricasGrupo.numTrabajos === 1 ? '' : 's'}) para darte una orientación fiable.`;
  }
  // 'media' y 'alta' ya traen sus propias señales, generadas por 2D — se reutilizan tal cual, nunca se duplica esa lógica aquí.
  return `Basado en: ${metricasGrupo.senales.join(', ')}.`;
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

  return frases.join(' ');
}

function formatoEuroSimple(valor: number): string {
  return `${valor.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€`;
}
