/**
 * Lógica pura de "Diseño 3D" (Fase SketchUp/Trimble Connect, 30/08/2026)
 * — separada del componente (`diseno-3d-vista.tsx`) para poder testear
 * sin renderizar nada ni simular un iframe, mismo criterio que
 * `candidatos-mercado.ts`. Reconoce qué trajo un evento `embed.onAction`
 * del Workspace API de Trimble: un archivo seleccionado en el explorador
 * (tiene `type: 'FILE'`) o un proyecto elegido en la lista de proyectos
 * (mismo `id`/`name` que un archivo, pero sin `type`).
 */

export type ArchivoSeleccionadoTrimble = { id: string; name: string; versionId?: string; revision?: number; thumbnailUrl?: string[] };
export type ProyectoSeleccionadoTrimble = { id: string; name?: string };

export function esArchivoSeleccionado(data: unknown): data is ArchivoSeleccionadoTrimble {
  return !!data && typeof data === 'object' && (data as any).type === 'FILE' && typeof (data as any).id === 'string';
}

export function esProyectoSeleccionado(data: unknown): data is ProyectoSeleccionadoTrimble {
  return !!data && typeof data === 'object' && !('type' in (data as any)) && typeof (data as any).id === 'string';
}

/** Convierte el archivo seleccionado en el explorador en los datos que necesita `api.asociarModelo3D` — nunca inventa una versión o miniatura que Trimble no dio. */
export function archivoAModelo3D(archivo: ArchivoSeleccionadoTrimble, trimbleProjectId: string): {
  trimbleProjectId: string; trimbleFileId: string; nombreArchivo: string; version: number; thumbnailUrl: string;
} {
  return {
    trimbleProjectId,
    trimbleFileId: archivo.id,
    nombreArchivo: archivo.name,
    version: archivo.revision ?? 1,
    thumbnailUrl: archivo.thumbnailUrl?.[0] ?? '',
  };
}
