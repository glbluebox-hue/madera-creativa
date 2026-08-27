import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { almacenamiento } from './almacenamiento.service.js';
import { intentarBorrarArchivo, ejecutarReintentoBorrados } from './borrado-pendiente.service.js';
import { BorradoPendienteModel } from './borrado-pendiente.model.js';

/**
 * Regresión del reintento de borrados (Incremento "Facturas privadas",
 * 27/08/2026) — sustituye al antiguo `.catch(() => {})`: un fallo de R2 al
 * borrar debe quedar registrado y reintentarse después, nunca perderse.
 */

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongod.getUri();
  await mongoose.connect(process.env.MONGO_URL);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await BorradoPendienteModel.deleteMany({});
  vi.restoreAllMocks();
});

it('un fallo al borrar queda registrado como pendiente, no se pierde en silencio', async () => {
  vi.spyOn(almacenamiento, 'borrar').mockRejectedValueOnce(new Error('R2 no disponible (simulado)'));

  await intentarBorrarArchivo('facturas/clave-que-falla');

  const pendiente = await BorradoPendienteModel.findOne({ clave: 'facturas/clave-que-falla' }).lean().exec();
  expect(pendiente).not.toBeNull();
  expect(pendiente?.intentos).toBe(1);
  expect(pendiente?.ultimoError).toContain('R2 no disponible');
});

it('un borrado que SÍ funciona no deja ningún pendiente', async () => {
  vi.spyOn(almacenamiento, 'borrar').mockResolvedValueOnce(undefined);

  await intentarBorrarArchivo('facturas/clave-que-funciona');

  const pendiente = await BorradoPendienteModel.findOne({ clave: 'facturas/clave-que-funciona' }).lean().exec();
  expect(pendiente).toBeNull();
});

it('el reintento periódico borra con éxito un pendiente y lo retira de la lista', async () => {
  await BorradoPendienteModel.create({
    clave: 'facturas/pendiente-a-reintentar', intentos: 1, ultimoError: 'fallo anterior',
    creado: new Date().toISOString(), actualizado: new Date().toISOString(),
  });
  vi.spyOn(almacenamiento, 'borrar').mockResolvedValueOnce(undefined);

  await ejecutarReintentoBorrados();

  const sigue = await BorradoPendienteModel.findOne({ clave: 'facturas/pendiente-a-reintentar' }).lean().exec();
  expect(sigue).toBeNull();
});

it('un pendiente que sigue fallando incrementa sus intentos en vez de desaparecer', async () => {
  await BorradoPendienteModel.create({
    clave: 'facturas/pendiente-sigue-fallando', intentos: 2, ultimoError: 'fallo anterior',
    creado: new Date().toISOString(), actualizado: new Date().toISOString(),
  });
  vi.spyOn(almacenamiento, 'borrar').mockRejectedValueOnce(new Error('sigue sin funcionar'));

  await ejecutarReintentoBorrados();

  const sigue = await BorradoPendienteModel.findOne({ clave: 'facturas/pendiente-sigue-fallando' }).lean().exec();
  expect(sigue).not.toBeNull();
  expect(sigue?.intentos).toBe(3);
});
