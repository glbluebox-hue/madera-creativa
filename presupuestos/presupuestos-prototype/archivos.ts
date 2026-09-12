/**
 * Utilidades para leer archivos seleccionados por el usuario (fotos,
 * adjuntos, logo, páginas escaneadas). Toda la app los guarda como
 * data URL en base64 — este es el único sitio que envuelve `FileReader`.
 */

/**
 * Lee un `File` o `Blob` y devuelve su contenido como data URL en base64.
 * Réplica exacta del comportamiento que tenían los 5 sitios que la
 * duplicaban: solo resuelve en éxito, sin manejo de error (ninguno de
 * los orígenes lo tenía tampoco) — mantenerlo así evita cambiar el
 * comportamiento existente al deduplicar. Acepta también `Blob` para
 * poder reutilizarse como adaptador del resultado de `comprimirImagen()`
 * (`procesamiento-imagenes.ts`) hacia el mecanismo de almacenamiento actual.
 */
export function leerArchivoComoBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.readAsDataURL(file);
  });
}

/**
 * Páginas de imagen de una factura YA GUARDADA, convertidas a base64 —
 * para poder enviárselas a un modelo de visión (nunca puede leer
 * directamente una URL del propio servidor, solo data URLs; mismo
 * problema real ya corregido una vez en `escaner-factura.tsx`, auditoría
 * 11/09/2026: "400 Failed to download file"). Prioriza `paginas` (sabe
 * distinguir imagen de PDF, un perfil de visión no puede leer un PDF);
 * si la factura es de antes de esa ampliación, cae en `imagenes`/`imagen`.
 */
export async function imagenesDeFacturaComoBase64(factura: { paginas?: { tipo: 'imagen' | 'pdf'; url: string }[]; imagenes?: string[]; imagen?: string }): Promise<string[]> {
  const urls: string[] = factura.paginas?.length
    ? factura.paginas.filter((p) => p.tipo === 'imagen').map((p) => p.url)
    : factura.imagenes?.length
      ? factura.imagenes
      : (factura.imagen ? [factura.imagen] : []);
  return Promise.all(urls.map(async (url) => {
    if (url.startsWith('data:')) return url;
    const blob = await (await fetch(url)).blob();
    return leerArchivoComoBase64(blob);
  }));
}
