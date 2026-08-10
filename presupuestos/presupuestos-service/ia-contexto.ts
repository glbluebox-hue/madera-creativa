/**
 * Contrato del constructor de contexto de una capacidad de IA. Cada
 * capacidad construye SOLO el contexto que necesita, a partir de
 * referencias (ids) que manda el frontend — nunca payloads libres ni "todo
 * lo que hay" (el defecto del `/asistente` actual, que carga hasta 1000
 * clientes y 1000 facturas sin acotar). Cada constructor concreto vive en su
 * propio archivo (p. ej. `asistente-global.contexto-ia.ts`) y se referencia
 * por instancia directa en `CapacidadIA.constructorContexto` (`ia-capacidad.ts`).
 */
export interface ConstructorContexto {
  /**
   * @param referencias Identificadores que manda el frontend (p. ej.
   *   `{ clienteAbiertoId, seccionActual }`) — el constructor decide qué
   *   pedir a `PresupuestosService` con esos ids, nunca recibe los datos ya
   *   resueltos por el llamante.
   * @param usuarioId Aísla cualquier consulta al mismo usuario autenticado.
   */
  construir(referencias: Record<string, unknown>, usuarioId: string): Promise<{
    /** Texto ya listo para insertar en el system prompt. */
    resumenParaPrompt: string;
    /** Datos que las herramientas de esta capacidad puedan necesitar cachear, sin volver a consultarlos. */
    datosParaHerramientas: Record<string, unknown>;
  }>;
}
