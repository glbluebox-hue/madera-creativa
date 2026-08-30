/**
 * Validación de la subida manual de un modelo 3D (Fase "Diseño 3D",
 * 30/08/2026) — función pura, sin red, mismo patrón que
 * `validarImagenParaIA` (`procesamiento-imagenes.ts`).
 *
 * Dos extensiones ADMITIDAS EN LA SUBIDA: `.glb` (se sube tal cual) y
 * `.stl` (SketchUp Free solo exporta SKP/PNG/STL, nunca GLB de forma
 * nativa — se convierte a `.glb` en el propio navegador antes de subir,
 * ver `stl-a-glb.ts`). El backend y el visor SIEMPRE reciben/muestran un
 * `.glb` — esta distinción es solo de entrada, nunca de almacenamiento.
 */

export const EXTENSION_MODELO_3D_ALMACENADA = 'glb';
export const EXTENSIONES_MODELO_3D_ENTRADA = ['glb', 'stl'] as const;
export type ExtensionModelo3DEntrada = (typeof EXTENSIONES_MODELO_3D_ENTRADA)[number];

/** Margen bajo el límite de 25MB del body JSON del backend — el base64 añade ~33% sobre el tamaño real del archivo. */
export const TAMANO_MAXIMO_MODELO_3D_BYTES = 15 * 1024 * 1024;

export type ResultadoValidacionModelo3D = { valido: true } | { valido: false; motivo: string };

export function extensionDe(nombreArchivo: string): string {
  const punto = nombreArchivo.lastIndexOf('.');
  return punto === -1 ? '' : nombreArchivo.slice(punto + 1).toLowerCase();
}

export function validarModelo3D(archivo: { name: string; size: number }): ResultadoValidacionModelo3D {
  const ext = extensionDe(archivo.name);
  if (!(EXTENSIONES_MODELO_3D_ENTRADA as readonly string[]).includes(ext)) {
    return { valido: false, motivo: `De momento solo se admiten archivos .${EXTENSIONES_MODELO_3D_ENTRADA.join(' o .')}.` };
  }
  if (archivo.size > TAMANO_MAXIMO_MODELO_3D_BYTES) {
    return { valido: false, motivo: `El archivo es demasiado grande (máximo ${Math.round(TAMANO_MAXIMO_MODELO_3D_BYTES / (1024 * 1024))} MB).` };
  }
  return { valido: true };
}

/** El nombre que se envía al backend siempre termina en `.glb` — un `.stl` de entrada se convierte antes de subir (ver `stl-a-glb.ts`), así que su nombre también cambia de extensión para reflejar lo que de verdad se guarda. */
export function nombreParaAlmacenar(nombreOriginal: string): string {
  const base = nombreOriginal.slice(0, nombreOriginal.length - extensionDe(nombreOriginal).length - 1) || nombreOriginal;
  return `${base}.${EXTENSION_MODELO_3D_ALMACENADA}`;
}

/** Formatea un tamaño en bytes como texto legible ("2.4 MB") — para mostrar el tamaño del modelo ya subido. */
export function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
