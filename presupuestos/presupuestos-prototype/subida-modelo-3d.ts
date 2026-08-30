import { extensionDe, nombreParaAlmacenar } from './modelo-3d-archivo.js';
import { convertirSTLaGLB } from './stl-a-glb.js';

/**
 * Prepara un archivo elegido por el usuario para subirlo como modelo 3D
 * (Fase "Diseño 3D", 30/08/2026) — un `.glb` se sube tal cual; un `.stl`
 * se convierte primero a `.glb` en el propio navegador (`stl-a-glb.ts`).
 * El backend nunca sabe cuál de los dos casos ocurrió: siempre recibe un
 * `.glb`. Separado de `use-modelo-3d.ts` (el hook de React) para poder
 * testear la orquestación (qué pasa con cada extensión) sin renderizar
 * nada ni cargar three.js de verdad en cada test de `modelo-3d-archivo.spec.ts`.
 */
export async function prepararSubidaModelo3D(file: File): Promise<{ nombreArchivo: string; blob: Blob }> {
  if (extensionDe(file.name) === 'stl') {
    return { nombreArchivo: nombreParaAlmacenar(file.name), blob: await convertirSTLaGLB(file) };
  }
  return { nombreArchivo: file.name, blob: file };
}
