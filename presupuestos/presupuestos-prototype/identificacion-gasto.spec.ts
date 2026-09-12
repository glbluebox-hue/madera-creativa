import { identificarTipoGasto } from './identificacion-gasto.js';

describe('identificarTipoGasto — Fase 3C.3', () => {
  // Test 1: Leroy Merlín (generalista) + concepto de material de obra → materiales.
  it('Leroy Merlín + "TABLERO BLANCO..." → materiales, alta confianza', () => {
    const r = identificarTipoGasto({ proveedor: 'LEROY MERLIN', concepto: 'TABLERO BLANCO A-244 B-39.5 C-1.6M 2C', categoria: '' });
    expect(r.categoriaFiscal).toBe('materiales');
    expect(r.confianza).toBe('alta');
  });

  // Test 2: proveedor generalista SIN concepto suficiente → nunca se inventa.
  it('Leroy Merlín sin concepto suficiente → por_clasificar, insuficiente (nunca inventa materiales)', () => {
    const r = identificarTipoGasto({ proveedor: 'Leroy Merlín', concepto: '', categoria: '' });
    expect(r.categoriaFiscal).toBe('por_clasificar');
    expect(r.confianza).toBe('insuficiente');
  });

  // Test 3: Maderas Santana (proveedor monoproducto) + tableros → materiales, sin necesitar concepto.
  it('Maderas Santana (proveedor especializado) → materiales incluso con concepto vacío', () => {
    const r = identificarTipoGasto({ proveedor: 'MADERAS SANTANA S.L.', concepto: '', categoria: '' });
    expect(r.categoriaFiscal).toBe('materiales');
    expect(r.confianza).toBe('alta');
  });

  it('Justo León Ramos + tableros → materiales', () => {
    const r = identificarTipoGasto({ proveedor: 'JUSTO LEÓN RAMOS, S.L.', concepto: 'TAB.RADIATA A/B 240*122*18 S/N', categoria: '' });
    expect(r.categoriaFiscal).toBe('materiales');
  });

  it('Pazrey Herrajes + conectores → materiales', () => {
    const r = identificarTipoGasto({ proveedor: 'PAZREY HERRAJES, SL', concepto: 'CONECTOR T IRA LED', categoria: '' });
    expect(r.categoriaFiscal).toBe('materiales');
  });

  it('Sagrera + formón → herramienta_pequena', () => {
    const r = identificarTipoGasto({ proveedor: 'SAGRERA CANARIAS', concepto: 'FORMON JGO.4 MANGO BI-MAT RATI', categoria: '' });
    expect(r.categoriaFiscal).toBe('herramienta_pequena');
  });

  // Test 4: Hooba (proveedor monoproducto de software).
  it('Hooba Iberia + "Cuota mensual Hooba Facturación" → software', () => {
    const r = identificarTipoGasto({ proveedor: 'Hooba Iberia, SL', concepto: 'Cuota mensual Hooba Facturación', categoria: 'servicios' });
    expect(r.categoriaFiscal).toBe('software');
    expect(r.confianza).toBe('alta');
  });

  // Test 5/6: vehículo — proveedor especializado y concepto, ambos casos.
  it('Parte Automóviles + "reparacion culata de la furgoneta" → vehiculo, con hecho requerido', () => {
    const r = identificarTipoGasto({ proveedor: 'PARTE AUTOMOVILES, S.L.', concepto: 'reparacion culata de la furgoneta', categoria: 'servicios' });
    expect(r.categoriaFiscal).toBe('vehiculo');
    expect(r.hechoRequerido).toBe('vehiculoUsoExclusivo');
  });

  it('Pratiche Auto Tenerife + "TRAMITE MATRÍCULA" → vehiculo, con hecho requerido', () => {
    const r = identificarTipoGasto({ proveedor: 'PRATICHE AUTO TENERIFE', concepto: 'TRAMITE MATRÍCULA', categoria: '' });
    expect(r.categoriaFiscal).toBe('vehiculo');
    expect(r.hechoRequerido).toBe('vehiculoUsoExclusivo');
  });

  // Test 7: gestoría — gestión normal de la actividad, sin hecho requerido.
  it('Tenerife Business Partners + "Trimestral" → servicios_profesionales, sin pregunta', () => {
    const r = identificarTipoGasto({ proveedor: 'Tenerife business partners sl', concepto: 'Trimestral', categoria: '' });
    expect(r.categoriaFiscal).toBe('servicios_profesionales');
    expect(r.hechoRequerido).toBeUndefined();
  });

  // Test 8: gestoría — declaración de la renta personal, con hecho requerido.
  it('Tenerife Business Partners + "Declaración de la renta" → servicios_profesionales, con hecho requerido', () => {
    const r = identificarTipoGasto({ proveedor: 'Tenerife business partners sl', concepto: 'Declaración de la renta', categoria: '' });
    expect(r.categoriaFiscal).toBe('servicios_profesionales');
    expect(r.hechoRequerido).toBe('gestoriaSoloActividad');
  });

  // Test 9: consumible de oficina, sin pregunta.
  it('Media Markt + "papel/tóner" → material_oficina, sin pregunta', () => {
    const r = identificarTipoGasto({ proveedor: 'MEDIA MARKT CANARIAS S.A.', concepto: 'Papel A4, tóner compatible', categoria: '' });
    expect(r.categoriaFiscal).toBe('material_oficina');
    expect(r.hechoRequerido).toBeUndefined();
  });

  // Test 10: equipo electrónico reutilizable, con pregunta.
  it('Media Markt + "tablet" → material_oficina, con hecho requerido de dispositivo', () => {
    const r = identificarTipoGasto({ proveedor: 'MEDIA MARKT CANARIAS S.A.', concepto: 'LENOVO IDEA TAB PLUS 6, ELITE TABLET', categoria: '' });
    expect(r.categoriaFiscal).toBe('material_oficina');
    expect(r.hechoRequerido).toBe('dispositivoUsoExclusivo');
  });

  it('proveedor y concepto totalmente desconocidos → por_clasificar, nunca inventa', () => {
    const r = identificarTipoGasto({ proveedor: 'Promaexpert', concepto: '', categoria: '' });
    expect(r.categoriaFiscal).toBe('por_clasificar');
    expect(r.confianza).toBe('insuficiente');
  });
});
