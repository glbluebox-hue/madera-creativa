/**
 * Firma de contenido para detectar cambios sin guardar en el editor de
 * dibujo (14/10/2026) — extraída a su propio módulo, sin depender de
 * Excalidraw ni de React, para poder testearla de forma aislada (importar
 * `editor-dibujo.tsx` en un test arrastra Excalidraw entero, que a su vez
 * necesita Canvas, no disponible en el entorno de test de este proyecto).
 *
 * El `version` de un elemento de Excalidraw solo sube con una edición real
 * del contenido (mover, dibujar, borrar...), nunca con una selección o un
 * cambio de herramienta, así que compararla evita falsos positivos que
 * bloquearían salir del editor sin motivo real. Los elementos marcados
 * `isDeleted` se descartan porque una goma que borra y un `updateScene` que
 * "revive" una imagen (ver `handleChangeEscena` en `editor-dibujo.tsx`) no
 * deben contar como pendiente de guardar si el resultado neto ya está
 * guardado.
 */
export type ElementoConVersion = { id: string; version: number; isDeleted?: boolean };

export function firmaDeElementos(elements: readonly ElementoConVersion[]): string {
  return elements.filter((e) => !e.isDeleted).map((e) => `${e.id}:${e.version}`).sort().join('|');
}
