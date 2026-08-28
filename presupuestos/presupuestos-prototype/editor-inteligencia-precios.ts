import type { AnalisisPrecio } from './inteligencia-precios.js';
import { analizarPrecioPresupuesto } from './inteligencia-precios.js';
import type { Proyecto } from './types.js';

/**
 * Lógica pura de "🧠 Inteligencia de precios" dentro del editor de
 * documentos (Fase 2C, integración en el editor, 28/08/2026) — separada
 * de `editor-documento.tsx` a propósito, para poder testearse sin
 * renderizar el componente (este paquete no tiene infraestructura de
 * tests de componentes React — ni `@testing-library/react` ni ningún
 * `.spec.tsx` existe hoy — solo tests de funciones puras, igual que el
 * resto de `*.spec.ts`). Reutiliza `analizarPrecioPresupuesto` tal cual,
 * nunca un cálculo nuevo ni una segunda fórmula.
 */

/**
 * ¿Hace falta pedir el proyecto a la red antes de poder mostrar el
 * análisis? `false` solo en los dos casos que no necesitan red — snapshot
 * ya congelado (presupuesto aceptado), o presupuesto sin proyecto
 * vinculado (`analizarPrecioPresupuesto` ya sabe explicar "sin_proyecto"
 * con `proyecto: null`, sin ningún caso especial aquí).
 *
 * Deliberadamente SIN caché entre aperturas (pedido real, 28/08/2026:
 * "que siempre lea en vivo todo de un presupuesto") — cada vez que el
 * usuario pulsa el botón se vuelve a pedir el proyecto, para que un gasto
 * o un trabajo extra añadido mientras el presupuesto seguía abierto se
 * refleje sin tener que cerrar y volver a abrir el editor.
 */
export function haceFaltaPedirProyecto(analisisPrecio: AnalisisPrecio | undefined, proyectoId: string | undefined): boolean {
  if (analisisPrecio) return false;
  if (!proyectoId) return false;
  return true;
}

/**
 * El análisis a mostrar en el modal — el snapshot congelado si el
 * presupuesto ya está aceptado ("presupuesto aceptado"), si no el
 * cálculo EN VIVO con lo que haya disponible ("presupuesto en curso"),
 * incluido `proyecto: null` cuando no hay ninguno vinculado todavía.
 */
export function analisisParaEditor(
  analisisPrecio: AnalisisPrecio | undefined,
  precioTotal: number,
  proyecto: Proyecto | null,
  margenObjetivoPorcentaje: number | null
): AnalisisPrecio {
  return analisisPrecio ?? analizarPrecioPresupuesto(precioTotal, proyecto, margenObjetivoPorcentaje);
}

/** Tipo de trabajo a pasar al motor de comparables — del proyecto ya cargado, si lo tiene guardado; `null` si no, nunca inventado. */
export function tipoTrabajoParaEditor(proyecto: Proyecto | null): string | null {
  return proyecto?.caracteristicas?.find((c) => c.clave === 'tipoTrabajo')?.valor ?? null;
}
