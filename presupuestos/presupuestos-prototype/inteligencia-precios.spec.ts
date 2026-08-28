import { describe, it, expect } from 'vitest';
import { analizarPrecioPresupuesto, calcularEstadoMargen, interpretarAnalisis } from './inteligencia-precios.js';
import type { Proyecto } from './types.js';

function proyectoConCostes(costeEstimado: number): Proyecto {
  return {
    id: 'p1', clienteId: 'c1', proyecto: '', direccion: '', presupuesto: 0, tarifaHora: 0,
    creado: '', estado: 'presupuesto', tareas: [], adjuntos: [], fotos: [],
    movimientos: [{ id: 'm1', fecha: '2026-08-01', concepto: 'Gasto', categoria: 'General', tipo: 'gasto', importe: costeEstimado }],
    horas: [],
  } as unknown as Proyecto;
}

describe('inteligencia-precios (Fase 1, frontend) — motor determinista', () => {
  // Caso 1: margen por encima del objetivo.
  it('marca "por_encima" cuando el margen calculado supera el objetivo', () => {
    const r = analizarPrecioPresupuesto(12400, proyectoConCostes(7200), 35);
    expect(r.disponible).toBe(true);
    if (!r.disponible) throw new Error('no disponible');
    expect(r.costeEstimado).toBe(7200);
    expect(r.margenPorcentaje).toBeCloseTo(41.935, 2);
    expect(r.estado).toBe('por_encima');
  });

  // Caso 2: margen igual al objetivo.
  it('marca "por_encima" cuando el margen es EXACTAMENTE igual al objetivo', () => {
    const r = analizarPrecioPresupuesto(1000, proyectoConCostes(650), 35);
    expect(r.disponible).toBe(true);
    if (!r.disponible) throw new Error('no disponible');
    expect(r.diferenciaPuntos).toBeCloseTo(0, 6);
    expect(r.estado).toBe('por_encima');
  });

  // Caso 3: margen por debajo del objetivo.
  it('marca "por_debajo" cuando el margen está muy por debajo del objetivo', () => {
    const r = analizarPrecioPresupuesto(1000, proyectoConCostes(900), 35);
    expect(r.disponible).toBe(true);
    if (!r.disponible) throw new Error('no disponible');
    expect(r.estado).toBe('por_debajo');
  });

  it('marca "cerca" cuando el margen está ligeramente por debajo (dentro del umbral)', () => {
    const r = analizarPrecioPresupuesto(1000, proyectoConCostes(680), 35);
    expect(r.disponible).toBe(true);
    if (!r.disponible) throw new Error('no disponible');
    expect(r.estado).toBe('cerca');
  });

  // Caso 4: presupuesto sin costes suficientes.
  it('devuelve "sin_costes" cuando el proyecto no tiene movimientos ni horas', () => {
    const proyectoVacio = { ...proyectoConCostes(0), movimientos: [] };
    const r = analizarPrecioPresupuesto(1000, proyectoVacio, 35);
    expect(r).toEqual({ disponible: false, motivo: 'sin_costes' });
  });

  it('devuelve "sin_proyecto" cuando no hay proyecto vinculado', () => {
    expect(analizarPrecioPresupuesto(1000, null, 35)).toEqual({ disponible: false, motivo: 'sin_proyecto' });
    expect(analizarPrecioPresupuesto(1000, undefined, 35)).toEqual({ disponible: false, motivo: 'sin_proyecto' });
  });

  it('devuelve "sin_precio" cuando no hay precio total válido', () => {
    expect(analizarPrecioPresupuesto(0, proyectoConCostes(500), 35)).toEqual({ disponible: false, motivo: 'sin_precio' });
  });

  // Caso 6: sin margen objetivo configurado.
  it('devuelve "sin_objetivo" cuando hay coste real pero no hay margen objetivo', () => {
    expect(analizarPrecioPresupuesto(1000, proyectoConCostes(500), null)).toEqual({ disponible: false, motivo: 'sin_objetivo' });
  });

  // Caso 7: nunca lanza.
  it('nunca lanza con datos ausentes o malformados', () => {
    expect(() => analizarPrecioPresupuesto(1000, undefined, undefined)).not.toThrow();
  });

  it('calcularEstadoMargen: umbral de "cerca" inclusivo en el límite', () => {
    expect(calcularEstadoMargen(-5)).toBe('cerca');
    expect(calcularEstadoMargen(-5.01)).toBe('por_debajo');
    expect(calcularEstadoMargen(0)).toBe('por_encima');
  });

  describe('interpretarAnalisis — texto generado por código, sin IA', () => {
    it('explica el motivo concreto cuando no hay datos suficientes', () => {
      expect(interpretarAnalisis({ disponible: false, motivo: 'sin_objetivo' })).toMatch(/margen objetivo/i);
      expect(interpretarAnalisis({ disponible: false, motivo: 'sin_costes' })).toMatch(/gastos ni horas/i);
    });

    it('explica la diferencia en puntos cuando sí hay análisis disponible', () => {
      const r = analizarPrecioPresupuesto(1000, proyectoConCostes(500), 35);
      expect(r.disponible).toBe(true);
      const texto = interpretarAnalisis(r);
      expect(texto).toMatch(/por encima del objetivo/i);
    });
  });
});
