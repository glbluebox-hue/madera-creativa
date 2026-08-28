import { describe, it, expect } from 'vitest';
import { analizarPrecioPresupuesto, calcularEstadoMargen } from './inteligencia-precios.js';
import type { ProyectoParaAnalisis } from './inteligencia-precios.js';

const proyectoConCostes = (costeEstimado: number): ProyectoParaAnalisis => ({
  movimientos: [{ tipo: 'gasto', importe: costeEstimado }],
  horas: [],
  tarifaHora: 0,
});

describe('inteligencia-precios (Fase 1) — motor determinista', () => {
  // Caso 1: margen por encima del objetivo.
  it('marca "por_encima" cuando el margen calculado supera el objetivo', () => {
    const r = analizarPrecioPresupuesto(12400, proyectoConCostes(7200), 35);
    expect(r.disponible).toBe(true);
    if (!r.disponible) throw new Error('no disponible');
    expect(r.costeEstimado).toBe(7200);
    expect(r.margenPorcentaje).toBeCloseTo(41.935, 2);
    expect(r.estado).toBe('por_encima');
  });

  // Caso 2: margen igual al objetivo (diferencia = 0 → por_encima, ver calcularEstadoMargen).
  it('marca "por_encima" cuando el margen es EXACTAMENTE igual al objetivo', () => {
    // precio 1000, coste 650 -> margen 35% == objetivo 35%
    const r = analizarPrecioPresupuesto(1000, proyectoConCostes(650), 35);
    expect(r.disponible).toBe(true);
    if (!r.disponible) throw new Error('no disponible');
    expect(r.diferenciaPuntos).toBeCloseTo(0, 6);
    expect(r.estado).toBe('por_encima');
  });

  // Caso 3: margen por debajo del objetivo (más allá del umbral de "cerca").
  it('marca "por_debajo" cuando el margen está muy por debajo del objetivo', () => {
    // precio 1000, coste 900 -> margen 10%, objetivo 35% -> diferencia -25 (> umbral 5)
    const r = analizarPrecioPresupuesto(1000, proyectoConCostes(900), 35);
    expect(r.disponible).toBe(true);
    if (!r.disponible) throw new Error('no disponible');
    expect(r.estado).toBe('por_debajo');
  });

  it('marca "cerca" cuando el margen está ligeramente por debajo (dentro del umbral)', () => {
    // precio 1000, coste 680 -> margen 32%, objetivo 35% -> diferencia -3 (dentro de 5)
    const r = analizarPrecioPresupuesto(1000, proyectoConCostes(680), 35);
    expect(r.disponible).toBe(true);
    if (!r.disponible) throw new Error('no disponible');
    expect(r.estado).toBe('cerca');
  });

  // Caso 4: presupuesto sin costes suficientes (proyecto existe pero sin movimientos ni horas).
  it('devuelve "sin_costes" cuando el proyecto no tiene movimientos ni horas registradas', () => {
    const r = analizarPrecioPresupuesto(1000, { movimientos: [], horas: [], tarifaHora: 20 }, 35);
    expect(r).toEqual({ disponible: false, motivo: 'sin_costes' });
  });

  it('devuelve "sin_proyecto" cuando el presupuesto no está vinculado a ningún proyecto', () => {
    const r = analizarPrecioPresupuesto(1000, null, 35);
    expect(r).toEqual({ disponible: false, motivo: 'sin_proyecto' });
  });

  it('devuelve "sin_precio" cuando el presupuesto no tiene precio total (0 o inválido)', () => {
    expect(analizarPrecioPresupuesto(0, proyectoConCostes(500), 35)).toEqual({ disponible: false, motivo: 'sin_precio' });
    expect(analizarPrecioPresupuesto(NaN, proyectoConCostes(500), 35)).toEqual({ disponible: false, motivo: 'sin_precio' });
  });

  // Caso 5: presupuesto antiguo — se cubre igual con proyecto=null/undefined, ver test de "sin_proyecto"/"sin_objetivo" (nunca lanza, nunca asume datos).
  it('no lanza excepción con datos ausentes (undefined en vez de null)', () => {
    expect(() => analizarPrecioPresupuesto(1000, undefined, undefined)).not.toThrow();
    const r = analizarPrecioPresupuesto(1000, undefined, undefined);
    expect(r.disponible).toBe(false);
  });

  // Caso 6: empresa sin margen objetivo configurado.
  it('devuelve "sin_objetivo" cuando hay coste real pero no hay margen objetivo configurado', () => {
    const r = analizarPrecioPresupuesto(1000, proyectoConCostes(500), null);
    expect(r).toEqual({ disponible: false, motivo: 'sin_objetivo' });
  });

  // Caso 7: entradas malformadas nunca deben lanzar — el análisis "falla seguro" a "no disponible".
  it('nunca lanza con entradas malformadas (mano de obra/movimientos no numéricos)', () => {
    const proyectoRaro = { movimientos: [{ tipo: 'gasto', importe: NaN as unknown as number }], horas: [], tarifaHora: 0 };
    expect(() => analizarPrecioPresupuesto(1000, proyectoRaro, 35)).not.toThrow();
  });

  it('calcularEstadoMargen: umbral exacto de "cerca" es inclusivo en el límite inferior', () => {
    expect(calcularEstadoMargen(-5)).toBe('cerca');
    expect(calcularEstadoMargen(-5.01)).toBe('por_debajo');
    expect(calcularEstadoMargen(0)).toBe('por_encima');
  });
});
