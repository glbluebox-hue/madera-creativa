import { registrarTipoElemento } from './documento-registro-tipos.js';
import { definicionesTiposIniciales } from './documento-tipos-iniciales.js';
import { definicionesTiposAvanzados } from './documento-tipos-avanzados.js';
import { registrarVariablesIniciales } from './documento-variables-iniciales.js';

/**
 * Punto único y explícito de arranque del Motor Documental — debe llamarse
 * una vez desde el bootstrap del servidor (`presupuestos-service.app-root.ts`),
 * antes de aceptar peticiones:
 *
 *   bootstrap → inicializarMotorDocumental() → registra tipos y variables → arranca servidor
 *
 * Deliberadamente NO ocurre como efecto secundario de importar un módulo de
 * validación HTTP ni ningún otro módulo ajeno al propio Motor Documental —
 * cualquier desarrollador que busque "dónde se inicializa el Motor
 * Documental" debe encontrar la respuesta en este único archivo.
 *
 * Idempotente a propósito: una segunda llamada (arranque duplicado, tests
 * que importan el bootstrap más de una vez, etc.) es un no-op — nunca
 * vuelve a registrar tipos ni puede dejar el registro en un estado a medias.
 */
let inicializado = false;

export function inicializarMotorDocumental(): void {
  if (inicializado) return;
  for (const definicion of definicionesTiposIniciales) {
    registrarTipoElemento(definicion);
  }
  for (const definicion of definicionesTiposAvanzados) {
    registrarTipoElemento(definicion);
  }
  registrarVariablesIniciales();
  inicializado = true;
}
