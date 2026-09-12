import { resolverIrpf, resolverIndirecto, aplicarResolucionAPorcentaje, resolverTratamientoFiscal } from './motor-resolucion-fiscal.js';

describe('resolverIrpf — Fase 3C.2/3C.3 (backend)', () => {
  it('categoría sin restricción → resuelto_automatico 100%', () => {
    const r = resolverIrpf({ tipo: 'gasto', categoriaFiscal: 'materiales', baseImponible: 100, importe: 121 });
    expect(r.estado).toBe('resuelto_automatico');
    expect(r.porcentaje).toBe(100);
  });

  it('categoría con excepción (vehiculo) sin hecho → revision_manual (comportamiento base sin contexto)', () => {
    const r = resolverIrpf({ tipo: 'gasto', categoriaFiscal: 'vehiculo', baseImponible: 100, importe: 121 });
    expect(r.estado).toBe('revision_manual');
  });

  it('ingreso → no_aplica', () => {
    const r = resolverIrpf({ tipo: 'ingreso', categoriaFiscal: 'materiales', baseImponible: 100, importe: 121 });
    expect(r.estado).toBe('no_aplica');
  });

  it('vehiculo sin hecho respondido → pendiente_respuesta', () => {
    const r = resolverIrpf({ tipo: 'gasto', categoriaFiscal: 'vehiculo', baseImponible: 5045.75, importe: 6105.36 }, { hechoRequerido: 'vehiculoUsoExclusivo', hechosFiscales: {} });
    expect(r.estado).toBe('pendiente_respuesta');
    expect(r.preguntaId).toBe('vehiculoUsoExclusivo');
  });

  it('vehiculo uso exclusivo=true → resuelto_automatico 100%', () => {
    const r = resolverIrpf({ tipo: 'gasto', categoriaFiscal: 'vehiculo', baseImponible: 5045.75, importe: 6105.36 }, { hechoRequerido: 'vehiculoUsoExclusivo', hechosFiscales: { vehiculoUsoExclusivo: true } });
    expect(r.estado).toBe('resuelto_automatico');
    expect(r.porcentaje).toBe(100);
  });

  it('vehiculo uso exclusivo=false → resuelto_automatico 0% (no revision_manual sin más)', () => {
    const r = resolverIrpf({ tipo: 'gasto', categoriaFiscal: 'vehiculo', baseImponible: 5045.75, importe: 6105.36 }, { hechoRequerido: 'vehiculoUsoExclusivo', hechosFiscales: { vehiculoUsoExclusivo: false } });
    expect(r.estado).toBe('resuelto_automatico');
    expect(r.porcentaje).toBe(0);
  });
});

describe('resolverIndirecto — Fase 3C.2/3C.3 (backend, CASO FUNDAMENTAL)', () => {
  it('factura IVA (Península) con categoría verde → IVA resuelto, IGIC no_aplica — nunca se convierte', () => {
    const f = { tipoImpuesto: 'iva' as const, importeImpuesto: 1059.61, baseImponible: 5045.75, porcentajeImpuesto: 21, categoriaFiscal: 'materiales' as const };
    const { iva, igic } = resolverIndirecto(f, { repepActivo: false });
    expect(iva.estado).toBe('resuelto_automatico');
    expect(igic.estado).toBe('no_aplica');
  });

  it('empresa con REPEP activo + factura real de IVA → IVA se resuelve igual, REPEP no lo afecta', () => {
    const f = { tipoImpuesto: 'iva' as const, importeImpuesto: 21, baseImponible: 100, porcentajeImpuesto: 21, categoriaFiscal: 'materiales' as const };
    const { iva, igic } = resolverIndirecto(f, { repepActivo: true });
    expect(iva.estado).toBe('resuelto_automatico');
    expect(igic.estado).toBe('no_aplica');
  });

  it('factura IGIC con REPEP activo → revision_manual, nunca resuelto', () => {
    const f = { tipoImpuesto: 'igic' as const, importeImpuesto: 7, baseImponible: 100, porcentajeImpuesto: 7, categoriaFiscal: 'materiales' as const };
    const { igic } = resolverIndirecto(f, { repepActivo: true });
    expect(igic.estado).toBe('revision_manual');
  });

  it('vehiculo IVA con uso exclusivo=false → revision_manual, nunca un 50%/prorrata inventado', () => {
    const f = { tipoImpuesto: 'iva' as const, importeImpuesto: 1059.61, baseImponible: 5045.75, porcentajeImpuesto: 21, categoriaFiscal: 'vehiculo' as const };
    const { iva } = resolverIndirecto(f, { repepActivo: false, hechoRequerido: 'vehiculoUsoExclusivo', hechosFiscales: { vehiculoUsoExclusivo: false } });
    expect(iva.estado).toBe('revision_manual');
  });

  it('sin base/cuota → revision_manual, nunca una cuota derivada del total', () => {
    const f = { tipoImpuesto: 'iva' as const, importeImpuesto: undefined, baseImponible: undefined, porcentajeImpuesto: undefined, categoriaFiscal: 'materiales' as const };
    const { iva } = resolverIndirecto(f, { repepActivo: false });
    expect(iva.estado).toBe('revision_manual');
    expect(iva.importe).toBeUndefined();
  });
});

describe('aplicarResolucionAPorcentaje — nunca sobrescribe decisiones humanas (backend)', () => {
  it('respeta 0 como decisión real', () => {
    const resolucion = { estado: 'resuelto_automatico' as const, porcentaje: 100, confianza: 'alta' as const, explicacion: '' };
    expect(aplicarResolucionAPorcentaje(0, resolucion)).toBe(0);
  });
});

describe('resolverTratamientoFiscal — orquestación (backend, Fase 3C.3)', () => {
  it('Maderas Santana sin categoriaFiscal → identifica materiales y resuelve automático', () => {
    const r = resolverTratamientoFiscal(
      { tipo: 'gasto', proveedor: 'MADERAS SANTANA S.L.', concepto: 'ALVIC-TAB.MDF', categoria: '', importe: 207.83, baseImponible: 207.83 },
      { repepActivo: false }
    );
    expect(r.categoriaFiscalSugerida).toBe('materiales');
    expect(r.irpf.estado).toBe('resuelto_automatico');
    expect(r.preguntasFiscalesPendientes).toHaveLength(0);
  });

  it('Parte Automóviles sin hecho respondido → pregunta factual en IRPF e IVA', () => {
    const r = resolverTratamientoFiscal(
      { tipo: 'gasto', proveedor: 'PARTE AUTOMOVILES, S.L.', concepto: 'reparacion culata de la furgoneta', categoria: 'servicios', importe: 6105.36, baseImponible: 5045.75, tipoImpuesto: 'iva', importeImpuesto: 1059.61, porcentajeImpuesto: 21 },
      { repepActivo: false }
    );
    expect(r.categoriaFiscalSugerida).toBe('vehiculo');
    expect(r.irpf.estado).toBe('pendiente_respuesta');
    expect(r.iva.estado).toBe('pendiente_respuesta');
    expect(r.preguntasFiscalesPendientes).toHaveLength(2);
  });

  it('categoriaFiscal ya decidida a mano nunca se sobrescribe', () => {
    const r = resolverTratamientoFiscal(
      { tipo: 'gasto', proveedor: 'MADERAS SANTANA S.L.', concepto: 'tableros', categoria: '', categoriaFiscal: 'otros', importe: 121, baseImponible: 100 },
      { repepActivo: false }
    );
    expect(r.categoriaFiscalSugerida).toBeUndefined();
    expect(r.irpf.estado).toBe('revision_manual');
  });
});
