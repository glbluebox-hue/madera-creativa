import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { ClienteModel, ProyectoModel } from './cliente.model.js';

/**
 * Regresión del bug real "el PDF subido no se puede borrar" (28/08/2026)
 * — `svc.anadirAdjuntoProyecto`/`svc.borrarAdjuntoProyecto`, las rutas
 * quirúrgicas que sustituyen el reenvío del proyecto completo. Contra
 * MongoDB en memoria, nunca Atlas real.
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

const USUARIO_A = 'usuario-a-adjuntos-test';
const USUARIO_B = 'usuario-b-adjuntos-test';

const PDF_BASE64_MINIMO = 'data:application/pdf;base64,JVBERi0xLjQKJeLjz9MK'; // cabecera real de un PDF, suficiente para la prueba

function clienteBase(id: string, usuarioId: string) {
  return { id, usuarioId, nombre: 'Cliente de prueba', creado: new Date().toISOString() };
}

function proyectoBase(id: string, clienteId: string, usuarioId: string) {
  return { id, usuarioId, clienteId, tarifaHora: 20, creado: new Date().toISOString() };
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

describe('anadirAdjuntoProyecto / borrarAdjuntoProyecto — bug real (28/08/2026)', () => {
  it('sube un adjunto Base64 y lo persiste con una URL real, sin dejar Base64 en Mongo', async () => {
    await ClienteModel.create(clienteBase('c1', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p1', 'c1', USUARIO_A));

    const adjuntos = await svc.anadirAdjuntoProyecto('p1', USUARIO_A, {
      id: 'a1', nombre: 'plano.pdf', tipo: 'application/pdf', tamano: 1000, url: PDF_BASE64_MINIMO,
    });
    expect(adjuntos.length).toBe(1);
    expect((adjuntos[0] as any).url).not.toMatch(/^data:/); // ya no es Base64 en la respuesta
    const doc = await ProyectoModel.findOne({ id: 'p1' }).lean().exec() as any;
    expect(doc.adjuntos[0].url).not.toMatch(/^data:/); // tampoco en Mongo
  });

  it('borra un adjunto por su id, dejando el resto intacto', async () => {
    await ClienteModel.create(clienteBase('c2', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p2', 'c2', USUARIO_A));
    await svc.anadirAdjuntoProyecto('p2', USUARIO_A, { id: 'a1', nombre: 'uno.pdf', tipo: 'application/pdf', tamano: 100, url: PDF_BASE64_MINIMO });
    await svc.anadirAdjuntoProyecto('p2', USUARIO_A, { id: 'a2', nombre: 'dos.pdf', tipo: 'application/pdf', tamano: 100, url: PDF_BASE64_MINIMO });

    const restantes = await svc.borrarAdjuntoProyecto('p2', USUARIO_A, 'a1');
    expect(restantes.length).toBe(1);
    expect((restantes[0] as any).id).toBe('a2');
    const doc = await ProyectoModel.findOne({ id: 'p2' }).lean().exec() as any;
    expect(doc.adjuntos.map((a: any) => a.id)).toEqual(['a2']);
  });

  it('borrar un adjunto que ya no existe no lanza y deja la lista igual', async () => {
    await ClienteModel.create(clienteBase('c3', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p3', 'c3', USUARIO_A));
    await svc.anadirAdjuntoProyecto('p3', USUARIO_A, { id: 'a1', nombre: 'uno.pdf', tipo: 'application/pdf', tamano: 100, url: PDF_BASE64_MINIMO });
    const resultado = await svc.borrarAdjuntoProyecto('p3', USUARIO_A, 'no-existe');
    expect(resultado.length).toBe(1);
  });

  it('subir/borrar un adjunto no modifica estado, movimientos ni otros campos del proyecto', async () => {
    await ClienteModel.create(clienteBase('c4', USUARIO_A));
    await ProyectoModel.create({ ...proyectoBase('p4', 'c4', USUARIO_A), estado: 'en_curso', movimientos: [{ id: 'm1', fecha: '2026-08-01', concepto: 'x', categoria: 'General', tipo: 'gasto', importe: 50 }] });

    await svc.anadirAdjuntoProyecto('p4', USUARIO_A, { id: 'a1', nombre: 'uno.pdf', tipo: 'application/pdf', tamano: 100, url: PDF_BASE64_MINIMO });
    await svc.borrarAdjuntoProyecto('p4', USUARIO_A, 'a1');

    const doc = await ProyectoModel.findOne({ id: 'p4' }).lean().exec() as any;
    expect(doc.estado).toBe('en_curso');
    expect(doc.movimientos.length).toBe(1);
    expect(doc.movimientos[0].importe).toBe(50);
  });

  it('aislamiento: un usuario no puede añadir ni borrar adjuntos en el proyecto de otro', async () => {
    await ClienteModel.create(clienteBase('c5', USUARIO_B));
    await ProyectoModel.create(proyectoBase('p5', 'c5', USUARIO_B));

    await expect(svc.anadirAdjuntoProyecto('p5', USUARIO_A, { id: 'a1', nombre: 'x.pdf', tipo: 'application/pdf', tamano: 1, url: PDF_BASE64_MINIMO })).rejects.toThrow();
    await svc.anadirAdjuntoProyecto('p5', USUARIO_B, { id: 'a1', nombre: 'x.pdf', tipo: 'application/pdf', tamano: 1, url: PDF_BASE64_MINIMO });
    await expect(svc.borrarAdjuntoProyecto('p5', USUARIO_A, 'a1')).rejects.toThrow();

    const doc = await ProyectoModel.findOne({ id: 'p5' }).lean().exec() as any;
    expect(doc.adjuntos.length).toBe(1); // el intento de A nunca llegó a aplicarse
  });
});
