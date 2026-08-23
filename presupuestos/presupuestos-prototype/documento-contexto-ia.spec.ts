import { extraerContextoDocumento, textoDeElementoSeleccionado, puedeAplicarPropuestaA } from './documento-contexto-ia.js';
import type { DocumentoMC, ElementoMC, PaginaMC } from './documento-modelo.js';

function elemento(tipo: string, contenido: Record<string, unknown>): ElementoMC {
  return {
    id: `el-${Math.random()}`, tipo, posicion: { x: 0, y: 0 }, tamano: { ancho: 100, alto: 20 },
    rotacion: 0, capa: 0, grupoId: null, bloqueado: false,
    restricciones: { soloLectura: false, visibilidad: 'siempre', obligatorio: false },
    opacidad: 1, origenComponente: null, estiloNombradoId: null,
    contenido, propiedadesEspecificas: {}, estilo: {},
  };
}

function pagina(elementos: ElementoMC[], extra: Partial<PaginaMC> = {}): PaginaMC {
  return {
    id: `p-${Math.random()}`, indice: 0, nombre: '', configuracion: null, fondo: null,
    encabezado: null, pie: null, numeracion: { mostrar: false, formato: '', posicion: 'centro' },
    elementos, ...extra,
  };
}

function documento(paginas: PaginaMC[]): DocumentoMC {
  return {
    id: 'doc-1', schemaVersion: 1, documentoBaseId: null, etiquetaVersion: null, documentVersion: 1,
    plantillaOrigen: null, paginas,
    configuracionPorDefecto: { ancho: 595, alto: 842, orientacion: 'vertical', margenes: { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 } },
  } as DocumentoMC;
}

describe('extraerContextoDocumento (contexto de la IA del Presupuesto, 23/08/2026)', () => {
  it('recoge el texto de los elementos de tipo texto, en orden', () => {
    const doc = documento([
      pagina([elemento('texto', { texto: 'Fabricación de cocina a medida.' }), elemento('texto', { texto: 'Materiales: roble macizo.' })]),
    ]);
    const contexto = extraerContextoDocumento(doc);
    expect(contexto).toContain('Fabricación de cocina a medida.');
    expect(contexto).toContain('Materiales: roble macizo.');
    expect(contexto.indexOf('Fabricación')).toBeLessThan(contexto.indexOf('Materiales'));
  });

  it('incluye un bloqueIA ya generado, pero no uno vacío/generando', () => {
    const doc = documento([
      pagina([
        elemento('bloqueIA', { instrucciones: 'x', textoGenerado: 'Texto ya generado por IA antes.', estado: 'generado' }),
        elemento('bloqueIA', { instrucciones: 'x', textoGenerado: '', estado: 'vacio' }),
        elemento('bloqueIA', { instrucciones: 'x', textoGenerado: '', estado: 'generando' }),
      ]),
    ]);
    const contexto = extraerContextoDocumento(doc);
    expect(contexto).toContain('Texto ya generado por IA antes.');
  });

  it('ignora elementos sin texto (imagen, línea, precio…)', () => {
    const doc = documento([
      pagina([elemento('imagen', { url: 'https://ejemplo.test/foto.jpg' }), elemento('linea', {}), elemento('precioDestacado', { precio: 1500 })]),
    ]);
    expect(extraerContextoDocumento(doc)).toBe('');
  });

  it('recorre también encabezado y pie, no solo el cuerpo de la página', () => {
    const doc = documento([
      pagina([elemento('texto', { texto: 'Cuerpo.' })], {
        encabezado: { altura: 40, elementos: [elemento('texto', { texto: 'Texto de cabecera.' })] },
        pie: { altura: 20, elementos: [elemento('texto', { texto: 'Texto de pie.' })] },
      }),
    ]);
    const contexto = extraerContextoDocumento(doc);
    expect(contexto).toContain('Texto de cabecera.');
    expect(contexto).toContain('Texto de pie.');
    expect(contexto).toContain('Cuerpo.');
  });

  it('documento vacío da un contexto vacío, nunca inventa texto', () => {
    expect(extraerContextoDocumento(documento([pagina([])]))).toBe('');
  });

  it('recorta el contexto si supera la longitud máxima, sin lanzar error', () => {
    const textoLargo = 'x'.repeat(5000);
    const doc = documento([pagina([elemento('texto', { texto: textoLargo })])]);
    const contexto = extraerContextoDocumento(doc);
    expect(contexto.length).toBeLessThan(5000);
    expect(contexto).toContain('omitido por longitud');
  });
});

describe('textoDeElementoSeleccionado / puedeAplicarPropuestaA', () => {
  it('devuelve el texto si el elemento seleccionado es de tipo texto', () => {
    const el = elemento('texto', { texto: 'Descripción actual.' });
    expect(textoDeElementoSeleccionado(el)).toBe('Descripción actual.');
    expect(puedeAplicarPropuestaA(el)).toBe(true);
  });

  it('sin selección (undefined), no hay texto y no se puede aplicar nada', () => {
    expect(textoDeElementoSeleccionado(undefined)).toBe('');
    expect(puedeAplicarPropuestaA(undefined)).toBe(false);
  });

  it('un elemento que no es de texto (p. ej. imagen) no tiene texto y no admite aplicar la propuesta', () => {
    const el = elemento('imagen', { url: 'x' });
    expect(textoDeElementoSeleccionado(el)).toBe('');
    expect(puedeAplicarPropuestaA(el)).toBe(false);
  });
});
