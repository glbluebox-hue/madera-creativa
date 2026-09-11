import {
  TIPO_IRPF, TIPO_GENERAL_POR_REGION, TIPO_MODELO,
  trimestreDeFecha, calculaIndirecto, tipoGeneralDeRegion, impuestoDeFactura, calcularTrimestres,
  sugerirTipoImpuesto, clasificarImpuestoFactura, cuotaRealDeFactura, calcularImpuestosPorTipo,
  estadoDeducibleIrpf, estadoIvaIgicDeducible, gastoDeducible, cuotaDeducible,
} from './motor-fiscal.js';
import type { Factura, GastoPeriodico } from './types.js';

const factura = (over: Partial<Factura>): Factura => ({
  id: 'f1', tipo: 'ingreso', fecha: '2026-01-15', concepto: '', importe: 0,
  proveedor: '', clienteId: '', creado: '2026-01-15', ...over,
});

describe('tipoGeneralDeRegion / TIPO_GENERAL_POR_REGION (extracción, mismos tipos que antes)', () => {
  it('Canarias → 7%', () => {
    expect(tipoGeneralDeRegion('canarias')).toBe(0.07);
    expect(TIPO_GENERAL_POR_REGION.canarias).toBe(0.07);
  });

  it('Península → 21%', () => {
    expect(tipoGeneralDeRegion('peninsula')).toBe(0.21);
    expect(TIPO_GENERAL_POR_REGION.peninsula).toBe(0.21);
  });

  it('región vacía → 0 (sin estimación)', () => {
    expect(tipoGeneralDeRegion('')).toBe(0);
  });
});

describe('sugerirTipoImpuesto (solo un valor por defecto, nunca una sobrescritura)', () => {
  it('Canarias → sugiere IGIC', () => {
    expect(sugerirTipoImpuesto('canarias')).toBe('igic');
  });

  it('Península → sugiere IVA', () => {
    expect(sugerirTipoImpuesto('peninsula')).toBe('iva');
  });

  it('región vacía → sin sugerencia', () => {
    expect(sugerirTipoImpuesto('')).toBe(null);
  });
});

describe('calculaIndirecto (REPEP)', () => {
  it('Canarias + REPEP activo → impuesto indirecto desactivado', () => {
    expect(calculaIndirecto('canarias', true)).toBe(false);
  });

  it('Canarias sin REPEP → impuesto indirecto activado', () => {
    expect(calculaIndirecto('canarias', false)).toBe(true);
  });

  it('Península + REPEP (no aplica, pero no debe desactivar) → activado', () => {
    expect(calculaIndirecto('peninsula', true)).toBe(true);
  });

  it('regionFiscal vacío → impuesto indirecto desactivado', () => {
    expect(calculaIndirecto('', false)).toBe(false);
    expect(calculaIndirecto('', true)).toBe(false);
  });
});

describe('impuestoDeFactura', () => {
  it('impuesto real informado (importeImpuesto numérico) → se usa tal cual, sin estimar', () => {
    const f = factura({ importe: 1070, importeImpuesto: 70 });
    expect(impuestoDeFactura(f, true, 0.21)).toBe(70);
    // Incluso si el indirecto estuviera desactivado, un importe real informado se respeta.
    expect(impuestoDeFactura(f, false, 0.21)).toBe(70);
  });

  it('IVA real de una factura de Península se conserva aunque la empresa sea Canarias + REPEP (no se convierte en IGIC)', () => {
    // Caso fundamental del diseño de Fase 2: reparación de vehículo en Península con empresa
    // Canarias+REPEP. El indirecto de la EMPRESA está desactivado (calculaIndirecto=false),
    // pero como la factura trae su propio importeImpuesto (IVA real), se devuelve sin tocar.
    const f = factura({ tipo: 'gasto', importe: 12100, baseImponible: 10000, tipoImpuesto: 'iva', porcentajeImpuesto: 21, importeImpuesto: 2100 });
    expect(impuestoDeFactura(f, /* calculaIndirecto('canarias', true) = */ false, 0)).toBe(2100);
  });

  it('sin impuesto real y estimación desactivada → 0', () => {
    const f = factura({ importe: 1000 });
    expect(impuestoDeFactura(f, false, 0.21)).toBe(0);
  });

  it('estimación existente cuando no existe impuesto real: extrae el tipo general del importe total', () => {
    const f = factura({ importe: 1210 }); // 1000 base + 21% = 1210
    expect(impuestoDeFactura(f, true, 0.21)).toBeCloseTo(210, 6);
  });
});

describe('trimestreDeFecha — corrección de zona horaria (usa desdeFechaISO, fecha local, no UTC)', () => {
  it('primer día de cada trimestre', () => {
    expect(trimestreDeFecha('2026-01-01')).toBe(0);
    expect(trimestreDeFecha('2026-04-01')).toBe(1);
    expect(trimestreDeFecha('2026-07-01')).toBe(2);
    expect(trimestreDeFecha('2026-10-01')).toBe(3);
  });

  it('límites de trimestre: último día de marzo sigue en Q1, primer día de abril ya es Q2', () => {
    expect(trimestreDeFecha('2026-03-31')).toBe(0);
    expect(trimestreDeFecha('2026-04-01')).toBe(1);
  });

  it('límites de año: 31 de diciembre es Q4, 1 de enero del año siguiente es Q1 (sin desplazarse de día por UTC)', () => {
    expect(trimestreDeFecha('2026-12-31')).toBe(3);
    expect(trimestreDeFecha('2027-01-01')).toBe(0);
  });

  it('caso de zona horaria: con new Date(iso) a secas, "2026-01-01" se interpreta en UTC y en un huso horario negativo pasa a ser 2025-12-31 local — con desdeFechaISO no ocurre, sea cual sea el huso de ejecución', () => {
    // new Date('2026-01-01').getMonth() puede dar 11 (diciembre) en husos negativos.
    // trimestreDeFecha, al usar desdeFechaISO (año/mes/día explícitos), siempre da 0 aquí.
    expect(trimestreDeFecha('2026-01-01')).toBe(0);
  });
});

describe('calcularTrimestres — snapshot/regresión del cálculo actual', () => {
  const gastosPeriodicos: GastoPeriodico[] = [];

  it('IRPF 20% sobre el beneficio del trimestre', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 10000 }),
      factura({ id: 'g1', tipo: 'gasto', fecha: '2026-02-10', importe: 4000 }),
    ];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.ingresos).toBe(10000);
    expect(q1.gastos).toBe(4000);
    expect(q1.beneficio).toBe(6000);
    expect(q1.irpf).toBeCloseTo(6000 * TIPO_IRPF, 6);
    expect(q1.irpf).toBeCloseTo(1200, 6);
  });

  it('beneficio <= 0 → IRPF 0', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 1000 }),
      factura({ id: 'g1', tipo: 'gasto', fecha: '2026-02-10', importe: 1000 }),
    ];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.beneficio).toBe(0);
    expect(q1.irpf).toBe(0);
  });

  it('gastos periódicos deducibles se prorratean y restan del beneficio (vehículo no deducible se excluye)', () => {
    const facturas: Factura[] = [factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 3000 })];
    const gp: GastoPeriodico[] = [
      { id: 'g1', tipo: 'reta', descripcion: 'RETA', importe: 300, periodicidad: 'mensual', activo: true, creado: '2026-01-01' },
      { id: 'g2', tipo: 'amortizacion', descripcion: 'Furgoneta uso mixto', importe: 500, periodicidad: 'mensual', activo: true, afectacionExclusiva: false, creado: '2026-01-01' },
    ];
    const [q1] = calcularTrimestres(facturas, gp, { regionFiscal: '', repepActivo: false });
    // Solo g1 es deducible (g2 tiene afectacionExclusiva:false) → 300 * 3 = 900.
    expect(q1.gastosPeriodicos).toBe(900);
    expect(q1.beneficio).toBe(3000 - 900);
  });

  it('Modelo 420 (IGIC) para Canarias sin REPEP, con etiqueta e importe correctos', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 1070, importeImpuesto: 70 }),
    ];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: 'canarias', repepActivo: false });
    expect(q1.modeloIndirecto).toContain('Modelo 420');
    expect(q1.impuestoIndirecto).toBeCloseTo(70, 6);
  });

  it('Modelo 303 (IVA) para Península, con etiqueta e importe correctos', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 1210, importeImpuesto: 210 }),
    ];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: 'peninsula', repepActivo: false });
    expect(q1.modeloIndirecto).toContain('Modelo 303');
    expect(q1.impuestoIndirecto).toBeCloseTo(210, 6);
  });

  it('Modelo 130 es el modelo de IRPF, distinto del indirecto (303/420), para los 4 trimestres', () => {
    expect(TIPO_MODELO).toHaveLength(4);
    TIPO_MODELO.forEach((m) => expect(m).toContain('Modelo 130'));
  });

  it('Canarias + REPEP: no se calcula impuesto indirecto aunque las facturas traigan importeImpuesto real', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 1070, importeImpuesto: 70 }),
    ];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: 'canarias', repepActivo: true });
    expect(q1.impuestoIndirecto).toBe(0);
  });

  it('límites de trimestres: una factura del 31/03 y otra del 01/04 caen en trimestres distintos', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-03-31', importe: 100 }),
      factura({ id: 'i2', tipo: 'ingreso', fecha: '2026-04-01', importe: 200 }),
    ];
    const [q1, q2] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.ingresos).toBe(100);
    expect(q2.ingresos).toBe(200);
  });
});

describe('clasificarImpuestoFactura (solo por tipoImpuesto, nunca por región)', () => {
  it('iva / igic / exento / sin_impuesto se reconocen tal cual', () => {
    expect(clasificarImpuestoFactura({ tipoImpuesto: 'iva' })).toBe('iva');
    expect(clasificarImpuestoFactura({ tipoImpuesto: 'igic' })).toBe('igic');
    expect(clasificarImpuestoFactura({ tipoImpuesto: 'exento' })).toBe('exento');
    expect(clasificarImpuestoFactura({ tipoImpuesto: 'sin_impuesto' })).toBe('sin_impuesto');
  });

  it('vacío o ausente → no_identificado, nunca asignado a iva/igic', () => {
    expect(clasificarImpuestoFactura({ tipoImpuesto: '' })).toBe('no_identificado');
    expect(clasificarImpuestoFactura({})).toBe('no_identificado');
  });
});

describe('cuotaRealDeFactura (cuota real, nunca una estimación por región)', () => {
  it('usa importeImpuesto directo cuando existe', () => {
    expect(cuotaRealDeFactura({ importeImpuesto: 210 })).toBe(210);
  });

  it('lo deriva de baseImponible × porcentajeImpuesto / 100 cuando no hay importeImpuesto', () => {
    expect(cuotaRealDeFactura({ baseImponible: 1000, porcentajeImpuesto: 21 })).toBeCloseTo(210, 6);
  });

  it('sin ningún dato real → null, NUNCA 0 (no es lo mismo "desconocido" que "cero real", y nunca se estima por región)', () => {
    expect(cuotaRealDeFactura({})).toBe(null);
    expect(cuotaRealDeFactura({ baseImponible: 1000 })).toBe(null);
    expect(cuotaRealDeFactura({ porcentajeImpuesto: 21 })).toBe(null);
  });

  it('cuota real de 0€ (p. ej. un tipo al 0%) se distingue de "sin dato": importeImpuesto: 0 es un valor real, no null', () => {
    expect(cuotaRealDeFactura({ importeImpuesto: 0 })).toBe(0);
  });
});

describe('calcularImpuestosPorTipo — agregación IVA/IGIC por tipo real (subfase "Agregación trimestral IVA/IGIC")', () => {
  it('IVA repercutido: un ingreso con tipoImpuesto iva', () => {
    const r = calcularImpuestosPorTipo([factura({ tipo: 'ingreso', tipoImpuesto: 'iva', importeImpuesto: 420 })]);
    expect(r.ivaRepercutido).toBe(420);
    expect(r.ivaSoportado).toBe(0);
    expect(r.igicRepercutido).toBe(0);
  });

  it('IVA soportado: un gasto con tipoImpuesto iva', () => {
    const r = calcularImpuestosPorTipo([factura({ tipo: 'gasto', tipoImpuesto: 'iva', importeImpuesto: 210 })]);
    expect(r.ivaSoportado).toBe(210);
    expect(r.ivaRepercutido).toBe(0);
  });

  it('IGIC repercutido: un ingreso con tipoImpuesto igic', () => {
    const r = calcularImpuestosPorTipo([factura({ tipo: 'ingreso', tipoImpuesto: 'igic', importeImpuesto: 140 })]);
    expect(r.igicRepercutido).toBe(140);
    expect(r.igicSoportado).toBe(0);
  });

  it('IGIC soportado: un gasto con tipoImpuesto igic', () => {
    const r = calcularImpuestosPorTipo([factura({ tipo: 'gasto', tipoImpuesto: 'igic', importeImpuesto: 70 })]);
    expect(r.igicSoportado).toBe(70);
    expect(r.igicRepercutido).toBe(0);
  });

  it('CASO FUNDAMENTAL: Canarias + REPEP + factura de gasto con IVA real de Península → IVA soportado real, IGIC soportado = 0, nunca se convierte en IGIC', () => {
    // Empresa Canarias+REPEP, reparación de vehículo en Península: base 13.310,74€, IVA 2.794,26€.
    // La función de agregación no recibe ni región ni REPEP — solo las facturas — precisamente para que sea imposible que la región influya.
    const r = calcularImpuestosPorTipo([
      factura({ tipo: 'gasto', tipoImpuesto: 'iva', baseImponible: 13310.74, porcentajeImpuesto: 21, importeImpuesto: 2794.26 }),
    ]);
    expect(r.ivaSoportado).toBeCloseTo(2794.26, 2);
    expect(r.igicSoportado).toBe(0);
  });

  it('al revés: una factura con IGIC real permanece IGIC sin importar nada más', () => {
    const r = calcularImpuestosPorTipo([factura({ tipo: 'gasto', tipoImpuesto: 'igic', importeImpuesto: 70 })]);
    expect(r.igicSoportado).toBe(70);
    expect(r.ivaSoportado).toBe(0);
  });

  it('Canarias sin REPEP + factura IGIC', () => {
    // La función no depende de la región, pero comprobamos que una factura IGIC normal de una empresa Canarias sigue clasificándose como IGIC.
    const r = calcularImpuestosPorTipo([factura({ tipo: 'ingreso', tipoImpuesto: 'igic', importeImpuesto: 70 })]);
    expect(r.igicRepercutido).toBe(70);
  });

  it('Península + factura IVA', () => {
    const r = calcularImpuestosPorTipo([factura({ tipo: 'ingreso', tipoImpuesto: 'iva', importeImpuesto: 420 })]);
    expect(r.ivaRepercutido).toBe(420);
  });

  it('factura exenta → cuota 0, no contamina ningún contador', () => {
    const r = calcularImpuestosPorTipo([factura({ tipo: 'ingreso', tipoImpuesto: 'exento', importe: 1000 })]);
    expect(r).toEqual({
      ivaRepercutido: 0, ivaSoportado: 0, igicRepercutido: 0, igicSoportado: 0,
      noIdentificado: { repercutido: 0, soportado: 0, numFacturas: 0 }, noCalculable: { numFacturas: 0 },
    });
  });

  it('factura sin impuesto → cuota 0, no contamina ningún contador', () => {
    const r = calcularImpuestosPorTipo([factura({ tipo: 'gasto', tipoImpuesto: 'sin_impuesto', importe: 500 })]);
    expect(r).toEqual({
      ivaRepercutido: 0, ivaSoportado: 0, igicRepercutido: 0, igicSoportado: 0,
      noIdentificado: { repercutido: 0, soportado: 0, numFacturas: 0 }, noCalculable: { numFacturas: 0 },
    });
  });

  it('CASO NUEVO: tipoImpuesto real (iva/igic) pero sin cuota calculable → NO se interpreta como 0€, se cuenta aparte en noCalculable', () => {
    const r = calcularImpuestosPorTipo([
      factura({ id: 'a', tipo: 'gasto', tipoImpuesto: 'iva' }), // sin importeImpuesto, sin base ni porcentaje
      factura({ id: 'b', tipo: 'ingreso', tipoImpuesto: 'igic', porcentajeImpuesto: 7 }), // solo el porcentaje, sin base ni importeImpuesto
    ]);
    expect(r.ivaSoportado).toBe(0);
    expect(r.igicRepercutido).toBe(0);
    expect(r.noCalculable.numFacturas).toBe(2);
  });

  it('distingue impuesto real = 0€ (importeImpuesto: 0) de impuesto no calculable: el real de 0 SÍ cuenta como iva/igic, con cuota 0', () => {
    const r = calcularImpuestosPorTipo([factura({ tipo: 'ingreso', tipoImpuesto: 'iva', importeImpuesto: 0 })]);
    expect(r.ivaRepercutido).toBe(0);
    expect(r.noCalculable.numFacturas).toBe(0); // no es "no calculable": el 0 es un dato real
  });

  it('tipoImpuesto vacío con cuota real (factura histórica típica) → va a "no identificado", nunca a IVA/IGIC', () => {
    const r = calcularImpuestosPorTipo([factura({ tipo: 'gasto', tipoImpuesto: '', baseImponible: 1000, importeImpuesto: 70 })]);
    expect(r.igicSoportado).toBe(0);
    expect(r.ivaSoportado).toBe(0);
    expect(r.noIdentificado.soportado).toBe(70);
    expect(r.noIdentificado.numFacturas).toBe(1);
  });

  it('impuesto faltante del todo (sin tipoImpuesto, sin importeImpuesto, sin base+%) → no entra en ningún contador', () => {
    const r = calcularImpuestosPorTipo([factura({ tipo: 'gasto', importe: 500 })]);
    expect(r.noIdentificado.numFacturas).toBe(0);
    expect(r.noIdentificado.soportado).toBe(0);
  });

  it('desglose incoherente (base+cuota no coincide con importe) → se usa igualmente la cuota real informada', () => {
    const r = calcularImpuestosPorTipo([
      factura({ tipo: 'gasto', tipoImpuesto: 'iva', importe: 999, baseImponible: 1000, importeImpuesto: 210 }),
    ]);
    expect(r.ivaSoportado).toBe(210);
  });

  it('varias facturas mixtas en el mismo trimestre: IVA, IGIC y sin identificar no se mezclan', () => {
    const r = calcularImpuestosPorTipo([
      factura({ id: 'a', tipo: 'ingreso', tipoImpuesto: 'iva', importeImpuesto: 100 }),
      factura({ id: 'b', tipo: 'gasto', tipoImpuesto: 'igic', importeImpuesto: 50 }),
      factura({ id: 'c', tipo: 'gasto', tipoImpuesto: '', baseImponible: 200, importeImpuesto: 20 }),
    ]);
    expect(r.ivaRepercutido).toBe(100);
    expect(r.igicSoportado).toBe(50);
    expect(r.noIdentificado.soportado).toBe(20);
    expect(r.noIdentificado.numFacturas).toBe(1);
  });
});

describe('calcularTrimestres — impuestos por tipo integrados, e impuestoIndirecto sin cambios (compatibilidad)', () => {
  it('el campo impuestos aparece con la agregación real por tipo', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', tipoImpuesto: 'iva', importe: 1210, importeImpuesto: 210 }),
      factura({ id: 'g1', tipo: 'gasto', fecha: '2026-02-10', tipoImpuesto: 'igic', importe: 107, importeImpuesto: 7 }),
    ];
    const [q1] = calcularTrimestres(facturas, [], { regionFiscal: 'canarias', repepActivo: true });
    expect(q1.impuestos.ivaRepercutido).toBe(210);
    expect(q1.impuestos.igicSoportado).toBe(7);
  });

  it('CASO FUNDAMENTAL a nivel trimestral: Canarias + REPEP + factura IVA de Península → nunca se convierte en IGIC', () => {
    const facturas: Factura[] = [
      factura({ id: 'g1', tipo: 'gasto', fecha: '2026-01-10', tipoImpuesto: 'iva', baseImponible: 13310.74, porcentajeImpuesto: 21, importeImpuesto: 2794.26, importe: 16105 }),
    ];
    const [q1] = calcularTrimestres(facturas, [], { regionFiscal: 'canarias', repepActivo: true });
    expect(q1.impuestos.ivaSoportado).toBeCloseTo(2794.26, 2);
    expect(q1.impuestos.igicSoportado).toBe(0);
    // impuestoIndirecto (compatibilidad) es agnóstico al tipo y se calcula exactamente igual que antes de esta subfase.
    expect(q1.impuestoIndirecto).toBe(0); // calculaIndirecto=false con REPEP activo → sigue en 0, sin cambios
  });

  it('impuestoIndirecto no cambia de valor tras añadir los contadores por tipo (regresión de compatibilidad)', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 1210, importeImpuesto: 210 }),
      factura({ id: 'g1', tipo: 'gasto', fecha: '2026-02-10', importe: 500 }),
    ];
    const [q1] = calcularTrimestres(facturas, [], { regionFiscal: 'peninsula', repepActivo: false });
    // Mismo cálculo que antes: repercutido (210) − soportado (estimado al 21% de 500).
    const estimadoGasto = 500 - 500 / 1.21;
    expect(q1.impuestoIndirecto).toBeCloseTo(210 - estimadoGasto, 6);
  });

  it('facturas históricas: base+cuota sin tipoImpuesto no se asignan a IVA/IGIC en el cálculo trimestral', () => {
    const facturas: Factura[] = [
      factura({ id: 'g1', tipo: 'gasto', fecha: '2026-01-10', baseImponible: 1000, importeImpuesto: 70, importe: 1070 }),
    ];
    const [q1] = calcularTrimestres(facturas, [], { regionFiscal: '', repepActivo: false });
    expect(q1.impuestos.igicSoportado).toBe(0);
    expect(q1.impuestos.ivaSoportado).toBe(0);
    expect(q1.impuestos.noIdentificado.soportado).toBe(70);
  });

  it('límites entre trimestres también separan correctamente los contadores por tipo', () => {
    const facturas: Factura[] = [
      factura({ id: 'a', tipo: 'ingreso', fecha: '2026-03-31', tipoImpuesto: 'iva', importeImpuesto: 100 }),
      factura({ id: 'b', tipo: 'ingreso', fecha: '2026-04-01', tipoImpuesto: 'igic', importeImpuesto: 200 }),
    ];
    const [q1, q2] = calcularTrimestres(facturas, [], { regionFiscal: '', repepActivo: false });
    expect(q1.impuestos.ivaRepercutido).toBe(100);
    expect(q2.impuestos.igicRepercutido).toBe(200);
  });

  it('cambio de año: factura de diciembre y de enero siguiente no se mezclan en los contadores por tipo', () => {
    const facturasAnioA: Factura[] = [factura({ id: 'a', tipo: 'ingreso', fecha: '2026-12-31', tipoImpuesto: 'iva', importeImpuesto: 50 })];
    const facturasAnioB: Factura[] = [factura({ id: 'b', tipo: 'ingreso', fecha: '2027-01-01', tipoImpuesto: 'iva', importeImpuesto: 60 })];
    const [, , , q4A] = calcularTrimestres(facturasAnioA, [], { regionFiscal: '', repepActivo: false });
    const [q1B] = calcularTrimestres(facturasAnioB, [], { regionFiscal: '', repepActivo: false });
    expect(q4A.impuestos.ivaRepercutido).toBe(50);
    expect(q1B.impuestos.ivaRepercutido).toBe(60);
  });
});

describe('estadoDeducibleIrpf / gastoDeducible (Fase 3A, infraestructura — sin reglas fiscales nuevas)', () => {
  it('gasto sin decisión (campo ausente, histórico o nuevo) → por_revisar, gastoDeducible → null (nunca 0€)', () => {
    const f = factura({ tipo: 'gasto', importe: 1000, baseImponible: 1000 });
    expect(estadoDeducibleIrpf(f)).toBe('por_revisar');
    expect(gastoDeducible(f)).toBe(null);
  });

  for (const porcentaje of [0, 50, 100]) {
    it(`gasto con deducibleIrpf=${porcentaje} → estado y euros deducibles correctos (0%/100% son decisiones reales, no "desconocido")`, () => {
      const f = factura({ tipo: 'gasto', importe: 1000, baseImponible: 1000, deducibleIrpf: porcentaje });
      expect(estadoDeducibleIrpf(f)).toBe(porcentaje);
      expect(gastoDeducible(f)).toBeCloseTo(1000 * porcentaje / 100, 6);
    });
  }

  it('ingreso → siempre no_aplica, aunque tuviera deducibleIrpf informado por error', () => {
    const f = factura({ tipo: 'ingreso', importe: 1000, deducibleIrpf: 100 });
    expect(estadoDeducibleIrpf(f)).toBe('no_aplica');
    expect(gastoDeducible(f)).toBe(null);
  });

  it('factura histórica sin el campo (nunca migrada) se comporta igual que una nueva sin decidir', () => {
    const historica = { id: 'h1', tipo: 'gasto' as const, fecha: '2026-01-01', concepto: '', importe: 500, proveedor: '', clienteId: '', creado: '2026-01-01' };
    expect(estadoDeducibleIrpf(historica)).toBe('por_revisar');
  });
});

describe('estadoIvaIgicDeducible / cuotaDeducible (Fase 3A) — IVA/IGIC soportado sin tocar, deducibilidad separada', () => {
  it('IVA soportado sin decisión → por_revisar, cuotaDeducible → null (la cuota real no se toca ni se trata como 0€)', () => {
    const f = factura({ tipo: 'gasto', tipoImpuesto: 'iva', importe: 16105, importeImpuesto: 2794.26 });
    expect(estadoIvaIgicDeducible(f)).toBe('por_revisar');
    expect(cuotaDeducible(f)).toBe(null);
    expect(f.importeImpuesto).toBe(2794.26); // la cuota real, intacta
  });

  for (const porcentaje of [0, 50, 100]) {
    it(`IVA soportado con ivaIgicDeducible=${porcentaje} → cuota deducible correcta, cuota real sin tocar`, () => {
      const f = factura({ tipo: 'gasto', tipoImpuesto: 'iva', importe: 16105, baseImponible: 13310.74, importeImpuesto: 2794.26, ivaIgicDeducible: porcentaje });
      expect(estadoIvaIgicDeducible(f)).toBe(porcentaje);
      expect(cuotaDeducible(f)).toBeCloseTo(2794.26 * porcentaje / 100, 2);
      expect(f.importeImpuesto).toBe(2794.26);
    });

    it(`IGIC soportado con ivaIgicDeducible=${porcentaje} → cuota deducible correcta`, () => {
      const f = factura({ tipo: 'gasto', tipoImpuesto: 'igic', importe: 1070, importeImpuesto: 70, ivaIgicDeducible: porcentaje });
      expect(estadoIvaIgicDeducible(f)).toBe(porcentaje);
      expect(cuotaDeducible(f)).toBeCloseTo(70 * porcentaje / 100, 6);
    });
  }

  it('exento / sin_impuesto / tipo no identificado → no_aplica, nunca "por_revisar"', () => {
    expect(estadoIvaIgicDeducible(factura({ tipo: 'gasto', tipoImpuesto: 'exento' }))).toBe('no_aplica');
    expect(estadoIvaIgicDeducible(factura({ tipo: 'gasto', tipoImpuesto: 'sin_impuesto' }))).toBe('no_aplica');
    expect(estadoIvaIgicDeducible(factura({ tipo: 'gasto', tipoImpuesto: '' }))).toBe('no_aplica');
  });

  it('cuota no calculable (tipo real pero sin importeImpuesto ni base+%) → no_aplica, nunca una deducción falsa', () => {
    const f = factura({ tipo: 'gasto', tipoImpuesto: 'iva' });
    expect(estadoIvaIgicDeducible(f)).toBe('no_aplica');
    expect(cuotaDeducible(f)).toBe(null);
  });

  it('ingreso con IVA repercutido → siempre no_aplica (la deducibilidad no existe en el lado repercutido)', () => {
    expect(estadoIvaIgicDeducible(factura({ tipo: 'ingreso', tipoImpuesto: 'iva', importeImpuesto: 420 }))).toBe('no_aplica');
  });
});

describe('Regresión: el resultado económico/trimestral existente no cambia con los campos nuevos', () => {
  it('calcularTrimestres da exactamente los mismos ingresos/gastos/beneficio/irpf/impuestos con o sin deducibleIrpf/ivaIgicDeducible en las facturas', () => {
    const base: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', tipoImpuesto: 'iva', importe: 1210, importeImpuesto: 210 }),
      factura({ id: 'g1', tipo: 'gasto', fecha: '2026-02-10', tipoImpuesto: 'igic', importe: 1070, importeImpuesto: 70 }),
    ];
    const conTratamiento: Factura[] = [
      { ...base[0], deducibleIrpf: 100 },
      { ...base[1], deducibleIrpf: 50, ivaIgicDeducible: 0 },
    ];
    const config = { regionFiscal: 'canarias' as const, repepActivo: false };
    const [sinTratamiento] = calcularTrimestres(base, [], config);
    const [conTratamientoResultado] = calcularTrimestres(conTratamiento, [], config);
    expect(conTratamientoResultado).toEqual(sinTratamiento);
  });
});
