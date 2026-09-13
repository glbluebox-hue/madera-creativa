import { resolverIrpf, resolverIndirecto, aplicarResolucionAPorcentaje, resolverTratamientoFiscal } from './motor-resolucion-fiscal.js';
import type { CategoriaFiscal } from './categoria-fiscal.js';

const CATEGORIAS_VERDES: CategoriaFiscal[] = [
  'materiales', 'herramienta_pequena', 'mantenimiento', 'servicios_profesionales',
  'software', 'publicidad', 'bancos', 'material_oficina',
];

const CATEGORIAS_CON_EXCEPCION: CategoriaFiscal[] = ['vehiculo', 'combustible', 'seguros', 'telefono_internet', 'alquiler'];

describe('resolverIrpf — Fase 3C.2', () => {
  // Test 1: las 8 categorías aprobadas se resuelven automáticamente al 100%.
  for (const categoria of CATEGORIAS_VERDES) {
    it(`categoría "${categoria}" (sin restricción) → resuelto_automatico 100%`, () => {
      const r = resolverIrpf({ tipo: 'gasto', categoriaFiscal: categoria, baseImponible: 200, importe: 242 });
      expect(r.estado).toBe('resuelto_automatico');
      expect(r.porcentaje).toBe(100);
      expect(r.importe).toBeCloseTo(200);
      expect(r.confianza).toBe('alta');
      expect(typeof r.reglaId).toBe('string');
      expect(typeof r.fuenteOficial).toBe('object');
    });
  }

  // Test 2: categorías con un régimen alternativo conocido (afectación parcial, exclusividad, etc.) nunca se resuelven solas.
  for (const categoria of CATEGORIAS_CON_EXCEPCION) {
    it(`categoría "${categoria}" (con excepción conocida) → revision_manual, nunca automática`, () => {
      const r = resolverIrpf({ tipo: 'gasto', categoriaFiscal: categoria, baseImponible: 100, importe: 121 });
      expect(r.estado).toBe('revision_manual');
      expect(r.confianza).toBe('insuficiente');
      expect(r.porcentaje).toBeUndefined();
    });
  }

  // Test 3: categoriaFiscal ausente (histórico sin clasificar) → revision_manual, nunca un valor inventado.
  it('categoriaFiscal ausente → revision_manual', () => {
    const r = resolverIrpf({ tipo: 'gasto', categoriaFiscal: undefined, baseImponible: 100, importe: 121 });
    expect(r.estado).toBe('revision_manual');
  });

  // Test 4: 'otros' es una clasificación positiva pero sin regla automática todavía.
  it("categoriaFiscal 'otros' → revision_manual", () => {
    const r = resolverIrpf({ tipo: 'gasto', categoriaFiscal: 'otros', baseImponible: 100, importe: 121 });
    expect(r.estado).toBe('revision_manual');
  });

  // Test 5: 'por_clasificar' — se sabe explícitamente que aún no se sabe.
  it("categoriaFiscal 'por_clasificar' → revision_manual", () => {
    const r = resolverIrpf({ tipo: 'gasto', categoriaFiscal: 'por_clasificar', baseImponible: 100, importe: 121 });
    expect(r.estado).toBe('revision_manual');
  });

  // Test 6: un ingreso siempre es no_aplica en IRPF, sea cual sea la categoría.
  it('tipo ingreso → no_aplica, incluso con una categoría "verde"', () => {
    const r = resolverIrpf({ tipo: 'ingreso' as any, categoriaFiscal: 'materiales', baseImponible: 100, importe: 121 });
    expect(r.estado).toBe('no_aplica');
    expect(r.porcentaje).toBeUndefined();
  });

  // Test 7: usa baseImponible cuando está disponible, no el importe total con impuesto incluido.
  it('usa baseImponible (sin impuesto) para el importe deducible, no el importe total', () => {
    const r = resolverIrpf({ tipo: 'gasto', categoriaFiscal: 'materiales', baseImponible: 100, importe: 121 });
    expect(r.importe).toBeCloseTo(100);
  });

  // Test 8: sin baseImponible, usa importe como única base disponible (nunca inventa una base distinta).
  it('sin baseImponible, usa importe tal cual (única base disponible)', () => {
    const r = resolverIrpf({ tipo: 'gasto', categoriaFiscal: 'materiales', baseImponible: undefined, importe: 121 });
    expect(r.importe).toBeCloseTo(121);
  });
});

describe('resolverIndirecto — Fase 3C.2 (IVA e IGIC siempre independientes)', () => {
  // Test 9 (CASO FUNDAMENTAL): factura de IVA (Península) con categoría verde → IVA resuelto, IGIC siempre no_aplica.
  it('factura IVA con categoría verde → IVA resuelto_automatico 100%, IGIC no_aplica', () => {
    const f = { tipoImpuesto: 'iva' as const, importeImpuesto: 21, baseImponible: 100, porcentajeImpuesto: 21, categoriaFiscal: 'materiales' as CategoriaFiscal };
    const { iva, igic } = resolverIndirecto(f, { repepActivo: false });
    expect(iva.estado).toBe('resuelto_automatico');
    expect(iva.porcentaje).toBe(100);
    expect(iva.importe).toBeCloseTo(21);
    expect(igic.estado).toBe('no_aplica');
  });

  // Test 10: factura de IGIC (Canarias, sin REPEP) con categoría verde → IGIC resuelto, IVA siempre no_aplica.
  it('factura IGIC (sin REPEP) con categoría verde → IGIC resuelto_automatico 100%, IVA no_aplica', () => {
    const f = { tipoImpuesto: 'igic' as const, importeImpuesto: 7, baseImponible: 100, porcentajeImpuesto: 7, categoriaFiscal: 'materiales' as CategoriaFiscal };
    const { iva, igic } = resolverIndirecto(f, { repepActivo: false });
    expect(igic.estado).toBe('resuelto_automatico');
    expect(igic.porcentaje).toBe(100);
    expect(igic.importe).toBeCloseTo(7);
    expect(iva.estado).toBe('no_aplica');
    expect(igic.fuenteOficial?.referencia).toContain('Ley 20/1991');
  });

  // Test 11 (CASO FUNDAMENTAL Canarias+REPEP con factura de IVA de Península): repepActivo NUNCA bloquea el eje IVA —
  // solo bloquea IGIC. Una empresa canaria con REPEP que compra en Península sigue teniendo IVA deducible con normalidad.
  it('empresa con REPEP activo + factura real de IVA → el IVA se resuelve igual, REPEP no lo afecta', () => {
    const f = { tipoImpuesto: 'iva' as const, importeImpuesto: 21, baseImponible: 100, porcentajeImpuesto: 21, categoriaFiscal: 'materiales' as CategoriaFiscal };
    const { iva, igic } = resolverIndirecto(f, { repepActivo: true });
    expect(iva.estado).toBe('resuelto_automatico');
    expect(iva.porcentaje).toBe(100);
    expect(igic.estado).toBe('no_aplica'); // nunca se "convierte" en IGIC por estar la empresa en Canarias
  });

  // Test 12: REPEP activo SÍ bloquea el eje IGIC — un régimen sin repercusión/deducción de IGIC no tiene, hoy, una regla automática vigente.
  it('factura IGIC con REPEP activo → revision_manual (bloqueado), nunca resuelto', () => {
    const f = { tipoImpuesto: 'igic' as const, importeImpuesto: 7, baseImponible: 100, porcentajeImpuesto: 7, categoriaFiscal: 'materiales' as CategoriaFiscal };
    const { iva, igic } = resolverIndirecto(f, { repepActivo: true });
    expect(igic.estado).toBe('revision_manual');
    expect(igic.confianza).toBe('insuficiente');
    expect(iva.estado).toBe('no_aplica');
  });

  // Test 13: factura exenta → ambos ejes no_aplica (dato real de la propia factura, no una suposición del motor).
  it("tipoImpuesto 'exento' → IVA e IGIC no_aplica", () => {
    const f = { tipoImpuesto: 'exento' as const, importeImpuesto: undefined, baseImponible: 100, porcentajeImpuesto: undefined, categoriaFiscal: 'materiales' as CategoriaFiscal };
    const { iva, igic } = resolverIndirecto(f, { repepActivo: false });
    expect(iva.estado).toBe('no_aplica');
    expect(igic.estado).toBe('no_aplica');
  });

  // Test 14: factura sin impuesto → ambos ejes no_aplica.
  it("tipoImpuesto 'sin_impuesto' → IVA e IGIC no_aplica", () => {
    const f = { tipoImpuesto: 'sin_impuesto' as const, importeImpuesto: undefined, baseImponible: 100, porcentajeImpuesto: undefined, categoriaFiscal: 'materiales' as CategoriaFiscal };
    const { iva, igic } = resolverIndirecto(f, { repepActivo: false });
    expect(iva.estado).toBe('no_aplica');
    expect(igic.estado).toBe('no_aplica');
  });

  // Test 15: tipoImpuesto '' (no identificado, histórico) → ambos ejes revision_manual, nunca se adivina IVA o IGIC.
  it("tipoImpuesto '' (no identificado) → IVA e IGIC revision_manual, nunca se asigna a ninguno de los dos", () => {
    const f = { tipoImpuesto: '' as const, importeImpuesto: 21, baseImponible: 100, porcentajeImpuesto: 21, categoriaFiscal: 'materiales' as CategoriaFiscal };
    const { iva, igic } = resolverIndirecto(f, { repepActivo: false });
    expect(iva.estado).toBe('revision_manual');
    expect(igic.estado).toBe('revision_manual');
  });

  // Test 16: sin cuota real calculable (ni importeImpuesto, ni baseImponible+porcentajeImpuesto) → revision_manual, NUNCA 0€.
  it('sin cuota real calculable → revision_manual, nunca 0€ ni un valor derivado del total', () => {
    const f = { tipoImpuesto: 'iva' as const, importeImpuesto: undefined, baseImponible: undefined, porcentajeImpuesto: undefined, categoriaFiscal: 'materiales' as CategoriaFiscal };
    const { iva } = resolverIndirecto(f, { repepActivo: false });
    expect(iva.estado).toBe('revision_manual');
    expect(iva.importe).toBeUndefined();
  });

  // Test 17: categoría con excepción conocida (p. ej. vehiculo) → revision_manual en IVA/IGIC igual que en IRPF, aunque la cuota sí sea calculable.
  it('categoría con excepción conocida → revision_manual en el eje indirecto también', () => {
    const f = { tipoImpuesto: 'iva' as const, importeImpuesto: 21, baseImponible: 100, porcentajeImpuesto: 21, categoriaFiscal: 'vehiculo' as CategoriaFiscal };
    const { iva } = resolverIndirecto(f, { repepActivo: false });
    expect(iva.estado).toBe('revision_manual');
  });

  // Test 18: categoriaFiscal ausente en el eje indirecto → revision_manual, igual que en IRPF.
  it('categoriaFiscal ausente en el eje indirecto → revision_manual', () => {
    const f = { tipoImpuesto: 'iva' as const, importeImpuesto: 21, baseImponible: 100, porcentajeImpuesto: 21, categoriaFiscal: undefined };
    const { iva } = resolverIndirecto(f, { repepActivo: false });
    expect(iva.estado).toBe('revision_manual');
  });

  // Test 19: la cuota real se toma de cuotaRealDeFactura sin recalcularla — nunca se deriva del importe total (base+cuota) dividiendo por 1.21.
  it('usa la cuota real derivada de baseImponible+porcentajeImpuesto cuando no hay importeImpuesto directo, nunca del importe total', () => {
    const f = { tipoImpuesto: 'iva' as const, importeImpuesto: undefined, baseImponible: 300, porcentajeImpuesto: 21, categoriaFiscal: 'materiales' as CategoriaFiscal };
    const { iva } = resolverIndirecto(f, { repepActivo: false });
    expect(iva.importe).toBeCloseTo(63); // 300 * 21/100, nunca un valor derivado de "total/1.21"
  });
});

describe('aplicarResolucionAPorcentaje — nunca sobrescribe una decisión ya tomada', () => {
  it('aplica el porcentaje resuelto cuando el campo actual está vacío', () => {
    const resolucion = { estado: 'resuelto_automatico' as const, porcentaje: 100, confianza: 'alta' as const, explicacion: '' };
    expect(aplicarResolucionAPorcentaje(undefined, resolucion)).toBe(100);
  });

  it('NUNCA sobrescribe un valor humano ya presente, aunque el motor resuelva otra cosa', () => {
    const resolucion = { estado: 'resuelto_automatico' as const, porcentaje: 100, confianza: 'alta' as const, explicacion: '' };
    expect(aplicarResolucionAPorcentaje(50, resolucion)).toBe(50);
    expect(aplicarResolucionAPorcentaje(0, resolucion)).toBe(0); // 0 es una decisión real, no "vacío"
  });

  it('si el motor no resuelve (revision_manual/no_aplica), el campo actual se queda como estaba (undefined sigue undefined)', () => {
    const resolucion = { estado: 'revision_manual' as const, confianza: 'insuficiente' as const, explicacion: '' };
    expect(aplicarResolucionAPorcentaje(undefined, resolucion)).toBeUndefined();
  });
});

describe('resolverIrpf/resolverIndirecto con hecho requerido — Fase 3C.3', () => {
  // Test 5/6/8/10 (sección 24): la categoría se identifica, pero el hecho todavía no se ha respondido → pendiente_respuesta, nunca revision_manual.
  it('vehiculo sin hecho respondido todavía → pendiente_respuesta, no revision_manual', () => {
    const r = resolverIrpf(
      { tipo: 'gasto', categoriaFiscal: 'vehiculo', baseImponible: 5045.75, importe: 6105.36 },
      { hechoRequerido: 'vehiculoUsoExclusivo', hechosFiscales: {} }
    );
    expect(r.estado).toBe('pendiente_respuesta');
    expect(r.preguntaId).toBe('vehiculoUsoExclusivo');
  });

  // Test 18: pregunta respondida true → resuelto automáticamente al 100%.
  it('vehiculo con uso exclusivo confirmado (true) → IRPF resuelto_automatico 100%', () => {
    const r = resolverIrpf(
      { tipo: 'gasto', categoriaFiscal: 'vehiculo', baseImponible: 5045.75, importe: 6105.36 },
      { hechoRequerido: 'vehiculoUsoExclusivo', hechosFiscales: { vehiculoUsoExclusivo: true } }
    );
    expect(r.estado).toBe('resuelto_automatico');
    expect(r.porcentaje).toBe(100);
    expect(r.importe).toBeCloseTo(5045.75);
  });

  // Test 19: pregunta respondida false → el motor SÍ aplica una consecuencia automática en IRPF (0%, fundamentada), no vuelve sin más a revisión manual.
  it('vehiculo con uso exclusivo confirmado (false) → IRPF resuelto_automatico 0%, con fuente jurídica', () => {
    const r = resolverIrpf(
      { tipo: 'gasto', categoriaFiscal: 'vehiculo', baseImponible: 5045.75, importe: 6105.36 },
      { hechoRequerido: 'vehiculoUsoExclusivo', hechosFiscales: { vehiculoUsoExclusivo: false } }
    );
    expect(r.estado).toBe('resuelto_automatico');
    expect(r.porcentaje).toBe(0);
    expect(r.importe).toBe(0);
    expect(typeof r.fuenteOficial).toBe('object');
  });

  // El eje indirecto, en cambio, NO tiene un porcentaje único jurídicamente seguro para "uso no exclusivo"
  // (turismos vs. vehículos mixtos, presunciones distintas) — se deja en revision_manual, nunca se inventa un 50%.
  it('vehiculo IVA con uso exclusivo=false → revision_manual (no se inventa un 50% ni ninguna prorrata)', () => {
    const f = { tipoImpuesto: 'iva' as const, importeImpuesto: 1059.61, baseImponible: 5045.75, porcentajeImpuesto: 21, categoriaFiscal: 'vehiculo' as CategoriaFiscal };
    const { iva } = resolverIndirecto(f, { repepActivo: false, hechoRequerido: 'vehiculoUsoExclusivo', hechosFiscales: { vehiculoUsoExclusivo: false } });
    expect(iva.estado).toBe('revision_manual');
  });

  it('vehiculo IVA con uso exclusivo=true → resuelto_automatico 100% sobre la cuota real', () => {
    const f = { tipoImpuesto: 'iva' as const, importeImpuesto: 1059.61, baseImponible: 5045.75, porcentajeImpuesto: 21, categoriaFiscal: 'vehiculo' as CategoriaFiscal };
    const { iva } = resolverIndirecto(f, { repepActivo: false, hechoRequerido: 'vehiculoUsoExclusivo', hechosFiscales: { vehiculoUsoExclusivo: true } });
    expect(iva.estado).toBe('resuelto_automatico');
    expect(iva.importe).toBeCloseTo(1059.61);
  });

  it('dispositivo con uso exclusivo=false → IRPF 0% automático, IVA revision_manual', () => {
    const irpf = resolverIrpf(
      { tipo: 'gasto', categoriaFiscal: 'material_oficina', baseImponible: 300, importe: 363 },
      { hechoRequerido: 'dispositivoUsoExclusivo', hechosFiscales: { dispositivoUsoExclusivo: false } }
    );
    expect(irpf.estado).toBe('resuelto_automatico');
    expect(irpf.porcentaje).toBe(0);
    const f = { tipoImpuesto: 'iva' as const, importeImpuesto: 63, baseImponible: 300, porcentajeImpuesto: 21, categoriaFiscal: 'material_oficina' as CategoriaFiscal };
    const { iva } = resolverIndirecto(f, { repepActivo: false, hechoRequerido: 'dispositivoUsoExclusivo', hechosFiscales: { dispositivoUsoExclusivo: false } });
    expect(iva.estado).toBe('revision_manual');
  });

  it('gestoría con declaración personal confirmada (false) → revision_manual en ambos ejes, factura mixta', () => {
    const irpf = resolverIrpf(
      { tipo: 'gasto', categoriaFiscal: 'servicios_profesionales', baseImponible: 200, importe: 242 },
      { hechoRequerido: 'gestoriaSoloActividad', hechosFiscales: { gestoriaSoloActividad: false } }
    );
    expect(irpf.estado).toBe('revision_manual');
  });

  it('gestoría confirmada como solo actividad (true) → resuelto_automatico 100%', () => {
    const irpf = resolverIrpf(
      { tipo: 'gasto', categoriaFiscal: 'servicios_profesionales', baseImponible: 200, importe: 242 },
      { hechoRequerido: 'gestoriaSoloActividad', hechosFiscales: { gestoriaSoloActividad: true } }
    );
    expect(irpf.estado).toBe('resuelto_automatico');
    expect(irpf.porcentaje).toBe(100);
  });
});

describe('resolverTratamientoFiscal — orquestación identificación + reglas + preguntas (Fase 3C.3)', () => {
  it('Maderas Santana sin categoriaFiscal todavía → identifica materiales y resuelve IRPF automático, sugiere la categoría', () => {
    const r = resolverTratamientoFiscal(
      { tipo: 'gasto', proveedor: 'MADERAS SANTANA S.L.', concepto: 'ALVIC-TAB.MDF ZENIT BLANCO SM', categoria: '', categoriaFiscal: undefined, baseImponible: 207.83, importe: 207.83, tipoImpuesto: '', importeImpuesto: undefined, porcentajeImpuesto: undefined },
      { repepActivo: false }
    );
    expect(r.categoriaFiscalSugerida).toBe('materiales');
    expect(r.irpf.estado).toBe('resuelto_automatico');
    expect(r.irpf.porcentaje).toBe(100);
    expect(r.preguntasFiscalesPendientes).toHaveLength(0);
  });

  it('Parte Automóviles (vehículo) sin hecho respondido → genera pregunta factual para IRPF e IVA, nunca resuelve sola', () => {
    const r = resolverTratamientoFiscal(
      {
        tipo: 'gasto', proveedor: 'PARTE AUTOMOVILES, S.L.', concepto: 'reparacion culata de la furgoneta', categoria: 'servicios',
        categoriaFiscal: undefined, baseImponible: 5045.75, importe: 6105.36,
        tipoImpuesto: 'iva', importeImpuesto: 1059.61, porcentajeImpuesto: 21,
      },
      { repepActivo: false }
    );
    expect(r.categoriaFiscalSugerida).toBe('vehiculo');
    expect(r.irpf.estado).toBe('pendiente_respuesta');
    expect(r.iva.estado).toBe('pendiente_respuesta');
    expect(r.preguntasFiscalesPendientes).toHaveLength(2);
    expect(r.preguntasFiscalesPendientes[0].pregunta.toLowerCase()).not.toContain('deduc');
  });

  it('categoriaFiscal ya decidida a mano nunca se sobrescribe, aunque la identificación sugiera otra cosa', () => {
    const r = resolverTratamientoFiscal(
      {
        tipo: 'gasto', proveedor: 'MADERAS SANTANA S.L.', concepto: 'tableros', categoria: '',
        categoriaFiscal: 'otros', baseImponible: 100, importe: 121, tipoImpuesto: '', importeImpuesto: undefined, porcentajeImpuesto: undefined,
      },
      { repepActivo: false }
    );
    expect(r.categoriaFiscalSugerida).toBeUndefined();
    expect(r.irpf.estado).toBe('revision_manual'); // 'otros' no tiene regla automática, y se respeta la decisión ya tomada
  });

  it('Tenerife Business Partners + Trimestral, sin categoriaFiscal → identifica servicios_profesionales y resuelve automático sin preguntar', () => {
    const r = resolverTratamientoFiscal(
      {
        tipo: 'gasto', proveedor: 'Tenerife business partners sl', concepto: 'Trimestral', categoria: '',
        categoriaFiscal: undefined, baseImponible: 74.9, importe: 74.9, tipoImpuesto: '', importeImpuesto: undefined, porcentajeImpuesto: undefined,
      },
      { repepActivo: false }
    );
    expect(r.categoriaFiscalSugerida).toBe('servicios_profesionales');
    expect(r.irpf.estado).toBe('resuelto_automatico');
    expect(r.preguntasFiscalesPendientes).toHaveLength(0);
  });

  // Auditoría Facturas/Trimestral 13/09/2026: 'combustible' era la categoría más repetida en revisión
  // manual real de un usuario, sin ninguna regla propia — reutiliza la misma pregunta/regla que 'vehiculo'.
  it('combustible (gasolinera) sin hecho respondido → genera la misma pregunta de exclusividad que vehiculo, nunca resuelve sola', () => {
    const r = resolverTratamientoFiscal(
      {
        tipo: 'gasto', proveedor: 'GASOLINERA CEPSA ADEJE', concepto: 'combustible', categoria: '',
        categoriaFiscal: 'combustible', baseImponible: 60, importe: 68.4,
        tipoImpuesto: 'igic', importeImpuesto: 4.2, porcentajeImpuesto: 7,
      },
      { repepActivo: false }
    );
    expect(r.irpf.estado).toBe('pendiente_respuesta');
    expect(r.irpf.preguntaId).toBe('vehiculoUsoExclusivo');
    expect(r.igic.estado).toBe('pendiente_respuesta');
    expect(r.preguntasFiscalesPendientes).toHaveLength(2);
  });

  it('combustible con uso exclusivo del vehículo confirmado (true) → IRPF e IGIC resueltos automáticamente al 100%, igual que vehiculo', () => {
    const r = resolverTratamientoFiscal(
      {
        tipo: 'gasto', proveedor: 'GASOLINERA CEPSA ADEJE', concepto: 'combustible', categoria: '',
        categoriaFiscal: 'combustible', baseImponible: 60, importe: 68.4,
        tipoImpuesto: 'igic', importeImpuesto: 4.2, porcentajeImpuesto: 7,
        hechosFiscales: { vehiculoUsoExclusivo: true },
      },
      { repepActivo: false }
    );
    expect(r.irpf.estado).toBe('resuelto_automatico');
    expect(r.irpf.porcentaje).toBe(100);
    expect(r.igic.estado).toBe('resuelto_automatico');
    expect(r.igic.porcentaje).toBe(100);
    expect(r.preguntasFiscalesPendientes).toHaveLength(0);
  });

  it('combustible con uso NO exclusivo confirmado (false) → IRPF 0% igual que vehiculo, IGIC revision_manual (sin prorrata inventada)', () => {
    const r = resolverTratamientoFiscal(
      {
        tipo: 'gasto', proveedor: 'GASOLINERA CEPSA ADEJE', concepto: 'combustible', categoria: '',
        categoriaFiscal: 'combustible', baseImponible: 60, importe: 68.4,
        tipoImpuesto: 'igic', importeImpuesto: 4.2, porcentajeImpuesto: 7,
        hechosFiscales: { vehiculoUsoExclusivo: false },
      },
      { repepActivo: false }
    );
    expect(r.irpf.estado).toBe('resuelto_automatico');
    expect(r.irpf.porcentaje).toBe(0);
    expect(r.igic.estado).toBe('revision_manual');
  });
});
