import { actualizarContenidoMC } from './documento-comandos.js';
import type { DocumentoMC } from './documento-modelo.js';

function documentoConElemento(overrides: Partial<DocumentoMC['paginas'][0]['elementos'][0]> = {}): DocumentoMC {
  return {
    id: 'doc-1', schemaVersion: 1, documentoBaseId: null, etiquetaVersion: null, documentVersion: 1, plantillaOrigen: null,
    paginas: [{
      id: 'pag-1', indice: 0, nombre: '', configuracion: null, fondo: null, encabezado: null, pie: null,
      numeracion: { mostrar: false, formato: '', posicion: 'centro' },
      elementos: [{
        id: 'el-1', tipo: 'texto', posicion: { x: 0, y: 0 }, tamano: { ancho: 10, alto: 10 },
        rotacion: 0, capa: 0, grupoId: null, bloqueado: false,
        restricciones: { soloLectura: false, visibilidad: 'siempre', obligatorio: false },
        opacidad: 1, origenComponente: null, estiloNombradoId: null,
        contenido: { texto: 'hola' }, propiedadesEspecificas: {}, estilo: {},
        ...overrides,
      }],
    }],
    configuracionPorDefecto: { ancho: 794, alto: 1123, orientacion: 'vertical', margenes: { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 } },
    fondoPorDefecto: { tipo: 'ninguno' }, encabezadoPorDefecto: null, piePorDefecto: null,
    variables: { claves: {} }, configuracionImpresion: { sangrado: 0, escala: 1 }, tema: null, estilosGuardados: [],
  } as unknown as DocumentoMC;
}

describe('actualizarContenidoMC (puerto backend del canal de comandos, Incremento 11)', () => {
  it('mezcla contenido nuevo con el existente, sin perder claves no tocadas', () => {
    const doc = documentoConElemento();
    const resultado = actualizarContenidoMC(doc, 'el-1', { texto: 'adiós' });
    expect((resultado.paginas[0].elementos[0].contenido as any).texto).toBe('adiós');
  });

  it('no muta el documento original', () => {
    const doc = documentoConElemento();
    const original = structuredClone(doc);
    actualizarContenidoMC(doc, 'el-1', { texto: 'adiós' });
    expect(doc).toEqual(original);
  });

  it('ignora la escritura si el elemento es de solo lectura (mismo criterio que el frontend, Regla de Oro 3)', () => {
    const doc = documentoConElemento({ restricciones: { soloLectura: true, visibilidad: 'siempre', obligatorio: false } } as any);
    const resultado = actualizarContenidoMC(doc, 'el-1', { texto: 'hackeado' });
    expect((resultado.paginas[0].elementos[0].contenido as any).texto).toBe('hola');
  });
});
