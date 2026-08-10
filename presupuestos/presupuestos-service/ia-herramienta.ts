import type { ZodType } from 'zod';

/**
 * Contrato de una herramienta que una capacidad de IA puede ofrecer al
 * modelo. Cada herramienta concreta vive en su propio archivo (p. ej.
 * `ia-herramientas-asistente-global.ts`) y se referencia por instancia
 * directa en `CapacidadIA.herramientas` (`ia-capacidad.ts`) — no hay un
 * registro global de herramientas por nombre: la agrupación por capacidad
 * la resuelve `ia-registro-capacidades.ts`.
 */

/**
 * Nivel de permiso de una herramienta — determina cómo la trata
 * `ServicioCentralIA` durante el bucle de function-calling:
 * - `'lectura'`: se ejecuta sola en el mismo turno; solo debe llamar a
 *   métodos ya existentes de `PresupuestosService` (nunca a Mongo directo),
 *   con el mismo `usuarioId` de aislamiento que el resto de la app. Su
 *   resultado se reinyecta al modelo como mensaje `'tool'`.
 * - `'interfaz'`: navegación pura, no toca datos. No se ejecuta en el
 *   servidor — se acumula en `accionesInterfaz` para que el frontend la
 *   ejecute.
 * - `'escritura'`: modifica datos. Nunca se ejecuta automáticamente — se
 *   acumula en `propuestas`, pendiente de confirmación explícita del
 *   usuario; al confirmar, se llama al mismo método de `PresupuestosService`
 *   que usaría un humano rellenando el formulario correspondiente.
 */
export type PermisoHerramienta = 'lectura' | 'interfaz' | 'escritura';

/** Contexto de ejecución que recibe una herramienta — nunca datos del propio modelo, siempre del servidor. */
export type ContextoEjecucionHerramienta = {
  usuarioId: string;
  requestId: string;
};

export interface HerramientaIA<TParams = any, TResultado = any> {
  nombre: string;
  descripcion: string;
  permiso: PermisoHerramienta;
  esquemaParametros: ZodType<TParams>;
  /**
   * Solo se invoca para permiso `'lectura'` (ejecución inmediata dentro del
   * bucle) o tras confirmación explícita para permiso `'escritura'`. Nunca
   * se invoca para permiso `'interfaz'` — esas se pasan tal cual al frontend.
   */
  ejecutar(params: TParams, ctx: ContextoEjecucionHerramienta): Promise<TResultado>;
}
