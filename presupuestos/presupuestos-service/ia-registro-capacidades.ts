import type { CapacidadIA } from './ia-capacidad.js';

/**
 * Registro central de capacidades de IA — poblado por importación explícita
 * en el arranque (`registrarCapacidadesConocidas`), no por auto-discovery de
 * carpeta: consistente con que el propio router de rutas HTTP de la app se
 * monta a mano, sin ningún precedente de escaneo automático en el repo.
 * `ServicioCentralIA` resuelve con `obtenerCapacidad(nombre)` en vez de un
 * `switch` que crecería con cada copiloto nuevo.
 */
const capacidades = new Map<string, CapacidadIA>();

/** Se lanza al pedir una capacidad que no está registrada (o registrada pero `activa: false`). */
export class ErrorCapacidadDesconocida extends Error {
  constructor(nombre: string) {
    super(`Capacidad de IA desconocida o inactiva: "${nombre}".`);
  }
}

export function registrarCapacidad(capacidad: CapacidadIA): void {
  capacidades.set(capacidad.nombre, capacidad);
}

export function obtenerCapacidad(nombre: string): CapacidadIA {
  const capacidad = capacidades.get(nombre);
  if (!capacidad || !capacidad.activa) throw new ErrorCapacidadDesconocida(nombre);
  return capacidad;
}

export function listarCapacidades(): CapacidadIA[] {
  return [...capacidades.values()];
}
