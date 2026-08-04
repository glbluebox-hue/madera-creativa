import type { Estancia } from './types.js';
export type { Estancia } from './types.js';

/** Una pieza del despiece generada automáticamente. */
export type Pieza = {
  /** Nombre de la pieza. */
  nombre: string;
  /** Cantidad de unidades iguales. */
  cantidad: number;
  /** Largo en mm. */
  largo: number;
  /** Ancho en mm. */
  ancho: number;
  /** Grosor en mm. */
  grosor: number;
  /** Cantos a cantear (descripción). */
  canteado: string;
};

/**
 * Genera un despiece automático básico para un mueble tipo caja
 * (laterales, techo, base, fondo y estantes) a partir de las medidas
 * de una estancia/mueble. Las medidas se toman en cm y se devuelven en mm.
 *
 * @param estancia Estancia con altura, anchura y profundidad en cm.
 * @param numEstantes Número de estantes interiores (por defecto 2).
 * @param grosor Grosor del tablero en mm (por defecto 19).
 * @returns Listado de piezas para corte.
 */
export function generarDespiece(
  estancia: Estancia,
  numEstantes = 2,
  grosor = 19
): Pieza[] {
  const altoMm = (estancia.alto ?? 0) * 10;
  const anchoMm = (estancia.ancho ?? 0) * 10;
  const fondoMm = (estancia.fondo ?? 0) * 10;

  if (!altoMm || !anchoMm || !fondoMm) return [];

  const anchoInterior = anchoMm - grosor * 2;

  const piezas: Pieza[] = [
    { nombre: 'Lateral', cantidad: 2, largo: altoMm, ancho: fondoMm, grosor, canteado: 'Canto frontal' },
    { nombre: 'Techo', cantidad: 1, largo: anchoInterior, ancho: fondoMm, grosor, canteado: 'Canto frontal' },
    { nombre: 'Base', cantidad: 1, largo: anchoInterior, ancho: fondoMm, grosor, canteado: 'Canto frontal' },
    { nombre: 'Fondo', cantidad: 1, largo: altoMm - grosor * 2, ancho: anchoInterior, grosor: 5, canteado: 'Sin cantear' },
  ];

  if (numEstantes > 0) {
    piezas.push({
      nombre: 'Estante',
      cantidad: numEstantes,
      largo: anchoInterior,
      ancho: fondoMm - 10,
      grosor,
      canteado: 'Canto frontal',
    });
  }

  return piezas;
}
