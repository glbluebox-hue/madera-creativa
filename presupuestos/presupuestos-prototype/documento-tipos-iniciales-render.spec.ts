import { parsearGrosorBorde, sanitizarHtmlTexto } from './documento-tipos-iniciales-render.js';

describe('parsearGrosorBorde (corrección del campo "Grosor de borde", 24/08/2026)', () => {
  it('un número válido se interpreta correctamente', () => {
    expect(parsearGrosorBorde('5')).toBe(5);
  });

  it('0 sigue siendo un valor válido explícito (representa "sin borde")', () => {
    expect(parsearGrosorBorde('0')).toBe(0);
  });

  it('el texto vacío no es válido — no debe forzar ningún valor mientras se edita', () => {
    expect(parsearGrosorBorde('')).toBeNull();
  });

  it('espacios en blanco tampoco son válidos', () => {
    expect(parsearGrosorBorde('   ')).toBeNull();
  });

  it('un número negativo no es válido', () => {
    expect(parsearGrosorBorde('-1')).toBeNull();
  });

  it('texto no numérico no es válido', () => {
    expect(parsearGrosorBorde('abc')).toBeNull();
  });

  it('acepta valores decimales', () => {
    expect(parsearGrosorBorde('2.5')).toBe(2.5);
  });

  it('un "-" suelto (mientras se escribe un negativo) no es válido todavía', () => {
    expect(parsearGrosorBorde('-')).toBeNull();
  });
});

describe('sanitizarHtmlTexto (saneado de texto pegado desde fuera, bug real 20/10/2026)', () => {
  it('conserva el texto y el formato permitido (negrita/cursiva/subrayado)', () => {
    expect(sanitizarHtmlTexto('<b>Hola</b> <i>mundo</i> <u>test</u>')).toBe('<b>Hola</b> <i>mundo</i> <u>test</u>');
  });

  it('desenvuelve estructura de bloque anidada (párrafos/divs/spans con estilo, típico de Word/webs) conservando el texto', () => {
    const pegadoWord = '<div><p><span style="font-family:Calibri"><o:p>Hola</o:p></span> mundo</p></div>';
    const resultado = sanitizarHtmlTexto(pegadoWord);
    expect(resultado).toBe('Hola mundo');
  });

  it('quita cualquier atributo (incluidos style/onerror) de las etiquetas que sí se conservan', () => {
    const conAtributos = '<b style="color:red" onclick="alert(1)">fuerte</b>';
    expect(sanitizarHtmlTexto(conAtributos)).toBe('<b>fuerte</b>');
  });

  it('un salto de línea <br> se conserva', () => {
    expect(sanitizarHtmlTexto('línea1<br>línea2')).toBe('línea1<br>línea2');
  });
});
