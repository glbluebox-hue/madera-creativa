import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/**
 * Convierte un `.stl` a `.glb` en el propio navegador (Fase "Diseño 3D",
 * 30/08/2026 — SketchUp Free solo exporta SKP/PNG/STL, nunca GLB de forma
 * nativa). El backend y el visor (`visor-modelo-3d.tsx`) siguen sin saber
 * que esto existe: reciben siempre un `.glb`, la conversión ocurre antes
 * de subir nada. STL no lleva color ni textura (solo geometría) — el
 * resultado se ve en un gris liso, nunca se inventa un material que la
 * fuente no tenía.
 */
export async function convertirSTLaGLB(file: File): Promise<Blob> {
  const buffer = await file.arrayBuffer();
  const geometria = new STLLoader().parse(buffer);
  geometria.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.6, metalness: 0.1 });
  const malla = new THREE.Mesh(geometria, material);
  const escena = new THREE.Scene();
  escena.add(malla);

  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    new GLTFExporter().parse(
      escena,
      (resultado) => resolve(resultado as ArrayBuffer),
      (error) => reject(error instanceof Error ? error : new Error('No se pudo convertir el archivo STL.')),
      { binary: true }
    );
  });

  return new Blob([arrayBuffer], { type: 'model/gltf-binary' });
}
