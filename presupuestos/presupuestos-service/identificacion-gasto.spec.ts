import { identificarTipoGasto } from './identificacion-gasto.js';

describe('identificarTipoGasto — Fase 3C.3 (backend)', () => {
  it('Leroy Merlín + concepto de material de obra → materiales', () => {
    const r = identificarTipoGasto({ proveedor: 'LEROY MERLIN', concepto: 'TABLERO BLANCO A-244 B-39.5 C-1.6M 2C' });
    expect(r.categoriaFiscal).toBe('materiales');
  });

  it('Leroy Merlín sin concepto suficiente → por_clasificar, nunca inventa', () => {
    const r = identificarTipoGasto({ proveedor: 'Leroy Merlín', concepto: '' });
    expect(r.categoriaFiscal).toBe('por_clasificar');
    expect(r.confianza).toBe('insuficiente');
  });

  it('Maderas Santana (proveedor especializado) → materiales sin necesitar concepto', () => {
    const r = identificarTipoGasto({ proveedor: 'MADERAS SANTANA S.L.', concepto: '' });
    expect(r.categoriaFiscal).toBe('materiales');
  });

  it('Hooba Iberia + cuota mensual de facturación → software', () => {
    const r = identificarTipoGasto({ proveedor: 'Hooba Iberia, SL', concepto: 'Cuota mensual Hooba Facturación' });
    expect(r.categoriaFiscal).toBe('software');
  });

  it('Parte Automóviles + reparación de furgoneta → vehiculo, con hecho requerido', () => {
    const r = identificarTipoGasto({ proveedor: 'PARTE AUTOMOVILES, S.L.', concepto: 'reparacion culata de la furgoneta' });
    expect(r.categoriaFiscal).toBe('vehiculo');
    expect(r.hechoRequerido).toBe('vehiculoUsoExclusivo');
  });

  it('Tenerife Business Partners + Trimestral → servicios_profesionales, sin pregunta', () => {
    const r = identificarTipoGasto({ proveedor: 'Tenerife business partners sl', concepto: 'Trimestral' });
    expect(r.categoriaFiscal).toBe('servicios_profesionales');
    expect(r.hechoRequerido).toBeUndefined();
  });

  it('Tenerife Business Partners + Declaración de la renta → pregunta requerida, aunque el proveedor sea gestoría', () => {
    const r = identificarTipoGasto({ proveedor: 'Tenerife business partners sl', concepto: 'Declaración de la renta' });
    expect(r.categoriaFiscal).toBe('servicios_profesionales');
    expect(r.hechoRequerido).toBe('gestoriaSoloActividad');
  });

  it('Media Markt + tablet → material_oficina, con hecho requerido de dispositivo', () => {
    const r = identificarTipoGasto({ proveedor: 'MEDIA MARKT CANARIAS S.A.', concepto: 'LENOVO IDEA TAB PLUS 6, ELITE TABLET' });
    expect(r.categoriaFiscal).toBe('material_oficina');
    expect(r.hechoRequerido).toBe('dispositivoUsoExclusivo');
  });

  it('Media Markt + papel/tóner → material_oficina, sin pregunta', () => {
    const r = identificarTipoGasto({ proveedor: 'MEDIA MARKT CANARIAS S.A.', concepto: 'Papel A4, tóner compatible' });
    expect(r.categoriaFiscal).toBe('material_oficina');
    expect(r.hechoRequerido).toBeUndefined();
  });
});
