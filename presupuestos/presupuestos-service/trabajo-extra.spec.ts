import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { ClienteModel, ProyectoModel } from './cliente.model.js';

/**
 * "Trabajo extra" (28/08/2026): `Proyecto.trabajosExtra[]` y
 * `svc.anadirTrabajoExtraProyecto` — el carpintero añade algo que el
 * cliente pide durante la obra, aparte del presupuesto inicial; el precio
 * se suma al `presupuesto` acordado en la misma operación atómica que
 * registra el trabajo. Contra MongoDB en memoria, nunca Atlas real —
 * mismo patrón que `caracteristicas-trabajo.spec.ts`.
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

const USUARIO_A = 'usuario-a-trabajo-extra-test';
const USUARIO_B = 'usuario-b-trabajo-extra-test';

function clienteBase(id: string, usuarioId: string) {
  return { id, usuarioId, nombre: 'Cliente de prueba', creado: new Date().toISOString() };
}

function proyectoBase(id: string, clienteId: string, usuarioId: string, extra: Record<string, unknown> = {}) {
  return {
    id, usuarioId, clienteId, tarifaHora: 20, presupuesto: 1000,
    creado: new Date().toISOString(),
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
  await Promise.all([ClienteModel.deleteMany({}), ProyectoModel.deleteMany({})]);
});

describe('anadirTrabajoExtraProyecto', () => {
  it('A. añade la entrada con descripción/precio y suma el precio al presupuesto acordado', async () => {
    await ClienteModel.create(clienteBase('cA', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pA', 'cA', USUARIO_A));
    const actualizado = await svc.anadirTrabajoExtraProyecto('pA', USUARIO_A, 'Balda extra en el armario', 400);
    expect((actualizado as any).presupuesto).toBe(1400);
    expect((actualizado as any).trabajosExtra.length).toBe(1);
    expect((actualizado as any).trabajosExtra[0].descripcion).toBe('Balda extra en el armario');
    expect((actualizado as any).trabajosExtra[0].precio).toBe(400);
  });

  it('B. el id y la fecha los asigna siempre el servidor', async () => {
    await ClienteModel.create(clienteBase('cB', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pB', 'cB', USUARIO_A));
    const actualizado = await svc.anadirTrabajoExtraProyecto('pB', USUARIO_A, 'Ventana extra', 250);
    const t = (actualizado as any).trabajosExtra[0];
    expect(typeof t.id).toBe('string');
    expect(t.id.length).toBeGreaterThan(0);
    expect(typeof t.fecha).toBe('string');
  });

  it('C. varios trabajos extra se acumulan, tanto en la lista como en el presupuesto', async () => {
    await ClienteModel.create(clienteBase('cC', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pC', 'cC', USUARIO_A));
    await svc.anadirTrabajoExtraProyecto('pC', USUARIO_A, 'Extra 1', 100);
    const actualizado = await svc.anadirTrabajoExtraProyecto('pC', USUARIO_A, 'Extra 2', 250);
    expect((actualizado as any).presupuesto).toBe(1350);
    expect((actualizado as any).trabajosExtra.length).toBe(2);
  });

  it('D. un proyecto sin presupuesto inicial (0) admite trabajos extra con normalidad', async () => {
    await ClienteModel.create(clienteBase('cD', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pD', 'cD', USUARIO_A, { presupuesto: 0 }));
    const actualizado = await svc.anadirTrabajoExtraProyecto('pD', USUARIO_A, 'Primer extra', 300);
    expect((actualizado as any).presupuesto).toBe(300);
  });

  it('E. un proyecto antiguo sin el campo trabajosExtra en absoluto admite añadir uno nuevo', async () => {
    await ClienteModel.create(clienteBase('cE', USUARIO_A));
    // Inserción directa sin pasar por el esquema con default (bypass de
    // Mongoose vía `.collection`) — la clave `trabajosExtra` queda
    // REALMENTE ausente del documento, no `null`, tal como un proyecto
    // creado antes de esta función (a diferencia de asignar explícitamente
    // `undefined`, que el driver de Mongo serializa como `null`).
    await ProyectoModel.collection.insertOne(proyectoBase('pE', 'cE', USUARIO_A) as any);
    await expect(svc.anadirTrabajoExtraProyecto('pE', USUARIO_A, 'Extra', 50)).resolves.toBeTruthy();
  });

  it('F. aislamiento entre usuarios: no se puede añadir un trabajo extra al proyecto de otro', async () => {
    await ClienteModel.create(clienteBase('cF', USUARIO_B));
    await ProyectoModel.create(proyectoBase('pF', 'cF', USUARIO_B));
    await expect(svc.anadirTrabajoExtraProyecto('pF', USUARIO_A, 'Intento ajeno', 999)).rejects.toThrow();
    const doc = await ProyectoModel.findOne({ id: 'pF' }).lean().exec() as any;
    expect(doc.trabajosExtra).toEqual([]);
    expect(doc.presupuesto).toBe(1000); // intacto, la escritura de A nunca llegó a aplicarse
  });

  it('G. no se puede introducir un trabajo extra en un proyecto ajeno manipulando el usuarioId', async () => {
    await ClienteModel.create(clienteBase('cG-a', USUARIO_A));
    await ClienteModel.create(clienteBase('cG-b', USUARIO_B));
    await ProyectoModel.create(proyectoBase('pG-propio', 'cG-a', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pG-ajeno', 'cG-b', USUARIO_B));

    await expect(svc.anadirTrabajoExtraProyecto('pG-ajeno', USUARIO_A, 'Intento', 500)).rejects.toThrow();
    const propio = await ProyectoModel.findOne({ id: 'pG-propio' }).lean().exec() as any;
    const ajeno = await ProyectoModel.findOne({ id: 'pG-ajeno' }).lean().exec() as any;
    expect(propio.trabajosExtra).toEqual([]);
    expect(ajeno.trabajosExtra).toEqual([]);
    expect(ajeno.presupuesto).toBe(1000);
  });
});
