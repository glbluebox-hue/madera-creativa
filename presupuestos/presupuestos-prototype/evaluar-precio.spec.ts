import { evaluarPrecio } from './evaluar-precio.js';
import type { AnalisisPrecio, Comparable } from './inteligencia-precios.js';
import type { MetricasGrupo } from './metricas-por-tipo.js';
import type { ResultadoMercadoLocal } from './mercado-local.js';

/**
 * Consejero Inteligente de Precios (Fase 2E, ampliado en Fase 2F "Consenso
 * de Precio") — tests de la función pura `evaluarPrecio`. No duplica los
 * tests de `analizarPrecioPresupuesto` (Fase 1), `calcularComparables`
 * (2C), `calcularMetricasGrupo` (2D) ni `resolverMercadoLocal` (2F,
 * `mercado-local.spec.ts`) — solo la lógica de ensamblaje y de la fórmula
 * de recomendación.
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

function comparable(nivel: Comparable['nivel'] = 'muy_comparable', precio?: number): Comparable {
  const principal: AnalisisPrecio = precio !== undefined
    ? { disponible: true, precio, costeEstimado: precio * 0.6, margenPorcentaje: 40, margenObjetivoPorcentaje: 45, diferenciaPuntos: -5, estado: 'cerca' }
    : { disponible: false, motivo: 'sin_costes' };
  return {
    trabajo: { id: 'x', titulo: 'x', clienteId: 'c', actualizado: '2026-01-01', tipoTrabajo: 'Cocina', real: null, previsto: null, principal, origenPrincipal: precio !== undefined ? 'previsto' : null },
    puntuacion: 80, nivel, motivos: [], esSecundario: false,
  };
}

function mercado(extra: Partial<Extract<ResultadoMercadoLocal, { disponible: true }>> = {}): ResultadoMercadoLocal {
  return { disponible: true, nivelUsado: 'local', zona: 'Tenerife', precioMin: 5500, precioMax: 6300, numReferencias: 2, confianza: 'baja', fuentes: ['Manual'], ...extra };
}

const SIN_MERCADO: ResultadoMercadoLocal = { disponible: false };

describe('evaluarPrecio — disponibilidad', () => {
  it('sin costes/proyecto/objetivo (analisis.disponible=false): devuelve el mismo motivo, sin inventar nada', () => {
    const r = evaluarPrecio({ disponible: false, motivo: 'sin_proyecto' }, null, [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    expect(r).toEqual({ disponible: false, motivo: 'sin_proyecto' });
  });

  it('sin histórico ni mercado: confianza "insuficiente", con el texto exacto pedido', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.nivelConfianza).toBe('insuficiente');
    expect(r.notaConfianza).toBe('Todavía no tengo suficiente información de tus trabajos anteriores ni de tu mercado local para aconsejarte un precio con fiabilidad.');
    // Sin histórico ni mercado no hay comprobación de rango, mediana ni mercado -- solo la de margen vs objetivo.
    expect(r.comprobaciones.map((c) => c.tipo)).toEqual(['margen_vs_objetivo']);
  });
});

describe('evaluarPrecio — histórico insuficiente vs suficiente', () => {
  it('histórico insuficiente (1-2 trabajos): NO añade comprobación de rango ni de mediana (un solo dato no es un rango)', () => {
    const r = evaluarPrecio(analisis(10000, 40), metricas({ numTrabajos: 2, historicoSuficiente: false, nivelConfianza: 'baja' }), [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.comprobaciones.map((c) => c.tipo)).toEqual(['margen_vs_objetivo']);
    expect(r.nivelConfianza).toBe('baja');
    expect(r.notaConfianza).toContain('todavía es limitado');
  });

  it('histórico suficiente (3+): SÍ añade rango y mediana', () => {
    const r = evaluarPrecio(analisis(10000, 40), metricas(), [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.comprobaciones.map((c) => c.tipo)).toEqual(['margen_vs_objetivo', 'precio_vs_rango_historico', 'margen_vs_mediana_historica']);
  });
});

describe('evaluarPrecio — margen vs objetivo (tres casos)', () => {
  it('por debajo del objetivo: la conclusión lo dice explícitamente', () => {
    const r = evaluarPrecio(analisis(10000, 30, 45), null, [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.conclusion).toContain('por debajo de tu objetivo');
  });

  it('cerca del objetivo: texto distinto, sin dramatizar', () => {
    const r = evaluarPrecio(analisis(10000, 42, 45), null, [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.conclusion).toContain('cerca de tu objetivo');
  });

  it('por encima del objetivo: texto positivo', () => {
    const r = evaluarPrecio(analisis(10000, 50, 45), null, [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.conclusion).toContain('alcanza tu objetivo');
  });
});

describe('evaluarPrecio — precio vs rango histórico (tres posiciones)', () => {
  it('precio dentro del rango', () => {
    const r = evaluarPrecio(analisis(15000, 40), metricas({ precioMinimo: 8200, precioMaximo: 24500 }), [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    const c = r.comprobaciones.find((x) => x.tipo === 'precio_vs_rango_historico') as any;
    expect(c.posicion).toBe('dentro');
    expect(r.conclusion).toContain('dentro del rango');
  });

  it('precio por debajo del rango', () => {
    const r = evaluarPrecio(analisis(5000, 40), metricas({ precioMinimo: 8200, precioMaximo: 24500 }), [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    const c = r.comprobaciones.find((x) => x.tipo === 'precio_vs_rango_historico') as any;
    expect(c.posicion).toBe('por_debajo');
    expect(r.conclusion).toContain('por debajo de lo que sueles cobrar');
  });

  it('precio por encima del rango', () => {
    const r = evaluarPrecio(analisis(32000, 40), metricas({ precioMinimo: 8200, precioMaximo: 24500 }), [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    const c = r.comprobaciones.find((x) => x.tipo === 'precio_vs_rango_historico') as any;
    expect(c.posicion).toBe('por_encima');
    expect(r.conclusion).toContain('por encima de lo que sueles cobrar');
  });

  it('Ejemplo E de la auditoría: precio dentro del rango PERO margen por debajo del objetivo — las dos conclusiones conviven, nunca se funden', () => {
    const r = evaluarPrecio(analisis(15000, 31, 45), metricas({ precioMinimo: 8200, precioMaximo: 24500, margenMediana: 42 }), [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.conclusion).toContain('dentro del rango');
    expect(r.conclusion).toContain('por debajo de tu objetivo');
  });
});

describe('evaluarPrecio — comparables como evidencia', () => {
  it('sin comparables: no añade esa comprobación', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.comprobaciones.map((c) => c.tipo)).not.toContain('comparables_fuertes');
  });

  it('con comparables 🟢: cuenta los fuertes y lo menciona en la conclusión', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [comparable('muy_comparable'), comparable('muy_comparable'), comparable('comparable')], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    const c = r.comprobaciones.find((x) => x.tipo === 'comparables_fuertes') as any;
    expect(c.numFuertes).toBe(2);
    expect(c.numTotal).toBe(3);
    expect(r.conclusion).toContain('2 trabajos especialmente parecidos');
  });
});

describe('evaluarPrecio — confianza (reutiliza la de 2D, no inventa una nueva)', () => {
  it('confianza alta se traslada tal cual, con las señales ya generadas por 2D', () => {
    const r = evaluarPrecio(analisis(10000, 40), metricas({ nivelConfianza: 'alta', senales: ['7 trabajos', '5 con margen real'] }), [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.nivelConfianza).toBe('alta');
    expect(r.notaConfianza).toBe('Basado en: 7 trabajos, 5 con margen real.');
  });

  it('confianza media se traslada tal cual', () => {
    const r = evaluarPrecio(analisis(10000, 40), metricas({ nivelConfianza: 'media', senales: ['3 trabajos'] }), [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.nivelConfianza).toBe('media');
  });
});

describe('evaluarPrecio — proyecto en curso vs finalizado (costes provisionales)', () => {
  it('sin proyecto vinculado: sin nota de costes provisionales', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.notaCostesProvisionales).toBeNull();
  });

  it('proyecto finalizado: sin nota (el margen ya es real y definitivo)', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], SIN_MERCADO, { proyectoEstado: 'finalizado', esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.notaCostesProvisionales).toBeNull();
  });

  it('proyecto en_curso, presupuesto SIN aceptar (cálculo en vivo): nota de "costes registrados hasta ahora"', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], SIN_MERCADO, { proyectoEstado: 'en_curso', esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.notaCostesProvisionales).toContain('costes registrados hasta ahora');
  });

  it('proyecto en_curso, presupuesto YA aceptado (snapshot congelado): nota distinta, avisando de que el snapshot puede haber quedado desactualizado (hallazgo de la auditoría)', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], SIN_MERCADO, { proyectoEstado: 'en_curso', esSnapshot: true });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.notaCostesProvisionales).toContain('se calculó al aceptar el presupuesto');
    expect(r.notaCostesProvisionales).toContain('puede haber cambiado desde entonces');
  });
});

describe('evaluarPrecio — real vs previsto (delegado, no decidido aquí)', () => {
  it('evaluarPrecio no decide real vs previsto -- simplemente evalúa el AnalisisPrecio que recibe, sea cual sea su origen (ya decidido aguas arriba por analizarTrabajos)', () => {
    const rReal = evaluarPrecio(analisis(20000, 50), null, [], SIN_MERCADO, { proyectoEstado: 'finalizado', esSnapshot: false });
    const rPrevisto = evaluarPrecio(analisis(20000, 50), null, [], SIN_MERCADO, { proyectoEstado: 'en_curso', esSnapshot: false });
    if (!rReal.disponible || !rPrevisto.disponible) throw new Error('deberían estar disponibles');
    expect(rReal.comprobaciones).toEqual(rPrevisto.comprobaciones); // mismas comprobaciones, la única diferencia es la nota de costes provisionales
    expect(rReal.notaCostesProvisionales).toBeNull();
    expect(rPrevisto.notaCostesProvisionales).not.toBeNull();
  });
});

// ── Fase 2F — "Consenso de Precio" ─────────────────────────────────────────

describe('evaluarPrecio — mercado local como comprobación (2F)', () => {
  it('sin mercado disponible: no añade la comprobación de mercado', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.comprobaciones.map((c) => c.tipo)).not.toContain('mercado_local');
  });

  it('con mercado disponible: añade la comprobación y la menciona en la conclusión con su zona', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], mercado({ zona: 'Tenerife', nivelUsado: 'local' }), { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.comprobaciones.map((c) => c.tipo)).toContain('mercado_local');
    expect(r.conclusion).toContain('Tenerife');
  });

  it('mercado escalado a nivel regional: la conclusión lo indica explícitamente, nunca lo presenta como local', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], mercado({ zona: 'Canarias', nivelUsado: 'regional' }), { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.conclusion).toContain('Canarias');
    expect(r.conclusion).toContain('sin datos locales');
  });
});

describe('evaluarPrecio — confianza combinada con mercado (2F, condición 7)', () => {
  it('histórico alta + mercado baja -> la confianza final es la más baja de las dos, nunca se infla', () => {
    const r = evaluarPrecio(analisis(10000, 40), metricas({ nivelConfianza: 'alta' }), [], mercado({ confianza: 'baja' }), { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.nivelConfianza).toBe('baja');
  });

  it('solo mercado disponible (sin histórico propio): usa la confianza del mercado', () => {
    const r = evaluarPrecio(analisis(10000, 40), null, [], mercado({ confianza: 'media' }), { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.nivelConfianza).toBe('media');
  });

  it('solo histórico disponible (sin mercado): usa la confianza del histórico, no la rebaja por la ausencia de mercado', () => {
    const r = evaluarPrecio(analisis(10000, 40), metricas({ nivelConfianza: 'alta' }), [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.nivelConfianza).toBe('alta');
  });
});

describe('evaluarPrecio — precio recomendado (2F, fórmula de la sección F)', () => {
  it('sin histórico, sin comparables, sin mercado: el rango es un único punto = coste/margen objetivo (el suelo)', () => {
    const r = evaluarPrecio(analisis(10000, 40, 45), null, [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    const costeEstimado = 10000 * (1 - 40 / 100);
    const sueloEsperado = costeEstimado / (1 - 45 / 100);
    expect(r.precioRecomendado).not.toBeNull();
    expect(r.precioRecomendado!.min).toBeCloseTo(sueloEsperado, 1);
    expect(r.precioRecomendado!.max).toBeCloseTo(sueloEsperado, 1);
    expect(r.precioRecomendado!.anclas.map((a) => a.origen)).toEqual(['suelo_margen']);
  });

  it('con histórico suficiente: añade el ancla de histórico (mediana de margen traducida al coste actual)', () => {
    const r = evaluarPrecio(analisis(10000, 40, 45), metricas({ margenMediana: 50 }), [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.precioRecomendado!.anclas.map((a) => a.origen)).toContain('historico');
  });

  it('con comparables muy comparables: usa su precio real tal cual', () => {
    const r = evaluarPrecio(analisis(10000, 40, 45), null, [comparable('muy_comparable', 12000), comparable('muy_comparable', 13000)], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    const ancla = r.precioRecomendado!.anclas.find((a) => a.origen === 'comparables')!;
    expect(ancla.min).toBe(12000);
    expect(ancla.max).toBe(13000);
  });

  it('el mercado local AMPLÍA el máximo del rango, nunca lo sustituye', () => {
    const r = evaluarPrecio(analisis(10000, 40, 45), metricas({ margenMediana: 40 }), [], mercado({ precioMin: 9000, precioMax: 20000 }), { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.precioRecomendado!.max).toBeGreaterThanOrEqual(20000);
    expect(r.precioRecomendado!.anclas.map((a) => a.origen)).toContain('mercado');
  });

  it('el mercado local NUNCA baja el mínimo por debajo del suelo de margen objetivo', () => {
    const r = evaluarPrecio(analisis(10000, 40, 45), null, [], mercado({ precioMin: 1000, precioMax: 2000 }), { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    const costeEstimado = 10000 * (1 - 40 / 100);
    const suelo = costeEstimado / (1 - 45 / 100);
    expect(r.precioRecomendado!.min).toBeGreaterThanOrEqual(suelo - 0.01);
  });

  it('margen objetivo inválido (>=100%): descarta el ancla de suelo en vez de devolver Infinity/NaN', () => {
    const r = evaluarPrecio(analisis(10000, 40, 100), null, [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    // Sin ninguna ancla disponible (ni suelo, ni histórico, ni comparables, ni mercado), el rango es null -- degradación honesta, nunca un número inventado.
    expect(r.precioRecomendado).toBeNull();
  });
});

describe('evaluarPrecio — contradicciones explícitas (2F, condición 4 y el ejemplo H de la autorización)', () => {
  it('histórico por debajo del suelo de margen objetivo: lo explica, no lo oculta', () => {
    // costeEstimado = 6000; suelo (45%) = 6000/0.55 ≈ 10909; histórico con margen mediana bajo -> precio implícito muy por debajo del suelo.
    const r = evaluarPrecio(analisis(10000, 40, 45), metricas({ margenMediana: 5 }), [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.contradicciones.some((c) => c.includes('Tu histórico') && c.includes('queda por debajo'))).toBe(true);
  });

  it('mercado muy por encima del suelo: lo señala como oportunidad de subir, no lo esconde', () => {
    const r = evaluarPrecio(analisis(10000, 40, 45), null, [], mercado({ precioMin: 20000, precioMax: 25000 }), { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.contradicciones.some((c) => c.includes('mercado de tu zona') && c.includes('margen para cobrar más'))).toBe(true);
  });

  it('cuando las fuentes coinciden razonablemente, no genera ninguna contradicción', () => {
    const r = evaluarPrecio(analisis(10000, 40, 45), metricas({ margenMediana: 44 }), [], SIN_MERCADO, { proyectoEstado: null, esSnapshot: false });
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.contradicciones).toEqual([]);
  });
});
