import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { ClienteModel, ProyectoModel, PresupuestoModel, EmpresaModel } from './cliente.model.js';

/**
 * Regresión de "margen real" (28/08/2026) — la ampliación que fusiona el
 * margen PREVISTO (presupuesto cotizado, ya existente en Fase 1) con el
 * margen REAL (proyecto `finalizado`, ingresos y gastos ya cobrados/pagados)
 * en un único "trabajo" por `svc.analizarTrabajos`. Contra MongoDB en
 * memoria, nunca Atlas real — mismo patrón que `presupuestos-precio.spec.ts`.
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

const USUARIO_A = 'usuario-a-trabajos-test';
const USUARIO_B = 'usuario-b-trabajos-test';

function clienteBase(id: string, usuarioId: string) {
  return { id, usuarioId, nombre: 'Cliente de prueba', creado: new Date().toISOString() };
}

/** Proyecto con datos reales completos: 12.500€ de ingreso, 4.000€ de gasto, 150€ de mano de obra (5h a 30€/h) -> coste 4.150€, margen real ~66,8%. */
function proyectoBase(id: string, clienteId: string, usuarioId: string, extra: Record<string, unknown> = {}) {
  return {
    id, usuarioId, clienteId, tarifaHora: 30, estado: 'finalizado',
    movimientos: [
      { id: 'ing1', fecha: '2026-08-01', concepto: 'Cobro', categoria: 'General', tipo: 'ingreso', importe: 12500 },
      { id: 'gas1', fecha: '2026-08-01', concepto: 'Material', categoria: 'General', tipo: 'gasto', importe: 4000 },
    ],
    horas: [{ id: 'h1', fecha: '2026-08-01', tarea: 'Montaje', horas: 5 }],
    creado: new Date().toISOString(),
    ...extra,
  };
}

function presupuestoBase(id: string, clienteId: string, proyectoId: string, usuarioId: string, precioTotal: number, extra: Record<string, unknown> = {}) {
  const ahora = new Date().toISOString();
  return {
    id, usuarioId, clienteId, proyectoId, titulo: 'Presupuesto de prueba', formato: 'simple' as const,
    precioTotal, items: [], alcance: [], estado: 'aceptado', creado: ahora, actualizado: ahora,
    ...extra,
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongod.getUri();
  await mongoose.connect(process.env.MONGO_URL);
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all([
    ClienteModel.deleteMany({}), ProyectoModel.deleteMany({}),
    PresupuestoModel.deleteMany({}), EmpresaModel.deleteMany({}),
  ]);
});

describe('analizarTrabajos — margen real de proyectos finalizados (ampliación 28/08/2026)', () => {
  // Caso 1: proyecto finalizado + datos reales -> margen real.
  it('1. calcula margen real para un proyecto finalizado con ingresos y gastos', async () => {
    await ClienteModel.create(clienteBase('c1', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p1', 'c1', USUARIO_A));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });

    const trabajos = await svc.analizarTrabajos(USUARIO_A);
    const t = trabajos.find((x: any) => x.id === 'p1') as any;
    expect(t).toBeTruthy();
    expect(t.origenPrincipal).toBe('real');
    expect(t.real.costeEstimado).toBe(4150); // 4000 gasto + 5h*30€/h
    expect(t.real.precio).toBe(12500); // ingreso real, no un precio cotizado
    expect(t.previsto).toBeFalsy();
  });

  // Caso 2: proyecto finalizado SIN presupuesto -> aparece igualmente como margen real.
  it('2. un proyecto finalizado sin ningún presupuesto asociado aparece como margen real', async () => {
    await ClienteModel.create(clienteBase('c2', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p2', 'c2', USUARIO_A, { proyecto: 'Armario López' }));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });
    // Deliberadamente sin ningún PresupuestoModel.create.

    const trabajos = await svc.analizarTrabajos(USUARIO_A);
    expect(trabajos.length).toBe(1);
    const t = trabajos[0] as any;
    expect(t.titulo).toBe('Armario López');
    expect(t.origenPrincipal).toBe('real');
    expect(t.previsto).toBeFalsy();
  });

  // Caso 3: presupuesto aceptado + proyecto NO finalizado -> margen previsto (comportamiento Fase 1 sin cambios).
  it('3. presupuesto aceptado con proyecto no finalizado sigue dando margen previsto', async () => {
    await ClienteModel.create(clienteBase('c3', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p3', 'c3', USUARIO_A, { estado: 'en_curso' }));
    await PresupuestoModel.create(presupuestoBase('pr3', 'c3', 'p3', USUARIO_A, 15000));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });

    const trabajos = await svc.analizarTrabajos(USUARIO_A);
    const t = trabajos.find((x: any) => x.id === 'p3') as any;
    expect(t.origenPrincipal).toBe('previsto');
    expect(t.real).toBeFalsy();
    expect(t.previsto.precio).toBe(15000); // el precio COTIZADO, no el ingreso real
  });

  // Caso 4: presupuesto aceptado + proyecto finalizado -> UN ÚNICO trabajo, margen real prioritario.
  it('4. proyecto finalizado con presupuesto aceptado es un único trabajo, con el real como principal', async () => {
    await ClienteModel.create(clienteBase('c4', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p4', 'c4', USUARIO_A));
    await PresupuestoModel.create(presupuestoBase('pr4', 'c4', 'p4', USUARIO_A, 12000, { titulo: 'Cocina García' }));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });

    const trabajos = await svc.analizarTrabajos(USUARIO_A);
    // Un único trabajo, nunca dos filas para el mismo proyecto.
    expect(trabajos.length).toBe(1);
    const t = trabajos[0] as any;
    expect(t.id).toBe('p4'); // identidad = el proyecto, no el presupuesto
    expect(t.titulo).toBe('Cocina García'); // título del presupuesto, más descriptivo que el del proyecto
    expect(t.origenPrincipal).toBe('real');
    expect(t.real.precio).toBe(12500); // ingreso real del proyecto
  });

  // Caso 5: en el mismo escenario del caso 4, el margen previsto sigue disponible para el detalle.
  it('5. el margen previsto del caso 4 sigue disponible, no se pierde al priorizar el real', async () => {
    await ClienteModel.create(clienteBase('c5', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p5', 'c5', USUARIO_A));
    await PresupuestoModel.create(presupuestoBase('pr5', 'c5', 'p5', USUARIO_A, 12000));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });

    const trabajos = await svc.analizarTrabajos(USUARIO_A);
    const t = trabajos[0] as any;
    expect(t.previsto).toBeTruthy();
    expect(t.previsto.precio).toBe(12000); // el precio cotizado, distinto del real (12.500)
    expect(t.real.precio).toBe(12500);
  });

  // Caso 6: proyecto finalizado sin datos suficientes (sin ingresos) -> pendiente de datos.
  it('6. proyecto finalizado sin ingresos registrados queda pendiente, no un margen del 0%', async () => {
    await ClienteModel.create(clienteBase('c6', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p6', 'c6', USUARIO_A, { movimientos: [], horas: [] }));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });

    const trabajos = await svc.analizarTrabajos(USUARIO_A);
    const t = trabajos[0] as any;
    expect(t.real).toBeFalsy();
    expect(t.principal.disponible).toBe(false);
    expect(t.principal.motivo).toBe('sin_ingresos');
  });

  // Caso 7: real y previsto nunca se mezclan en un único número — quedan como campos numéricos independientes.
  it('7. el margen real y el previsto se conservan como cifras independientes, nunca promediadas', async () => {
    await ClienteModel.create(clienteBase('c7', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p7', 'c7', USUARIO_A));
    await PresupuestoModel.create(presupuestoBase('pr7', 'c7', 'p7', USUARIO_A, 12000));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });

    const trabajos = await svc.analizarTrabajos(USUARIO_A);
    const t = trabajos[0] as any;
    // margen real (~66,8%) y margen previsto (~66,25%) son cercanos pero
    // distintos -- si se hubieran promediado o sobrescrito, no coincidirían
    // exactamente con cada fórmula por separado.
    expect(t.real.margenPorcentaje).not.toBe(t.previsto.margenPorcentaje);
    expect(t.real.margenPorcentaje).toBeCloseTo(((12500 - 4150) / 12500) * 100, 5);
    expect(t.previsto.margenPorcentaje).toBeCloseTo(((12000 - 4150) / 12000) * 100, 5);
  });

  // Caso 8: el objetivo del 45% produce el estado correcto, misma lógica que ya existía.
  it('8. aplica el mismo umbral de estados (por_encima/cerca/por_debajo) al margen real', async () => {
    await ClienteModel.create(clienteBase('c8', USUARIO_A));
    // Ingreso 10.000, coste 5.500 -> margen 45% exacto == objetivo -> por_encima.
    await ProyectoModel.create(proyectoBase('p8', 'c8', USUARIO_A, {
      movimientos: [
        { id: 'i', fecha: '2026-08-01', concepto: 'Cobro', categoria: 'General', tipo: 'ingreso', importe: 10000 },
        { id: 'g', fecha: '2026-08-01', concepto: 'Material', categoria: 'General', tipo: 'gasto', importe: 5500 },
      ],
      horas: [],
    }));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });

    const trabajos = await svc.analizarTrabajos(USUARIO_A);
    const t = trabajos[0] as any;
    expect(t.real.estado).toBe('por_encima');
  });

  // Caso 9: aislamiento entre usuarios.
  it('9. nunca mezcla proyectos/presupuestos/objetivo de otro usuario', async () => {
    await ClienteModel.create(clienteBase('c9-a', USUARIO_A));
    await ClienteModel.create(clienteBase('c9-b', USUARIO_B));
    await ProyectoModel.create(proyectoBase('p9-a', 'c9-a', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p9-b', 'c9-b', USUARIO_B, {
      movimientos: [{ id: 'i', fecha: '2026-08-01', concepto: 'Fuga', categoria: 'General', tipo: 'ingreso', importe: 999999 }],
    }));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });
    await EmpresaModel.create({ usuarioId: USUARIO_B, margenObjetivoPorcentaje: 10 });

    const trabajosA = await svc.analizarTrabajos(USUARIO_A);
    expect(trabajosA.length).toBe(1);
    expect((trabajosA[0] as any).id).toBe('p9-a');
    expect((trabajosA[0] as any).real.margenObjetivoPorcentaje).toBe(45); // nunca el 10 de B
  });

  // Caso 11 (Histórico Inteligente, Fase 2B): tipoTrabajo del proyecto finalizado se refleja en el trabajo.
  it('11. incluye tipoTrabajo de Proyecto.caracteristicas[] cuando el proyecto está finalizado', async () => {
    await ClienteModel.create(clienteBase('c11', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p11', 'c11', USUARIO_A, {
      caracteristicas: [{ clave: 'tipoTrabajo', valor: 'Cocina', origen: 'usuario', confirmadoPorUsuario: true, confianza: null, fecha: new Date().toISOString() }],
    }));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });

    const trabajos = await svc.analizarTrabajos(USUARIO_A);
    expect((trabajos[0] as any).tipoTrabajo).toBe('Cocina');
  });

  // Caso 12: tipoTrabajo también se refleja cuando el trabajo viene SOLO de un presupuesto (proyecto aún no finalizado).
  it('12. incluye tipoTrabajo aunque el trabajo venga solo del margen previsto (proyecto no finalizado)', async () => {
    await ClienteModel.create(clienteBase('c12', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p12', 'c12', USUARIO_A, {
      estado: 'en_curso',
      caracteristicas: [{ clave: 'tipoTrabajo', valor: 'Armario', origen: 'usuario', confirmadoPorUsuario: true, confianza: null, fecha: new Date().toISOString() }],
    }));
    await PresupuestoModel.create(presupuestoBase('pr12', 'c12', 'p12', USUARIO_A, 9000));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });

    const trabajos = await svc.analizarTrabajos(USUARIO_A);
    const t = trabajos.find((x: any) => x.id === 'p12') as any;
    expect(t.origenPrincipal).toBe('previsto');
    expect(t.tipoTrabajo).toBe('Armario');
  });

  // Caso 13: sin tipoTrabajo guardado -> null, nunca inventado ni vacío ambiguo.
  it('13. tipoTrabajo es null cuando el proyecto no lo tiene guardado', async () => {
    await ClienteModel.create(clienteBase('c13', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p13', 'c13', USUARIO_A));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });

    const trabajos = await svc.analizarTrabajos(USUARIO_A);
    expect((trabajos[0] as any).tipoTrabajo).toBeNull();
  });

  // Caso 10: no sobrescribir un snapshot de margen previsto ya existente.
  it('10. no sobrescribe un analisisPrecio (previsto) ya congelado, aunque el proyecto ahora esté finalizado', async () => {
    await ClienteModel.create(clienteBase('c10', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p10', 'c10', USUARIO_A));
    const snapshotOriginal = {
      precio: 12000, costeEstimado: 111, margenPorcentaje: 99.1, margenObjetivoPorcentaje: 45,
      diferenciaPuntos: 54.1, estado: 'por_encima', fecha: '2020-01-01T00:00:00.000Z',
    };
    await PresupuestoModel.create(presupuestoBase('pr10', 'c10', 'p10', USUARIO_A, 12000, { analisisPrecio: snapshotOriginal }));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });

    await svc.analizarTrabajos(USUARIO_A);
    const doc = await PresupuestoModel.findOne({ id: 'pr10' }).lean().exec() as any;
    expect(doc.analisisPrecio.costeEstimado).toBe(111); // intacto, nunca recalculado a 4150
    expect(doc.analisisPrecio.fecha).toBe('2020-01-01T00:00:00.000Z');
  });
});
