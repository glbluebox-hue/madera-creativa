import { calcularImpuestosPorTipo, estadoDeducibleIrpf, estadoIvaIgicDeducible, gastoDeducible, cuotaDeducible, agregarLineasFiscales, validarLineasFiscales, type LineaFiscal } from './motor-fiscal.js';

describe('calcularImpuestosPorTipo (backend, mismo criterio que el frontend)', () => {
  it('IVA repercutido / soportado', () => {
    const r = calcularImpuestosPorTipo([
      { tipo: 'ingreso', tipoImpuesto: 'iva', importeImpuesto: 420 },
      { tipo: 'gasto', tipoImpuesto: 'iva', importeImpuesto: 210 },
    ]);
    expect(r.ivaRepercutido).toBe(420);
    expect(r.ivaSoportado).toBe(210);
  });

  it('IGIC repercutido / soportado', () => {
    const r = calcularImpuestosPorTipo([
      { tipo: 'ingreso', tipoImpuesto: 'igic', importeImpuesto: 140 },
      { tipo: 'gasto', tipoImpuesto: 'igic', importeImpuesto: 70 },
    ]);
    expect(r.igicRepercutido).toBe(140);
    expect(r.igicSoportado).toBe(70);
  });

  it('CASO FUNDAMENTAL: factura de gasto con IVA real de Península nunca se convierte en IGIC (empresa Canarias+REPEP no influye — la función no recibe región)', () => {
    const r = calcularImpuestosPorTipo([
      { tipo: 'gasto', tipoImpuesto: 'iva', baseImponible: 13310.74, porcentajeImpuesto: 21, importeImpuesto: 2794.26 },
    ]);
    expect(r.ivaSoportado).toBeCloseTo(2794.26, 2);
    expect(r.igicSoportado).toBe(0);
  });

  it('exento y sin_impuesto no aportan cuota a ningún contador', () => {
    const r = calcularImpuestosPorTipo([
      { tipo: 'ingreso', tipoImpuesto: 'exento' },
      { tipo: 'gasto', tipoImpuesto: 'sin_impuesto' },
    ]);
    expect(r).toEqual({
      ivaRepercutido: 0, ivaSoportado: 0, igicRepercutido: 0, igicSoportado: 0,
      noIdentificado: { repercutido: 0, soportado: 0, numFacturas: 0 }, noCalculable: { numFacturas: 0 },
    });
  });

  it('tipoImpuesto vacío con cuota real → "no identificado", nunca IVA/IGIC', () => {
    const r = calcularImpuestosPorTipo([{ tipo: 'gasto', tipoImpuesto: '', baseImponible: 1000, importeImpuesto: 70 }]);
    expect(r.igicSoportado).toBe(0);
    expect(r.ivaSoportado).toBe(0);
    expect(r.noIdentificado.soportado).toBe(70);
    expect(r.noIdentificado.numFacturas).toBe(1);
  });

  it('sin ningún dato de impuesto → no entra en ningún contador', () => {
    const r = calcularImpuestosPorTipo([{ tipo: 'gasto' }]);
    expect(r.noIdentificado.numFacturas).toBe(0);
    expect(r.noCalculable.numFacturas).toBe(0);
  });

  it('CASO NUEVO: tipoImpuesto real pero sin cuota calculable → NO se interpreta como 0€, se cuenta en noCalculable', () => {
    const r = calcularImpuestosPorTipo([
      { tipo: 'gasto', tipoImpuesto: 'iva' },
      { tipo: 'ingreso', tipoImpuesto: 'igic', porcentajeImpuesto: 7 },
    ]);
    expect(r.ivaSoportado).toBe(0);
    expect(r.igicRepercutido).toBe(0);
    expect(r.noCalculable.numFacturas).toBe(2);
  });

  it('impuesto real de 0€ SÍ cuenta como iva/igic (con cuota 0), distinto de "no calculable"', () => {
    const r = calcularImpuestosPorTipo([{ tipo: 'ingreso', tipoImpuesto: 'iva', importeImpuesto: 0 }]);
    expect(r.ivaRepercutido).toBe(0);
    expect(r.noCalculable.numFacturas).toBe(0);
  });
});

describe('Tratamiento fiscal (backend, Fase 3A) — mismo criterio que el frontend, sin reglas nuevas', () => {
  it('gasto sin decisión → por_revisar; gastoDeducible → null, nunca 0€', () => {
    const f = { tipo: 'gasto' as const, importe: 1000, baseImponible: 1000 };
    expect(estadoDeducibleIrpf(f)).toBe('por_revisar');
    expect(gastoDeducible(f)).toBe(null);
  });

  for (const porcentaje of [0, 50, 100]) {
    it(`gasto con deducibleIrpf=${porcentaje} → estado y euros deducibles correctos`, () => {
      const f = { tipo: 'gasto' as const, importe: 1000, baseImponible: 1000, deducibleIrpf: porcentaje };
      expect(estadoDeducibleIrpf(f)).toBe(porcentaje);
      expect(gastoDeducible(f)).toBeCloseTo(1000 * porcentaje / 100, 6);
    });

    it(`IVA soportado con ivaIgicDeducible=${porcentaje} → cuota deducible correcta, cuota real sin tocar`, () => {
      const f = { tipo: 'gasto' as const, tipoImpuesto: 'iva' as const, importe: 16105, baseImponible: 13310.74, importeImpuesto: 2794.26, ivaIgicDeducible: porcentaje };
      expect(estadoIvaIgicDeducible(f)).toBe(porcentaje);
      expect(cuotaDeducible(f)).toBeCloseTo(2794.26 * porcentaje / 100, 2);
      expect(f.importeImpuesto).toBe(2794.26);
    });
  }

  it('ingreso → siempre no_aplica en ambos estados', () => {
    expect(estadoDeducibleIrpf({ tipo: 'ingreso', deducibleIrpf: 100 })).toBe('no_aplica');
    expect(estadoIvaIgicDeducible({ tipo: 'ingreso', tipoImpuesto: 'iva', importeImpuesto: 420 })).toBe('no_aplica');
  });

  it('exento/sin_impuesto/tipo no identificado y cuota no calculable → no_aplica, nunca una deducción falsa', () => {
    expect(estadoIvaIgicDeducible({ tipo: 'gasto', tipoImpuesto: 'exento' })).toBe('no_aplica');
    expect(estadoIvaIgicDeducible({ tipo: 'gasto', tipoImpuesto: 'sin_impuesto' })).toBe('no_aplica');
    expect(estadoIvaIgicDeducible({ tipo: 'gasto', tipoImpuesto: '' })).toBe('no_aplica');
    const sinCuota = { tipo: 'gasto' as const, tipoImpuesto: 'iva' as const };
    expect(estadoIvaIgicDeducible(sinCuota)).toBe('no_aplica');
    expect(cuotaDeducible(sinCuota)).toBe(null);
  });

  it('factura histórica sin los campos nuevos se comporta igual que una sin decidir', () => {
    expect(estadoDeducibleIrpf({ tipo: 'gasto' })).toBe('por_revisar');
  });
});

// Caso real reportado por el usuario (12/09/2026), verificado también en backend:
// factura de 146,61€ con dos tramos de IGIC — 25,08€ al 3% (cuota 0,75€) y
// 112,88€ al 7% (cuota 7,90€).
const LINEA_3: LineaFiscal = { id: 'l1', tipo: 'igic', porcentaje: 3, baseImponible: 25.08, cuota: 0.75 };
const LINEA_7: LineaFiscal = { id: 'l2', tipo: 'igic', porcentaje: 7, baseImponible: 112.88, cuota: 7.90 };

describe('agregarLineasFiscales (backend) — Fase desglose fiscal por tramos (12/09/2026)', () => {
  it('caso real del usuario: 137,96€ de base y 8,65€ de IGIC', () => {
    const r = agregarLineasFiscales([LINEA_3, LINEA_7]);
    expect(r.baseImponible).toBeCloseTo(137.96);
    expect(r.importeImpuesto).toBeCloseTo(8.65);
  });

  it('sin líneas → 0, nunca NaN', () => {
    expect(agregarLineasFiscales([])).toEqual({ baseImponible: 0, importeImpuesto: 0 });
  });
});

describe('validarLineasFiscales (backend) — Fase desglose fiscal por tramos (12/09/2026)', () => {
  it('el caso real completo (dos tramos) cuadra con el total de la factura', () => {
    expect(validarLineasFiscales([LINEA_3, LINEA_7], 146.61).valido).toBe(true);
  });

  it('el bug real reportado — solo se detecta el primer tramo — se marca como inválido', () => {
    const r = validarLineasFiscales([LINEA_3], 146.61);
    expect(r.valido).toBe(false);
  });

  it('mezclar IVA e IGIC en la misma factura se rechaza siempre', () => {
    const r = validarLineasFiscales(
      [{ id: 'a', tipo: 'iva', porcentaje: 21, baseImponible: 100, cuota: 21 }, LINEA_7],
      100 + 21 + 112.88 + 7.90
    );
    expect(r.valido).toBe(false);
  });
});
