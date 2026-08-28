import { haceFaltaPedirProyecto, analisisParaEditor, tipoTrabajoParaEditor } from './editor-inteligencia-precios.js';
import type { AnalisisPrecio } from './inteligencia-precios.js';
import type { Proyecto } from './types.js';

/**
 * "🧠 Inteligencia de precios" dentro del editor (Fase 2C, integración en
 * el editor, 28/08/2026) — tests de la lógica pura extraída a
 * `editor-inteligencia-precios.ts`. No duplica los tests del motor de
 * comparables (`comparables.spec.ts`, backend) ni los de
 * `analizarPrecioPresupuesto`/`calcularMargenRealProyecto` (ya cubiertos
 * en `inteligencia-precios.spec.ts`) — solo prueba la decisión NUEVA:
 * cuándo hace falta pedir el proyecto, y qué análisis se acaba mostrando
 * en cada combinación real (presupuesto en curso / aceptado / sin
 * proyecto / con datos insuficientes).
 *
 * Este paquete no tiene infraestructura de tests de componentes React
 * (ni `@testing-library/react` ni ningún `.spec.tsx` existe hoy) — la
 * visibilidad del botón, la apertura del modal al pulsar y el cierre sin
 * perder el presupuesto están verificados por revisión de código, no por
 * un test automatizado (ver el informe final, sección M).
 */

const analisisDisponible: AnalisisPrecio = {
  disponible: true, precio: 10000, costeEstimado: 6000, margenPorcentaje: 40, margenObjetivoPorcentaje: 45, diferenciaPuntos: -5, estado: 'cerca',
};

function proyectoBase(extra: Partial<Proyecto> = {}): Proyecto {
  return {
    id: 'p1', usuarioId: 'u1', clienteId: 'c1', proyecto: 'Cocina', direccion: '', presupuesto: 0, tarifaHora: 20,
    creado: '2026-01-01T00:00:00.000Z', estado: 'en_curso',
    estancias: [], tareas: [], movimientos: [], horas: [], adjuntos: [], fotos: [],
    ...extra,
  } as Proyecto;
}

describe('haceFaltaPedirProyecto — Fase 2C, integración en el editor', () => {
  it('presupuesto ACEPTADO (con snapshot congelado): nunca hace falta pedir el proyecto', () => {
    expect(haceFaltaPedirProyecto(analisisDisponible, 'p1')).toBe(false);
  });

  it('sin proyecto vinculado: nunca hace falta pedir nada (analizarPrecioPresupuesto ya sabe explicarlo con null)', () => {
    expect(haceFaltaPedirProyecto(undefined, undefined)).toBe(false);
  });

  it('presupuesto EN CURSO con proyecto: siempre hace falta pedirlo — sin caché entre aperturas (pedido real, 28/08/2026: "que siempre lea en vivo")', () => {
    expect(haceFaltaPedirProyecto(undefined, 'p1')).toBe(true);
    // Se pide igual la segunda vez que se llama — nunca se "recuerda" que ya se pidió antes.
    expect(haceFaltaPedirProyecto(undefined, 'p1')).toBe(true);
  });
});

describe('analisisParaEditor — qué análisis se muestra en cada caso', () => {
  it('presupuesto ACEPTADO: usa el snapshot congelado tal cual, sin tocar el proyecto ni el precio actual', () => {
    const proyectoDistinto = proyectoBase({ movimientos: [{ id: 'i', fecha: '2026-01-01', concepto: 'x', categoria: 'General', tipo: 'ingreso', importe: 999999 }] });
    const r = analisisParaEditor(analisisDisponible, 1, proyectoDistinto, 10);
    expect(r).toBe(analisisDisponible); // el mismísimo objeto, no recalculado
  });

  it('presupuesto EN CURSO sin proyecto vinculado: "sin_proyecto", sin inventar nada', () => {
    const r = analisisParaEditor(undefined, 10000, null, 45);
    expect(r).toEqual({ disponible: false, motivo: 'sin_proyecto' });
  });

  it('presupuesto EN CURSO con proyecto pero sin costes ni horas registradas: "sin_costes"', () => {
    const proyectoVacio = proyectoBase({ movimientos: [], horas: [] });
    const r = analisisParaEditor(undefined, 10000, proyectoVacio, 45);
    expect(r).toEqual({ disponible: false, motivo: 'sin_costes' });
  });

  it('presupuesto EN CURSO con proyecto y costes suficientes: calcula en vivo, disponible', () => {
    const proyectoConCostes = proyectoBase({
      movimientos: [{ id: 'g', fecha: '2026-01-01', concepto: 'Material', categoria: 'General', tipo: 'gasto', importe: 4000 }],
    });
    const r = analisisParaEditor(undefined, 10000, proyectoConCostes, 45);
    expect(r.disponible).toBe(true);
    if (r.disponible) expect(r.precio).toBe(10000);
  });
});

describe('tipoTrabajoParaEditor', () => {
  it('sin proyecto cargado: null', () => {
    expect(tipoTrabajoParaEditor(null)).toBeNull();
  });

  it('proyecto sin caracteristicas guardadas: null, nunca inventado', () => {
    expect(tipoTrabajoParaEditor(proyectoBase())).toBeNull();
  });

  it('proyecto con tipoTrabajo guardado: lo devuelve', () => {
    const proyecto = proyectoBase({
      caracteristicas: [{ clave: 'tipoTrabajo', valor: 'Cocina', origen: 'usuario', confirmadoPorUsuario: true, confianza: null, fecha: '2026-01-01' }],
    });
    expect(tipoTrabajoParaEditor(proyecto)).toBe('Cocina');
  });
});
