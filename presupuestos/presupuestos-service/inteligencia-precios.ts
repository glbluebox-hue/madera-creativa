/**
 * Motor determinista de Inteligencia de Precios (Fase 1) — SIN IA: solo
 * aritmética de negocio sobre datos que la aplicación ya tiene. Ver la
 * especificación aprobada ("IA propone → código calcula → usuario
 * confirma") — este módulo es la parte "código calcula", tanto para el
 * cálculo EN VIVO (mientras se crea/edita un presupuesto, ver el módulo
 * gemelo en `presupuestos-prototype/inteligencia-precios.ts`) como para el
 * snapshot que se congela al aceptar un presupuesto
 * (`ejecutarConsecuenciasAceptacion`, `presupuestos-service.ts`).
 *
 * Reutiliza la MISMA fórmula de coste que `calcularResumen`
 * (`presupuestos-prototype/calculos.ts`): coste = gastos registrados +
 * (horas registradas × tarifa/hora) del proyecto vinculado. No se importa
 * directamente porque vive en otro paquete del workspace sin frontera de
 * import entre ellos — es una duplicación deliberada y pequeña (4 líneas),
 * cubierta por tests en ambos lados para detectar cualquier divergencia.
 */

/** Movimiento económico de un proyecto — mismo tipo que `Proyecto.movimientos`. */
export type MovimientoProyecto = { tipo: 'ingreso' | 'gasto'; importe: number };

/** Registro de horas de un proyecto — mismo tipo que `Proyecto.horas`. */
export type HorasProyecto = { horas: number };

/** Subconjunto de `Proyecto` que necesita este motor — nunca el objeto completo, para que quede claro qué datos usa de verdad. */
export type ProyectoParaAnalisis = {
  movimientos: MovimientoProyecto[];
  horas: HorasProyecto[];
  tarifaHora: number;
};

export type EstadoAnalisisPrecio = 'por_encima' | 'cerca' | 'por_debajo';

/** Motivo por el que no se puede completar el análisis — específico, para poder guiar al usuario en vez de un "Datos insuficientes" genérico. */
export type MotivoSinAnalisis = 'sin_precio' | 'sin_proyecto' | 'sin_costes' | 'sin_objetivo' | 'sin_ingresos';

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
 * considera "cerca" en vez de "por debajo" — 5 puntos es un margen de
 * tolerancia razonable para no alarmar por una desviación pequeña, pero es
 * una decisión de producto, no una ley física: documentado aquí a
 * propósito para poder revisarla con datos reales de uso más adelante
 * (ver la especificación, sección "Estados").
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
 * `{disponible:false, motivo}` en vez de reventar (caso 7 del plan de
 * pruebas: "error en el análisis" nunca debe bloquear nada).
 *
 * @param precioTotal Precio de venta del presupuesto (`Presupuesto.precioTotal`).
 * @param proyecto Proyecto vinculado, o `null`/`undefined` si el presupuesto no está vinculado a ninguno.
 * @param margenObjetivoPorcentaje Margen objetivo configurado en Ajustes de empresa, o `null` si no se ha configurado.
 */
export function analizarPrecioPresupuesto(
  precioTotal: number,
  proyecto: ProyectoParaAnalisis | null | undefined,
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

/**
 * Analiza el MARGEN REAL de un proyecto — a diferencia de
 * `analizarPrecioPresupuesto` (que compara el precio COTIZADO en un
 * presupuesto con el coste), este usa el ingreso REAL cobrado
 * (`Proyecto.movimientos` con `tipo:'ingreso'`) como precio. Es la misma
 * fórmula, línea por línea, que `calcularResumen()`
 * (`presupuestos-prototype/calculos.ts`) usa hoy para `TablaMargen` —
 * duplicación deliberada por la misma razón que el resto de este módulo
 * (paquetes distintos, sin frontera de import), nunca una fórmula nueva.
 *
 * Deliberadamente NO se persiste en ningún snapshot: a diferencia de un
 * presupuesto (precio fijado una vez, inmutable), los movimientos de un
 * proyecto pueden seguir editándose después de marcarlo "finalizado" — el
 * margen real siempre se recalcula en el momento, sobre el estado actual
 * del proyecto, nunca se congela.
 *
 * @param proyecto Proyecto con sus movimientos/horas ya cargados.
 * @param margenObjetivoPorcentaje Margen objetivo configurado en Ajustes de empresa, o `null` si no se ha configurado.
 */
export function calcularMargenRealProyecto(
  proyecto: ProyectoParaAnalisis | null | undefined,
  margenObjetivoPorcentaje: number | null | undefined
): AnalisisPrecio {
  if (!proyecto) {
    return { disponible: false, motivo: 'sin_ingresos' };
  }
  const movimientos = Array.isArray(proyecto.movimientos) ? proyecto.movimientos : [];
  const horas = Array.isArray(proyecto.horas) ? proyecto.horas : [];

  const totalIngresos = movimientos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + (m.importe || 0), 0);
  if (!(totalIngresos > 0)) {
    // Sin ingresos reales registrados no hay nada que dividir — nunca se
    // informa un margen del 0% como si fuera un dato real.
    return { disponible: false, motivo: 'sin_ingresos' };
  }

  const totalGastos = movimientos.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + (m.importe || 0), 0);
  const costeManoObra = horas.reduce((s, h) => s + (h.horas || 0), 0) * (proyecto.tarifaHora || 0);
  const costeEstimado = totalGastos + costeManoObra;
  const margenPorcentaje = ((totalIngresos - costeEstimado) / totalIngresos) * 100;

  if (margenObjetivoPorcentaje === null || margenObjetivoPorcentaje === undefined) {
    return { disponible: false, motivo: 'sin_objetivo' };
  }

  const diferenciaPuntos = margenPorcentaje - margenObjetivoPorcentaje;
  return {
    disponible: true,
    precio: totalIngresos,
    costeEstimado,
    margenPorcentaje,
    margenObjetivoPorcentaje,
    diferenciaPuntos,
    estado: calcularEstadoMargen(diferenciaPuntos),
  };
}
