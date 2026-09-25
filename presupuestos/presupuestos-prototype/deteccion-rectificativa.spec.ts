import { detectarPosibleRectificativa } from './deteccion-rectificativa.js';

describe('detectarPosibleRectificativa — solo sugiere, nunca decide', () => {
  it('sin evidencias: no sugiere nada', () => {
    const r = detectarPosibleRectificativa({ concepto: 'Compra de tornillería', numeroFactura: 'F-2026-001' });
    expect(r.sugerido).toBe(false);
    expect(r.evidencias).toEqual([]);
  });

  it('detecta "factura rectificativa" en el concepto', () => {
    const r = detectarPosibleRectificativa({ concepto: 'Factura rectificativa de la F-2026-014' });
    expect(r.sugerido).toBe(true);
    expect(r.confianza).toBe('media');
    expect(r.evidencias.some((e) => e.tipo === 'palabra_clave' && e.detalle === 'factura rectificativa')).toBe(true);
  });

  it('detecta "abono" con tildes/mayúsculas distintas', () => {
    const r = detectarPosibleRectificativa({ concepto: 'ABONO por devolución de mercancía' });
    expect(r.sugerido).toBe(true);
    expect(r.evidencias.some((e) => e.tipo === 'palabra_clave' && e.detalle === 'abono')).toBe(true);
    expect(r.evidencias.some((e) => e.tipo === 'palabra_clave' && e.detalle === 'devolución')).toBe(true);
  });

  it('detecta "nota de crédito" sin acento también', () => {
    const r = detectarPosibleRectificativa({ concepto: 'nota de credito adjunta' });
    expect(r.sugerido).toBe(true);
    expect(r.evidencias.some((e) => e.tipo === 'palabra_clave' && e.detalle === 'nota de crédito')).toBe(true);
  });

  it('un importe negativo extraído del documento es evidencia, pero con confianza baja si no hay palabra clave', () => {
    const r = detectarPosibleRectificativa({ concepto: 'Ajuste de precio', importeExtraido: -150 });
    expect(r.sugerido).toBe(true);
    expect(r.confianza).toBe('baja');
    expect(r.evidencias).toEqual([{ tipo: 'importe_negativo', detalle: '-150' }]);
  });

  it('un importe positivo nunca es evidencia', () => {
    const r = detectarPosibleRectificativa({ concepto: 'Compra normal', importeExtraido: 150 });
    expect(r.sugerido).toBe(false);
  });

  it('palabra clave + importe negativo: confianza media (gana la palabra clave)', () => {
    const r = detectarPosibleRectificativa({ concepto: 'Abono parcial', importeExtraido: -50 });
    expect(r.confianza).toBe('media');
    expect(r.evidencias.length).toBe(2);
  });

  it('sin concepto ni número de factura: no revienta, simplemente no sugiere', () => {
    const r = detectarPosibleRectificativa({});
    expect(r.sugerido).toBe(false);
  });

  it('"factura original" en el concepto también es evidencia (referencia a la factura que corrige)', () => {
    const r = detectarPosibleRectificativa({ concepto: 'Corrige factura original F-2026-009' });
    expect(r.sugerido).toBe(true);
  });
});
