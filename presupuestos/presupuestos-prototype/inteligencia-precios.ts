import type { Proyecto } from './types.js';

/**
 * Motor determinista de Inteligencia de Precios (Fase 1) — SIN IA: solo
 * aritmética de negocio sobre datos que la aplicación ya tiene. Ver la
 * especificación aprobada ("IA propone → código calcula → usuario
 * confirma") — este módulo es la parte "código calcula" para el cálculo
 * EN VIVO mientras se revisa un presupuesto (antes de aceptarlo, cuando
 * todavía no existe un snapshot congelado en `Presupuesto.analisisPrecio`).
 *
 * Reutiliza la MISMA fórmula de coste que `calcularResumen` (`calculos.ts`):
 * coste = gastos registrados + (horas registradas × tarifa/hora) del
 * proyecto vinculado. Es un módulo GEMELO del backend
 * (`presupuestos-service/inteligencia-precios.ts`, mismo nombre de
 * archivo a propósito) que congela el snapshot al aceptar — una pequeña
 * duplicación deliberada (viven en paquetes distintos del workspace, sin
 * frontera de import entre ellos), cubierta por tests idénticos en ambos
 * lados para detectar cualquier divergencia entre "lo que se ve en vivo" y
 * "lo que se acaba guardando al aceptar".
 */

export type EstadoAnalisisPrecio = 'por_encima' | 'cerca' | 'por_debajo';

/** Motivo por el que no se puede completar el análisis — específico, para poder guiar al usuario en vez de un "Datos insuficientes" genérico. */
export type MotivoSinAnalisis = 'sin_precio' | 'sin_proyecto' | 'sin_costes' | 'sin_objetivo' | 'sin_ingresos';

/**
 * Origen de un análisis (ampliación "margen real", 28/08/2026):
 * - `'previsto'` — precio COTIZADO en un presupuesto aceptado vs. coste.
 * - `'real'` — ingreso REAL cobrado en un proyecto finalizado vs. coste.
 * Nunca se mezclan bajo el mismo número — ver `TrabajoAnalizado`.
 */
export type OrigenAnalisis = 'real' | 'previsto';

/**
 * Un "trabajo" tal como lo devuelve `GET /inteligencia-precios/analisis`
 * (`svc.analizarTrabajos`, backend) — un único registro por proyecto (o
 * por presupuesto suelto sin proyecto), nunca dos filas para el mismo
 * trabajo aunque tenga presupuesto Y esté finalizado.
 */
export type TrabajoAnalizado = {
  id: string;
  titulo: string;
  clienteId: string;
  actualizado: string;
  /** Tipo de trabajo (Histórico Inteligente, Fase 2A/2B) — de `Proyecto.caracteristicas[]`, clave `tipoTrabajo`. `null` si el proyecto no lo tiene guardado (opcional, nunca inferido). */
  tipoTrabajo: string | null;
  /** Presente solo si el proyecto está `finalizado` con ingresos reales suficientes. */
  real: AnalisisPrecio | null;
  /** Presente solo si hay un presupuesto aceptado con datos suficientes (snapshot congelado al aceptar). */
  previsto: AnalisisPrecio | null;
  /** El que se muestra como resultado principal — el real si existe, si no el previsto, si no un `disponible:false`. */
  principal: AnalisisPrecio;
  origenPrincipal: OrigenAnalisis | null;
};

// ── Comparables Inteligentes (Fase 2C) ────────────────────────────────────────
// Mismos tipos que produce `svc.obtenerComparables` (backend) — ver
// `comparables.ts` para el motor determinista real. Aquí solo se declara la
// FORMA de la respuesta, el cálculo vive exclusivamente en el backend.

export type NivelComparable = 'muy_comparable' | 'comparable' | 'poco_comparable';

/** Motivo por el que un trabajo se considera comparable — siempre generado por una regla determinista, nunca por IA. */
export type MotivoComparable =
  | { tipo: 'mismo_tipo_trabajo' }
  | { tipo: 'precio_similar'; diferenciaPorcentaje: number }
  | { tipo: 'reciente'; mesesAntiguedad: number };

export type Comparable = {
  trabajo: TrabajoAnalizado;
  /** 0-100, solo para ordenar — nunca se muestra al usuario tal cual. */
  puntuacion: number;
  nivel: NivelComparable;
  motivos: MotivoComparable[];
  /** true si el trabajo nuevo o este candidato no tienen `tipoTrabajo` guardado — "comparable secundario". */
  esSecundario: boolean;
};

export type ResultadoComparables =
  | { disponible: true; comparables: Comparable[]; totalEvaluados: number }
  | { disponible: false; motivo: 'sin_historico' | 'sin_precio_referencia' };

const ETIQUETA_NIVEL: Record<NivelComparable, { icono: string; texto: string }> = {
  muy_comparable: { icono: '🟢', texto: 'Muy comparable' },
  comparable: { icono: '🟡', texto: 'Comparable' },
  poco_comparable: { icono: '⚪', texto: 'Poco comparable' },
};

export function etiquetaNivelComparable(nivel: NivelComparable): { icono: string; texto: string } {
  return ETIQUETA_NIVEL[nivel];
}

/** Texto corto y en lenguaje llano para un motivo — generado por código, nunca por IA (ver principio 3 de la autorización de 2C). */
export function textoMotivoComparable(motivo: MotivoComparable): string {
  switch (motivo.tipo) {
    case 'mismo_tipo_trabajo': return '🍳 Mismo tipo de trabajo';
    case 'precio_similar': return `💰 Precio similar (±${motivo.diferenciaPorcentaje.toFixed(0)}%)`;
    case 'reciente': return motivo.mesesAntiguedad < 1 ? '📅 Trabajo muy reciente' : `📅 Trabajo reciente (hace ${Math.round(motivo.mesesAntiguedad)} mes${Math.round(motivo.mesesAntiguedad) === 1 ? '' : 'es'})`;
  }
}

/**
 * Desviación en puntos porcentuales (margen real − margen previsto) de un
 * trabajo — Histórico Inteligente, Fase 2B. Solo tiene sentido cuando
 * AMBOS existen; `null` en cualquier otro caso, nunca una aproximación con
 * un solo dato. Resta trivial sobre cifras ya calculadas por cada motor
 * (`analizarPrecioPresupuesto`/`calcularMargenRealProyecto`) — no es una
 * fórmula de margen nueva.
 */
export function desviacionPuntos(trabajo: TrabajoAnalizado): number | null {
  if (!trabajo.real?.disponible || !trabajo.previsto?.disponible) return null;
  return trabajo.real.margenPorcentaje - trabajo.previsto.margenPorcentaje;
}

export type AnalisisPrecio =
  | {
      disponible: true;
      precio: number;
      costeEstimado: number;
      margenPorcentaje: number;
      margenObjetivoPorcentaje: number;
      diferenciaPuntos: number;
      estado: EstadoAnalisisPrecio;
    }
  | { disponible: false; motivo: MotivoSinAnalisis };

/**
 * Umbral (en puntos porcentuales) por debajo del objetivo que todavía se
 * considera "cerca" en vez de "por debajo" — misma constante y mismo
 * razonamiento que el motor del backend: decisión de producto documentada
 * para poder revisarla con datos reales de uso, no una ley física.
 */
export const UMBRAL_CERCA_OBJETIVO_PUNTOS = 5;

/** Decide el estado a partir de la diferencia (margen real − margen objetivo), ya calculada. */
export function calcularEstadoMargen(diferenciaPuntos: number): EstadoAnalisisPrecio {
  if (diferenciaPuntos >= 0) return 'por_encima';
  if (diferenciaPuntos >= -UMBRAL_CERCA_OBJETIVO_PUNTOS) return 'cerca';
  return 'por_debajo';
}

/**
 * Analiza el precio de un presupuesto frente al coste real ya registrado
 * en su proyecto vinculado y el margen objetivo del negocio. Nunca lanza
 * una excepción — cualquier dato insuficiente o inválido devuelve
 * `{disponible:false, motivo}` en vez de reventar la pantalla.
 *
 * @param precioTotal Precio de venta del presupuesto (`PresupuestoMC.precioTotal`).
 * @param proyecto Proyecto vinculado ya cargado, o `null`/`undefined` si no hay ninguno.
 * @param margenObjetivoPorcentaje Margen objetivo configurado en Ajustes de empresa, o `null` si no se ha configurado.
 */
export function analizarPrecioPresupuesto(
  precioTotal: number,
  proyecto: Proyecto | null | undefined,
  margenObjetivoPorcentaje: number | null | undefined
): AnalisisPrecio {
  if (typeof precioTotal !== 'number' || !Number.isFinite(precioTotal) || precioTotal <= 0) {
    return { disponible: false, motivo: 'sin_precio' };
  }
  if (!proyecto) {
    return { disponible: false, motivo: 'sin_proyecto' };
  }

  const movimientos = Array.isArray(proyecto.movimientos) ? proyecto.movimientos : [];
  const horas = Array.isArray(proyecto.horas) ? proyecto.horas : [];
  const tieneCostes = movimientos.length > 0 || horas.length > 0;
  if (!tieneCostes) {
    return { disponible: false, motivo: 'sin_costes' };
  }

  const totalGastos = movimientos.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + (m.importe || 0), 0);
  const costeManoObra = horas.reduce((s, h) => s + (h.horas || 0), 0) * (proyecto.tarifaHora || 0);
  const costeEstimado = totalGastos + costeManoObra;
  const margenPorcentaje = ((precioTotal - costeEstimado) / precioTotal) * 100;

  if (margenObjetivoPorcentaje === null || margenObjetivoPorcentaje === undefined) {
    return { disponible: false, motivo: 'sin_objetivo' };
  }

  const diferenciaPuntos = margenPorcentaje - margenObjetivoPorcentaje;
  return {
    disponible: true,
    precio: precioTotal,
    costeEstimado,
    margenPorcentaje,
    margenObjetivoPorcentaje,
    diferenciaPuntos,
    estado: calcularEstadoMargen(diferenciaPuntos),
  };
}

/** Texto de interpretación en lenguaje natural — GENERADO POR CÓDIGO (sin IA, ver principio 12), a partir únicamente de los valores ya calculados. */
const TEXTO_MOTIVO: Record<MotivoSinAnalisis, string> = {
  sin_precio: 'Este presupuesto todavía no tiene un precio total.',
  sin_proyecto: 'Este presupuesto no está vinculado a ningún proyecto — sin proyecto no hay gastos ni horas con los que estimar el coste.',
  sin_costes: 'El proyecto vinculado todavía no tiene gastos ni horas registradas — sin eso no se puede estimar el coste.',
  sin_objetivo: 'Configura tu margen objetivo en Ajustes de empresa para ver aquí la comparación.',
  sin_ingresos: 'Este proyecto está finalizado, pero todavía no tiene ningún ingreso registrado — sin eso no se puede calcular el margen real.',
};

/**
 * @param analisis Resultado ya calculado.
 * @param origen `'previsto'` (por defecto, compatibilidad con el bloque embebido en presupuestos) o `'real'` — cambia únicamente las palabras "margen previsto"/"margen real" del texto, nunca el cálculo.
 */
export function interpretarAnalisis(analisis: AnalisisPrecio, origen: OrigenAnalisis = 'previsto'): string {
  if (analisis.disponible === false) {
    const motivo: MotivoSinAnalisis = analisis.motivo;
    return TEXTO_MOTIVO[motivo];
  }
  const etiqueta = origen === 'real' ? 'El margen real' : 'El margen previsto';
  const puntos = Math.abs(analisis.diferenciaPuntos).toFixed(1);
  if (analisis.estado === 'por_encima') {
    return analisis.diferenciaPuntos === 0
      ? `${etiqueta} coincide exactamente con el objetivo configurado.`
      : `${etiqueta} está ${puntos} puntos por encima del objetivo configurado.`;
  }
  if (analisis.estado === 'cerca') {
    return `${etiqueta} está ${puntos} puntos por debajo del objetivo, dentro de un margen razonable.`;
  }
  return `${etiqueta} está ${puntos} puntos por debajo del objetivo configurado.`;
}
