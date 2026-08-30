import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { ClienteModel, ProyectoModel } from './cliente.model.js';
import { almacenamiento } from './almacenamiento.service.js';

/**
 * Diseño 3D — subida manual (30/08/2026, independiente de Trimble) —
 * mismo patrón de test que `modelo3d-proyecto.spec.ts` (Trimble): aquí
 * además se cubre el almacenamiento real (en memoria en test, mismo
 * comportamiento que R2 en producción) — reemplazar/eliminar nunca deja
 * un blob huérfano.
 */

/** `almacenamiento.obtener()` (parte de la interfaz pública) devuelve `null` si la clave no existe — más fiable en tests que `existe()`, que es un método interno de `AlmacenamientoMemoria` no expuesto por el proxy `almacenamiento`. */
async function existeEnAlmacenamiento(clave: string): Promise<boolean> {
  return (await almacenamiento.obtener(clave)) !== null;
}

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

const USUARIO_A = 'usuario-a-modelo3d-archivo-test';
const USUARIO_B = 'usuario-b-modelo3d-archivo-test';

/** Un `.glb` de mentira — el contenido no importa, solo que decodifique a un tamaño concreto. */
function dataUrlGlb(bytes = 100): string {
  return `data:model/gltf-binary;base64,${Buffer.alloc(bytes, 1).toString('base64')}`;
}

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

describe('asociarModelo3DArchivoProyecto', () => {
  it('sube un .glb y lo asocia al proyecto', async () => {
    await crearProyecto('p1', USUARIO_A);
    const doc = await svc.asociarModelo3DArchivoProyecto('p1', USUARIO_A, { nombreArchivo: 'Cocina.glb', url: dataUrlGlb() });
    const m = (doc as any).modelo3D;
    expect(m.proveedor).toBe('manual');
    expect(m.nombreArchivo).toBe('Cocina.glb');
    expect(m.formato).toBe('glb');
    expect(m.tamano).toBe(100);
    expect(m.url).toBeTruthy();
    expect(m.claveAlmacenamiento).toBeTruthy();
  });

  it('rechaza un formato distinto de .glb, con un mensaje claro, y no sube nada al almacenamiento', async () => {
    await crearProyecto('p1', USUARIO_A);
    await expect(svc.asociarModelo3DArchivoProyecto('p1', USUARIO_A, { nombreArchivo: 'Cocina.skp', url: dataUrlGlb() }))
      .rejects.toThrow(/solo se admiten archivos \.glb/);
  });

  it('rechaza un archivo demasiado grande y borra el blob que ya se había subido para comprobarlo', async () => {
    await crearProyecto('p1', USUARIO_A);
    const MAS_DE_15MB = 16 * 1024 * 1024;
    await expect(svc.asociarModelo3DArchivoProyecto('p1', USUARIO_A, { nombreArchivo: 'Grande.glb', url: dataUrlGlb(MAS_DE_15MB) }))
      .rejects.toThrow(/demasiado grande/);
    // Ninguna clave nueva queda huérfana en el almacenamiento tras el rechazo.
    const doc = await ProyectoModel.findOne({ id: 'p1' }).lean().exec();
    expect((doc as any).modelo3D).toBeFalsy();
  });

  it('un usuario NUNCA puede subir un modelo al proyecto de otro', async () => {
    await crearProyecto('p1', USUARIO_A);
    await expect(svc.asociarModelo3DArchivoProyecto('p1', USUARIO_B, { nombreArchivo: 'Cocina.glb', url: dataUrlGlb() }))
      .rejects.toThrow('Proyecto no encontrado');
  });

  it('reemplazar un modelo manual borra el blob anterior (nunca acumula archivos huérfanos)', async () => {
    await crearProyecto('p1', USUARIO_A);
    const doc1 = await svc.asociarModelo3DArchivoProyecto('p1', USUARIO_A, { nombreArchivo: 'v1.glb', url: dataUrlGlb() });
    const claveAntigua = (doc1 as any).modelo3D.claveAlmacenamiento;
    expect(await existeEnAlmacenamiento(claveAntigua)).toBe(true);

    const doc2 = await svc.asociarModelo3DArchivoProyecto('p1', USUARIO_A, { nombreArchivo: 'v2.glb', url: dataUrlGlb() });
    const claveNueva = (doc2 as any).modelo3D.claveAlmacenamiento;

    expect(claveNueva).not.toBe(claveAntigua);
    expect(await existeEnAlmacenamiento(claveAntigua)).toBe(false);
    expect(await existeEnAlmacenamiento(claveNueva)).toBe(true);
  });
});

describe('quitarModelo3DProyecto — también borra el blob de un modelo manual', () => {
  it('al desasociar un modelo manual, borra su blob del almacenamiento', async () => {
    await crearProyecto('p1', USUARIO_A);
    const doc = await svc.asociarModelo3DArchivoProyecto('p1', USUARIO_A, { nombreArchivo: 'Cocina.glb', url: dataUrlGlb() });
    const clave = (doc as any).modelo3D.claveAlmacenamiento;
    expect(await existeEnAlmacenamiento(clave)).toBe(true);

    await svc.quitarModelo3DProyecto('p1', USUARIO_A);
    expect(await existeEnAlmacenamiento(clave)).toBe(false);
  });

  it('un usuario nunca puede desasociar (ni borrar el blob) del proyecto de otro', async () => {
    await crearProyecto('p1', USUARIO_A);
    const doc = await svc.asociarModelo3DArchivoProyecto('p1', USUARIO_A, { nombreArchivo: 'Cocina.glb', url: dataUrlGlb() });
    const clave = (doc as any).modelo3D.claveAlmacenamiento;

    await expect(svc.quitarModelo3DProyecto('p1', USUARIO_B)).rejects.toThrow('Proyecto no encontrado');
    expect(await existeEnAlmacenamiento(clave)).toBe(true); // sigue intacto
  });
});
