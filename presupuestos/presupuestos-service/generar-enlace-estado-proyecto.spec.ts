import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ClienteModel, ProyectoModel, PresupuestoModel, conectar } from './cliente.model.js';
import { PresupuestosService } from './presupuestos-service.js';

/**
 * `generarEnlacePresupuesto` marcando también "presupuesto_enviado" en el
 * proyecto asociado (petición real del usuario, 01/11/2026): "al generar
 * el enlace también en la ficha de cliente tienes que pasar a presupuesto
 * enviado" — mismo efecto, en sentido contrario, que ya cubre
 * `cambiar-estado-proyecto.spec.ts` (marcar el proyecto a mano también
 * marca el presupuesto).
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();
const USUARIO = 'u-enlace-estado-proyecto';

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

async function crearCliente(clienteId: string) {
  await ClienteModel.create({ id: clienteId, usuarioId: USUARIO, nombre: 'Cliente de prueba', creado: new Date().toISOString() });
}

async function crearProyecto(clienteId: string, estado: string, creado: string) {
  const id = randomUUID();
  await ProyectoModel.create({ id, clienteId, usuarioId: USUARIO, estado, creado });
  return id;
}

async function crearPresupuesto(clienteId: string, proyectoId: string, formato: 'documento' = 'documento') {
  const id = randomUUID();
  const ahora = new Date().toISOString();
  await PresupuestoModel.create({
    id, clienteId, proyectoId, usuarioId: USUARIO, estado: 'borrador', formato,
    titulo: 'Presupuesto', precioTotal: 100, creado: ahora, actualizado: ahora,
  });
  return id;
}

it('con proyectoId: generar el enlace pasa ese proyecto a "presupuesto_enviado"', async () => {
  const clienteId = 'c-enlace-1';
  await crearCliente(clienteId);
  const proyectoId = await crearProyecto(clienteId, 'presupuestado', '2026-10-28T10:00:00.000Z');
  const presupuestoId = await crearPresupuesto(clienteId, proyectoId);

  await svc.generarEnlacePresupuesto(presupuestoId, USUARIO);

  const proyecto = await ProyectoModel.findOne({ id: proyectoId }).lean().exec() as any;
  expect(proyecto.estado).toBe('presupuesto_enviado');
});

it('sin proyectoId: usa el proyecto "presupuestado" más reciente de ese cliente', async () => {
  const clienteId = 'c-enlace-2';
  await crearCliente(clienteId);
  await crearProyecto(clienteId, 'presupuestado', '2026-10-20T10:00:00.000Z'); // más antiguo
  const masReciente = await crearProyecto(clienteId, 'presupuestado', '2026-10-28T10:00:00.000Z'); // más reciente
  const presupuestoId = await crearPresupuesto(clienteId, ''); // sin proyectoId — caso habitual (flujo global)

  await svc.generarEnlacePresupuesto(presupuestoId, USUARIO);

  const proyectos = await ProyectoModel.find({ clienteId, usuarioId: USUARIO }).lean().exec();
  const actualizado = proyectos.find((p: any) => p.id === masReciente) as any;
  const otro = proyectos.find((p: any) => p.id !== masReciente) as any;
  expect(actualizado.estado).toBe('presupuesto_enviado');
  expect(otro.estado).toBe('presupuestado'); // el más antiguo no se toca
});

it('nunca pisa un proyecto que ya avanzó más (en_curso/finalizado/rechazado)', async () => {
  const clienteId = 'c-enlace-3';
  await crearCliente(clienteId);
  const proyectoId = await crearProyecto(clienteId, 'en_curso', '2026-10-28T10:00:00.000Z');
  const presupuestoId = await crearPresupuesto(clienteId, proyectoId);

  await svc.generarEnlacePresupuesto(presupuestoId, USUARIO);

  const proyecto = await ProyectoModel.findOne({ id: proyectoId }).lean().exec() as any;
  expect(proyecto.estado).toBe('en_curso'); // sin cambios
});

it('sin ningún proyecto en "presupuestado" para ese cliente, no falla ni toca nada', async () => {
  const clienteId = 'c-enlace-4';
  await crearCliente(clienteId);
  const proyectoId = await crearProyecto(clienteId, 'finalizado', '2026-10-28T10:00:00.000Z');
  const presupuestoId = await crearPresupuesto(clienteId, '');

  await expect(svc.generarEnlacePresupuesto(presupuestoId, USUARIO)).resolves.toBeDefined();

  const proyecto = await ProyectoModel.findOne({ id: proyectoId }).lean().exec() as any;
  expect(proyecto.estado).toBe('finalizado');
});

it('generar el enlace una segunda vez (presupuesto ya "enviado") no repite la sincronización', async () => {
  const clienteId = 'c-enlace-5';
  await crearCliente(clienteId);
  const proyectoId = await crearProyecto(clienteId, 'presupuestado', '2026-10-28T10:00:00.000Z');
  const presupuestoId = await crearPresupuesto(clienteId, proyectoId);

  await svc.generarEnlacePresupuesto(presupuestoId, USUARIO);
  // El proyecto ya pasó a 'presupuesto_enviado' — un segundo enlace (p. ej. tras revocar el anterior) no debe tocarlo más.
  await svc.generarEnlacePresupuesto(presupuestoId, USUARIO);

  const proyecto = await ProyectoModel.findOne({ id: proyectoId }).lean().exec() as any;
  expect(proyecto.estado).toBe('presupuesto_enviado');
});
