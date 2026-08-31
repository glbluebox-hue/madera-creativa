import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { PresupuestoModel } from './cliente.model.js';
import { EnlacePresupuestoModel } from './enlace-presupuesto.model.js';

/**
 * Hallazgo real del usuario, 31/08/2026: mandó un enlace de un presupuesto,
 * lo editó ANTES de que el cliente firmara, y el enlace dejó de servir (el
 * cliente vio "el presupuesto ha cambiado, pide uno nuevo" — integridad ya
 * existente, revisión de seguridad 17/08/2026). El problema: la propia app
 * seguía diciéndole "ya hay un enlace activo" sin avisar de que ESE
 * concreto ya no valía — se enteró porque se lo dijo el cliente.
 * `estadoEnlacePresupuesto` (presupuestos-service.ts) cierra ese hueco.
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();
const USUARIO = 'usuario-enlace-vigencia-test';

function presupuestoBase(id: string, extra: Record<string, unknown> = {}) {
  const ahora = new Date().toISOString();
  return {
    id, usuarioId: USUARIO, clienteId: 'cliente-x', titulo: 'Presupuesto de prueba',
    formato: 'documento', precioTotal: 1000, creado: ahora, actualizado: ahora,
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
  await Promise.all([PresupuestoModel.deleteMany({}), EnlacePresupuestoModel.deleteMany({})]);
});

describe('vigencia del enlace de un presupuesto (listarPresupuestos)', () => {
  it('sin enlace generado: ni activo ni roto', async () => {
    await PresupuestoModel.create(presupuestoBase('p1'));
    const [p] = await svc.listarPresupuestos(USUARIO);
    expect((p as any).enlaceActivoExpiraEn).toBeNull();
    expect((p as any).enlaceRotoPorEdicion).toBe(false);
  });

  it('enlace generado, contenido sin cambios: activo y no roto', async () => {
    await PresupuestoModel.create(presupuestoBase('p2'));
    await svc.generarEnlacePresupuesto('p2', USUARIO);
    const [p] = await svc.listarPresupuestos(USUARIO);
    expect((p as any).enlaceActivoExpiraEn).not.toBeNull();
    expect((p as any).enlaceRotoPorEdicion).toBe(false);
  });

  it('enlace generado y presupuesto editado DESPUÉS: roto, deja de mostrarse como activo', async () => {
    await PresupuestoModel.create(presupuestoBase('p3'));
    await svc.generarEnlacePresupuesto('p3', USUARIO);
    await PresupuestoModel.updateOne({ id: 'p3', usuarioId: USUARIO }, { $set: { precioTotal: 2000 } });
    const [p] = await svc.listarPresupuestos(USUARIO);
    expect((p as any).enlaceActivoExpiraEn).toBeNull();
    expect((p as any).enlaceRotoPorEdicion).toBe(true);
  });

  it('presupuesto ya aceptado: se muestra activo aunque el contenido ya no coincida (el enlace ya cumplió su función, no se puede volver a firmar)', async () => {
    await PresupuestoModel.create(presupuestoBase('p4'));
    await svc.generarEnlacePresupuesto('p4', USUARIO);
    await PresupuestoModel.updateOne({ id: 'p4', usuarioId: USUARIO }, { $set: { precioTotal: 2000, estado: 'aceptado' } });
    const [p] = await svc.listarPresupuestos(USUARIO);
    expect((p as any).enlaceActivoExpiraEn).not.toBeNull();
    expect((p as any).enlaceRotoPorEdicion).toBe(false);
  });

  it('listarPresupuestosDeProyecto también distingue enlace roto (mismo cálculo, distinta consulta)', async () => {
    await PresupuestoModel.create(presupuestoBase('p5', { proyectoId: 'proy-x' }));
    await svc.generarEnlacePresupuesto('p5', USUARIO);
    await PresupuestoModel.updateOne({ id: 'p5', usuarioId: USUARIO }, { $set: { titulo: 'Título editado' } });
    const [p] = await svc.listarPresupuestosDeProyecto(USUARIO, 'proy-x');
    expect((p as any).enlaceActivoExpiraEn).toBeNull();
    expect((p as any).enlaceRotoPorEdicion).toBe(true);
  });
});
