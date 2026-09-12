import type { OrigenDecisionFiscal, ResolucionEje } from './motor-resolucion-fiscal.js';

/**
 * Fusiona una decisión de deducibilidad (`deducibleIrpf`/`ivaIgicDeducible`)
 * ya guardada con el resultado fresco del motor fiscal (Fase 3C.3) — usada
 * por `guardarFactura()`. Extraída a su propio archivo (en vez de vivir
 * dentro de `presupuestos-service.ts`) para poder probarla de forma
 * aislada, mismo criterio que `motor-resolucion-fiscal.ts`/`identificacion-gasto.ts`.
 *
 * Reglas, en este orden:
 *
 * 1. Si el número que llega en ESTE guardado es distinto del que ya había
 *    guardado, es que el usuario acaba de tocar el selector manual en el
 *    formulario — decisión humana nueva, gana sobre cualquier otra cosa.
 * 2. Si no hay decisión previa, o la que había la puso el propio motor
 *    (`origen === 'automatico'`), se puede recalcular con seguridad: se
 *    aplica el nuevo resultado automático, o se retira (vuelve a
 *    `undefined`) si ya no aplica — nunca se deja un número obsoleto.
 * 3. Si la decisión previa es humana (`origen === 'usuario'`, o sin
 *    `origen` — todo lo guardado antes de esta fase), nunca se toca, pase
 *    lo que pase en el resto de la factura.
 */
export function fusionarDecisionFiscal(
  numeroAnterior: number | undefined,
  origenAnterior: OrigenDecisionFiscal | undefined,
  numeroEntrante: number | undefined,
  resolucion: ResolucionEje
): { numero: number | undefined; origen: OrigenDecisionFiscal | undefined } {
  if (typeof numeroEntrante === 'number' && numeroEntrante !== numeroAnterior) {
    return { numero: numeroEntrante, origen: 'usuario' };
  }
  if (numeroAnterior === undefined || origenAnterior === 'automatico') {
    if (resolucion.estado === 'resuelto_automatico') {
      return { numero: resolucion.porcentaje, origen: 'automatico' };
    }
    if (origenAnterior === 'automatico') {
      return { numero: undefined, origen: undefined };
    }
  }
  return { numero: numeroAnterior, origen: origenAnterior };
}
