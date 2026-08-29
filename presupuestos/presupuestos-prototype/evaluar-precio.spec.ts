import { evaluarPrecio } from './evaluar-precio.js';
import type { AnalisisPrecio, Comparable } from './inteligencia-precios.js';
import type { MetricasGrupo } from './metricas-por-tipo.js';

/**
 * Consejero Inteligente de Precios (Fase 2E) — tests de la función pura
 * `evaluarPrecio`. No duplica los tests de `analizarPrecioPresupuesto`
 * (Fase 1, ya en `inteligencia-precios.spec.ts`), `calcularComparables`
 * (2C, `comparables.spec.ts` backend) ni `calcularMetricasGrupo` (2D,
 * `metricas-por-tipo.spec.ts`) — solo la lógica NUEVA de ensamblaje.
 */

function analisis(precio: number, margenPorcentaje: number, margenObjetivoPorcentaje = 45): AnalisisPrecio {
  const diferenciaPuntos = margenPorcentaje - margenObjetivoPorcentaje;
  const estado = diferenciaPuntos >= 0 ? 'por_encima' : diferenciaPuntos >= -5 ? 'cerca' : 'por_debajo';
  return { disponible: true, precio, costeEstimado: precio * (1 - margenPorcentaje / 100), margenPorcentaje, margenObjetivoPorcentaje, diferenciaPuntos, estado };
}

function metricas(extra: Partial<MetricasGrupo> = {}): MetricasGrupo {
  return {
    tipoTrabajo: 'Cocina', numTrabajos: 7, margenMedio: 41, margenMediana: 42,
    precioMinimo: 8200, precioMaximo: 24500, numConMargenReal: 5, numSoloConMargenPrevisto: 2,
    historicoSuficiente: true, nivelConfianza: 'alta', senales: ['7 trabajos', '5 con margen real', 'precios poco dispersos'],
    ...extra,
  };
}

function comparable(nivel: Comparable['nivel'] = 'muy_comparable'): Comparable {
  return {
    trabajo: { id: 'x', titulo: 'x', clienteId: 'c', actualizado: '2026-01-01', tipoTrabajo: 'Cocina', real: null, previsto: null, principal: { disponible: false, motivo: 'sin_costes' }, origenPrincipal: null },
    puntuacion: 80, nivel, motivos: [], esSecundario: false,
  };
}

describe('evaluarPrecio — disponibilidad', () => {
  it('sin costes/proyecto/objetivo (analisis.disponible=false): devuelve el mismo motivo, sin inventar nada', () => {
    const r = evaluarPrecio({ disponible: false, motivo: 'sin_proyecto' }, null, [], { proyectoEstado: null, esSnapshot: false });
    expect(r).toEqual({ disponible: false, motivo: 'sin_proyecto' });
  });

  it('sin histórico del tipo en absoluto (metricasGrupo=null): confianza "insuficiente", con el texto exacto pedido', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.nivelConfianza).toBe('insuficiente');
    expect(r.notaConfianza).toBe('Todavía no tengo suficiente información de tus trabajos anteriores para aconsejarte un precio con fiabilidad.');
    // Sin histórico no hay comprobación de rango ni de mediana -- solo la de margen vs objetivo.
    expect(r.comprobaciones.map((c) => c.tipo)).toEqual(['margen_vs_objetivo']);
  });
});

describe('evaluarPrecio — histórico insuficiente vs suficiente', () => {
  it('histórico insuficiente (1-2 trabajos): NO añade comprobación de rango ni de mediana (un solo dato no es un rango)', () => {
    const r = evaluarPrecio(analisis(10000, 40), metricas({ numTrabajos: 2, historicoSuficiente: false, nivelConfianza: 'baja' }), [], { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.comprobaciones.map((c) => c.tipo)).toEqual(['margen_vs_objetivo']);
    expect(r.nivelConfianza).toBe('baja');
    expect(r.notaConfianza).toContain('todavía es limitado');
  });

  it('histórico suficiente (3+): SÍ añade rango y mediana', () => {
    const r = evaluarPrecio(analisis(10000, 40), metricas(), [], { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.comprobaciones.map((c) => c.tipo)).toEqual(['margen_vs_objetivo', 'precio_vs_rango_historico', 'margen_vs_mediana_historica']);
  });
});

describe('evaluarPrecio — margen vs objetivo (tres casos)', () => {
  it('por debajo del objetivo: la conclusión lo dice explícitamente', () => {
    const r = evaluarPrecio(analisis(10000, 30, 45), null, [], { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.conclusion).toContain('por debajo de tu objetivo');
  });

  it('cerca del objetivo: texto distinto, sin dramatizar', () => {
    const r = evaluarPrecio(analisis(10000, 42, 45), null, [], { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.conclusion).toContain('cerca de tu objetivo');
  });

  it('por encima del objetivo: texto positivo', () => {
    const r = evaluarPrecio(analisis(10000, 50, 45), null, [], { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.conclusion).toContain('alcanza tu objetivo');
  });
});

describe('evaluarPrecio — precio vs rango histórico (tres posiciones)', () => {
  it('precio dentro del rango', () => {
    const r = evaluarPrecio(analisis(15000, 40), metricas({ precioMinimo: 8200, precioMaximo: 24500 }), [], { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    const c = r.comprobaciones.find((x) => x.tipo === 'precio_vs_rango_historico') as any;
    expect(c.posicion).toBe('dentro');
    expect(r.conclusion).toContain('dentro del rango');
  });

  it('precio por debajo del rango', () => {
    const r = evaluarPrecio(analisis(5000, 40), metricas({ precioMinimo: 8200, precioMaximo: 24500 }), [], { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    const c = r.comprobaciones.find((x) => x.tipo === 'precio_vs_rango_historico') as any;
    expect(c.posicion).toBe('por_debajo');
    expect(r.conclusion).toContain('por debajo de lo que sueles cobrar');
  });

  it('precio por encima del rango', () => {
    const r = evaluarPrecio(analisis(32000, 40), metricas({ precioMinimo: 8200, precioMaximo: 24500 }), [], { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    const c = r.comprobaciones.find((x) => x.tipo === 'precio_vs_rango_historico') as any;
    expect(c.posicion).toBe('por_encima');
    expect(r.conclusion).toContain('por encima de lo que sueles cobrar');
  });

  it('Ejemplo E de la auditoría: precio dentro del rango PERO margen por debajo del objetivo — las dos conclusiones conviven, nunca se funden', () => {
    const r = evaluarPrecio(analisis(15000, 31, 45), metricas({ precioMinimo: 8200, precioMaximo: 24500, margenMediana: 42 }), [], { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.conclusion).toContain('dentro del rango');
    expect(r.conclusion).toContain('por debajo de tu objetivo');
  });
});

describe('evaluarPrecio — comparables como evidencia', () => {
  it('sin comparables: no añade esa comprobación', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.comprobaciones.map((c) => c.tipo)).not.toContain('comparables_fuertes');
  });

  it('con comparables 🟢: cuenta los fuertes y lo menciona en la conclusión', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [comparable('muy_comparable'), comparable('muy_comparable'), comparable('comparable')], { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    const c = r.comprobaciones.find((x) => x.tipo === 'comparables_fuertes') as any;
    expect(c.numFuertes).toBe(2);
    expect(c.numTotal).toBe(3);
    expect(r.conclusion).toContain('2 trabajos especialmente parecidos');
  });
});

describe('evaluarPrecio — confianza (reutiliza la de 2D, no inventa una nueva)', () => {
  it('confianza alta se traslada tal cual, con las señales ya generadas por 2D', () => {
    const r = evaluarPrecio(analisis(10000, 40), metricas({ nivelConfianza: 'alta', senales: ['7 trabajos', '5 con margen real'] }), [], { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.nivelConfianza).toBe('alta');
    expect(r.notaConfianza).toBe('Basado en: 7 trabajos, 5 con margen real.');
  });

  it('confianza media se traslada tal cual', () => {
    const r = evaluarPrecio(analisis(10000, 40), metricas({ nivelConfianza: 'media', senales: ['3 trabajos'] }), [], { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.nivelConfianza).toBe('media');
  });
});

describe('evaluarPrecio — proyecto en curso vs finalizado (costes provisionales)', () => {
  it('sin proyecto vinculado: sin nota de costes provisionales', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.notaCostesProvisionales).toBeNull();
  });

  it('proyecto finalizado: sin nota (el margen ya es real y definitivo)', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], { proyectoEstado: 'finalizado', esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.notaCostesProvisionales).toBeNull();
  });

  it('proyecto en_curso, presupuesto SIN aceptar (cálculo en vivo): nota de "costes registrados hasta ahora"', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], { proyectoEstado: 'en_curso', esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.notaCostesProvisionales).toContain('costes registrados hasta ahora');
  });

  it('proyecto en_curso, presupuesto YA aceptado (snapshot congelado): nota distinta, avisando de que el snapshot puede haber quedado desactualizado (hallazgo de la auditoría)', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], { proyectoEstado: 'en_curso', esSnapshot: true });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.notaCostesProvisionales).toContain('se calculó al aceptar el presupuesto');
    expect(r.notaCostesProvisionales).toContain('puede haber cambiado desde entonces');
  });
});

describe('evaluarPrecio — real vs previsto (delegado, no decidido aquí)', () => {
  it('evaluarPrecio no decide real vs previsto -- simplemente evalúa el AnalisisPrecio que recibe, sea cual sea su origen (ya decidido aguas arriba por analizarTrabajos)', () => {
    // Con datos de margen real (mismo tipo de objeto AnalisisPrecio que con datos previstos) -- el comportamiento es idéntico, porque la prioridad real>previsto ya se resolvió antes de llamar a esta función.
    const rReal = evaluarPrecio(analisis(20000, 50), null, [], { proyectoEstado: 'finalizado', esSnapshot: false });
    const rPrevisto = evaluarPrecio(analisis(20000, 50), null, [], { proyectoEstado: 'en_curso', esSnapshot: false });
    if (!rReal.disponible || !rPrevisto.disponible) throw new Error('deberían estar disponibles');
    expect(rReal.comprobaciones).toEqual(rPrevisto.comprobaciones); // mismas comprobaciones, la única diferencia es la nota de costes provisionales
    expect(rReal.notaCostesProvisionales).toBeNull();
    expect(rPrevisto.notaCostesProvisionales).not.toBeNull();
  });
});
