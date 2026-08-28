import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { ClienteModel, ProyectoModel, PresupuestoModel, EmpresaModel } from './cliente.model.js';

/**
 * Regresión de Inteligencia de Precios (Fase 1) contra una MongoDB en
 * memoria (nunca Atlas real) — cubre el snapshot `analisisPrecio` que se
 * congela al aceptar un presupuesto (`ejecutarConsecuenciasAceptacion`,
 * `presupuestos-service.ts`), incluyendo el aislamiento por `usuarioId`
 * pedido explícitamente en el plan de pruebas (caso 9) y la compatibilidad
 * con presupuestos/proyectos antiguos sin estos campos (caso 5).
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

const USUARIO_A = 'usuario-a-precio-test';
const USUARIO_B = 'usuario-b-precio-test';

function clienteBase(id: string, usuarioId: string) {
  return { id, usuarioId, nombre: 'Cliente de prueba', creado: new Date().toISOString() };
}

function proyectoBase(id: string, clienteId: string, usuarioId: string, extra: Record<string, unknown> = {}) {
  return {
    id, usuarioId, clienteId, tarifaHora: 20,
    movimientos: [{ id: 'm1', fecha: '2026-08-01', concepto: 'Material', tipo: 'gasto', importe: 500 }],
    horas: [{ id: 'h1', fecha: '2026-08-01', tarea: 'Montaje', horas: 10 }],
    creado: new Date().toISOString(),
    ...extra,
  };
}

function presupuestoBase(id: string, clienteId: string, proyectoId: string, usuarioId: string, precioTotal: number) {
  const ahora = new Date().toISOString();
  return {
    id, usuarioId, clienteId, proyectoId, titulo: 'Presupuesto de prueba', formato: 'simple' as const,
    precioTotal, items: [], alcance: [], creado: ahora, actualizado: ahora,
  };
}

/**
 * `aceptarPresupuesto` dispara `ejecutarConsecuenciasAceptacion` como
 * "mejor esfuerzo" SIN esperarla (`.catch()` sin `await`, a propósito —
 * ver el comentario junto a esa llamada en `presupuestos-service.ts`: la
 * respuesta al usuario no debe depender de estos pasos secundarios). Contra
 * MongoMemoryServer, sin latencia de red real, esa tarea de fondo termina
 * en milisegundos — esta espera fija es deliberada, no una comprobación
 * frágil por sondeo.
 */
const esperarConsecuencias = () => new Promise((resolve) => setTimeout(resolve, 150));

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

describe('aceptarPresupuesto — snapshot de análisis de precio (Fase 1)', () => {
  it('congela analisisPrecio al aceptar cuando hay coste y objetivo configurados', async () => {
    await ClienteModel.create(clienteBase('c1', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p1', 'c1', USUARIO_A));
    await PresupuestoModel.create(presupuestoBase('pr1', 'c1', 'p1', USUARIO_A, 1000));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });

    await svc.aceptarPresupuesto('pr1', USUARIO_A);
    await esperarConsecuencias();
    const doc = await PresupuestoModel.findOne({ id: 'pr1' }).lean().exec() as any;
    expect(doc.analisisPrecio).toBeTruthy();
    expect(doc.analisisPrecio.costeEstimado).toBe(700); // 500 gasto + 10h*20€/h
    expect(doc.analisisPrecio.margenPorcentaje).toBeCloseTo(30, 5);
    expect(doc.analisisPrecio.estado).toBe('cerca'); // 30% vs objetivo 35% -> -5 puntos, dentro del umbral
  });

  it('no escribe analisisPrecio si no hay margen objetivo configurado (Empresa sin configurar)', async () => {
    await ClienteModel.create(clienteBase('c2', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p2', 'c2', USUARIO_A));
    await PresupuestoModel.create(presupuestoBase('pr2', 'c2', 'p2', USUARIO_A, 1000));
    // Sin EmpresaModel.create — simula un usuario que nunca configuró Ajustes de empresa.

    await svc.aceptarPresupuesto('pr2', USUARIO_A);
    await esperarConsecuencias();
    const doc = await PresupuestoModel.findOne({ id: 'pr2' }).lean().exec() as any;
    expect(doc.analisisPrecio).toBeFalsy();
  });

  it('un guardado normal (PUT) nunca puede pisar analisisPrecio ya congelado', async () => {
    await ClienteModel.create(clienteBase('c3', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p3', 'c3', USUARIO_A));
    await PresupuestoModel.create(presupuestoBase('pr3', 'c3', 'p3', USUARIO_A, 1000));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });
    await svc.aceptarPresupuesto('pr3', USUARIO_A);
    await esperarConsecuencias();

    const aceptado = await svc.obtenerPresupuesto('pr3', USUARIO_A) as any;
    expect(aceptado.analisisPrecio).toBeTruthy();
    // guardarPresupuesto pasa por esquemaPresupuestoMC (Zod), que no incluye
    // analisisPrecio — igual que ya ocurre con `estado`/`firmaClienteUrl`.
    // Aquí se simula ese filtrado (el propio objeto no lo lleva) y se
    // confirma que guardarPresupuesto no lo borra por su ausencia.
    const { analisisPrecio, ...sinAnalisis } = aceptado;
    await svc.guardarPresupuesto({ ...sinAnalisis, titulo: 'Título editado' }, USUARIO_A);
    const releido = await svc.obtenerPresupuesto('pr3', USUARIO_A) as any;
    expect(releido.titulo).toBe('Título editado');
    expect(releido.analisisPrecio).toBeTruthy();
  });

  // Caso 9 del plan de pruebas: aislamiento entre empresas/usuarios.
  // Nota: `Cliente.id`/`Proyecto.id`/`Presupuesto.id` tienen un índice
  // ÚNICO GLOBAL (no compuesto con usuarioId, confirmado al ejecutar este
  // test por primera vez: `E11000 duplicate key` al intentar reutilizar el
  // mismo id para dos usuarios) — un id nunca puede colisionar entre
  // cuentas, así que el escenario real de riesgo no es "mismo id, dos
  // dueños" sino que el análisis de A use, por un fallo de scoping en la
  // consulta, el margen objetivo o el proyecto de B. Se verifica creando
  // datos MUY distintos para cada usuario y comprobando que el snapshot de
  // A solo refleja los suyos.
  it('aislamiento: el análisis de un usuario nunca usa el proyecto/objetivo de otro', async () => {
    await ClienteModel.create(clienteBase('cliente-a', USUARIO_A));
    await ClienteModel.create(clienteBase('cliente-b', USUARIO_B));
    await ProyectoModel.create(proyectoBase('proyecto-a', 'cliente-a', USUARIO_A));
    // Proyecto de B con costes disparatados — si hubiera fuga de scoping, contaminaría el resultado de A.
    await ProyectoModel.create(proyectoBase('proyecto-b', 'cliente-b', USUARIO_B, {
      movimientos: [{ id: 'm-fuga', fecha: '2026-08-01', concepto: 'Fuga', tipo: 'gasto', importe: 999999 }], horas: [],
    }));
    await PresupuestoModel.create(presupuestoBase('pr-a', 'cliente-a', 'proyecto-a', USUARIO_A, 1000));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });
    await EmpresaModel.create({ usuarioId: USUARIO_B, margenObjetivoPorcentaje: 99 }); // objetivo disparatado de B, no debe filtrarse a A

    await svc.aceptarPresupuesto('pr-a', USUARIO_A);
    await esperarConsecuencias();
    const doc = await PresupuestoModel.findOne({ id: 'pr-a' }).lean().exec() as any;
    expect(doc.analisisPrecio.costeEstimado).toBe(700); // nunca los 999999 del proyecto de B
    expect(doc.analisisPrecio.margenObjetivoPorcentaje).toBe(35); // nunca el 99 de la empresa de B
  });

  // Caso 5 del plan de pruebas: presupuesto/proyecto antiguo sin los campos nuevos.
  it('presupuesto antiguo sin proyectoId ni analisisPrecio se acepta sin romperse', async () => {
    await ClienteModel.create(clienteBase('c5', USUARIO_A));
    const legado = presupuestoBase('pr5', 'c5', '', USUARIO_A, 500);
    await PresupuestoModel.create(legado);
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });

    await expect(svc.aceptarPresupuesto('pr5', USUARIO_A)).resolves.toBeTruthy();
    await esperarConsecuencias();
    const doc = await PresupuestoModel.findOne({ id: 'pr5' }).lean().exec() as any;
    expect(doc.estado).toBe('aceptado');
    expect(doc.analisisPrecio).toBeFalsy(); // sin proyecto vinculado -> sin datos, nunca inventado
  });
});
