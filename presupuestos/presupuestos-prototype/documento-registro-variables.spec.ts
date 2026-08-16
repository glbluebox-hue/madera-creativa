import { registrarVariable, listarVariables, resolverVariables } from './documento-registro-variables.js';
import './documento-variables-iniciales.js'; // registro por efecto secundario
import { PAGINA_A4, type DocumentoMC } from './documento-modelo.js';

function documentoConTexto(texto: string): DocumentoMC {
  return {
    id: 'doc-var-1', schemaVersion: 1, documentoBaseId: null, etiquetaVersion: null, documentVersion: 1, plantillaOrigen: null,
    paginas: [{
      id: 'p1', indice: 0, nombre: '', configuracion: null, fondo: null, encabezado: null, pie: null,
      numeracion: { mostrar: false, formato: '', posicion: 'centro' },
      elementos: [{
        id: 'e1', tipo: 'texto', posicion: { x: 0, y: 0 }, tamano: { ancho: 100, alto: 20 }, rotacion: 0, capa: 0,
        grupoId: null, bloqueado: false, restricciones: { soloLectura: false, visibilidad: 'siempre', obligatorio: false },
        opacidad: 1, origenComponente: null, estiloNombradoId: null,
        contenido: { texto }, propiedadesEspecificas: {}, estilo: {},
      }],
    }],
    configuracionPorDefecto: { ancho: PAGINA_A4.ancho, alto: PAGINA_A4.alto, orientacion: 'vertical', margenes: { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 } },
    fondoPorDefecto: { tipo: 'ninguno' }, encabezadoPorDefecto: null, piePorDefecto: null,
    variables: { claves: {} }, configuracionImpresion: { sangrado: 0, escala: 1 },
    tema: null, estilosGuardados: [],
  };
}

describe('registro de variables inteligentes (frontend)', () => {
  it('las variables iniciales quedan registradas al importar el módulo', () => {
    const claves = listarVariables().map((v) => v.clave);
    expect(claves).toContain('cliente.nombre');
    expect(claves).toContain('presupuesto.total');
    expect(claves).toContain('fecha');
  });

  it('resolverVariables sustituye {{clave}} por el valor real del contexto', () => {
    const doc = documentoConTexto('Hola {{cliente.nombre}}, total: {{presupuesto.total}}');
    const resuelto = resolverVariables(doc, { cliente: { nombre: 'Juan' }, presupuesto: { titulo: 'X', precioTotal: 1234.5 } });
    const texto = resuelto.paginas[0].elementos[0].contenido.texto as string;
    expect(texto).toContain('Hola Juan');
    expect(texto).toMatch(/1234,50\s?€|1\.234,50\s?€/);
  });

  it('deja intacta una clave desconocida o sin dato disponible', () => {
    const doc = documentoConTexto('{{no.existe}} / {{cliente.nombre}}');
    expect(resolverVariables(doc, {}).paginas[0].elementos[0].contenido.texto).toBe('{{no.existe}} / {{cliente.nombre}}');
  });

  it('no muta el documento original', () => {
    const doc = documentoConTexto('{{cliente.nombre}}');
    const original = structuredClone(doc);
    resolverVariables(doc, { cliente: { nombre: 'Ana' } });
    expect(doc).toEqual(original);
  });

  it('una variable sintética propia se resuelve correctamente', () => {
    registrarVariable({ clave: 'prueba.frontend', fuente: 'prueba', etiqueta: 'Prueba', tipoDato: 'texto', resolver: () => 'OK' });
    const doc = documentoConTexto('{{prueba.frontend}}');
    expect(resolverVariables(doc, {}).paginas[0].elementos[0].contenido.texto).toBe('OK');
  });
});
