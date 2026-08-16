import { registrarVariable, listarVariables, resolverVariables } from './documento-registro-variables.js';
import { inicializarMotorDocumental } from './documento-motor-inicializar.js';
import { PAGINA_A4, type DocumentoMC, type ElementoMC } from './documento-modelo.js';

/** `ElementoMC.contenido` es `unknown` a propósito (Regla de Oro 6) — este helper solo existe en el test, para leer el texto del único tipo que usan estas pruebas. */
function textoDe(elemento: ElementoMC): string {
  return (elemento.contenido as { texto: string }).texto;
}

/**
 * Pruebas del registro de variables inteligentes (Incremento 4) —
 * `inicializarMotorDocumental()` puebla las 11 variables reales de la app
 * (cliente/empresa/presupuesto/sistema); estas pruebas también registran
 * una variable sintética propia para probar el mecanismo en sí sin
 * depender de los datos reales.
 */

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

beforeAll(() => { inicializarMotorDocumental(); });

describe('registro de variables inteligentes', () => {
  it('registra variables reales (cliente/empresa/presupuesto/sistema) tras inicializar el motor', () => {
    const claves = listarVariables().map((v) => v.clave);
    expect(claves).toContain('cliente.nombre');
    expect(claves).toContain('empresa.iban');
    expect(claves).toContain('presupuesto.total');
    expect(claves).toContain('fecha');
  });

  it('resolverVariables sustituye {{clave}} por el valor real del contexto', () => {
    const doc = documentoConTexto('Hola {{cliente.nombre}}, tu presupuesto "{{presupuesto.titulo}}" es de {{presupuesto.total}}.');
    const resuelto = resolverVariables(doc, {
      cliente: { nombre: 'Juan' },
      presupuesto: { titulo: 'Cocina en L', precioTotal: 1234.5 },
    });
    const texto = textoDe(resuelto.paginas[0].elementos[0]);
    expect(texto).toContain('Hola Juan');
    expect(texto).toContain('Cocina en L');
    expect(texto).toMatch(/1234,50\s?€|1\.234,50\s?€/); // formato es-ES, tolerante a variantes de espacio
  });

  it('deja intacta una clave desconocida (no rompe el documento)', () => {
    const doc = documentoConTexto('Valor: {{esto.no.existe}}');
    const resuelto = resolverVariables(doc, {});
    expect(textoDe(resuelto.paginas[0].elementos[0])).toBe('Valor: {{esto.no.existe}}');
  });

  it('deja intacta una variable real si su fuente no está en el contexto', () => {
    const doc = documentoConTexto('Cliente: {{cliente.nombre}}');
    const resuelto = resolverVariables(doc, {}); // sin cliente en el contexto
    expect(textoDe(resuelto.paginas[0].elementos[0])).toBe('Cliente: {{cliente.nombre}}');
  });

  it('resuelve múltiples ocurrencias de la misma variable', () => {
    const doc = documentoConTexto('{{cliente.nombre}} y {{cliente.nombre}} otra vez');
    const resuelto = resolverVariables(doc, { cliente: { nombre: 'Ana' } });
    expect(textoDe(resuelto.paginas[0].elementos[0])).toBe('Ana y Ana otra vez');
  });

  it('no muta el documento original', () => {
    const doc = documentoConTexto('{{cliente.nombre}}');
    const original = structuredClone(doc);
    resolverVariables(doc, { cliente: { nombre: 'Ana' } });
    expect(doc).toEqual(original);
  });

  it('una variable sintética propia también se resuelve correctamente', () => {
    registrarVariable({ clave: 'prueba.sintetica', fuente: 'prueba', etiqueta: 'Prueba', tipoDato: 'texto', resolver: () => 'VALOR-PRUEBA' });
    const doc = documentoConTexto('{{prueba.sintetica}}');
    expect(textoDe(resolverVariables(doc, {}).paginas[0].elementos[0])).toBe('VALOR-PRUEBA');
  });
});
