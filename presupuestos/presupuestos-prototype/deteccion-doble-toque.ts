/**
 * Detección manual de doble toque/doble clic — Fase B, Prioridad 1
 * (24/08/2026): el `onDoubleClick` nativo del navegador no entra en modo
 * edición de forma fiable porque `react-moveable` gestiona el mismo nodo
 * DOM para arrastrar/redimensionar (`target={targetsMoveable}`) y sus
 * propios listeners de `pointerdown`/`touchstart` interfieren con la
 * síntesis del evento `dblclick`, sobre todo en táctil.
 *
 * Funciones puras, sin DOM ni React — el componente (`editor-documento.tsx`)
 * es quien registra `onPointerDown`/`onPointerUp` sobre el wrapper del
 * elemento y llama a estas funciones con las coordenadas/tiempos reales.
 * Deliberadamente NO sustituye el `onDoubleClick` existente, se añade en
 * paralelo — un doble-clic de ratón que sí funcione nativamente sigue
 * llamando a `setEditandoId` exactamente igual que antes.
 */

/** Un toque/clic ya confirmado como "gesto limpio" (no fue un arrastre). */
export type PuntoToque = { elementoId: string; tiempo: number; x: number; y: number };

/** Milisegundos máximos entre el primer y el segundo toque para contar como doble toque. */
export const INTERVALO_MAXIMO_MS_DEFECTO = 400;

/** Distancia máxima (px) entre el primer y el segundo toque — toques en sitios muy distintos del elemento no cuentan como doble toque. */
export const DISTANCIA_MAXIMA_TOQUE_PX_DEFECTO = 12;

/** Distancia máxima (px) entre el inicio y el fin de UN mismo gesto para seguir considerándolo un toque y no un arrastre. */
export const DISTANCIA_MAXIMA_ARRASTRE_PX_DEFECTO = 8;

function distancia(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * ¿El propio gesto (bajada → subida del puntero) se movió demasiado para
 * seguir considerándose un toque limpio? Se comprueba ANTES de registrar
 * nada como candidato a doble toque — un arrastre (mover el elemento) nunca
 * debe consumirse ni contarse como la mitad de un doble toque.
 */
export function fueArrastre(
  inicio: { x: number; y: number },
  fin: { x: number; y: number },
  umbralPx: number = DISTANCIA_MAXIMA_ARRASTRE_PX_DEFECTO
): boolean {
  return distancia(inicio, fin) > umbralPx;
}

/**
 * ¿`actual` forma un doble toque válido junto con `anterior`? `anterior`
 * es `null` en el primer toque de una posible secuencia (nunca hay doble
 * toque sin un toque previo con el que compararlo).
 */
export function esDobleToque(
  anterior: PuntoToque | null,
  actual: PuntoToque,
  opciones: { intervaloMaximoMs?: number; distanciaMaximaPx?: number } = {}
): boolean {
  if (!anterior) return false;
  if (anterior.elementoId !== actual.elementoId) return false;
  const intervaloMaximoMs = opciones.intervaloMaximoMs ?? INTERVALO_MAXIMO_MS_DEFECTO;
  const distanciaMaximaPx = opciones.distanciaMaximaPx ?? DISTANCIA_MAXIMA_TOQUE_PX_DEFECTO;
  const dt = actual.tiempo - anterior.tiempo;
  if (dt < 0 || dt > intervaloMaximoMs) return false;
  return distancia(anterior, actual) <= distanciaMaximaPx;
}
