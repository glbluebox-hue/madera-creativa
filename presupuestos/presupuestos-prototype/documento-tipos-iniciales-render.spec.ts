import { parsearGrosorBorde } from './documento-tipos-iniciales-render.js';

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
