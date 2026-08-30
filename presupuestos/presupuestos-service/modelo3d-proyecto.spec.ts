import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { ClienteModel, ProyectoModel } from './cliente.model.js';

/**
 * Diseño 3D / SketchUp (30/08/2026) — regresión de aislamiento por usuario
 * (misma condición que el resto de rutas de proyecto: un usuario nunca
 * puede leer ni modificar el modelo 3D de un proyecto que no es suyo).
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

const USUARIO_A = 'usuario-a-modelo3d-test';
const USUARIO_B = 'usuario-b-modelo3d-test';

const DATOS_MODELO = {
  trimbleProjectId: 'tp-1', trimbleFolderId: 'tf-1', trimbleFileId: 'tfi-1',
  nombreArchivo: 'Cocina_Garcia_v01.skp', version: 1, thumbnailUrl: '',
};

async function crearProyecto(id: string, usuarioId: string) {
  await ClienteModel.create({ id: `cliente-${id}`, usuarioId, nombre: 'Cliente test', creado: new Date().toISOString() });
  await ProyectoModel.create({ id, usuarioId, clienteId: `cliente-${id}`, creado: new Date().toISOString() });
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
  await ProyectoModel.deleteMany({});
  await ClienteModel.deleteMany({});
});

describe('asociarModelo3DProyecto', () => {
  it('el propietario puede asociar un modelo a su proyecto', async () => {
    await crearProyecto('p1', USUARIO_A);
    const doc = await svc.asociarModelo3DProyecto('p1', USUARIO_A, DATOS_MODELO);
    expect((doc as any).modelo3D.nombreArchivo).toBe('Cocina_Garcia_v01.skp');
    expect((doc as any).modelo3D.proveedor).toBe('trimble_connect');
    expect((doc as any).modelo3D.asociadoPor).toBe(USUARIO_A);
  });

  it('un usuario NUNCA puede asociar un modelo al proyecto de otro, aunque conozca su id', async () => {
    await crearProyecto('p1', USUARIO_A);
    await expect(svc.asociarModelo3DProyecto('p1', USUARIO_B, DATOS_MODELO)).rejects.toThrow('Proyecto no encontrado');
    const doc = await ProyectoModel.findOne({ id: 'p1' }).lean().exec();
    expect((doc as any).modelo3D).toBeFalsy();
  });

  it('asociar de nuevo reemplaza el modelo anterior (no lo acumula)', async () => {
    await crearProyecto('p1', USUARIO_A);
    await svc.asociarModelo3DProyecto('p1', USUARIO_A, DATOS_MODELO);
    const doc = await svc.asociarModelo3DProyecto('p1', USUARIO_A, { ...DATOS_MODELO, trimbleFileId: 'tfi-2', nombreArchivo: 'Cocina_Garcia_v02.skp', version: 2 });
    expect((doc as any).modelo3D.trimbleFileId).toBe('tfi-2');
    expect((doc as any).modelo3D.version).toBe(2);
  });
});

describe('quitarModelo3DProyecto', () => {
  it('el propietario puede desasociar su modelo', async () => {
    await crearProyecto('p1', USUARIO_A);
    await svc.asociarModelo3DProyecto('p1', USUARIO_A, DATOS_MODELO);
    const doc = await svc.quitarModelo3DProyecto('p1', USUARIO_A);
    expect((doc as any).modelo3D).toBeFalsy();
  });

  it('un usuario NUNCA puede desasociar el modelo del proyecto de otro', async () => {
    await crearProyecto('p1', USUARIO_A);
    await svc.asociarModelo3DProyecto('p1', USUARIO_A, DATOS_MODELO);
    await expect(svc.quitarModelo3DProyecto('p1', USUARIO_B)).rejects.toThrow('Proyecto no encontrado');
    const doc = await ProyectoModel.findOne({ id: 'p1' }).lean().exec();
    expect((doc as any).modelo3D?.trimbleFileId).toBe('tfi-1'); // sigue intacto
  });
});
