import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ClienteModel, ProyectoModel, PresupuestoModel, conectar } from './cliente.model.js';
import { PresupuestosService } from './presupuestos-service.js';

/**
 * `cambiarEstadoProyecto` marcando "presupuesto_enviado" a mano desde la
 * ficha del cliente (petición real del usuario, 29/10/2026): debe marcar
 * también como 'enviado' el presupuesto más reciente en 'borrador' de ese
 * mismo cliente — mismo efecto que generar su enlace del Portal, sin que
 * el carpintero tenga que acordarse de hacerlo en los dos sitios.
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();
const USUARIO = 'u-estado-proyecto';

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
  await Promise.all([ClienteModel.deleteMany({}), ProyectoModel.deleteMany({}), PresupuestoModel.deleteMany({})]);
});

async function prepararClienteYProyecto(clienteId: string) {
  await ClienteModel.create({ id: clienteId, usuarioId: USUARIO, nombre: 'Cliente de prueba', creado: new Date().toISOString() });
  const proyectoId = randomUUID();
  await ProyectoModel.create({ id: proyectoId, clienteId, usuarioId: USUARIO, estado: 'presupuestado', creado: new Date().toISOString() });
  return proyectoId;
}

async function crearPresupuesto(clienteId: string, estado: string, creado: string) {
  const id = randomUUID();
  await PresupuestoModel.create({
    id, clienteId, usuarioId: USUARIO, estado, formato: 'documento',
    titulo: 'Presupuesto', precioTotal: 100, creado, actualizado: creado,
  });
  return id;
}

it('marcar "presupuesto_enviado" a mano pasa a enviado el presupuesto en borrador más reciente', async () => {
  const clienteId = 'c-estado-1';
  const proyectoId = await prepararClienteYProyecto(clienteId);
  await crearPresupuesto(clienteId, 'borrador', '2026-10-20T10:00:00.000Z'); // más antiguo
  const masReciente = await crearPresupuesto(clienteId, 'borrador', '2026-10-28T10:00:00.000Z'); // más reciente

  await svc.cambiarEstadoProyecto(proyectoId, USUARIO, 'presupuesto_enviado');

  const docs = await PresupuestoModel.find({ clienteId, usuarioId: USUARIO }).lean().exec();
  const actualizado = docs.find((d: any) => d.id === masReciente) as any;
  const otro = docs.find((d: any) => d.id !== masReciente) as any;
  expect(actualizado.estado).toBe('enviado');
  expect(otro.estado).toBe('borrador'); // el más antiguo no se toca
});

it('nunca pisa un presupuesto ya enviado/aceptado/rechazado', async () => {
  const clienteId = 'c-estado-2';
  const proyectoId = await prepararClienteYProyecto(clienteId);
  await crearPresupuesto(clienteId, 'aceptado', '2026-10-28T10:00:00.000Z');

  await svc.cambiarEstadoProyecto(proyectoId, USUARIO, 'presupuesto_enviado');

  const docs = await PresupuestoModel.find({ clienteId, usuarioId: USUARIO }).lean().exec();
  expect((docs[0] as any).estado).toBe('aceptado'); // sin cambios
});

it('si no hay ningún presupuesto en borrador, no falla ni crea nada', async () => {
  const clienteId = 'c-estado-3';
  const proyectoId = await prepararClienteYProyecto(clienteId);

  const proyecto = await svc.cambiarEstadoProyecto(proyectoId, USUARIO, 'presupuesto_enviado');
  expect((proyecto as any).estado).toBe('presupuesto_enviado');

  const docs = await PresupuestoModel.find({ clienteId, usuarioId: USUARIO }).lean().exec();
  expect(docs.length).toBe(0);
});

it('otros estados (ej. "en_curso") nunca tocan ningún presupuesto', async () => {
  const clienteId = 'c-estado-4';
  const proyectoId = await prepararClienteYProyecto(clienteId);
  await crearPresupuesto(clienteId, 'borrador', '2026-10-28T10:00:00.000Z');

  await svc.cambiarEstadoProyecto(proyectoId, USUARIO, 'en_curso');

  const docs = await PresupuestoModel.find({ clienteId, usuarioId: USUARIO }).lean().exec();
  expect((docs[0] as any).estado).toBe('borrador'); // sin cambios
});
