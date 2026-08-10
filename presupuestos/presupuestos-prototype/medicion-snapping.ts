import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { PuntoEscena } from './cota-modelo.js';

/**
 * Motor de "enganche a puntos notables" compartido por cualquier herramienta
 * de medición que capture sus propios gestos de arrastre (cotas lineales
 * hoy; cotas angulares, radios/diámetros y medición sobre foto o PDF más
 * adelante) — no depende de nada específico de las cotas, solo de la lista
 * de elementos de la escena.
 */

/** Radio del resalto visual (en píxeles de pantalla, no de escena) cuando el punto actual del arrastre engancha a un candidato. */
const RADIO_RESALTO_PX = 6;

/**
 * Recoge los puntos "notables" de la escena a los que puede engancharse un
 * arrastre de medición: extremos y centros de formas, vértices de líneas y
 * flechas, extremos de trazos a mano alzada (solo sus dos puntas, no cada
 * punto intermedio — un trazo puede tener miles). `puntosExtra` añade
 * puntos que no son elementos de Excalidraw, como los extremos de cotas ya
 * creadas.
 */
export function puntosCandidatosSnap(
  elements: readonly ExcalidrawElement[],
  puntosExtra: readonly PuntoEscena[] = []
): PuntoEscena[] {
  const puntos: PuntoEscena[] = [...puntosExtra];
  for (const e of elements) {
    const el = e as any;
    if (el.isDeleted) continue;
    switch (el.type) {
      case 'rectangle':
      case 'diamond':
      case 'ellipse':
      case 'image':
      case 'frame': {
        const { x, y, width, height } = el;
        puntos.push(
          { x, y },
          { x: x + width, y },
          { x, y: y + height },
          { x: x + width, y: y + height },
          { x: x + width / 2, y: y + height / 2 }
        );
        break;
      }
      case 'line':
      case 'arrow': {
        for (const p of el.points as [number, number][]) {
          puntos.push({ x: el.x + p[0], y: el.y + p[1] });
        }
        break;
      }
      case 'freedraw': {
        const pts = el.points as [number, number][];
        if (pts.length > 0) {
          puntos.push({ x: el.x + pts[0][0], y: el.y + pts[0][1] });
          const ultimo = pts[pts.length - 1];
          puntos.push({ x: el.x + ultimo[0], y: el.y + ultimo[1] });
        }
        break;
      }
      default:
        break;
    }
  }
  return puntos;
}

/**
 * Punto candidato más cercano a `punto`, si hay alguno a distancia (en
 * unidades de escena) menor o igual que `umbral`. Si no hay ninguno dentro
 * del umbral, devuelve el propio `punto` sin modificar.
 */
export function buscarSnap(
  punto: PuntoEscena,
  candidatos: readonly PuntoEscena[],
  umbral: number
): { punto: PuntoEscena; snapeado: boolean } {
  let mejor: PuntoEscena | null = null;
  let mejorDistancia = umbral;
  for (const c of candidatos) {
    const d = Math.hypot(c.x - punto.x, c.y - punto.y);
    if (d <= mejorDistancia) {
      mejorDistancia = d;
      mejor = c;
    }
  }
  return mejor ? { punto: mejor, snapeado: true } : { punto, snapeado: false };
}

/** Umbral de enganche (unidades de escena) para un radio en píxeles de pantalla dado el zoom actual — así el enganche "se siente" igual de generoso a cualquier nivel de zoom. */
export function umbralSnapEscena(umbralPx: number, zoom: number): number {
  return umbralPx / zoom;
}

/**
 * Marca visual (un pequeño círculo) sobre el punto al que se acaba de
 * enganchar el arrastre. Usa un id estable para que, mientras el enganche se
 * mantenga, Excalidraw actualice el mismo elemento en vez de crear uno
 * nuevo cada fotograma.
 */
export function construirResaltoSnap(punto: PuntoEscena, id: string, zoom: number): ExcalidrawElement[] {
  const radio = RADIO_RESALTO_PX / zoom;
  return convertToExcalidrawElements(
    [
      {
        type: 'ellipse',
        id,
        x: punto.x - radio,
        y: punto.y - radio,
        width: radio * 2,
        height: radio * 2,
        strokeColor: '#1971c2',
        backgroundColor: 'transparent',
        strokeWidth: 1.5,
      } as any,
    ],
    { regenerateIds: false }
  ) as ExcalidrawElement[];
}
