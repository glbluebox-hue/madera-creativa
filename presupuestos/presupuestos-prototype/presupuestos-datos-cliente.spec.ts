import { rellenarLinea, rellenarEtiquetasCliente, crearBloqueDatosCliente, autoRellenarDatosCliente, type DatosClienteAutoRelleno } from './presupuestos-datos-cliente.js';
import { crearDocumentoVacio } from './documento-modelo.js';
import { crearElementoBase, anadirElemento } from './documento-comandos.js';
import type { DocumentoMC } from './documento-modelo.js';

const DATOS: DatosClienteAutoRelleno = {
  nombre: 'Walter Di Zio', direccion: 'Calle Falsa 123', codigoPostal: '38677', poblacion: 'Tijoco Bajo',
  telefono: '+34 642 02 14 68', dni: '12345678A', fecha: '24/08/2026',
};

function docConTexto(texto: string): DocumentoMC {
  let id = 0;
  const doc = crearDocumentoVacio(() => `id-${id++}`);
  const el = crearElementoBase('texto', { x: 0, y: 0 }, { ancho: 100, alto: 20 });
  return anadirElemento(doc, doc.paginas[0].id, { ...el, contenido: { texto } });
}

describe('rellenarLinea (corrección 24/08/2026 — rellenar etiquetas de una plantilla ya diseñada)', () => {
  it('rellena una etiqueta sin nada detrás (Nombre: al final de la línea)', () => {
    const r = rellenarLinea('Nombre:', DATOS);
    expect(r.linea).toBe('Nombre: Walter Di Zio');
    expect(r.huboRelleno).toBe(true);
    expect(r.cubiertos).toEqual(new Set(['nombre']));
  });

  it('rellena una etiqueta con guiones bajos de relleno', () => {
    const r = rellenarLinea('Dirección: ____________________', DATOS);
    expect(r.linea).toBe('Dirección: Calle Falsa 123');
    expect(r.huboRelleno).toBe(true);
    expect(r.cubiertos).toEqual(new Set(['direccion']));
  });

  it('NUNCA toca una etiqueta que ya tiene algo escrito detrás, pero SÍ la cuenta como cubierta', () => {
    const r = rellenarLinea('Nombre: Otro cliente', DATOS);
    expect(r.linea).toBe('Nombre: Otro cliente');
    expect(r.huboRelleno).toBe(false);
    // Cubierta aunque no la hayamos rellenado nosotros — ya tiene un sitio
    // propio (texto manual, o resuelto antes vía {{cliente.nombre}}), así
    // que no debe duplicarse en el bloque de reserva.
    expect(r.cubiertos).toEqual(new Set(['nombre']));
  });

  it('dos etiquetas en la misma línea se rellenan cada una de forma independiente', () => {
    const resultado = rellenarLinea('Teléfono: ______________     CIF/NIF: ______________', DATOS);
    expect(resultado.huboRelleno).toBe(true);
    expect(resultado.linea).toContain('Teléfono: +34 642 02 14 68');
    expect(resultado.linea).toContain('CIF/NIF: 12345678A');
    expect(resultado.cubiertos).toEqual(new Set(['telefono', 'dni']));
  });

  it('si el dato no existe (ej. cliente sin DNI), el hueco se deja tal cual pero la etiqueta sigue contando como cubierta', () => {
    const sinDni: DatosClienteAutoRelleno = { ...DATOS, dni: '' };
    const r = rellenarLinea('DNI/NIE: ____', sinDni);
    expect(r.linea).toBe('DNI/NIE: ____');
    expect(r.huboRelleno).toBe(false);
    expect(r.cubiertos).toEqual(new Set(['dni']));
  });

  it('una línea sin ninguna etiqueta reconocible se devuelve intacta', () => {
    const r = rellenarLinea('Condiciones de pago', DATOS);
    expect(r.linea).toBe('Condiciones de pago');
    expect(r.huboRelleno).toBe(false);
    expect(r.cubiertos.size).toBe(0);
  });

  it('reconoce "Direccion" sin tilde', () => {
    expect(rellenarLinea('Direccion: ___', DATOS).huboRelleno).toBe(true);
  });

  it('rellena Código postal y Población', () => {
    expect(rellenarLinea('Código postal: ___', DATOS).linea).toBe('Código postal: 38677');
    expect(rellenarLinea('Población: ___', DATOS).linea).toBe('Población: Tijoco Bajo');
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
  it('rellena las etiquetas dentro de un elemento de texto multilínea y devuelve qué datos cubrió', () => {
    const doc = docConTexto('CLIENTE\nNombre:\nDirección: ________\nTeléfono: ________     CIF/NIF: ________');
    const { documento, cubiertos } = rellenarEtiquetasCliente(doc, DATOS);
    expect(cubiertos).toEqual(new Set(['nombre', 'direccion', 'telefono', 'dni']));
    const texto = documento.paginas[0].elementos[0].contenido.texto as string;
    expect(texto).toContain('Nombre: Walter Di Zio');
    expect(texto).toContain('Dirección: Calle Falsa 123');
    expect(texto).toContain('Teléfono: +34 642 02 14 68');
    expect(texto).toContain('CIF/NIF: 12345678A');
  });

  it('ensancha la caja de una etiqueta demasiado ajustada para que el valor rellenado no quede invisible (overflow:hidden) — fallo real con captura, 28/10/2026', () => {
    // Caja ajustada SOLO al ancho de "Nombre:" (plantilla corporativa real del usuario).
    const doc = docConTexto('Nombre:');
    const { documento } = rellenarEtiquetasCliente(doc, DATOS);
    const elemento = documento.paginas[0].elementos[0];
    expect(elemento.contenido.texto).toBe('Nombre: Walter Di Zio');
    expect(elemento.tamano.ancho).toBeGreaterThan(100); // la caja original (docConTexto) es de 100
  });

  it('nunca encoge una caja que ya era más grande de lo necesario', () => {
    let id = 0;
    const doc = crearDocumentoVacio(() => `id-${id++}`);
    const el = crearElementoBase('texto', { x: 0, y: 0 }, { ancho: 500, alto: 200 });
    const conTexto = anadirElemento(doc, doc.paginas[0].id, { ...el, contenido: { texto: 'Nombre:' } });
    const { documento } = rellenarEtiquetasCliente(conTexto, DATOS);
    const elemento = documento.paginas[0].elementos[0];
    expect(elemento.tamano.ancho).toBe(500);
    expect(elemento.tamano.alto).toBe(200);
  });

  it('devuelve cubiertos vacío si no hay ninguna etiqueta reconocible en todo el documento', () => {
    const doc = docConTexto('Presupuesto sin ninguna etiqueta de cliente');
    const { cubiertos } = rellenarEtiquetasCliente(doc, DATOS);
    expect(cubiertos.size).toBe(0);
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
    const { cubiertos } = rellenarEtiquetasCliente(doc, DATOS);
    expect(cubiertos.size).toBe(0);
  });
});

describe('crearBloqueDatosCliente (corrección 28/10/2026 — solo los datos pendientes)', () => {
  it('devuelve null si no hay ningún dato pendiente', () => {
    expect(crearBloqueDatosCliente(DATOS, new Set())).toBeNull();
  });

  it('incluye solo los datos marcados como pendientes, nunca los ya cubiertos por la plantilla', () => {
    const bloque = crearBloqueDatosCliente(DATOS, new Set(['codigoPostal', 'poblacion', 'fecha']));
    const texto = bloque!.contenido.texto as string;
    expect(texto).toContain('38677 Tijoco Bajo');
    expect(texto).toContain('Fecha: 24/08/2026');
    expect(texto).not.toContain('Walter Di Zio');
    expect(texto).not.toContain('Calle Falsa 123');
  });
});

describe('autoRellenarDatosCliente', () => {
  it('si la plantilla cubre TODOS los datos con valor real, no añade ningún bloque de reserva', () => {
    const doc = docConTexto('Nombre:\nDirección: ___\nCódigo postal: ___\nPoblación: ___\nTeléfono: ___\nDNI: ___\nFecha: ___');
    const resultado = autoRellenarDatosCliente(doc, DATOS);
    expect(resultado.paginas[0].elementos).toHaveLength(1); // sigue habiendo solo el elemento original, ninguno nuevo
    expect(resultado.paginas[0].elementos[0].contenido.texto).toContain('Nombre: Walter Di Zio');
  });

  it('si la plantilla solo cubre ALGUNOS datos, añade un bloque de reserva con SOLO los que faltan (fallo real, 28/10/2026)', () => {
    // Plantilla propia del usuario: tiene Nombre/Dirección/Teléfono, pero nunca Código postal/Población/Fecha.
    const doc = docConTexto('Nombre:\nDirección: ___\nTeléfono: ___');
    const resultado = autoRellenarDatosCliente(doc, DATOS);
    expect(resultado.paginas[0].elementos).toHaveLength(2); // el original + el bloque de reserva con lo pendiente
    const original = resultado.paginas[0].elementos[0].contenido.texto as string;
    const bloque = resultado.paginas[0].elementos[1].contenido.texto as string;
    expect(original).toContain('Nombre: Walter Di Zio');
    expect(original).toContain('Dirección: Calle Falsa 123');
    expect(original).toContain('Teléfono: +34 642 02 14 68');
    // Lo que la plantilla no cubría aparece en el bloque de reserva, sin repetir lo que ya estaba.
    expect(bloque).toContain('38677 Tijoco Bajo');
    expect(bloque).toContain('Fecha: 24/08/2026');
    expect(bloque).not.toContain('Walter Di Zio');
  });

  it('una etiqueta ya resuelta vía {{variable}} (con contenido real, no un hueco) cuenta como cubierta y no se duplica', () => {
    // Simula una plantilla con "Dirección: {{cliente.direccion}}" YA resuelto por resolverVariables
    // antes de llegar aquí — la etiqueta existe pero su hueco ya no está vacío.
    const doc = docConTexto('Nombre: Walter Di Zio\nDirección: Calle Falsa 123');
    const resultado = autoRellenarDatosCliente(doc, DATOS);
    expect(resultado.paginas[0].elementos).toHaveLength(2); // sigue faltando CP/población/telefono/dni/fecha
    const bloque = resultado.paginas[0].elementos[1].contenido.texto as string;
    expect(bloque).not.toContain('Walter Di Zio'); // nombre ya cubierto, no se repite
    expect(bloque).not.toContain('Calle Falsa 123'); // dirección ya cubierta, no se repite
    expect(bloque).toContain('38677 Tijoco Bajo');
  });

  it('si NO encuentra ninguna etiqueta, añade el bloque de reserva completo como elemento nuevo', () => {
    const doc = docConTexto('Presupuesto sin etiquetas de cliente');
    const resultado = autoRellenarDatosCliente(doc, DATOS);
    expect(resultado.paginas[0].elementos).toHaveLength(2); // el original + el bloque de reserva
    const bloque = resultado.paginas[0].elementos[1];
    expect(bloque.contenido.texto).toContain('Walter Di Zio');
  });
});
