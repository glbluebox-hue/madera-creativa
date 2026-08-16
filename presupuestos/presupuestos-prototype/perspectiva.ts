/**
 * Corrección de perspectiva de un documento fotografiado — implementación
 * propia sobre Canvas 2D, sin dependencias externas (nada de OpenCV.js/WASM,
 * ver auditoría técnica de la Fase Facturas Profesional: para "recortar +
 * enderezar" con las 4 esquinas ya conocidas, una homografía propia es
 * suficiente y evita 8-10 MB de WebAssembly poco fiable en Safari iOS).
 *
 * Se calcula la homografía real (proyectiva, no una aproximación afín) que
 * mapea el cuadrilátero de las 4 esquinas elegidas por el usuario a un
 * rectángulo, y se recorre el rectángulo de salida con la matriz inversa
 * (mapeo inverso, para no dejar huecos), muestreando el origen con
 * interpolación bilineal.
 */

export type Punto = { x: number; y: number };

/** Resuelve un sistema lineal `Ax = b` mediante eliminación gaussiana con pivote parcial. */
function resolverSistema(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((fila, i) => [...fila, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivote = col;
    for (let fila = col + 1; fila < n; fila++) {
      if (Math.abs(M[fila][col]) > Math.abs(M[pivote][col])) pivote = fila;
    }
    [M[col], M[pivote]] = [M[pivote], M[col]];
    for (let fila = col + 1; fila < n; fila++) {
      const factor = M[fila][col] / M[col][col];
      for (let k = col; k <= n; k++) M[fila][k] -= factor * M[col][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let fila = n - 1; fila >= 0; fila--) {
    let suma = M[fila][n];
    for (let k = fila + 1; k < n; k++) suma -= M[fila][k] * x[k];
    x[fila] = suma / M[fila][fila];
  }
  return x;
}

/** Homografía (matriz 3x3, como array de 9) que mapea `origen` (4 puntos) a `destino` (4 puntos). */
function calcularHomografia(origen: Punto[], destino: Punto[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = origen[i];
    const { x: X, y: Y } = destino[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }
  const coef = resolverSistema(A, b);
  return [...coef, 1];
}

/** Invierte una matriz 3x3 (array de 9 elementos, fila a fila). */
function invertirMatriz3x3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const invDet = 1 / det;
  return [
    (e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet,
    (f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet,
    (d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet,
  ];
}

function aplicarPunto(m: number[], x: number, y: number): Punto {
  const w = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}

/** Muestrea un píxel de `datos` con interpolación bilineal; fuera de rango devuelve transparente. */
function muestrear(datos: ImageData, x: number, y: number): [number, number, number, number] {
  const { width, height, data } = datos;
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return [0, 0, 0, 0];
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const idx = (xx: number, yy: number) => (yy * width + xx) * 4;
  const c00 = idx(x0, y0), c10 = idx(x0 + 1, y0), c01 = idx(x0, y0 + 1), c11 = idx(x0 + 1, y0 + 1);
  const resultado: [number, number, number, number] = [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const arriba = data[c00 + k] * (1 - fx) + data[c10 + k] * fx;
    const abajo = data[c01 + k] * (1 - fx) + data[c11 + k] * fx;
    resultado[k] = arriba * (1 - fy) + abajo * fy;
  }
  return resultado;
}

/** Distancia euclídea entre dos puntos. */
function distancia(a: Punto, b: Punto): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * A partir de las 4 esquinas elegidas (orden: superior-izq, superior-der,
 * inferior-der, inferior-izq, en coordenadas de píxel del canvas origen),
 * calcula un tamaño de salida razonable que preserva la proporción real del
 * documento fotografiado, en vez de forzar un tamaño arbitrario.
 */
export function tamanoDestinoDesdeEsquinas(esquinas: [Punto, Punto, Punto, Punto], maxLado = 1600): { ancho: number; alto: number } {
  const anchoArriba = distancia(esquinas[0], esquinas[1]);
  const anchoAbajo = distancia(esquinas[3], esquinas[2]);
  const altoIzq = distancia(esquinas[0], esquinas[3]);
  const altoDer = distancia(esquinas[1], esquinas[2]);
  const ancho = Math.max(1, Math.round((anchoArriba + anchoAbajo) / 2));
  const alto = Math.max(1, Math.round((altoIzq + altoDer) / 2));
  const escala = Math.min(1, maxLado / Math.max(ancho, alto));
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}

/**
 * Endereza la región cuadrilátera de `canvasOrigen` definida por `esquinas`
 * (orden: superior-izq, superior-der, inferior-der, inferior-izq) en un
 * rectángulo nuevo de `anchoDestino`x`altoDestino`.
 */
export function corregirPerspectiva(
  canvasOrigen: HTMLCanvasElement,
  esquinas: [Punto, Punto, Punto, Punto],
  anchoDestino: number,
  altoDestino: number
): HTMLCanvasElement {
  const destino: Punto[] = [
    { x: 0, y: 0 }, { x: anchoDestino, y: 0 },
    { x: anchoDestino, y: altoDestino }, { x: 0, y: altoDestino },
  ];
  const homografia = calcularHomografia(esquinas, destino);
  const inversa = invertirMatriz3x3(homografia);

  const ctxOrigen = canvasOrigen.getContext('2d')!;
  const datosOrigen = ctxOrigen.getImageData(0, 0, canvasOrigen.width, canvasOrigen.height);

  const canvasSalida = document.createElement('canvas');
  canvasSalida.width = anchoDestino;
  canvasSalida.height = altoDestino;
  const ctxSalida = canvasSalida.getContext('2d')!;
  const datosSalida = ctxSalida.createImageData(anchoDestino, altoDestino);

  for (let y = 0; y < altoDestino; y++) {
    for (let x = 0; x < anchoDestino; x++) {
      const origen = aplicarPunto(inversa, x, y);
      const [r, g, azul, a] = muestrear(datosOrigen, origen.x, origen.y);
      const i = (y * anchoDestino + x) * 4;
      datosSalida.data[i] = r; datosSalida.data[i + 1] = g; datosSalida.data[i + 2] = azul; datosSalida.data[i + 3] = a;
    }
  }
  ctxSalida.putImageData(datosSalida, 0, 0);
  return canvasSalida;
}
