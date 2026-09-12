import { esquemaFactura } from './esquemas-validacion.js';

const base = { id: 'f1', tipo: 'gasto', fecha: '2026-01-01', importe: 146.61, creado: '2026-01-01T00:00:00.000Z' };

describe('esquemaFactura — lineasFiscales (desglose fiscal por tramos, 12/09/2026)', () => {
  it('acepta el caso real del usuario: dos tramos de IGIC (3% y 7%)', () => {
    const r = esquemaFactura.safeParse({
      ...base,
      lineasFiscales: [
        { id: 'l1', tipo: 'igic', porcentaje: 3, baseImponible: 25.08, cuota: 0.75 },
        { id: 'l2', tipo: 'igic', porcentaje: 7, baseImponible: 112.88, cuota: 7.90 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('acepta una única línea (factura de un solo tramo, el caso de siempre)', () => {
    const r = esquemaFactura.safeParse({ ...base, lineasFiscales: [{ id: 'l1', tipo: 'iva', porcentaje: 21, baseImponible: 100, cuota: 21 }] });
    expect(r.success).toBe(true);
  });

  it('rechaza un tipo de línea fuera del enum cerrado', () => {
    const r = esquemaFactura.safeParse({ ...base, lineasFiscales: [{ id: 'l1', tipo: 'irpf', porcentaje: 3, baseImponible: 1, cuota: 1 }] });
    expect(r.success).toBe(false);
  });

  it('rechaza una línea sin base o sin cuota', () => {
    expect(esquemaFactura.safeParse({ ...base, lineasFiscales: [{ id: 'l1', tipo: 'igic', porcentaje: 3 }] }).success).toBe(false);
  });

  it('ausente sigue siendo válido, sin default — compatibilidad total con facturas de un único tramo ya existentes', () => {
    const r = esquemaFactura.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.lineasFiscales).toBeUndefined();
  });

  it('un array vacío es válido (factura sin desglose todavía)', () => {
    expect(esquemaFactura.safeParse({ ...base, lineasFiscales: [] }).success).toBe(true);
  });
});
