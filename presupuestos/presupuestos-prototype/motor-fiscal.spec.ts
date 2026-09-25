import {
  TIPO_IRPF, TIPO_GENERAL_POR_REGION, TIPO_MODELO,
  trimestreDeFecha, calculaIndirecto, tipoGeneralDeRegion, impuestoDeFactura, calcularTrimestres,
  sugerirTipoImpuesto, clasificarImpuestoFactura, cuotaRealDeFactura, calcularImpuestosPorTipo,
  estadoDeducibleIrpf, estadoIvaIgicDeducible, gastoDeducible, cuotaDeducible,
  agregarLineasFiscales, validarLineasFiscales, detectarProblemaFiscal, detectarDatosIdentificacionFaltantes,
  signoPorNaturaleza, detectarRectificativaTrimestreDistinto, calcularPosicionFiscal,
  calcularSaldoEntradaAnio, calcularTotalAIngresar,
} from './motor-fiscal.js';
import type { Factura, GastoPeriodico, LineaFiscal } from './types.js';

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

describe('calcularTrimestres — IRPF acumulado desde enero (auditoría 13/09/2026, como el Modelo 130 real)', () => {
  const gastosPeriodicos: GastoPeriodico[] = [];

  it('un solo trimestre con beneficio: igual que antes, el acumulado es el propio beneficio del trimestre', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 10000 }),
      factura({ id: 'g1', tipo: 'gasto', fecha: '2026-02-10', importe: 4000 }),
    ];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.beneficioAcumulado).toBe(6000);
    expect(q1.irpf).toBeCloseTo(1200, 6);
  });

  it('dos trimestres con beneficio: Q2 paga el 20% del acumulado MENOS lo ya calculado en Q1, no el 20% de su propio beneficio aislado', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 6000 }), // Q1 beneficio 6000 → IRPF 1200
      factura({ id: 'i2', tipo: 'ingreso', fecha: '2026-04-10', importe: 4000 }), // Q2 beneficio 4000, acumulado 10000
    ];
    const [q1, q2] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.irpf).toBeCloseTo(1200, 6);
    expect(q2.beneficioAcumulado).toBe(10000);
    // 20% de 10000 = 2000, menos los 1200 ya calculados en Q1 = 800 — NUNCA 20% de 4000 (=800 por casualidad coincide aquí, se comprueba con otro reparto más abajo).
    expect(q2.irpf).toBeCloseTo(800, 6);
  });

  it('pérdida en Q2 tras beneficio en Q1: Q2 no paga nada (nunca negativo) y Q3 no paga de más hasta recuperar el acumulado', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 5000 }), // Q1 beneficio 5000 → IRPF 1000
      factura({ id: 'g1', tipo: 'gasto', fecha: '2026-04-10', importe: 8000 }), // Q2 beneficio -8000, acumulado -3000
      factura({ id: 'i2', tipo: 'ingreso', fecha: '2026-07-10', importe: 2000 }), // Q3 beneficio +2000, acumulado -1000 (sigue negativo)
    ];
    const [q1, q2, q3] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.irpf).toBeCloseTo(1000, 6);
    expect(q2.beneficioAcumulado).toBe(-3000);
    expect(q2.irpf).toBe(0);
    expect(q3.beneficioAcumulado).toBe(-1000);
    expect(q3.irpf).toBe(0); // acumulado sigue siendo negativo — no se paga nada, y nunca se "devuelve" lo pagado en Q1 aquí
  });

  it('el reparto por trimestre nunca suma más del 20% del acumulado final del año (verificación con importes que NO coinciden por casualidad)', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 7000 }), // Q1: 7000 → IRPF 1400
      factura({ id: 'i2', tipo: 'ingreso', fecha: '2026-04-10', importe: 1000 }), // Q2: acumulado 8000 → teórico 1600, pagado 200
      factura({ id: 'i3', tipo: 'ingreso', fecha: '2026-07-10', importe: 3000 }), // Q3: acumulado 11000 → teórico 2200, pagado 600
    ];
    const [q1, q2, q3] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.irpf).toBeCloseTo(1400, 6);
    expect(q2.irpf).toBeCloseTo(200, 6);
    expect(q3.irpf).toBeCloseTo(600, 6);
    expect(q1.irpf + q2.irpf + q3.irpf).toBeCloseTo(q3.beneficioAcumulado * TIPO_IRPF, 6);
  });

  it('saldoInicial (auditoría 13/09/2026): un negocio dado de alta a mitad de año arrastra su beneficio/IRPF previos, no empieza en 0', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-07-10', importe: 3000 }), // único trimestre dentro de la app: Q3, beneficio 3000
    ];
    const [, , q3] = calcularTrimestres(facturas, gastosPeriodicos, {
      regionFiscal: '', repepActivo: false,
      saldoInicial: { beneficio: 5000, irpf: 1000 }, // ya facturaba 5000€ (pagó 1000€) antes de usar la app
    });
    expect(q3.beneficioAcumulado).toBe(8000); // 5000 de antes + 3000 de este trimestre
    // 20% de 8000 = 1600, menos los 1000 ya pagados antes de usar la app = 600.
    expect(q3.irpf).toBeCloseTo(600, 6);
  });

  it('sin saldoInicial, el comportamiento es idéntico a antes (empieza en 0)', () => {
    const facturas: Factura[] = [factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-07-10', importe: 3000 })];
    const [, , q3] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q3.beneficioAcumulado).toBe(3000);
    expect(q3.irpf).toBeCloseTo(600, 6); // 20% de 3000
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
      ivaBaseRepercutida: 0, ivaRepercutido: 0, ivaBaseSoportada: 0, ivaSoportado: 0, ivaResultado: 0,
      igicBaseRepercutida: 0, igicRepercutido: 0, igicBaseSoportada: 0, igicSoportado: 0, igicResultado: 0,
      noIdentificado: { repercutido: 0, soportado: 0, numFacturas: 0 }, noCalculable: { numFacturas: 0 },
    });
  });

  it('factura sin impuesto → cuota 0, no contamina ningún contador', () => {
    const r = calcularImpuestosPorTipo([factura({ tipo: 'gasto', tipoImpuesto: 'sin_impuesto', importe: 500 })]);
    expect(r).toEqual({
      ivaBaseRepercutida: 0, ivaRepercutido: 0, ivaBaseSoportada: 0, ivaSoportado: 0, ivaResultado: 0,
      igicBaseRepercutida: 0, igicRepercutido: 0, igicBaseSoportada: 0, igicSoportado: 0, igicResultado: 0,
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

  // Petición explícita del usuario 14/09/2026: el informe debe dar base imponible, cuota Y el
  // resultado a pagar/compensar de cada impuesto, no solo la cuota suelta.
  it('agrega la base imponible repercutida/soportada por impuesto, no solo la cuota', () => {
    const r = calcularImpuestosPorTipo([
      factura({ id: 'i1', tipo: 'ingreso', tipoImpuesto: 'igic', baseImponible: 25.08, porcentajeImpuesto: 3, importeImpuesto: 0.75 }),
      factura({ id: 'i2', tipo: 'ingreso', tipoImpuesto: 'igic', baseImponible: 112.88, porcentajeImpuesto: 7, importeImpuesto: 7.90 }),
      factura({ id: 'g1', tipo: 'gasto', tipoImpuesto: 'igic', baseImponible: 60, porcentajeImpuesto: 7, importeImpuesto: 4.20 }),
    ]);
    expect(r.igicBaseRepercutida).toBeCloseTo(137.96, 2);
    expect(r.igicRepercutido).toBeCloseTo(8.65, 2);
    expect(r.igicBaseSoportada).toBeCloseTo(60, 2);
    expect(r.igicSoportado).toBeCloseTo(4.20, 2);
  });

  it('ivaResultado/igicResultado = repercutido − soportado, positivo es "a ingresar"', () => {
    const r = calcularImpuestosPorTipo([
      factura({ id: 'i1', tipo: 'ingreso', tipoImpuesto: 'iva', baseImponible: 1000, porcentajeImpuesto: 21, importeImpuesto: 210 }),
      factura({ id: 'g1', tipo: 'gasto', tipoImpuesto: 'iva', baseImponible: 300, porcentajeImpuesto: 21, importeImpuesto: 63 }),
    ]);
    expect(r.ivaResultado).toBeCloseTo(147, 2); // 210 - 63, a ingresar
  });

  it('igicResultado negativo cuando lo soportado supera lo repercutido — a compensar, nunca se fuerza a 0', () => {
    const r = calcularImpuestosPorTipo([
      factura({ id: 'g1', tipo: 'gasto', tipoImpuesto: 'igic', baseImponible: 6000, porcentajeImpuesto: 7, importeImpuesto: 420 }),
    ]);
    expect(r.igicResultado).toBeCloseTo(-420, 2); // sin nada repercutido, todo a compensar
  });

  it('una factura con cuota calculable pero sin baseImponible no aporta a la base agregada, aunque sí a la cuota', () => {
    const r = calcularImpuestosPorTipo([
      factura({ id: 'i1', tipo: 'ingreso', tipoImpuesto: 'iva', importeImpuesto: 100 }), // cuota directa, sin base
    ]);
    expect(r.ivaRepercutido).toBe(100);
    expect(r.ivaBaseRepercutida).toBe(0);
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
    // repepActivo:false — sin REPEP de por medio, para no mezclar esta prueba (agregación
    // real por tipo) con el fix de REPEP de más abajo, que sí usa repepActivo:true a propósito.
    const [q1] = calcularTrimestres(facturas, [], { regionFiscal: 'canarias', repepActivo: false });
    expect(q1.impuestos.ivaRepercutido).toBe(210);
    expect(q1.impuestos.igicSoportado).toBe(7);
  });

  it('fix REPEP (25/09/2026): factura de gasto con IGIC real bajo REPEP no aporta nada al Modelo 420, pero el gasto económico no cambia', () => {
    const facturas: Factura[] = [
      factura({ id: 'g1', tipo: 'gasto', fecha: '2026-02-10', tipoImpuesto: 'igic', importe: 107, importeImpuesto: 7 }),
    ];
    const [q1] = calcularTrimestres(facturas, [], { regionFiscal: 'canarias', repepActivo: true });
    expect(q1.impuestos.igicSoportado).toBe(0);
    expect(q1.impuestos.igicRepercutido).toBe(0);
    expect(q1.impuestos.igicResultado).toBe(0);
    expect(q1.igicArrastre.saldoPendiente).toBe(0);
    // El gasto económico (importe completo, impuesto incluido) sigue contando con normalidad.
    expect(q1.gastos).toBe(107);
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

// Caso real reportado por el usuario (12/09/2026): factura de 146,61€ con
// DOS tramos de IGIC — 25,08€ al 3% (cuota 0,75€) y 112,88€ al 7% (cuota
// 7,90€) — que la extracción con IA solo leía como un único tramo.
const LINEA_3: LineaFiscal = { id: 'l1', tipo: 'igic', porcentaje: 3, baseImponible: 25.08, cuota: 0.75 };
const LINEA_7: LineaFiscal = { id: 'l2', tipo: 'igic', porcentaje: 7, baseImponible: 112.88, cuota: 7.90 };

describe('agregarLineasFiscales — Fase desglose fiscal por tramos (12/09/2026)', () => {
  it('caso real del usuario: dos tramos de IGIC (3% y 7%) suman exactamente 137,96€ de base y 8,65€ de IGIC', () => {
    const r = agregarLineasFiscales([LINEA_3, LINEA_7]);
    expect(r.baseImponible).toBeCloseTo(137.96);
    expect(r.importeImpuesto).toBeCloseTo(8.65);
  });

  it('una sola línea → la suma es exactamente esa línea', () => {
    const r = agregarLineasFiscales([LINEA_7]);
    expect(r.baseImponible).toBeCloseTo(112.88);
    expect(r.importeImpuesto).toBeCloseTo(7.90);
  });

  it('sin líneas → suma 0, nunca undefined ni NaN', () => {
    const r = agregarLineasFiscales([]);
    expect(r.baseImponible).toBe(0);
    expect(r.importeImpuesto).toBe(0);
  });

  it('nunca recalcula la cuota de una línea a partir de base×porcentaje — usa el importe real de la línea', () => {
    // 25.08 * 3% = 0.7524, que redondearía a 0.75 igualmente aquí, así que probamos
    // con un caso donde el cálculo y el dato real difieren para comprobar que se
    // respeta el dato real de la línea, no un recálculo.
    const lineaConCuotaReal: LineaFiscal = { id: 'l3', tipo: 'igic', porcentaje: 7, baseImponible: 100, cuota: 7.02 }; // cuota real distinta de 100*7%=7.00
    const r = agregarLineasFiscales([lineaConCuotaReal]);
    expect(r.importeImpuesto).toBe(7.02);
  });

  it('redondea a céntimos para evitar arrastrar errores de coma flotante', () => {
    const lineas: LineaFiscal[] = [
      { id: 'a', tipo: 'igic', porcentaje: 7, baseImponible: 0.1, cuota: 0.01 },
      { id: 'b', tipo: 'igic', porcentaje: 7, baseImponible: 0.2, cuota: 0.01 },
    ];
    const r = agregarLineasFiscales(lineas);
    expect(r.baseImponible).toBe(0.3); // 0.1 + 0.2 en JS puro da 0.30000000000000004
  });
});

describe('validarLineasFiscales — Fase desglose fiscal por tramos (12/09/2026)', () => {
  it('caso real del usuario: dos tramos de IGIC que sí cuadran con el total (146,61€) → válido', () => {
    const r = validarLineasFiscales([LINEA_3, LINEA_7], 146.61);
    expect(r.valido).toBe(true);
  });

  it('si al extraer solo se detecta el primer tramo (el bug real reportado) → no cuadra, queda marcado para revisar', () => {
    const r = validarLineasFiscales([LINEA_3], 146.61); // solo el tramo del 3%, como hacía la IA antes de esta corrección
    expect(r.valido).toBe(false);
    expect(r.motivo).toContain('no coincide');
  });

  it('sin líneas → válido (no hay desglose que validar todavía, no es un error)', () => {
    expect(validarLineasFiscales([], 100).valido).toBe(true);
  });

  it('mezclar IVA e IGIC en la misma factura → inválido, nunca se acepta', () => {
    const mezcla: LineaFiscal[] = [
      { id: 'a', tipo: 'iva', porcentaje: 21, baseImponible: 100, cuota: 21 },
      { id: 'b', tipo: 'igic', porcentaje: 7, baseImponible: 50, cuota: 3.5 },
    ];
    const r = validarLineasFiscales(mezcla, 174.5);
    expect(r.valido).toBe(false);
    expect(r.motivo).toContain('mezcla');
  });

  it('un tramo exento conviviendo con un tramo de IGIC no cuenta como mezcla de impuestos', () => {
    const lineas: LineaFiscal[] = [
      { id: 'a', tipo: 'exento', porcentaje: 0, baseImponible: 20, cuota: 0 },
      LINEA_7,
    ];
    const r = validarLineasFiscales(lineas, 20 + 112.88 + 7.90);
    expect(r.valido).toBe(true);
  });

  it('margen de 1 céntimo por redondeo — no marca error por una diferencia mínima', () => {
    const r = validarLineasFiscales([LINEA_3, LINEA_7], 146.62); // 1 céntimo de diferencia
    expect(r.valido).toBe(true);
  });

  it('una diferencia real (no de redondeo) sí se marca', () => {
    const r = validarLineasFiscales([LINEA_3, LINEA_7], 150.00);
    expect(r.valido).toBe(false);
  });
});

describe('detectarProblemaFiscal — detector de desglose fiscal incorrecto (12/09/2026)', () => {
  it('factura correcta con campos antiguos (un único tramo) → null, sin problema', () => {
    const r = detectarProblemaFiscal({ importe: 121, baseImponible: 100, importeImpuesto: 21, tipoImpuesto: 'iva' });
    expect(r).toBe(null);
  });

  it('factura con descuadre usando campos antiguos → descuadre_total', () => {
    // El bug real: solo se guardó el primer tramo (25,08 base / 0,75 cuota) de una factura de 146,61€ total.
    const r = detectarProblemaFiscal({ importe: 146.61, baseImponible: 25.08, importeImpuesto: 0.75, tipoImpuesto: 'igic' });
    expect(r).not.toBe(null);
    expect(r!.categoria).toBe('descuadre_total');
    expect(r!.baseUtilizada).toBe(25.08);
    expect(r!.cuotaUtilizada).toBe(0.75);
  });

  it('factura correcta con varias lineasFiscales (el caso real ya arreglado) → null', () => {
    const r = detectarProblemaFiscal({
      importe: 146.61,
      lineasFiscales: [LINEA_3, LINEA_7],
    });
    expect(r).toBe(null);
  });

  it('factura con descuadre usando lineasFiscales (falta un tramo) → descuadre_total, usa la suma de las líneas', () => {
    const r = detectarProblemaFiscal({ importe: 146.61, lineasFiscales: [LINEA_3] }); // solo el tramo del 3%, falta el del 7%
    expect(r).not.toBe(null);
    expect(r!.categoria).toBe('descuadre_total');
    expect(r!.baseUtilizada).toBe(25.08);
    expect(r!.cuotaUtilizada).toBe(0.75);
  });

  it('factura antigua sin lineasFiscales y sin ningún dato fiscal → null, no es un problema (nunca se rellenó nada)', () => {
    const r = detectarProblemaFiscal({ importe: 74.90 });
    expect(r).toBe(null);
  });

  it('factura con solo base o solo cuota (falta el otro) → datos_fiscales_incompletos', () => {
    const soloBase = detectarProblemaFiscal({ importe: 100, baseImponible: 100 });
    expect(soloBase!.categoria).toBe('datos_fiscales_incompletos');
    const soloCuota = detectarProblemaFiscal({ importe: 100, importeImpuesto: 10 });
    expect(soloCuota!.categoria).toBe('datos_fiscales_incompletos');
  });

  it('lineasFiscales con una línea corrupta (sin cuota) → datos_fiscales_incompletos', () => {
    const r = detectarProblemaFiscal({ importe: 100, lineasFiscales: [{ id: 'x', tipo: 'igic', porcentaje: 7 } as LineaFiscal] });
    expect(r!.categoria).toBe('datos_fiscales_incompletos');
  });

  it('factura con mezcla IVA/IGIC en las líneas → mezcla_iva_igic', () => {
    const mezcla: LineaFiscal[] = [
      { id: 'a', tipo: 'iva', porcentaje: 21, baseImponible: 100, cuota: 21 },
      LINEA_7,
    ];
    const r = detectarProblemaFiscal({ importe: 100 + 21 + 112.88 + 7.90, lineasFiscales: mezcla });
    expect(r!.categoria).toBe('mezcla_iva_igic');
  });

  it('factura exenta con cuota distinta de cero (campos antiguos) → tipo_exento_con_cuota', () => {
    const r = detectarProblemaFiscal({ importe: 100, baseImponible: 100, importeImpuesto: 5, tipoImpuesto: 'exento' });
    expect(r!.categoria).toBe('tipo_exento_con_cuota');
  });

  it('línea exenta con cuota distinta de cero (lineasFiscales) → tipo_exento_con_cuota', () => {
    const lineas: LineaFiscal[] = [{ id: 'a', tipo: 'exento', porcentaje: 0, baseImponible: 50, cuota: 3 }];
    const r = detectarProblemaFiscal({ importe: 50, lineasFiscales: lineas });
    expect(r!.categoria).toBe('tipo_exento_con_cuota');
  });

  it('campos antiguos contradictorios frente a lineasFiscales → se ignoran los campos antiguos, solo cuentan las líneas', () => {
    // baseImponible/importeImpuesto sueltos dicen otra cosa completamente distinta a las líneas reales.
    const r = detectarProblemaFiscal({
      importe: 146.61,
      baseImponible: 999, importeImpuesto: 999, tipoImpuesto: 'iva',
      lineasFiscales: [LINEA_3, LINEA_7], // suman exactamente el total real
    });
    expect(r).toBe(null); // correcta, porque las líneas sí cuadran — los campos antiguos no se miran
  });

  it('diferencia de exactamente 0,01€ → no se marca (margen de redondeo)', () => {
    const r = detectarProblemaFiscal({ importe: 146.62, lineasFiscales: [LINEA_3, LINEA_7] });
    expect(r).toBe(null);
  });

  it('diferencia superior a 0,01€ → sí se marca', () => {
    const r = detectarProblemaFiscal({ importe: 146.63, lineasFiscales: [LINEA_3, LINEA_7] });
    expect(r).not.toBe(null);
    expect(r!.categoria).toBe('descuadre_total');
  });
});

describe('detectarDatosIdentificacionFaltantes — detector de datos de identificación incompletos (13/09/2026)', () => {
  const COMPLETA = { proveedor: 'Maderas Santana, S.L.', numeroFactura: 'F26-13252', cifNif: 'B38045868' };

  it('con los tres datos presentes → null, no falta nada', () => {
    expect(detectarDatosIdentificacionFaltantes(COMPLETA)).toBe(null);
  });

  it('falta solo el número de factura → un único motivo, nombrado explícitamente', () => {
    const r = detectarDatosIdentificacionFaltantes({ ...COMPLETA, numeroFactura: '' });
    expect(r).not.toBe(null);
    expect(r!.faltantes).toEqual(['numero_factura']);
    expect(r!.explicacion).toBe('Falta el número de factura.');
  });

  it('falta solo el CIF/NIF → un único motivo, nombrado explícitamente', () => {
    const r = detectarDatosIdentificacionFaltantes({ ...COMPLETA, cifNif: undefined });
    expect(r).not.toBe(null);
    expect(r!.faltantes).toEqual(['cif_nif']);
    expect(r!.explicacion).toBe('Falta el CIF/NIF.');
  });

  it('falta solo el nombre (razón social) → un único motivo, nombrado explícitamente', () => {
    const r = detectarDatosIdentificacionFaltantes({ ...COMPLETA, proveedor: '   ' }); // solo espacios cuenta como vacío
    expect(r).not.toBe(null);
    expect(r!.faltantes).toEqual(['razon_social']);
    expect(r!.explicacion).toBe('Falta el nombre (razón social).');
  });

  it('faltan dos datos a la vez → los nombra los dos, unidos con "y"', () => {
    const r = detectarDatosIdentificacionFaltantes({ proveedor: 'Maderas Santana, S.L.', numeroFactura: '', cifNif: undefined });
    expect(r!.faltantes).toEqual(['numero_factura', 'cif_nif']);
    expect(r!.explicacion).toBe('Faltan el número de factura y el CIF/NIF.');
  });

  it('faltan los tres a la vez → los nombra los tres, con comas y "y" antes del último', () => {
    const r = detectarDatosIdentificacionFaltantes({ proveedor: '', numeroFactura: '', cifNif: '' });
    expect(r!.faltantes).toEqual(['numero_factura', 'cif_nif', 'razon_social']);
    expect(r!.explicacion).toBe('Faltan el número de factura, el CIF/NIF y el nombre (razón social).');
  });
});

// ── Rectificativas/devoluciones (Bloque A, 25/09/2026) ──────────────────────

describe('signoPorNaturaleza — única fuente de la regla de signo', () => {
  it('factura normal → +1', () => {
    expect(signoPorNaturaleza(factura({ naturaleza: 'normal' }))).toBe(1);
  });

  it('rectificativa → -1', () => {
    expect(signoPorNaturaleza(factura({ naturaleza: 'rectificativa' }))).toBe(-1);
  });

  it('factura antigua sin `naturaleza` (ausente) → se interpreta como normal, +1 (compatibilidad con el histórico)', () => {
    const f = factura({});
    delete (f as any).naturaleza;
    expect(signoPorNaturaleza(f)).toBe(1);
  });
});

/**
 * Test "espejo" frontend↔backend (cierre de riesgo #2 de la revisión de
 * diff, 25/09/2026). `signoPorNaturaleza` existe DUPLICADA a propósito en
 * `presupuestos-prototype/motor-fiscal.ts` (este archivo) y en
 * `presupuestos-service/motor-fiscal.ts` — son dos apps Bit independientes,
 * sin ningún paquete compartido entre ellas (confirmado: no hay ningún
 * import cruzado en todo el proyecto entre `presupuestos-prototype` y
 * `presupuestos-service`, y `AGENTS.md` prohíbe explícitamente las rutas
 * relativas entre límites de componente). Un test que importe literalmente
 * las dos implementaciones en el mismo proceso NO es viable sin inventar
 * infraestructura nueva (publicar uno como paquete instalable del otro),
 * así que este test no prueba igualdad de código — prueba que ESTA copia
 * sigue produciendo, para esta MISMA tabla de casos literal, el resultado
 * que el archivo hermano espera para la SUYA. Si algún día se cambia esta
 * tabla aquí sin tocar la del backend (o viceversa), un lector que revise
 * el diff verá un archivo modificado sin su pareja — es una defensa por
 * visibilidad, no automática. Tabla idéntica, palabra por palabra, en
 * `presupuestos-service/motor-fiscal.spec.ts` → describe('signoPorNaturaleza
 * — tabla espejo frontend↔backend ...').
 */
describe('signoPorNaturaleza — tabla espejo frontend↔backend (misma tabla que presupuestos-service/motor-fiscal.spec.ts)', () => {
  const CASOS: { descripcion: string; naturaleza: 'normal' | 'rectificativa' | undefined; esperado: 1 | -1 }[] = [
    { descripcion: 'factura normal', naturaleza: 'normal', esperado: 1 },
    { descripcion: 'factura rectificativa', naturaleza: 'rectificativa', esperado: -1 },
    { descripcion: 'naturaleza ausente (histórico)', naturaleza: undefined, esperado: 1 },
  ];

  for (const caso of CASOS) {
    it(`${caso.descripcion} → ${caso.esperado}`, () => {
      const f = caso.naturaleza === undefined ? {} : { naturaleza: caso.naturaleza };
      expect(signoPorNaturaleza(f as Pick<Factura, 'naturaleza'>)).toBe(caso.esperado);
    });
  }
});

describe('calcularTrimestres — rectificativas (Bloque A, 25/09/2026)', () => {
  const gastosPeriodicos: GastoPeriodico[] = [];

  it('factura normal sola → sin cambios respecto al comportamiento de siempre', () => {
    const facturas: Factura[] = [factura({ id: 'g1', tipo: 'gasto', fecha: '2026-01-10', importe: 1000, naturaleza: 'normal' })];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.gastos).toBe(1000);
  });

  it('rectificativa de un gasto resta del total de GASTOS del trimestre en que se registra, nunca se mueve a ingresos', () => {
    const facturas: Factura[] = [
      factura({ id: 'g1', tipo: 'gasto', fecha: '2026-01-10', importe: 1000 }),
      factura({ id: 'r1', tipo: 'gasto', fecha: '2026-01-20', importe: 300, naturaleza: 'rectificativa', facturaOriginalId: 'g1' }),
    ];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.gastos).toBe(700); // 1000 - 300, el importe de la rectificativa se introduce en positivo (300), signoPorNaturaleza lo resta
    expect(q1.ingresos).toBe(0); // nunca se mueve al otro lado
  });

  it('rectificativa parcial (importe menor que la original) — se resta tal cual, sin necesidad de igualar el importe original', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 1000 }),
      factura({ id: 'r1', tipo: 'ingreso', fecha: '2026-01-20', importe: 150, naturaleza: 'rectificativa', facturaOriginalId: 'i1' }),
    ];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.ingresos).toBe(850);
  });

  it('varias rectificativas de la misma factura original, en el mismo trimestre, se acumulan', () => {
    const facturas: Factura[] = [
      factura({ id: 'g1', tipo: 'gasto', fecha: '2026-01-10', importe: 1000 }),
      factura({ id: 'r1', tipo: 'gasto', fecha: '2026-01-15', importe: 200, naturaleza: 'rectificativa', facturaOriginalId: 'g1' }),
      factura({ id: 'r2', tipo: 'gasto', fecha: '2026-01-20', importe: 100, naturaleza: 'rectificativa', facturaOriginalId: 'g1' }),
    ];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.gastos).toBe(700); // 1000 - 200 - 100
  });

  it('factura original y rectificativa en el MISMO trimestre → la corrección se ve en ese trimestre, beneficioAcumulado ya la refleja', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 1000 }),
      factura({ id: 'r1', tipo: 'ingreso', fecha: '2026-02-10', importe: 300, naturaleza: 'rectificativa', facturaOriginalId: 'i1' }),
    ];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.beneficio).toBe(700);
    expect(q1.beneficioAcumulado).toBe(700);
  });

  it('factura original y rectificativa en TRIMESTRES DIFERENTES → cada una afecta solo al trimestre en que se registra (la original no se toca retroactivamente)', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 1000 }), // Q1
      factura({ id: 'r1', tipo: 'ingreso', fecha: '2026-07-10', importe: 300, naturaleza: 'rectificativa', facturaOriginalId: 'i1' }), // Q3
    ];
    const [q1, , q3] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.ingresos).toBe(1000); // Q1 no se toca
    expect(q3.ingresos).toBe(-300); // Q3 registra la corrección
    // El acumulado SÍ refleja la corrección desde el momento en que se registra — así funciona el Modelo 130 real.
    expect(q3.beneficioAcumulado).toBe(700);
  });

  it('facturas antiguas sin `naturaleza` (ausente en el documento guardado) se tratan como normales, sin romper el cálculo de siempre', () => {
    const antigua = factura({ id: 'g1', tipo: 'gasto', fecha: '2026-01-10', importe: 500 });
    delete (antigua as any).naturaleza;
    const [q1] = calcularTrimestres([antigua], gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.gastos).toBe(500);
  });
});

describe('detectarRectificativaTrimestreDistinto — solo detecta y avisa, nunca corrige (25/09/2026)', () => {
  it('misma fecha (mismo trimestre y año) → sin aviso', () => {
    const r = detectarRectificativaTrimestreDistinto({ fecha: '2026-01-20' }, { fecha: '2026-01-10' });
    expect(r.trimestreDistinto).toBe(false);
    expect(r.explicacion).toBeUndefined();
  });

  it('mismo trimestre, distinto día → sin aviso', () => {
    const r = detectarRectificativaTrimestreDistinto({ fecha: '2026-03-30' }, { fecha: '2026-01-10' });
    expect(r.trimestreDistinto).toBe(false);
  });

  it('trimestre distinto dentro del mismo año → aviso, con explicación que nombra ambos trimestres', () => {
    const r = detectarRectificativaTrimestreDistinto({ fecha: '2026-07-05' }, { fecha: '2026-01-10' });
    expect(r.trimestreDistinto).toBe(true);
    expect(r.explicacion).toContain('1.er Trimestre');
    expect(r.explicacion).toContain('3.er Trimestre');
  });

  it('año distinto → aviso', () => {
    const r = detectarRectificativaTrimestreDistinto({ fecha: '2027-01-05' }, { fecha: '2026-11-10' });
    expect(r.trimestreDistinto).toBe(true);
    expect(r.explicacion).toContain('2026');
    expect(r.explicacion).toContain('2027');
  });
});

describe('calcularImpuestosPorTipo — rectificativas e IVA/IGIC simultáneos (Bloque A, 25/09/2026)', () => {
  it('rectificativa de una factura con IVA resta del IVA, nunca del IGIC', () => {
    const facturas: Factura[] = [
      factura({ id: 'g1', tipo: 'gasto', tipoImpuesto: 'iva', baseImponible: 1000, importeImpuesto: 210, importe: 1210 }),
      factura({ id: 'r1', tipo: 'gasto', tipoImpuesto: 'iva', baseImponible: 300, importeImpuesto: 63, importe: 363, naturaleza: 'rectificativa', facturaOriginalId: 'g1' }),
    ];
    const r = calcularImpuestosPorTipo(facturas);
    expect(r.ivaSoportado).toBeCloseTo(210 - 63, 6);
    expect(r.ivaBaseSoportada).toBeCloseTo(1000 - 300, 6);
    expect(r.igicSoportado).toBe(0);
    expect(r.igicBaseSoportada).toBe(0);
  });

  it('rectificativa de una factura con IGIC resta del IGIC, nunca del IVA', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', tipoImpuesto: 'igic', baseImponible: 1000, importeImpuesto: 70, importe: 1070 }),
      factura({ id: 'r1', tipo: 'ingreso', tipoImpuesto: 'igic', baseImponible: 200, importeImpuesto: 14, importe: 214, naturaleza: 'rectificativa', facturaOriginalId: 'i1' }),
    ];
    const r = calcularImpuestosPorTipo(facturas);
    expect(r.igicRepercutido).toBeCloseTo(70 - 14, 6);
    expect(r.igicBaseRepercutida).toBeCloseTo(1000 - 200, 6);
    expect(r.ivaRepercutido).toBe(0);
  });

  it('empresa Canarias + factura con tipoImpuesto:\'igic\' → se agrega como IGIC (la región es solo contexto, coincide con el impuesto real de la factura)', () => {
    const r = calcularImpuestosPorTipo([factura({ tipo: 'gasto', tipoImpuesto: 'igic', importeImpuesto: 70, importe: 1070 })]);
    expect(r.igicSoportado).toBe(70);
    expect(r.ivaSoportado).toBe(0);
  });

  it('empresa Canarias + factura con tipoImpuesto:\'iva\' (compra en Península) → se agrega como IVA, NUNCA se convierte en IGIC por la región', () => {
    const r = calcularImpuestosPorTipo([factura({ tipo: 'gasto', tipoImpuesto: 'iva', importeImpuesto: 210, importe: 1210 })]);
    expect(r.ivaSoportado).toBe(210);
    expect(r.igicSoportado).toBe(0); // la función ni siquiera recibe la región — estructuralmente no puede convertir
  });

  it('IVA e IGIC simultáneos en el mismo trimestre → se agregan por separado, ninguno se mezcla ni se suma con el otro', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', tipoImpuesto: 'iva', importeImpuesto: 210, importe: 1210 }),
      factura({ id: 'i2', tipo: 'ingreso', tipoImpuesto: 'igic', importeImpuesto: 70, importe: 1070 }),
    ];
    const r = calcularImpuestosPorTipo(facturas);
    expect(r.ivaRepercutido).toBe(210);
    expect(r.igicRepercutido).toBe(70);
    // Ningún campo del resumen combina ambos — ivaResultado e igicResultado son independientes.
    expect(r.ivaResultado).toBe(210);
    expect(r.igicResultado).toBe(70);
  });
});

describe('calcularPosicionFiscal — Bloque B, reestructura sin recalcular (25/09/2026)', () => {
  const gastosPeriodicos: GastoPeriodico[] = [];

  it('resultadoEconomico es el mismo beneficio que ya calcula calcularTrimestres, sin recalcularlo', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 10000 }),
      factura({ id: 'g1', tipo: 'gasto', fecha: '2026-01-10', importe: 4000 }),
    ];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    const posicion = calcularPosicionFiscal(q1);
    expect(posicion.resultadoEconomico).toBe(q1.beneficio);
    expect(posicion.resultadoEconomico).toBe(6000);
  });

  it('irpf.importe y tipoModelo \'130\', mismo valor que DatosTrimestre.irpf', () => {
    const facturas: Factura[] = [factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 10000 })];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    const posicion = calcularPosicionFiscal(q1);
    expect(posicion.irpf.importe).toBe(q1.irpf);
    expect(posicion.irpf.tipoModelo).toBe('130');
  });

  it('iva.resultado y tipoModelo \'303\', mismo valor que DatosTrimestre.impuestos.ivaResultado', () => {
    const facturas: Factura[] = [factura({ id: 'i1', tipo: 'ingreso', tipoImpuesto: 'iva', importeImpuesto: 210, importe: 1210, fecha: '2026-01-10' })];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: 'peninsula', repepActivo: false });
    const posicion = calcularPosicionFiscal(q1);
    expect(posicion.iva.resultado).toBe(q1.impuestos.ivaResultado);
    expect(posicion.iva.resultado).toBe(210);
    expect(posicion.iva.tipoModelo).toBe('303');
  });

  it('igic.resultado y tipoModelo \'420\', mismo valor que DatosTrimestre.impuestos.igicResultado', () => {
    const facturas: Factura[] = [factura({ id: 'i1', tipo: 'ingreso', tipoImpuesto: 'igic', importeImpuesto: 70, importe: 1070, fecha: '2026-01-10' })];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: 'canarias', repepActivo: false });
    const posicion = calcularPosicionFiscal(q1);
    expect(posicion.igic.resultado).toBe(q1.impuestos.igicResultado);
    expect(posicion.igic.resultado).toBe(70);
    expect(posicion.igic.tipoModelo).toBe('420');
  });

  it('IVA e IGIC se mantienen separados — no existe ningún campo que los sume ni un total combinado todavía', () => {
    const facturas: Factura[] = [
      factura({ id: 'i1', tipo: 'ingreso', tipoImpuesto: 'iva', importeImpuesto: 210, importe: 1210, fecha: '2026-01-10' }),
      factura({ id: 'i2', tipo: 'ingreso', tipoImpuesto: 'igic', importeImpuesto: 70, importe: 1070, fecha: '2026-01-10' }),
    ];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    const posicion = calcularPosicionFiscal(q1);
    expect(posicion.iva.resultado).toBe(210);
    expect(posicion.igic.resultado).toBe(70);
    expect((posicion as any).totalAIngresar).toBeUndefined();
    expect(Object.keys(posicion).sort()).toEqual(['igic', 'irpf', 'iva', 'resultadoEconomico']);
  });
});

describe('Arrastre IVA/IGIC entre trimestres (Fase A-C, 25/09/2026)', () => {
  const gastosPeriodicos: GastoPeriodico[] = [];
  /** Factura de gasto con IVA soportado de `importeImpuesto` € — genera un `ivaResultado` de -X (a compensar). */
  const gastoIva = (id: string, fecha: string, importeImpuesto: number) =>
    factura({ id, tipo: 'gasto', fecha, tipoImpuesto: 'iva', importe: importeImpuesto, importeImpuesto });
  /** Factura de ingreso con IVA repercutido de `importeImpuesto` € — genera un `ivaResultado` de +X (a ingresar). */
  const ingresoIva = (id: string, fecha: string, importeImpuesto: number) =>
    factura({ id, tipo: 'ingreso', fecha, tipoImpuesto: 'iva', importe: importeImpuesto, importeImpuesto });
  const gastoIgic = (id: string, fecha: string, importeImpuesto: number) =>
    factura({ id, tipo: 'gasto', fecha, tipoImpuesto: 'igic', importe: importeImpuesto, importeImpuesto });
  const ingresoIgic = (id: string, fecha: string, importeImpuesto: number) =>
    factura({ id, tipo: 'ingreso', fecha, tipoImpuesto: 'igic', importe: importeImpuesto, importeImpuesto });

  it('1. IVA negativo → se convierte en saldo pendiente de compensar', () => {
    const facturas = [gastoIva('g1', '2026-01-10', 300)]; // Q1: ivaResultado = -300
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.impuestos.ivaResultado).toBe(-300);
    expect(q1.ivaArrastre).toEqual({ resultadoTrimestre: -300, saldoAnterior: 0, compensacionAplicada: 0, aIngresar: 0, saldoPendiente: 300 });
  });

  it('2-3. IVA positivo consume el saldo — ejemplo exacto del encargo: Q1 -300, Q2 +500 → ingresa 200, saldo 0', () => {
    const facturas = [gastoIva('g1', '2026-01-10', 300), ingresoIva('i1', '2026-04-10', 500)];
    const [q1, q2] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.ivaArrastre.saldoPendiente).toBe(300);
    expect(q2.ivaArrastre).toEqual({ resultadoTrimestre: 500, saldoAnterior: 300, compensacionAplicada: 300, aIngresar: 200, saldoPendiente: 0 });
  });

  it('4. IVA positivo INFERIOR al saldo → no hay ingreso y queda saldo pendiente', () => {
    const facturas = [gastoIva('g1', '2026-01-10', 500), ingresoIva('i1', '2026-04-10', 200)];
    const [q1, q2] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.ivaArrastre.saldoPendiente).toBe(500);
    expect(q2.ivaArrastre).toEqual({ resultadoTrimestre: 200, saldoAnterior: 500, compensacionAplicada: 200, aIngresar: 0, saldoPendiente: 300 });
  });

  it('5/A/B. Varios trimestres acumulando saldo — secuencia completa del encargo: -300, -200, +400, +300', () => {
    const facturas = [
      gastoIva('g1', '2026-01-10', 300), // Q1: -300 → saldo 300
      gastoIva('g2', '2026-04-10', 200), // Q2: -200 → saldo 500
      ingresoIva('i1', '2026-07-10', 400), // Q3: +400 → compensa 400, ingresa 0, saldo 100
      ingresoIva('i2', '2026-10-10', 300), // Q4: +300 → compensa 100, ingresa 200, saldo 0
    ];
    const [q1, q2, q3, q4] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.ivaArrastre.saldoPendiente).toBe(300);
    expect(q2.ivaArrastre.saldoPendiente).toBe(500);
    expect(q3.ivaArrastre).toEqual({ resultadoTrimestre: 400, saldoAnterior: 500, compensacionAplicada: 400, aIngresar: 0, saldoPendiente: 100 });
    expect(q4.ivaArrastre).toEqual({ resultadoTrimestre: 300, saldoAnterior: 100, compensacionAplicada: 100, aIngresar: 200, saldoPendiente: 0 });
  });

  it('6/C. IGIC sigue exactamente el mismo patrón que IVA', () => {
    const facturas = [gastoIgic('g1', '2026-01-10', 400), ingresoIgic('i1', '2026-04-10', 700)];
    const [q1, q2] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.igicArrastre.saldoPendiente).toBe(400);
    expect(q2.igicArrastre).toEqual({ resultadoTrimestre: 700, saldoAnterior: 400, compensacionAplicada: 400, aIngresar: 300, saldoPendiente: 0 });
  });

  it('7/D/E. IVA e IGIC son circuitos completamente independientes — nunca se compensan entre sí', () => {
    const facturas = [
      gastoIva('g1', '2026-01-10', 300), gastoIgic('g2', '2026-01-10', 150), // Q1: IVA -300, IGIC -150 (D: negativos simultáneos)
      ingresoIva('i1', '2026-04-10', 500), // Q2: IVA +500 (se compensa con su propio saldo), IGIC sigue sin movimiento (E: IGIC con saldo pendiente mientras IVA ya ingresa)
    ];
    const [q1, q2] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.ivaArrastre.saldoPendiente).toBe(300);
    expect(q1.igicArrastre.saldoPendiente).toBe(150);
    // Q2: el saldo de IGIC (150) NO se usa para reducir lo que hay que ingresar de IVA — el IVA se compensa solo con SU PROPIO saldo (300).
    expect(q2.ivaArrastre).toEqual({ resultadoTrimestre: 500, saldoAnterior: 300, compensacionAplicada: 300, aIngresar: 200, saldoPendiente: 0 });
    // El IGIC de Q2 no tiene facturas → resultado 0, su saldo pendiente de 150 se mantiene intacto, sin tocarlo el resultado de IVA.
    expect(q2.igicArrastre).toEqual({ resultadoTrimestre: 0, saldoAnterior: 150, compensacionAplicada: 0, aIngresar: 0, saldoPendiente: 150 });
  });

  it('8/F. Saldo inicial de IVA (negocio que empieza a usar la app a mitad de año con un saldo pendiente ya existente)', () => {
    const facturas = [ingresoIva('i1', '2026-07-10', 200)]; // único trimestre con datos: Q3, +200
    const [, , q3] = calcularTrimestres(facturas, gastosPeriodicos, {
      regionFiscal: '', repepActivo: false, saldoInicial: { beneficio: 0, irpf: 0, iva: 1000, igic: 0 },
    });
    // 1.000€ pendientes de antes + 200€ de este trimestre → compensa 200, sigue debiendo 800.
    expect(q3.ivaArrastre).toEqual({ resultadoTrimestre: 200, saldoAnterior: 1000, compensacionAplicada: 200, aIngresar: 0, saldoPendiente: 800 });
  });

  it('9/G. Saldo inicial de IGIC — independiente del de IVA', () => {
    const facturas = [ingresoIgic('i1', '2026-07-10', 100)];
    const [, , q3] = calcularTrimestres(facturas, gastosPeriodicos, {
      regionFiscal: '', repepActivo: false, saldoInicial: { beneficio: 0, irpf: 0, iva: 0, igic: 500 },
    });
    expect(q3.igicArrastre).toEqual({ resultadoTrimestre: 100, saldoAnterior: 500, compensacionAplicada: 100, aIngresar: 0, saldoPendiente: 400 });
    expect(q3.ivaArrastre.saldoAnterior).toBe(0); // el saldo inicial de IGIC nunca contamina al de IVA
  });

  it('H. Saldo inicial + nuevo saldo negativo en el propio trimestre → se acumulan, nunca se pierde ninguno de los dos', () => {
    const facturas = [gastoIva('g1', '2026-01-10', 150)]; // Q1: -150
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, {
      regionFiscal: '', repepActivo: false, saldoInicial: { beneficio: 0, irpf: 0, iva: 1000, igic: 0 },
    });
    expect(q1.ivaArrastre).toEqual({ resultadoTrimestre: -150, saldoAnterior: 1000, compensacionAplicada: 0, aIngresar: 0, saldoPendiente: 1150 });
  });

  it('sin ningún saldo inicial ni facturas, el arrastre no genera nada de la nada (ausencia de datos anteriores)', () => {
    const [q1] = calcularTrimestres([], gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.ivaArrastre).toEqual({ resultadoTrimestre: 0, saldoAnterior: 0, compensacionAplicada: 0, aIngresar: 0, saldoPendiente: 0 });
    expect(q1.igicArrastre).toEqual({ resultadoTrimestre: 0, saldoAnterior: 0, compensacionAplicada: 0, aIngresar: 0, saldoPendiente: 0 });
  });

  describe('calcularSaldoEntradaAnio — I. saldo que pasa de 4T de un año a 1T del año siguiente', () => {
    it('sin saldo inicial: el cierre real de 2026 (con un histórico de un solo año) alimenta la entrada de 2027', () => {
      const facturas2026 = [gastoIva('g1', '2026-10-10', 500)]; // Q4 2026: -500 → cierra el año con 500€ pendientes
      const entrada2027 = calcularSaldoEntradaAnio([{ facturas: facturas2026 }], gastosPeriodicos, { regionFiscal: '', repepActivo: false });
      expect(entrada2027).toEqual({ iva: 500, igic: 0 });

      // Y aplicado de verdad al cálculo de 2027 (no solo al helper aislado):
      const facturas2027 = [ingresoIva('i1', '2027-01-10', 300)]; // Q1 2027: +300, con 500€ de entrada
      const [q1_2027] = calcularTrimestres(facturas2027, gastosPeriodicos, {
        regionFiscal: '', repepActivo: false, saldoInicial: { beneficio: 0, irpf: 0, ...entrada2027 },
      });
      expect(q1_2027.ivaArrastre).toEqual({ resultadoTrimestre: 300, saldoAnterior: 500, compensacionAplicada: 300, aIngresar: 0, saldoPendiente: 200 });
    });

    it('con saldo inicial manual en un año anterior al histórico: se usa como punto de partida de la cadena, no se pierde', () => {
      // Saldo inicial manual de 1.000€ configurado para 2025 (antes de que el negocio tuviera facturas en la app);
      // 2025 sin movimiento; 2026 compensa parte. calcularSaldoEntradaAnio(historico=[2025, 2026]) debe dar la entrada de 2027.
      const facturas2025: Factura[] = [];
      const facturas2026 = [ingresoIva('i1', '2026-01-10', 400)]; // Q1 2026: +400, compensa 400 del saldo inicial de 1000 → queda 600
      const entrada2027 = calcularSaldoEntradaAnio(
        [{ facturas: facturas2025 }, { facturas: facturas2026 }],
        gastosPeriodicos, { regionFiscal: '', repepActivo: false },
        { iva: 1000, igic: 0 }
      );
      expect(entrada2027.iva).toBe(600);
    });

    it('historico vacío y sin saldoInicial → entrada 0 (primer año de uso de la app, sin dato anterior)', () => {
      expect(calcularSaldoEntradaAnio([], gastosPeriodicos, { regionFiscal: '', repepActivo: false })).toEqual({ iva: 0, igic: 0 });
    });
  });

  it('J. Rectificativa que cambia el resultado de un trimestre — el arrastre ve el resultado YA con el signo aplicado, sin aplicarlo dos veces', () => {
    const original = ingresoIva('orig', '2026-04-10', 500); // Q2: +500
    const rectificativa: Factura = { ...ingresoIva('rect', '2026-04-15', 200), naturaleza: 'rectificativa', facturaOriginalId: 'orig' };
    // ivaResultado de Q2 = 500 - 200 (la rectificativa resta) = 300 → nunca 500-(-200)=700 ni ningún otro signo duplicado.
    const [, q2] = calcularTrimestres([original, rectificativa], gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q2.impuestos.ivaResultado).toBe(300);
    expect(q2.ivaArrastre).toEqual({ resultadoTrimestre: 300, saldoAnterior: 0, compensacionAplicada: 0, aIngresar: 300, saldoPendiente: 0 });
  });

  it('K. Rectificativa de un trimestre anterior — el arrastre resulta correcto en el trimestre en que se REGISTRA la rectificativa, nunca en el de la original (mismo criterio que ya usa el resto del motor)', () => {
    const original = ingresoIva('orig', '2026-01-10', 500); // Q1: +500 → ingresa 500, sin saldo
    const rectificativa: Factura = { ...ingresoIva('rect', '2026-07-15', 200), naturaleza: 'rectificativa', facturaOriginalId: 'orig' };
    const [q1, , q3] = calcularTrimestres([original, rectificativa], gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q1.ivaArrastre).toEqual({ resultadoTrimestre: 500, saldoAnterior: 0, compensacionAplicada: 0, aIngresar: 500, saldoPendiente: 0 });
    // Q3 (donde se registra la rectificativa): -200, no toca Q1 ya calculado — se convierte en saldo pendiente de Q3 en adelante.
    expect(q3.ivaArrastre).toEqual({ resultadoTrimestre: -200, saldoAnterior: 0, compensacionAplicada: 0, aIngresar: 0, saldoPendiente: 200 });
  });

  it('L. REPEP activo — sin facturas de IGIC real (caso normal bajo REPEP), el arrastre de IGIC no genera ni consume saldo en ningún trimestre', () => {
    const facturas = [
      gastoIva('g1', '2026-01-10', 100), // solo movimiento de IVA (p. ej. una compra en Península) — REPEP no afecta a esto
      ingresoIva('i1', '2026-04-10', 150),
    ];
    const trimestres = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: 'canarias', repepActivo: true });
    for (const t of trimestres) {
      expect(t.impuestos.igicResultado).toBe(0);
      expect(t.igicArrastre).toEqual({ resultadoTrimestre: 0, saldoAnterior: 0, compensacionAplicada: 0, aIngresar: 0, saldoPendiente: 0 });
    }
    // El IVA (ajeno a REPEP, que solo afecta al IGIC) sigue arrastrando con normalidad.
    expect(trimestres[0].ivaArrastre.saldoPendiente).toBe(100);
  });

  it('13. El cálculo de IRPF no cambia con la llegada del arrastre IVA/IGIC — mismo resultado que antes de esta fase con o sin saldoInicial.iva/igic', () => {
    const facturas = [factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 6000 })];
    const sinIvaIgic = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false, saldoInicial: { beneficio: 1000, irpf: 200 } });
    const conIvaIgic = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false, saldoInicial: { beneficio: 1000, irpf: 200, iva: 999, igic: 999 } });
    expect(conIvaIgic[0].beneficioAcumulado).toBe(sinIvaIgic[0].beneficioAcumulado);
    expect(conIvaIgic[0].irpf).toBe(sinIvaIgic[0].irpf);
  });

  it('14. calcularPosicionFiscal() sigue sin mezclar IVA e IGIC — cada uno con su propio arrastre completo, nunca combinados', () => {
    const facturas = [gastoIva('g1', '2026-01-10', 300), gastoIgic('g2', '2026-01-10', 150)];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    const posicion = calcularPosicionFiscal(q1);
    expect(posicion.iva.saldoPendiente).toBe(300);
    expect(posicion.igic.saldoPendiente).toBe(150);
    expect((posicion as any).totalAIngresar).toBeUndefined();
    expect((posicion.iva as any).saldoIgic).toBeUndefined();
    expect((posicion.igic as any).saldoIva).toBeUndefined();
  });
});

describe('calcularTotalAIngresar — Fase Total estimado a ingresar (25/09/2026)', () => {
  const gastosPeriodicos: GastoPeriodico[] = [];

  /**
   * Construye una PosicionFiscalTrimestre directamente con los valores
   * exactos que necesita cada test — más claro que fabricar facturas para
   * llegar a una cifra concreta, y perfectamente legítimo: la función bajo
   * test es pura, solo consume esta forma, no le importa de dónde salió.
   */
  const posicion = (over: {
    irpf?: number;
    ivaResultado?: number; ivaSaldoAnterior?: number; ivaCompensacion?: number; ivaAIngresar?: number; ivaSaldoPendiente?: number;
    igicResultado?: number; igicSaldoAnterior?: number; igicCompensacion?: number; igicAIngresar?: number; igicSaldoPendiente?: number;
  }): ReturnType<typeof calcularPosicionFiscal> => ({
    resultadoEconomico: 0,
    irpf: { importe: over.irpf ?? 0, tipoModelo: '130' },
    iva: {
      resultado: over.ivaResultado ?? 0, tipoModelo: '303',
      resultadoTrimestre: over.ivaResultado ?? 0,
      saldoAnterior: over.ivaSaldoAnterior ?? 0,
      compensacionAplicada: over.ivaCompensacion ?? 0,
      aIngresar: over.ivaAIngresar ?? 0,
      saldoPendiente: over.ivaSaldoPendiente ?? 0,
    },
    igic: {
      resultado: over.igicResultado ?? 0, tipoModelo: '420',
      resultadoTrimestre: over.igicResultado ?? 0,
      saldoAnterior: over.igicSaldoAnterior ?? 0,
      compensacionAplicada: over.igicCompensacion ?? 0,
      aIngresar: over.igicAIngresar ?? 0,
      saldoPendiente: over.igicSaldoPendiente ?? 0,
    },
  });

  it('1. Solo IRPF a ingresar', () => {
    expect(calcularTotalAIngresar(posicion({ irpf: 650 }))).toEqual({ irpf: 650, iva: 0, igic: 0, total: 650 });
  });

  it('2. Solo IVA a ingresar', () => {
    expect(calcularTotalAIngresar(posicion({ ivaAIngresar: 300 }))).toEqual({ irpf: 0, iva: 300, igic: 0, total: 300 });
  });

  it('3. Solo IGIC a ingresar', () => {
    expect(calcularTotalAIngresar(posicion({ igicAIngresar: 150 }))).toEqual({ irpf: 0, iva: 0, igic: 150, total: 150 });
  });

  it('4. IRPF + IVA', () => {
    expect(calcularTotalAIngresar(posicion({ irpf: 650, ivaAIngresar: 300 })).total).toBe(950);
  });

  it('5. IRPF + IGIC', () => {
    expect(calcularTotalAIngresar(posicion({ irpf: 650, igicAIngresar: 150 })).total).toBe(800);
  });

  it('6. IVA + IGIC simultáneamente', () => {
    expect(calcularTotalAIngresar(posicion({ ivaAIngresar: 300, igicAIngresar: 150 })).total).toBe(450);
  });

  it('7. Los tres impuestos simultáneamente', () => {
    expect(calcularTotalAIngresar(posicion({ irpf: 650, ivaAIngresar: 300, igicAIngresar: 150 })))
      .toEqual({ irpf: 650, iva: 300, igic: 150, total: 1100 });
  });

  it('8. IVA con saldo pendiente de compensar — el pendiente NO entra en el total', () => {
    expect(calcularTotalAIngresar(posicion({ ivaAIngresar: 0, ivaSaldoPendiente: 400 })))
      .toEqual({ irpf: 0, iva: 0, igic: 0, total: 0 });
  });

  it('9. IGIC con saldo pendiente de compensar — el pendiente NO entra en el total', () => {
    expect(calcularTotalAIngresar(posicion({ igicAIngresar: 0, igicSaldoPendiente: 200 })))
      .toEqual({ irpf: 0, iva: 0, igic: 0, total: 0 });
  });

  it('10. IVA e IGIC con saldos independientes — nunca se compensan entre sí en el total', () => {
    // El saldo pendiente de IGIC (200) no reduce el IVA a ingresar (300), ni al revés.
    expect(calcularTotalAIngresar(posicion({ ivaAIngresar: 300, igicAIngresar: 0, igicSaldoPendiente: 200 })))
      .toEqual({ irpf: 0, iva: 300, igic: 0, total: 300 });
  });

  it('11. Resultado negativo → sin importe a ingresar (aIngresar ya viene en 0 desde el arrastre)', () => {
    const r = calcularTotalAIngresar(posicion({ ivaResultado: -300, ivaAIngresar: 0, ivaSaldoPendiente: 300 }));
    expect(r.iva).toBe(0);
    expect(r.total).toBe(0);
  });

  it('12. Rectificativa que modifica el total — el signo se aplica una sola vez, el total refleja la corrección', () => {
    const original = factura({ id: 'orig', tipo: 'ingreso', fecha: '2026-04-10', tipoImpuesto: 'iva', importe: 2500, importeImpuesto: 500 }); // Q2: IVA +500
    const rectificativa: Factura = {
      ...factura({ id: 'rect', tipo: 'ingreso', fecha: '2026-04-15', tipoImpuesto: 'iva', importe: 1000, importeImpuesto: 200 }),
      naturaleza: 'rectificativa', facturaOriginalId: 'orig',
    }; // resta 200€ del IVA repercutido de Q2 → ivaResultado neto = 300
    // Gasto sin impuesto que compensa el beneficio neto (2500-1000=1500) de estas dos facturas, para
    // aislar el efecto de la rectificativa sobre el IVA sin que el IRPF interfiera en el total.
    const offsetBeneficio = factura({ id: 'g-offset', tipo: 'gasto', fecha: '2026-04-10', importe: 1500 });
    const [, q2] = calcularTrimestres([original, rectificativa, offsetBeneficio], gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(q2.impuestos.ivaResultado).toBe(300); // ni 500-(-200)=700 ni ningún otro signo duplicado
    expect(q2.irpf).toBe(0); // beneficio neutralizado a propósito, ver comentario arriba
    const r = calcularTotalAIngresar(calcularPosicionFiscal(q2));
    expect(r.iva).toBe(300);
    expect(r.total).toBe(300);
  });

  it('13. Cambio de trimestre — cada trimestre usa su propia posición fiscal, el total se actualiza correctamente', () => {
    // Cada trimestre lleva un ingreso/gasto sin impuesto que compensa el beneficio de la factura con IVA de
    // ese mismo trimestre — aísla el efecto del arrastre de IVA sobre el total, sin que el IRPF interfiera.
    const facturas = [
      factura({ id: 'g1', tipo: 'gasto', fecha: '2026-01-10', tipoImpuesto: 'iva', importe: 1000, importeImpuesto: 300 }), // Q1: IVA soportado 300 → resultado -300
      factura({ id: 'i0', tipo: 'ingreso', fecha: '2026-01-10', importe: 1000 }), // compensa el beneficio de Q1
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-04-10', tipoImpuesto: 'iva', importe: 500, importeImpuesto: 500 }), // Q2: IVA repercutido 500 → resultado +500, compensa los 300 de Q1
      factura({ id: 'g0', tipo: 'gasto', fecha: '2026-04-10', importe: 500 }), // compensa el beneficio de Q2
      factura({ id: 'i2', tipo: 'ingreso', fecha: '2026-07-10', tipoImpuesto: 'iva', importe: 100, importeImpuesto: 100 }), // Q3: IVA +100, sin saldo previo
      factura({ id: 'g2', tipo: 'gasto', fecha: '2026-07-10', importe: 100 }), // compensa el beneficio de Q3
    ];
    const trimestres = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(trimestres[0].irpf).toBe(0);
    expect(trimestres[1].irpf).toBe(0);
    expect(trimestres[2].irpf).toBe(0);
    const totalQ1 = calcularTotalAIngresar(calcularPosicionFiscal(trimestres[0]));
    const totalQ2 = calcularTotalAIngresar(calcularPosicionFiscal(trimestres[1]));
    const totalQ3 = calcularTotalAIngresar(calcularPosicionFiscal(trimestres[2]));
    expect(totalQ1.total).toBe(0); // negativo, nada a ingresar
    expect(totalQ2.total).toBe(200); // 500 - 300 de saldo compensado
    expect(totalQ3.total).toBe(100); // ya sin saldo pendiente, todo el resultado se ingresa
  });

  it('14. Cambio de año — el total de 2027 Q1 usa el saldo pendiente real de 2026 Q4, sin mezclar años', () => {
    const facturas2026 = [factura({ id: 'g1', tipo: 'gasto', fecha: '2026-10-10', tipoImpuesto: 'iva', importe: 500, importeImpuesto: 500 })]; // Q4 2026: IVA -500
    const entrada2027 = calcularSaldoEntradaAnio([{ facturas: facturas2026 }], gastosPeriodicos, { regionFiscal: '', repepActivo: false });
    expect(entrada2027).toEqual({ iva: 500, igic: 0 });

    const facturas2027 = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2027-01-10', tipoImpuesto: 'iva', importe: 300, importeImpuesto: 300 }), // Q1 2027: IVA +300
      factura({ id: 'g-offset', tipo: 'gasto', fecha: '2027-01-10', importe: 300 }), // compensa el beneficio, aísla el efecto sobre el IVA
    ];
    const [q1_2027] = calcularTrimestres(facturas2027, gastosPeriodicos, {
      regionFiscal: '', repepActivo: false, saldoInicial: { beneficio: 0, irpf: 0, ...entrada2027 },
    });
    expect(q1_2027.irpf).toBe(0);
    const total2027Q1 = calcularTotalAIngresar(calcularPosicionFiscal(q1_2027));
    // 300€ no llega a cubrir los 500€ pendientes de 2026 → nada a ingresar, sigue quedando saldo (nunca se mezcla con 2026).
    expect(total2027Q1.iva).toBe(0);
    expect(total2027Q1.total).toBe(0);
    expect(q1_2027.ivaArrastre.saldoPendiente).toBe(200);
  });

  it('15. REPEP activo — IGIC no aplicable no aporta nada al total, el IVA real de una compra/venta en Península sí', () => {
    const facturas = [
      factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', tipoImpuesto: 'iva', importe: 726, importeImpuesto: 126 }),
      factura({ id: 'g-offset', tipo: 'gasto', fecha: '2026-01-10', importe: 726 }), // compensa el beneficio, aísla el efecto sobre el IVA
    ];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: 'canarias', repepActivo: true });
    expect(q1.impuestos.igicResultado).toBe(0);
    expect(q1.irpf).toBe(0);
    const total = calcularTotalAIngresar(calcularPosicionFiscal(q1));
    expect(total.igic).toBe(0);
    expect(total.iva).toBe(126);
    expect(total.total).toBe(126);
  });

  it('16. Caso sin datos fiscales (trimestre sin facturas) → total 0, sin errores', () => {
    expect(calcularTotalAIngresar(posicion({}))).toEqual({ irpf: 0, iva: 0, igic: 0, total: 0 });
  });

  it('17. El IRPF no se descuenta dos veces — usa irpf.importe tal cual, ya neto de trimestres anteriores', () => {
    // beneficio de 6000€ en Q1 con saldoInicial.irpf de 200€ ya "pagado" → irpf de Q1 = max(0, 6000*0.20 - 200) = 1000
    const facturas = [factura({ id: 'i1', tipo: 'ingreso', fecha: '2026-01-10', importe: 6000 })];
    const [q1] = calcularTrimestres(facturas, gastosPeriodicos, { regionFiscal: '', repepActivo: false, saldoInicial: { beneficio: 0, irpf: 200 } });
    const posicionQ1 = calcularPosicionFiscal(q1);
    expect(posicionQ1.irpf.importe).toBe(1000);
    // Si calcularTotalAIngresar volviera a restar algo aquí, saldría menos de 1000 — no debe ocurrir.
    expect(calcularTotalAIngresar(posicionQ1).irpf).toBe(1000);
  });

  it('18. IVA e IGIC nunca se compensan entre sí en el total — un saldo grande de IVA a compensar no reduce el IGIC a ingresar', () => {
    expect(calcularTotalAIngresar(posicion({ ivaAIngresar: 0, ivaSaldoPendiente: 900, igicAIngresar: 300 })))
      .toEqual({ irpf: 0, iva: 0, igic: 300, total: 300 });
  });

  it('Test de ejemplo central del encargo — IRPF 650€ + IVA 300€ (tras compensar 500€ de un resultado de 800€) + IGIC 0€ (con 200€ pendientes) = 950€', () => {
    const p = posicion({
      irpf: 650,
      ivaResultado: 800, ivaSaldoAnterior: 500, ivaCompensacion: 500, ivaAIngresar: 300, ivaSaldoPendiente: 0,
      igicResultado: -200, igicAIngresar: 0, igicSaldoPendiente: 200,
    });
    expect(calcularTotalAIngresar(p)).toEqual({ irpf: 650, iva: 300, igic: 0, total: 950 });
    // Los saldos pendientes, informativos, siguen disponibles aparte en la propia posición — nunca en el total.
    expect(p.iva.saldoPendiente).toBe(0);
    expect(p.igic.saldoPendiente).toBe(200);
  });
});
