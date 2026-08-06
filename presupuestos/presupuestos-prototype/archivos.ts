/**
 * Utilidades para leer archivos seleccionados por el usuario (fotos,
 * adjuntos, logo, páginas escaneadas). Toda la app los guarda como
 * data URL en base64 — este es el único sitio que envuelve `FileReader`.
 */

/**
 * Lee un `File` y devuelve su contenido como data URL en base64.
 * Réplica exacta del comportamiento que tenían los 5 sitios que la
 * duplicaban: solo resuelve en éxito, sin manejo de error (ninguno de
 * los orígenes lo tenía tampoco) — mantenerlo así evita cambiar el
 * comportamiento existente al deduplicar.
 */
export function leerArchivoComoBase64(file: File): Promise<string> {
  return new Promise((resolve) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.readAsDataURL(file);
  });
}
