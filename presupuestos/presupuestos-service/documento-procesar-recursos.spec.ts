import { vi } from 'vitest';
import { procesarRecursosDocumento, borrarRecursosDocumentoHuerfanos } from './documento-procesar-recursos.js';
import { inicializarMotorDocumental } from './documento-motor-inicializar.js';
import { almacenamiento } from './almacenamiento.service.js';
import type { AlmacenamientoMemoria } from './almacenamiento-memoria.js';
import { PAGINA_A4, type DocumentoMC } from './documento-modelo.js';

/**
 * Pruebas del procesado de recursos del Motor Documental contra el
 * almacenamiento real de desarrollo (`AlmacenamientoMemoria`, el mismo que
 * usa la app cuando no hay credenciales de R2 — no un mock que reproduzca
 * `procesarRecursosDocumento` por dentro). Solo el test de fallo de
 * almacenamiento sustituye `subir` por una implementación que falla a
 * propósito, para poder observar el comportamiento ante un error real de
 * un proveedor externo, que no se puede provocar de otra forma de manera
 * determinista.
 */

const PIXEL_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function elementoImagen(id: string, url: string) {
  return {
    id,
    tipo: 'imagen',
    posicion: { x: 0, y: 0 },
    tamano: { ancho: 10, alto: 10 },
    contenido: { url, recorte: null },
    propiedadesEspecificas: { bordeRadio: 0 },
    estilo: {},
  };
}

function elementoTexto(id: string) {
  return {
    id,
    tipo: 'texto',
    posicion: { x: 0, y: 0 },
    tamano: { ancho: 10, alto: 10 },
    contenido: { texto: 'sin recurso' },
    propiedadesEspecificas: {},
    estilo: {},
  };
}

function documentoConElementos(elementos: unknown[]): DocumentoMC {
  return {
    id: 'doc-recursos-1',
    schemaVersion: 1,
    documentoBaseId: null,
    etiquetaVersion: null,
    documentVersion: 1,
    plantillaOrigen: null,
    paginas: [{ id: 'pag-1', indice: 0, nombre: '', configuracion: null, fondo: null, encabezado: null, pie: null, numeracion: { mostrar: false, formato: '', posicion: 'centro' }, elementos: elementos as any }],
    configuracionPorDefecto: { ancho: PAGINA_A4.ancho, alto: PAGINA_A4.alto, orientacion: 'vertical', margenes: { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 } },
    fondoPorDefecto: { tipo: 'ninguno' },
    encabezadoPorDefecto: null,
    piePorDefecto: null,
    variables: { claves: {} },
    configuracionImpresion: { sangrado: 0, escala: 1 },
    tema: null,
    estilosGuardados: [],
  };
}

beforeAll(() => {
  inicializarMotorDocumental();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('procesarRecursosDocumento', () => {
  it('sustituye una imagen Base64 por una URL de almacenamiento externo y no deja Base64 en el resultado', async () => {
    const documento = documentoConElementos([elementoImagen('img-1', `data:image/png;base64,${PIXEL_PNG_B64}`)]);
    const procesado = await procesarRecursosDocumento(documento);

    const elemento = procesado.paginas[0].elementos[0] as any;
    expect(elemento.contenido.url).not.toMatch(/^data:/);
    expect(elemento.contenido.claveAlmacenamiento).toBeTruthy();
    expect((almacenamiento as AlmacenamientoMemoria).existe(elemento.contenido.claveAlmacenamiento)).toBe(true);
  });

  it('deja intactos los elementos sin recurso (p. ej. texto)', async () => {
    const documento = documentoConElementos([elementoTexto('t-1')]);
    const procesado = await procesarRecursosDocumento(documento);
    expect((procesado.paginas[0].elementos[0] as any).contenido).toEqual({ texto: 'sin recurso' });
  });

  it('deja intacta una URL que ya es externa (no Base64) — no la vuelve a subir', async () => {
    const documento = documentoConElementos([elementoImagen('img-1', 'https://ejemplo.test/foto.png')]);
    const procesado = await procesarRecursosDocumento(documento);
    expect((procesado.paginas[0].elementos[0] as any).contenido.url).toBe('https://ejemplo.test/foto.png');
  });

  it('procesa varios recursos en paralelo, no secuencialmente (recupera el rendimiento del patrón legado)', async () => {
    const RETARDO_MS = 60;
    const original = almacenamiento.subir.bind(almacenamiento);
    const spy = vi.spyOn(almacenamiento, 'subir').mockImplementation(async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, RETARDO_MS));
      return original(...args);
    });

    const documento = documentoConElementos([
      elementoImagen('img-1', `data:image/png;base64,${PIXEL_PNG_B64}`),
      elementoImagen('img-2', `data:image/png;base64,${PIXEL_PNG_B64}`),
      elementoImagen('img-3', `data:image/png;base64,${PIXEL_PNG_B64}`),
    ]);

    const inicio = Date.now();
    const procesado = await procesarRecursosDocumento(documento);
    const duracionMs = Date.now() - inicio;

    expect(spy).toHaveBeenCalledTimes(3);
    // Secuencial habría tardado ~3×RETARDO_MS; en paralelo, ~1×RETARDO_MS.
    // Margen amplio para no ser un test frágil, pero suficiente para
    // distinguir claramente paralelo (~60ms) de secuencial (~180ms).
    expect(duracionMs).toBeLessThan(RETARDO_MS * 2);

    const urls = procesado.paginas[0].elementos.map((e: any) => e.contenido.url);
    expect(new Set(urls).size).toBe(3); // tres claves distintas, ninguna reutilizada
    for (const url of urls) expect(url).not.toMatch(/^data:/);
  });

  it('si falla la subida de un recurso, la función rechaza y no se persiste ninguna referencia a medio sustituir', async () => {
    vi.spyOn(almacenamiento, 'subir').mockRejectedValueOnce(new Error('Fallo simulado de almacenamiento externo'));

    const documento = documentoConElementos([elementoImagen('img-1', `data:image/png;base64,${PIXEL_PNG_B64}`)]);

    await expect(procesarRecursosDocumento(documento)).rejects.toThrow('Fallo simulado de almacenamiento externo');
    // El documento original pasado a la función nunca se muta.
    expect((documento.paginas[0].elementos[0] as any).contenido.url).toMatch(/^data:/);
  });
});

describe('borrarRecursosDocumentoHuerfanos', () => {
  it('borra del almacenamiento externo los recursos que ya no están en la versión nueva', async () => {
    const antes = await procesarRecursosDocumento(documentoConElementos([elementoImagen('img-1', `data:image/png;base64,${PIXEL_PNG_B64}`)]));
    const claveAntes = (antes.paginas[0].elementos[0] as any).contenido.claveAlmacenamiento;
    expect((almacenamiento as AlmacenamientoMemoria).existe(claveAntes)).toBe(true);

    const despues = documentoConElementos([elementoTexto('t-1')]); // la imagen ya no está

    await borrarRecursosDocumentoHuerfanos(antes, despues);

    expect((almacenamiento as AlmacenamientoMemoria).existe(claveAntes)).toBe(false);
  });

  it('no borra un recurso que sigue presente en la versión nueva', async () => {
    const antes = await procesarRecursosDocumento(documentoConElementos([elementoImagen('img-1', `data:image/png;base64,${PIXEL_PNG_B64}`)]));
    const clave = (antes.paginas[0].elementos[0] as any).contenido.claveAlmacenamiento;

    await borrarRecursosDocumentoHuerfanos(antes, antes);

    expect((almacenamiento as AlmacenamientoMemoria).existe(clave)).toBe(true);
  });

  it('no falla si "antes" es null (documento recién creado)', async () => {
    await expect(borrarRecursosDocumentoHuerfanos(null, documentoConElementos([]))).resolves.not.toThrow();
  });
});
