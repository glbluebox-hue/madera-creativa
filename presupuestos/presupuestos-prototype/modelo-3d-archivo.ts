/**
 * Validación de la subida manual de un modelo 3D (Fase "Diseño 3D",
 * 30/08/2026) — función pura, sin red, mismo patrón que
 * `validarImagenParaIA` (`procesamiento-imagenes.ts`). Solo se admite
 * `.glb`: es un archivo binario único autocontenido (geometría,
 * materiales y texturas en un solo fichero), a diferencia de un `.gltf`
 * suelto, que suele referenciar archivos externos — admitirlo exigiría
 * una subida de varios archivos a la vez, fuera de alcance de esta fase.
 */

export const EXTENSION_MODELO_3D_PERMITIDA = 'glb';
/** Margen bajo el límite de 25MB del body JSON del backend — el base64 añade ~33% sobre el tamaño real del archivo. */
export const TAMANO_MAXIMO_MODELO_3D_BYTES = 15 * 1024 * 1024;

export type ResultadoValidacionModelo3D = { valido: true } | { valido: false; motivo: string };

function extensionDe(nombreArchivo: string): string {
  const punto = nombreArchivo.lastIndexOf('.');
  return punto === -1 ? '' : nombreArchivo.slice(punto + 1).toLowerCase();
}

export function validarModelo3D(archivo: { name: string; size: number }): ResultadoValidacionModelo3D {
  if (extensionDe(archivo.name) !== EXTENSION_MODELO_3D_PERMITIDA) {
    return { valido: false, motivo: `De momento solo se admiten archivos .${EXTENSION_MODELO_3D_PERMITIDA}.` };
  }
  if (archivo.size > TAMANO_MAXIMO_MODELO_3D_BYTES) {
    return { valido: false, motivo: `El archivo es demasiado grande (máximo ${Math.round(TAMANO_MAXIMO_MODELO_3D_BYTES / (1024 * 1024))} MB).` };
  }
  return { valido: true };
}

/** Formatea un tamaño en bytes como texto legible ("2.4 MB") — para mostrar el tamaño del modelo ya subido. */
export function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
