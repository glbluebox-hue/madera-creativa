import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { ClienteModel, ProyectoModel, PresupuestoModel, EmpresaModel } from './cliente.model.js';

/**
 * `svc.obtenerComparables` (Fase 2C) — integración con Mongo real (en
 * memoria): confirma que el motor puro de `comparables.spec.ts` recibe de
 * verdad el histórico ya aislado por `usuarioId`, sin ninguna vía de fuga
 * entre empresas. El cálculo de puntuación en sí ya está cubierto aparte.
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

const USUARIO_A = 'usuario-a-comparables-test';
const USUARIO_B = 'usuario-b-comparables-test';

function clienteBase(id: string, usuarioId: string) {
  return { id, usuarioId, nombre: 'Cliente de prueba', creado: new Date().toISOString() };
}

function proyectoBase(id: string, clienteId: string, usuarioId: string, extra: Record<string, unknown> = {}) {
  return {
    id, usuarioId, clienteId, tarifaHora: 20, estado: 'finalizado',
    movimientos: [
      { id: 'ing1', fecha: '2026-08-01', concepto: 'Cobro', categoria: 'General', tipo: 'ingreso', importe: 10000 },
      { id: 'gas1', fecha: '2026-08-01', concepto: 'Material', categoria: 'General', tipo: 'gasto', importe: 4000 },
    ],
    horas: [],
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
  await Promise.all([
    ClienteModel.deleteMany({}), ProyectoModel.deleteMany({}),
    PresupuestoModel.deleteMany({}), EmpresaModel.deleteMany({}),
  ]);
});

describe('svc.obtenerComparables — aislamiento e integración (Fase 2C)', () => {
  it('A. encuentra un comparable real del mismo usuario', async () => {
    await ClienteModel.create(clienteBase('c1', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p1', 'c1', USUARIO_A, {
      proyecto: 'Cocina García',
      caracteristicas: [{ clave: 'tipoTrabajo', valor: 'Cocina', origen: 'usuario', confirmadoPorUsuario: true, confianza: null, fecha: new Date().toISOString() }],
    }));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });

    const r = await svc.obtenerComparables(USUARIO_A, 10200, 'Cocina', undefined, 5);
    expect(r.disponible).toBe(true);
    if (!r.disponible) return;
    expect(r.comparables.length).toBe(1);
    expect(r.comparables[0].trabajo.id).toBe('p1');
  });

  it('B. NUNCA devuelve trabajos de otro usuario, aunque sean un comparable perfecto', async () => {
    await ClienteModel.create(clienteBase('cB', USUARIO_B));
    await ProyectoModel.create(proyectoBase('pB', 'cB', USUARIO_B, {
      proyecto: 'Cocina de otro estudio',
      caracteristicas: [{ clave: 'tipoTrabajo', valor: 'Cocina', origen: 'usuario', confirmadoPorUsuario: true, confianza: null, fecha: new Date().toISOString() }],
    }));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });
    // USUARIO_A no tiene ningún proyecto propio -- si hubiera fuga, aparecería el de B.

    const r = await svc.obtenerComparables(USUARIO_A, 10000, 'Cocina', undefined, 5);
    expect(r).toEqual({ disponible: false, motivo: 'sin_historico' });
  });

  it('C. con datos de ambos usuarios, cada uno solo ve los suyos', async () => {
    await ClienteModel.create(clienteBase('cA', USUARIO_A));
    await ClienteModel.create(clienteBase('cB2', USUARIO_B));
    await ProyectoModel.create(proyectoBase('pA', 'cA', USUARIO_A, { proyecto: 'Cocina A' }));
    await ProyectoModel.create(proyectoBase('pB2', 'cB2', USUARIO_B, { proyecto: 'Cocina B', movimientos: [{ id: 'i', fecha: '2026-08-01', concepto: 'Fuga', categoria: 'General', tipo: 'ingreso', importe: 999999 }] }));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });
    await EmpresaModel.create({ usuarioId: USUARIO_B, margenObjetivoPorcentaje: 10 });

    const rA = await svc.obtenerComparables(USUARIO_A, 10000, null, undefined, 5);
    if (!rA.disponible) throw new Error('debería estar disponible');
    expect(rA.comparables.map((c) => c.trabajo.id)).toEqual(['pA']);
    expect(rA.comparables[0].trabajo.real?.precio).not.toBe(999999);
  });

  it('D. una característica tipoTrabajo no confirmada por el usuario nunca participa como señal de comparable', async () => {
    await ClienteModel.create(clienteBase('cD', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pD', 'cD', USUARIO_A, {
      proyecto: 'Cocina sin confirmar',
      caracteristicas: [{ clave: 'tipoTrabajo', valor: 'Cocina', origen: 'ia', confirmadoPorUsuario: false, confianza: 'alta', fecha: new Date().toISOString() }],
    }));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });

    const r = await svc.obtenerComparables(USUARIO_A, 10000, 'Cocina', undefined, 5);
    if (!r.disponible) throw new Error('debería estar disponible');
    // El trabajo SIGUE apareciendo (comparable secundario), pero sin la característica no confirmada.
    expect(r.comparables[0].trabajo.tipoTrabajo).toBeNull();
    expect(r.comparables[0].esSecundario).toBe(true);
  });

  it('E. excluirId funciona de extremo a extremo: un proyecto no se compara consigo mismo', async () => {
    await ClienteModel.create(clienteBase('cE', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pE', 'cE', USUARIO_A));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 45 });

    const r = await svc.obtenerComparables(USUARIO_A, 10000, null, 'pE', 5);
    expect(r).toEqual({ disponible: false, motivo: 'sin_historico' });
  });
});
