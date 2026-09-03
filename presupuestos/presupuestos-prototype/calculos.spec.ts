import { calcularResumen } from './calculos.js';
import type { Proyecto } from './types.js';

/**
 * Horas de ayudante (petición del usuario, 03/09/2026): apartado separado
 * de las horas propias, con tarifa por hora propia en cada registro (no
 * la tarifaHora única del proyecto), y su coste debe sumarse al gasto
 * total del proyecto igual que la mano de obra propia.
 */

function proyectoBase(extra: Partial<Proyecto> = {}): Proyecto {
  return {
    id: 'p1', clienteId: 'c1', proyecto: '', direccion: '', presupuesto: 0, tarifaHora: 20,
    creado: '', estado: 'en_curso', tareas: [], adjuntos: [], fotos: [],
    movimientos: [],
    horas: [],
    ...extra,
  } as unknown as Proyecto;
}

describe('calcularResumen — horas de ayudante', () => {
  it('cuesta las horas de ayudante a SU PROPIA tarifa, no a la tarifaHora del proyecto', () => {
    const r = calcularResumen(proyectoBase({
      tarifaHora: 20, // la tarifa propia, no debe usarse para el ayudante
      horasAyudante: [
        { id: 'a1', fecha: '2026-09-01', ayudante: 'Pedro', tarea: 'Lijado', horas: 5, tarifaHora: 12 },
      ],
    }));
    expect(r.totalHorasAyudante).toBe(5);
    expect(r.costeAyudante).toBe(60); // 5 * 12, no 5 * 20
  });

  it('suma varios registros de ayudante con tarifas distintas cada uno', () => {
    const r = calcularResumen(proyectoBase({
      horasAyudante: [
        { id: 'a1', fecha: '2026-09-01', ayudante: 'Pedro', tarea: '', horas: 3, tarifaHora: 10 },
        { id: 'a2', fecha: '2026-09-02', ayudante: 'María', tarea: '', horas: 2, tarifaHora: 15 },
      ],
    }));
    expect(r.totalHorasAyudante).toBe(5);
    expect(r.costeAyudante).toBe(60); // 3*10 + 2*15
  });

  it('el coste del ayudante se suma al coste total y reduce el margen', () => {
    const r = calcularResumen(proyectoBase({
      movimientos: [{ id: 'm1', fecha: '2026-09-01', concepto: '', categoria: '', tipo: 'ingreso', importe: 1000 }],
      horas: [{ id: 'h1', fecha: '2026-09-01', tarea: '', horas: 2 }], // 2 * 20 = 40 (tarifa propia)
      horasAyudante: [{ id: 'a1', fecha: '2026-09-01', ayudante: 'Pedro', tarea: '', horas: 4, tarifaHora: 10 }], // 40
    }));
    expect(r.costeManoObra).toBe(40);
    expect(r.costeAyudante).toBe(40);
    expect(r.costeTotal).toBe(80); // 0 gastos + 40 + 40
    expect(r.margen).toBe(920); // 1000 - 80
  });

  it('nunca falla con un proyecto guardado antes de este incremento (sin el campo horasAyudante)', () => {
    const proyecto = proyectoBase();
    delete (proyecto as any).horasAyudante; // simula un documento real anterior, sin este campo en absoluto
    const r = calcularResumen(proyecto);
    expect(r.totalHorasAyudante).toBe(0);
    expect(r.costeAyudante).toBe(0);
  });
});
