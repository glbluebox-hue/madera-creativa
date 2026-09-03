import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { ClienteModel, ProyectoModel } from './cliente.model.js';

/**
 * Horas de ayudante (petición del usuario, 03/09/2026): `Proyecto.horasAyudante[]`,
 * un apartado separado de `Proyecto.horas[]` (las propias), guardado a
 * través del PUT genérico de proyecto (`guardarProyecto`) — mismo camino
 * que ya usan las horas propias, sin ruta quirúrgica dedicada.
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();
const USUARIO = 'usuario-horas-ayudante-test';

function clienteBase(id: string) {
  return { id, usuarioId: USUARIO, nombre: 'Cliente de prueba', creado: new Date().toISOString() };
}

function proyectoBase(id: string, clienteId: string, extra: Record<string, unknown> = {}) {
  return { id, usuarioId: USUARIO, clienteId, tarifaHora: 20, presupuesto: 1000, creado: new Date().toISOString(), ...extra };
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

describe('Proyecto.horasAyudante — vía guardarProyecto', () => {
  it('guarda las horas de ayudante, cada una con su propia tarifa', async () => {
    await ClienteModel.create(clienteBase('c1'));
    const creado = await ProyectoModel.create(proyectoBase('p1', 'c1'));

    const actualizado = await svc.guardarProyecto({
      ...(creado.toObject() as any),
      horasAyudante: [
        { id: 'a1', fecha: '2026-09-01', ayudante: 'Pedro', tarea: 'Lijado', horas: 5, tarifaHora: 12 },
      ],
    } as any, USUARIO);

    expect((actualizado as any).horasAyudante.length).toBe(1);
    expect((actualizado as any).horasAyudante[0].ayudante).toBe('Pedro');
    expect((actualizado as any).horasAyudante[0].tarifaHora).toBe(12);

    // Y que de verdad quedó en la base de datos, no solo en la respuesta.
    const doc = await ProyectoModel.findOne({ id: 'p1' }).lean().exec() as any;
    expect(doc.horasAyudante.length).toBe(1);
  });

  it('un proyecto antiguo sin el campo horasAyudante en absoluto admite guardarlo por primera vez', async () => {
    await ClienteModel.create(clienteBase('c2'));
    // Inserción directa sin pasar por el esquema con default (bypass de
    // Mongoose vía `.collection`) — la clave `horasAyudante` queda
    // REALMENTE ausente del documento, tal como un proyecto creado antes
    // de este incremento — mismo patrón que `trabajo-extra.spec.ts` caso E.
    await ProyectoModel.collection.insertOne(proyectoBase('p2', 'c2') as any);
    const anterior = await ProyectoModel.findOne({ id: 'p2' }).lean().exec() as any;
    expect(anterior.horasAyudante).toBeUndefined();

    const actualizado = await svc.guardarProyecto({
      ...anterior,
      horasAyudante: [{ id: 'a1', fecha: '2026-09-01', ayudante: 'Ana', tarea: '', horas: 2, tarifaHora: 15 }],
    } as any, USUARIO);

    expect((actualizado as any).horasAyudante.length).toBe(1);
  });

  it('guardar otro campo del proyecto NUNCA borra en silencio las horas de ayudante ya guardadas', async () => {
    await ClienteModel.create(clienteBase('c3'));
    const creado = await ProyectoModel.create(proyectoBase('p3', 'c3', {
      horasAyudante: [{ id: 'a1', fecha: '2026-09-01', ayudante: 'Pedro', tarea: 'Lijado', horas: 3, tarifaHora: 10 }],
    }));

    // Actualiza SOLO la dirección, reenviando el proyecto tal como lo
    // devolvió el servidor (igual que hace el frontend al guardar
    // cualquier cambio) — las horas de ayudante deben seguir intactas.
    const actualizado = await svc.guardarProyecto({
      ...(creado.toObject() as any),
      direccion: 'Calle nueva 5',
    } as any, USUARIO);

    expect((actualizado as any).direccion).toBe('Calle nueva 5');
    expect((actualizado as any).horasAyudante.length).toBe(1);
    expect((actualizado as any).horasAyudante[0].ayudante).toBe('Pedro');
  });
});
