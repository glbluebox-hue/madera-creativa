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

function calcularDimensionFinal(ancho: number, alto: number, maxDim: number): { ancho: number; alto: number } {
  if (ancho <= maxDim && alto <= maxDim) return { ancho, alto };
  const escala = maxDim / Math.max(ancho, alto);
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

/**
 * Decodifica una fuente de imagen (data URL o `Blob`) a sus dimensiones
 * naturales y un dibujable para `drawImage`. Usa `createImageBitmap` cuando
 * está disponible en vez de `new Image()`: el `ImageBitmap` resultante se
 * puede liberar con `.close()` de forma inmediata y explícita en cuanto se
 * ha dibujado ya en el canvas reducido, en vez de depender de que el
 * recolector de basura decida cuándo liberar la memoria de la imagen a
 * resolución nativa — una foto de móvil real (12-48 MP o más) decodificada
 * puede ocupar 150-400+ MB en crudo, y mantener esa memoria viva más de lo
 * necesario es lo que hacía que la pestaña se cerrara sola en pruebas
 * reales en Android, tanto con la cámara del sistema como con la cámara en
 * vivo — el fallo no estaba en cuál cámara se usaba, sino en cómo se
 * decodificaba después la foto capturada.
 */
async function decodificarFuente(src: string | Blob): Promise<{ dibujable: ImageBitmap | HTMLImageElement; ancho: number; alto: number; cerrar: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      // Si ya es un `Blob`/`File` (p. ej. la foto tal cual sale de la
      // cámara), se pasa directo — convertirlo antes a data URL de texto
      // (Base64) solo para volver a decodificarlo duplicaría en memoria
      // una foto que ya puede pesar varios MB, justo antes del paso más
      // delicado de todos.
      const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
      const bitmap = await createImageBitmap(blob);
      return { dibujable: bitmap, ancho: bitmap.width, alto: bitmap.height, cerrar: () => bitmap.close() };
    } catch {
      // Sigue al respaldo de abajo si `createImageBitmap`/`fetch` fallan
      // para esta fuente concreta (algunos navegadores antiguos no
      // implementan `createImageBitmap` sobre todos los tipos de Blob).
    }
  }
  const dataUrl = typeof src === 'string' ? src : await new Promise<string>((resolve) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.readAsDataURL(src);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });
  return { dibujable: img, ancho: img.naturalWidth, alto: img.naturalHeight, cerrar: () => { img.src = ''; } };
}

/**
 * Carga `src` y lo dibuja ya redimensionado en un canvas nuevo, sin
 * codificarlo todavía — punto de extensión compartido con el filtro del
 * escáner de documento, para que cada imagen pase una única vez por la
 * codificación final (redimensionar + filtrar + codificar en un solo canvas).
 */
export async function prepararCanvas(
  src: string | Blob,
  maxDim: number = DIMENSION_MAXIMA_PX
): Promise<{ canvas: HTMLCanvasElement; anchoOriginal: number; altoOriginal: number }> {
  const { dibujable, ancho: anchoOriginal, alto: altoOriginal, cerrar } = await decodificarFuente(src);
  const { ancho, alto } = calcularDimensionFinal(anchoOriginal, altoOriginal, maxDim);
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  canvas.getContext('2d')!.drawImage(dibujable, 0, 0, ancho, alto);
  cerrar();
  return { canvas, anchoOriginal, altoOriginal };
}

/**
 * Codifica un canvas ya preparado: WebP si el navegador lo soporta de
 * verdad, si no JPEG. `forzarJpeg` evita WebP incluso si el navegador lo
 * soporta — necesario para páginas que puedan acabar incrustadas en un PDF
 * generado con `pdf-lib` (backend), que no sabe leer WebP.
 */
export async function codificarCanvas(canvas: HTMLCanvasElement, calidad: number = CALIDAD_COMPRESION, forzarJpeg = false): Promise<Blob> {
  const usarWebp = !forzarJpeg && await detectarSoporteWebp();
  const formato = usarWebp ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, formato, calidad));
  if (!blob) throw new Error('No se pudo codificar la imagen');
  return blob;
}

/** Comprime una imagen (foto o adjunto de imagen) sin ningún filtro adicional. */
export async function comprimirImagen(
  file: File | Blob,
  opciones: { maxDim?: number; calidad?: number; forzarJpeg?: boolean; quitarFondoClaro?: boolean } = {}
): Promise<ImagenProcesada> {
  const inicio = performance.now();
  const bytesOriginal = file.size;
  // El `File` se pasa tal cual — nunca se convierte antes a data URL de
  // texto (ver `decodificarFuente`), que para una foto de cámara real
  // duplicaría en memoria varios MB justo antes de decodificarla.
  const { canvas, anchoOriginal, altoOriginal } = await prepararCanvas(file, opciones.maxDim ?? DIMENSION_MAXIMA_PX);
  let blob: Blob;
  if (opciones.quitarFondoClaro) {
    quitarFondoClaro(canvas);
    // PNG siempre, sin pasar por la detección de WebP: el logo es pequeño
    // (unos cientos de KB como mucho a `DIMENSION_MAXIMA_LOGO_PX`) y lo que
    // importa aquí es que el canal alfa que acabamos de generar llegue
    // intacto en el 100% de los navegadores, no ahorrar los KB extra que
    // WebP conseguiría — un fallback a JPEG (que no admite alfa) borraría
    // justo la transparencia que se pide quitar el fondo.
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png')).then((b) => {
      if (!b) throw new Error('No se pudo codificar la imagen');
      return b;
    });
  } else {
    blob = await codificarCanvas(canvas, opciones.calidad ?? CALIDAD_COMPRESION, opciones.forzarJpeg);
  }
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

/**
 * Vacía a transparente el fondo de un logo con un fondo plano (blanco, crema,
 * gris claro…), directamente sobre el canvas ya redimensionado — pensado
 * para logos subidos "tal cual" desde otra herramienta (Canva, Word, una
 * captura...), que casi nunca traen ya el fondo transparente aunque el
 * archivo sea PNG (reporte real, 18/08/2026: "el logo se ve con un fondo
 * blanco" en el menú lateral en modo oscuro).
 *
 * Compara cada píxel de la imagen contra el color de fondo (no solo el
 * borde): la primera versión solo vaciaba el fondo expandiéndose desde el
 * borde hacia dentro (flood-fill), y dejaba intactos los huecos cerrados que
 * no tocan el borde — el interior de una "A" o una "R", por ejemplo (reporte
 * real, 18/08/2026: "en medio de las letras, dentro de la A, dentro de la R,
 * hay puntos blancos"). Comparar cada píxel directamente es más simple y sí
 * los alcanza, a costa de asumir que cualquier píxel del color del fondo lo
 * es de verdad — asunción razonable para un logo de dos tonos (tinta sobre
 * un color de fondo plano), que es el caso normal.
 *
 * Si las 4 esquinas no son razonablemente parecidas entre sí (fondo con
 * textura, foto en vez de logo con fondo plano…) no se toca nada — más
 * seguro no arriesgarse a comerse parte del logo que forzar una detección
 * dudosa.
 */
export function quitarFondoClaro(canvas: HTMLCanvasElement, tolerancia = 26): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  if (w < 2 || h < 2) return;
  const imagen = ctx.getImageData(0, 0, w, h);
  const datos = imagen.data;
  const indice = (x: number, y: number) => (y * w + x) * 4;

  const esquinas: Array<[number, number]> = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  let r0 = 0, g0 = 0, b0 = 0;
  for (const [x, y] of esquinas) { const i = indice(x, y); r0 += datos[i]; g0 += datos[i + 1]; b0 += datos[i + 2]; }
  r0 /= 4; g0 /= 4; b0 /= 4;

  const distanciaFondo = (i: number) => Math.hypot(datos[i] - r0, datos[i + 1] - g0, datos[i + 2] - b0);
  const desviacionMaxima = Math.max(...esquinas.map(([x, y]) => distanciaFondo(indice(x, y))));
  if (desviacionMaxima > 40) return; // Esquinas demasiado distintas entre sí — no es un fondo plano fiable.

  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const d = distanciaFondo(i);
    if (d > tolerancia * 2) continue; // Claramente parte del dibujo — no se toca.
    // Degradado: totalmente transparente pegado al color de fondo, subiendo
    // hacia opaco a medida que se acerca al límite de tolerancia — evita un
    // borde duro tipo "recortado con tijera" alrededor del logo.
    datos[i + 3] = Math.round(datos[i + 3] * Math.min(1, d / tolerancia));
  }

  ctx.putImageData(imagen, 0, 0);
}
