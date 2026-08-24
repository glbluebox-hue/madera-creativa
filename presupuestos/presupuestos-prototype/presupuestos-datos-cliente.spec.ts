import { rellenarLinea, rellenarEtiquetasCliente, autoRellenarDatosCliente, type DatosClienteAutoRelleno } from './presupuestos-datos-cliente.js';
import { crearDocumentoVacio } from './documento-modelo.js';
import { crearElementoBase, anadirElemento } from './documento-comandos.js';
import type { DocumentoMC } from './documento-modelo.js';

const DATOS: DatosClienteAutoRelleno = {
  nombre: 'Walter Di Zio', direccion: 'Calle Falsa 123', telefono: '+34 642 02 14 68', dni: '12345678A', fecha: '24/08/2026',
};

function docConTexto(texto: string): DocumentoMC {
  let id = 0;
  const doc = crearDocumentoVacio(() => `id-${id++}`);
  const el = crearElementoBase('texto', { x: 0, y: 0 }, { ancho: 100, alto: 20 });
  return anadirElemento(doc, doc.paginas[0].id, { ...el, contenido: { texto } });
}

describe('rellenarLinea (corrección 24/08/2026 — rellenar etiquetas de una plantilla ya diseñada)', () => {
  it('rellena una etiqueta sin nada detrás (Nombre: al final de la línea)', () => {
    expect(rellenarLinea('Nombre:', DATOS)).toEqual({ linea: 'Nombre: Walter Di Zio', huboRelleno: true });
  });

  it('rellena una etiqueta con guiones bajos de relleno', () => {
    expect(rellenarLinea('Dirección: ____________________', DATOS)).toEqual({ linea: 'Dirección: Calle Falsa 123', huboRelleno: true });
  });

  it('NUNCA toca una etiqueta que ya tiene algo escrito detrás', () => {
    expect(rellenarLinea('Nombre: Otro cliente', DATOS)).toEqual({ linea: 'Nombre: Otro cliente', huboRelleno: false });
  });

  it('dos etiquetas en la misma línea se rellenan cada una de forma independiente', () => {
    const resultado = rellenarLinea('Teléfono: ______________     CIF/NIF: ______________', DATOS);
    expect(resultado.huboRelleno).toBe(true);
    expect(resultado.linea).toContain('Teléfono: +34 642 02 14 68');
    expect(resultado.linea).toContain('CIF/NIF: 12345678A');
  });

  it('si el dato no existe (ej. cliente sin DNI), el hueco se deja tal cual', () => {
    const sinDni: DatosClienteAutoRelleno = { ...DATOS, dni: '' };
    expect(rellenarLinea('DNI/NIE: ____', sinDni)).toEqual({ linea: 'DNI/NIE: ____', huboRelleno: false });
  });

  it('una línea sin ninguna etiqueta reconocible se devuelve intacta', () => {
    expect(rellenarLinea('Condiciones de pago', DATOS)).toEqual({ linea: 'Condiciones de pago', huboRelleno: false });
  });

  it('reconoce "Direccion" sin tilde', () => {
    expect(rellenarLinea('Direccion: ___', DATOS).huboRelleno).toBe(true);
  });

  it('reconoce variantes del documento de identidad: NIF, DNI, NIE, DNI/NIE', () => {
    expect(rellenarLinea('NIF: ___', DATOS).linea).toBe('NIF: 12345678A');
    expect(rellenarLinea('DNI: ___', DATOS).linea).toBe('DNI: 12345678A');
    expect(rellenarLinea('NIE: ___', DATOS).linea).toBe('NIE: 12345678A');
    expect(rellenarLinea('DNI/NIE: ___', DATOS).linea).toBe('DNI/NIE: 12345678A');
  });

  it('rellena la etiqueta Fecha', () => {
    expect(rellenarLinea('Fecha: ___', DATOS).linea).toBe('Fecha: 24/08/2026');
  });
});

describe('rellenarEtiquetasCliente', () => {
  it('rellena las etiquetas dentro de un elemento de texto multilínea', () => {
    const doc = docConTexto('CLIENTE\nNombre:\nDirección: ________\nTeléfono: ________     CIF/NIF: ________');
    const { documento, rellenoAlgo } = rellenarEtiquetasCliente(doc, DATOS);
    expect(rellenoAlgo).toBe(true);
    const texto = documento.paginas[0].elementos[0].contenido.texto as string;
    expect(texto).toContain('Nombre: Walter Di Zio');
    expect(texto).toContain('Dirección: Calle Falsa 123');
    expect(texto).toContain('Teléfono: +34 642 02 14 68');
    expect(texto).toContain('CIF/NIF: 12345678A');
  });

  it('devuelve rellenoAlgo=false si no hay ninguna etiqueta reconocible en todo el documento', () => {
    const doc = docConTexto('Presupuesto sin ninguna etiqueta de cliente');
    const { rellenoAlgo } = rellenarEtiquetasCliente(doc, DATOS);
    expect(rellenoAlgo).toBe(false);
  });

  it('nunca muta el documento original', () => {
    const doc = docConTexto('Nombre:');
    const original = structuredClone(doc);
    rellenarEtiquetasCliente(doc, DATOS);
    expect(doc).toEqual(original);
  });

  it('no toca elementos que no son de texto', () => {
    let id = 0;
    const base = crearDocumentoVacio(() => `id-${id++}`);
    const rect = crearElementoBase('rectangulo', { x: 0, y: 0 }, { ancho: 10, alto: 10 });
    const doc = anadirElemento(base, base.paginas[0].id, { ...rect, contenido: { texto: 'Nombre:' } as unknown as Record<string, unknown> });
    const { rellenoAlgo } = rellenarEtiquetasCliente(doc, DATOS);
    expect(rellenoAlgo).toBe(false);
  });
});

describe('autoRellenarDatosCliente', () => {
  it('si encuentra etiquetas, las rellena y NO añade el bloque de reserva', () => {
    const doc = docConTexto('Nombre:\nDirección: ___');
    const resultado = autoRellenarDatosCliente(doc, DATOS);
    expect(resultado.paginas[0].elementos).toHaveLength(1); // sigue habiendo solo el elemento original, ninguno nuevo
    expect(resultado.paginas[0].elementos[0].contenido.texto).toContain('Nombre: Walter Di Zio');
  });

  it('si NO encuentra ninguna etiqueta, añade el bloque de reserva como elemento nuevo', () => {
    const doc = docConTexto('Presupuesto sin etiquetas de cliente');
    const resultado = autoRellenarDatosCliente(doc, DATOS);
    expect(resultado.paginas[0].elementos).toHaveLength(2); // el original + el bloque de reserva
    const bloque = resultado.paginas[0].elementos[1];
    expect(bloque.contenido.texto).toContain('Walter Di Zio');
  });
});
