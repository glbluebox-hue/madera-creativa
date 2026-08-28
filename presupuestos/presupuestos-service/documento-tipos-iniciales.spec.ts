import { definicionesTiposIniciales } from './documento-tipos-iniciales.js';

/**
 * Negrita/cursiva/subrayado por selección dentro de una caja de texto
 * (pedido real, 28/08/2026) — el guardián del lado servidor
 * (`sanitizarHtmlTextoEnriquecido`, dentro de `documento-tipos-iniciales.ts`)
 * es la defensa que de verdad importa: un cliente podría llamar a la API
 * directamente saltándose el saneado del navegador, y este contenido
 * puede acabar renderizado en el Portal del cliente, sin sesión.
 */

const tipoTexto = definicionesTiposIniciales.find((t) => t.tipo === 'texto')!;

function parseContenido(contenido: Record<string, unknown>) {
  return tipoTexto.esquemaContenido.parse(contenido) as { texto: string; textoHtml?: string };
}

describe('tipo "texto" — textoHtml (Zod + saneado del servidor)', () => {
  it('acepta un elemento sin textoHtml (compatibilidad con documentos antiguos)', () => {
    const r = parseContenido({ texto: 'hola' });
    expect(r.texto).toBe('hola');
    expect(r.textoHtml).toBeUndefined();
  });

  it('conserva las etiquetas de formato permitidas (negrita/cursiva/subrayado/salto de línea)', () => {
    const r = parseContenido({ texto: 'hola mundo', textoHtml: 'hola <b>mundo</b><br><i>cursiva</i> <u>subrayado</u>' });
    expect(r.textoHtml).toBe('hola <b>mundo</b><br><i>cursiva</i> <u>subrayado</u>');
  });

  it('normaliza variantes de <br> a una forma consistente', () => {
    const r = parseContenido({ texto: 'a', textoHtml: 'a<br/>b<br />c' });
    expect(r.textoHtml).toBe('a<br/>b<br/>c');
  });

  it('elimina por completo una etiqueta peligrosa, conservando el texto visible', () => {
    const r = parseContenido({ texto: 'hola', textoHtml: '<script>alert(1)</script>hola <b onclick="robar()">mundo</b>' });
    expect(r.textoHtml).not.toMatch(/<script/i);
    expect(r.textoHtml).not.toMatch(/onclick/i);
    expect(r.textoHtml).not.toMatch(/on\w+=/i); // ningún atributo de evento, en ninguna forma
    expect(r.textoHtml).toContain('hola');
    expect(r.textoHtml).toContain('mundo');
  });

  it('nunca deja pasar un atributo, ni siquiera en una etiqueta permitida', () => {
    const r = parseContenido({ texto: 'x', textoHtml: '<b style="background:url(javascript:alert(1))">x</b>' });
    expect(r.textoHtml).not.toMatch(/style=/i);
    expect(r.textoHtml).not.toMatch(/javascript:/i);
  });

  it('no permite colar una etiqueta peligrosa disfrazada de <br> con atributos', () => {
    const r = parseContenido({ texto: 'x', textoHtml: '<br onmouseover="alert(1)">' });
    expect(r.textoHtml).not.toMatch(/onmouseover/i);
    expect(r.textoHtml).toBe(''); // la etiqueta entera se descarta al no coincidir EXACTAMENTE con la forma permitida
  });

  it('elimina etiquetas de estructura (div/p/span) conservando su texto', () => {
    const r = parseContenido({ texto: 'x', textoHtml: '<div><p><span>hola</span></p></div>' });
    expect(r.textoHtml).toBe('hola');
  });

  it('rechaza un textoHtml que exceda el límite de tamaño', () => {
    expect(() => parseContenido({ texto: 'x', textoHtml: 'a'.repeat(20001) })).toThrow();
  });
});
