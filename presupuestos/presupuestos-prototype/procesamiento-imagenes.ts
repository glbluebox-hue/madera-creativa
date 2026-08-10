/**
 * Compresión de imágenes en el cliente antes de guardarlas. Deliberadamente
 * devuelve un `Blob`, no una data URL: la codificación a Base64 (mecanismo
 * de almacenamiento actual) es un paso aparte en `leerArchivoComoBase64()`
 * (`archivos.ts`). Cuando el Incremento 1.7 migre a almacenamiento externo,
 * esta función se reutiliza sin cambios — solo cambia qué se hace con el
 * `Blob` resultante.
 */

/** Dimensión máxima (lado largo, en píxeles) a la que se redimensiona una imagen antes de comprimirla. */
export const DIMENSION_MAXIMA_PX = 1600;

/** Calidad de codificación (0-1) usada tanto para WebP como para el JPEG de respaldo. */
export const CALIDAD_COMPRESION = 0.75;

/** Resultado de comprimir una imagen, con las métricas necesarias para el informe del incremento. */
export type ImagenProcesada = {
  blob: Blob;
  formato: string;
  anchoOriginal: number;
  altoOriginal: number;
  anchoFinal: number;
  altoFinal: number;
  bytesOriginal: number;
  bytesFinal: number;
  tiempoMs: number;
};

let soportaWebp: boolean | null = null;

/** Comprueba una única vez si `canvas.toBlob` produce realmente un WebP en este navegador (no todos lo soportan al codificar, aunque sepan leerlo). */
async function detectarSoporteWebp(): Promise<boolean> {
  if (soportaWebp !== null) return soportaWebp;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp'));
  soportaWebp = !!blob && blob.type === 'image/webp';
  return soportaWebp;
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function calcularDimensionFinal(ancho: number, alto: number, maxDim: number): { ancho: number; alto: number } {
  if (ancho <= maxDim && alto <= maxDim) return { ancho, alto };
  const escala = maxDim / Math.max(ancho, alto);
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

/**
 * Carga `src` y lo dibuja ya redimensionado en un canvas nuevo, sin
 * codificarlo todavía — punto de extensión compartido con el filtro del
 * escáner de documento, para que cada imagen pase una única vez por la
 * codificación final (redimensionar + filtrar + codificar en un solo canvas).
 */
export async function prepararCanvas(
  src: string,
  maxDim: number = DIMENSION_MAXIMA_PX
): Promise<{ canvas: HTMLCanvasElement; anchoOriginal: number; altoOriginal: number }> {
  const img = await cargarImagen(src);
  const { ancho, alto } = calcularDimensionFinal(img.naturalWidth, img.naturalHeight, maxDim);
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  canvas.getContext('2d')!.drawImage(img, 0, 0, ancho, alto);
  return { canvas, anchoOriginal: img.naturalWidth, altoOriginal: img.naturalHeight };
}

/** Codifica un canvas ya preparado: WebP si el navegador lo soporta de verdad, si no JPEG. */
export async function codificarCanvas(canvas: HTMLCanvasElement, calidad: number = CALIDAD_COMPRESION): Promise<Blob> {
  const usarWebp = await detectarSoporteWebp();
  const formato = usarWebp ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, formato, calidad));
  if (!blob) throw new Error('No se pudo codificar la imagen');
  return blob;
}

/** Comprime una imagen (foto o adjunto de imagen) sin ningún filtro adicional. */
export async function comprimirImagen(
  file: File | Blob,
  opciones: { maxDim?: number; calidad?: number } = {}
): Promise<ImagenProcesada> {
  const inicio = performance.now();
  const bytesOriginal = file.size;
  const src = await new Promise<string>((resolve) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.readAsDataURL(file);
  });
  const { canvas, anchoOriginal, altoOriginal } = await prepararCanvas(src, opciones.maxDim ?? DIMENSION_MAXIMA_PX);
  const blob = await codificarCanvas(canvas, opciones.calidad ?? CALIDAD_COMPRESION);
  return {
    blob,
    formato: blob.type,
    anchoOriginal,
    altoOriginal,
    anchoFinal: canvas.width,
    altoFinal: canvas.height,
    bytesOriginal,
    bytesFinal: blob.size,
    tiempoMs: performance.now() - inicio,
  };
}
