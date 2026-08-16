import type { ProveedorIA } from './ia-proveedor.js';
import { ProveedorOpenAI } from './ia-proveedor-openai.js';

/**
 * Registro de proveedores de IA disponibles, por nombre. `ServicioCentralIA`
 * nunca instancia un proveedor directamente — siempre pasa por
 * `obtenerProveedor(nombre)`, resuelto a partir de cada candidato de la
 * cadena que devuelve `ia-selector-modelo.ts`. Añadir un proveedor nuevo en
 * el futuro es registrar una entrada más aquí, sin tocar el resto del sistema.
 */
const proveedores = new Map<string, ProveedorIA>([
  ['openai', new ProveedorOpenAI()],
]);

/** Se lanza cuando se pide un proveedor que no está registrado. */
export class ErrorProveedorDesconocido extends Error {
  constructor(nombre: string) {
    super(`Proveedor de IA desconocido: "${nombre}".`);
  }
}

export function obtenerProveedor(nombre: string): ProveedorIA {
  const proveedor = proveedores.get(nombre);
  if (!proveedor) throw new ErrorProveedorDesconocido(nombre);
  return proveedor;
}
