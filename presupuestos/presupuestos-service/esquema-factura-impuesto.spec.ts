import { esquemaFactura } from './esquemas-validacion.js';

const base = { id: 'f1', tipo: 'ingreso' as const, fecha: '2026-01-01', importe: 100, creado: '2026-01-01T00:00:00.000Z' };

describe('esquemaFactura — validación del enum tipoImpuesto (subfase "Agregación trimestral IVA/IGIC")', () => {
  it('iva es válido', () => {
    expect(esquemaFactura.safeParse({ ...base, tipoImpuesto: 'iva' }).success).toBe(true);
  });

  it('igic es válido', () => {
    expect(esquemaFactura.safeParse({ ...base, tipoImpuesto: 'igic' }).success).toBe(true);
  });

  it('exento es válido', () => {
    expect(esquemaFactura.safeParse({ ...base, tipoImpuesto: 'exento' }).success).toBe(true);
  });

  it('sin_impuesto es válido', () => {
    expect(esquemaFactura.safeParse({ ...base, tipoImpuesto: 'sin_impuesto' }).success).toBe(true);
  });

  it("'' es válido — estado \"sin especificar\", el de la mayoría de facturas históricas", () => {
    expect(esquemaFactura.safeParse({ ...base, tipoImpuesto: '' }).success).toBe(true);
  });

  it('ausente (campo no enviado) es válido — usa el default \'\'', () => {
    const r = esquemaFactura.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tipoImpuesto).toBe('');
  });

  it('cualquier otro valor se rechaza', () => {
    expect(esquemaFactura.safeParse({ ...base, tipoImpuesto: 'igicc' }).success).toBe(false);
    expect(esquemaFactura.safeParse({ ...base, tipoImpuesto: 'IVA' }).success).toBe(false);
    expect(esquemaFactura.safeParse({ ...base, tipoImpuesto: 'no_identificado' }).success).toBe(false);
    expect(esquemaFactura.safeParse({ ...base, tipoImpuesto: 0 }).success).toBe(false);
  });
});
