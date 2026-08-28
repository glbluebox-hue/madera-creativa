import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { ClienteModel, ProyectoModel } from './cliente.model.js';
import { calcularMargenRealProyecto } from './inteligencia-precios.js';

/**
 * Histórico Inteligente — Fase 2A (28/08/2026): `Proyecto.caracteristicas[]`
 * y `svc.guardarCaracteristicaProyecto`. Contra MongoDB en memoria, nunca
 * Atlas real — mismo patrón que el resto de specs de Inteligencia de Precios.
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

const USUARIO_A = 'usuario-a-caracteristicas-test';
const USUARIO_B = 'usuario-b-caracteristicas-test';

function clienteBase(id: string, usuarioId: string) {
  return { id, usuarioId, nombre: 'Cliente de prueba', creado: new Date().toISOString() };
}

function proyectoBase(id: string, clienteId: string, usuarioId: string, extra: Record<string, unknown> = {}) {
  return {
    id, usuarioId, clienteId, tarifaHora: 20,
    movimientos: [{ id: 'm1', fecha: '2026-08-01', concepto: 'Material', categoria: 'General', tipo: 'gasto', importe: 500 }],
    horas: [{ id: 'h1', fecha: '2026-08-01', tarea: 'Montaje', horas: 10 }],
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

describe('guardarCaracteristicaProyecto — Histórico Inteligente, Fase 2A', () => {
  // Caso A: proyecto nuevo sin tipo de trabajo -> funciona correctamente.
  it('A. un proyecto sin ninguna característica se lee con normalidad', async () => {
    await ClienteModel.create(clienteBase('cA', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pA', 'cA', USUARIO_A));
    const doc = await ProyectoModel.findOne({ id: 'pA' }).lean().exec() as any;
    expect(doc.caracteristicas).toEqual([]);
  });

  // Caso B: proyecto con tipoTrabajo=Cocina -> se guarda correctamente.
  it('B. guarda tipoTrabajo="Cocina" correctamente', async () => {
    await ClienteModel.create(clienteBase('cB', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pB', 'cB', USUARIO_A));
    const actualizado = await svc.guardarCaracteristicaProyecto('pB', USUARIO_A, 'tipoTrabajo', 'Cocina');
    const car = (actualizado as any).caracteristicas.find((c: any) => c.clave === 'tipoTrabajo');
    expect(car.valor).toBe('Cocina');
  });

  // Caso C: origen=usuario -> confirmadoPorUsuario=true, decidido SIEMPRE por el servidor.
  it('C. origen y confirmadoPorUsuario los fija el servidor, nunca el llamante', async () => {
    await ClienteModel.create(clienteBase('cC', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pC', 'cC', USUARIO_A));
    const actualizado = await svc.guardarCaracteristicaProyecto('pC', USUARIO_A, 'tipoTrabajo', 'Armario');
    const car = (actualizado as any).caracteristicas[0];
    expect(car.origen).toBe('usuario');
    expect(car.confirmadoPorUsuario).toBe(true);
    expect(car.confianza).toBeNull();
  });

  // Caso D: "Otro" con texto libre -- cubierto a nivel de API: cualquier valor de texto se acepta igual (la lógica de "Otro" es puramente de interfaz, sin distinción en el backend).
  it('D. acepta un valor de texto libre igual que una opción predefinida', async () => {
    await ClienteModel.create(clienteBase('cD', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pD', 'cD', USUARIO_A));
    const actualizado = await svc.guardarCaracteristicaProyecto('pD', USUARIO_A, 'tipoTrabajo', 'Mueble a medida para recibidor');
    expect((actualizado as any).caracteristicas[0].valor).toBe('Mueble a medida para recibidor');
  });

  // Caso E: proyecto antiguo (creado antes de esta fase, sin el campo) sigue funcionando.
  it('E. un proyecto sin el campo caracteristicas en absoluto admite guardar una característica nueva', async () => {
    await ClienteModel.create(clienteBase('cE', USUARIO_A));
    // Inserción directa sin pasar por el esquema con default -- simula un documento antiguo real.
    await ProyectoModel.collection.insertOne({ ...proyectoBase('pE', 'cE', USUARIO_A), caracteristicas: undefined });
    await expect(svc.guardarCaracteristicaProyecto('pE', USUARIO_A, 'tipoTrabajo', 'Vestidor')).resolves.toBeTruthy();
  });

  // Caso F: no se modifican los cálculos de margen -- calcularMargenRealProyecto es indiferente a caracteristicas.
  it('F. el cálculo de margen real no cambia por tener o no características guardadas', async () => {
    await ClienteModel.create(clienteBase('cF', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pF', 'cF', USUARIO_A, {
      movimientos: [
        { id: 'i', fecha: '2026-08-01', concepto: 'Cobro', categoria: 'General', tipo: 'ingreso', importe: 1000 },
        { id: 'g', fecha: '2026-08-01', concepto: 'Material', categoria: 'General', tipo: 'gasto', importe: 500 },
      ],
    }));
    const antes = await ProyectoModel.findOne({ id: 'pF' }).lean().exec() as any;
    const margenAntes = calcularMargenRealProyecto(antes, 35);

    await svc.guardarCaracteristicaProyecto('pF', USUARIO_A, 'tipoTrabajo', 'Cocina');
    const despues = await ProyectoModel.findOne({ id: 'pF' }).lean().exec() as any;
    const margenDespues = calcularMargenRealProyecto(despues, 35);

    expect(margenDespues).toEqual(margenAntes);
  });

  // Caso G: aislamiento entre usuarios.
  it('G. un usuario no puede guardar una característica en el proyecto de otro', async () => {
    await ClienteModel.create(clienteBase('cG', USUARIO_B));
    await ProyectoModel.create(proyectoBase('pG', 'cG', USUARIO_B));
    await expect(svc.guardarCaracteristicaProyecto('pG', USUARIO_A, 'tipoTrabajo', 'Cocina')).rejects.toThrow();
    const doc = await ProyectoModel.findOne({ id: 'pG' }).lean().exec() as any;
    expect(doc.caracteristicas).toEqual([]); // intacto, la escritura de A nunca llegó a aplicarse
  });

  // Caso H: manipulación de datos -- id de proyecto real de B, pero usuarioId de A en la llamada.
  it('H. no se puede introducir una característica en un proyecto ajeno manipulando el usuarioId', async () => {
    await ClienteModel.create(clienteBase('cH-a', USUARIO_A));
    await ClienteModel.create(clienteBase('cH-b', USUARIO_B));
    await ProyectoModel.create(proyectoBase('pH-propio', 'cH-a', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pH-ajeno', 'cH-b', USUARIO_B));

    await expect(svc.guardarCaracteristicaProyecto('pH-ajeno', USUARIO_A, 'tipoTrabajo', 'Cocina')).rejects.toThrow();
    const propio = await ProyectoModel.findOne({ id: 'pH-propio' }).lean().exec() as any;
    const ajeno = await ProyectoModel.findOne({ id: 'pH-ajeno' }).lean().exec() as any;
    expect(propio.caracteristicas).toEqual([]);
    expect(ajeno.caracteristicas).toEqual([]);
  });

  // Caso I: la estructura admite características futuras sin cambiar el modelo -- dos claves distintas conviven.
  it('I. admite varias claves de característica a la vez, sin necesitar ningún cambio de esquema', async () => {
    await ClienteModel.create(clienteBase('cI', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pI', 'cI', USUARIO_A));
    await svc.guardarCaracteristicaProyecto('pI', USUARIO_A, 'tipoTrabajo', 'Cocina');
    // Clave hipotética futura -- nunca implementada de verdad en 2A, solo demuestra que el mismo método/esquema la admite.
    const actualizado = await svc.guardarCaracteristicaProyecto('pI', USUARIO_A, 'cantidadModulos', '8');
    const claves = (actualizado as any).caracteristicas.map((c: any) => c.clave).sort();
    expect(claves).toEqual(['cantidadModulos', 'tipoTrabajo']);
  });

  it('guardar la misma clave dos veces reemplaza el valor, nunca duplica la entrada', async () => {
    await ClienteModel.create(clienteBase('cJ', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pJ', 'cJ', USUARIO_A));
    await svc.guardarCaracteristicaProyecto('pJ', USUARIO_A, 'tipoTrabajo', 'Cocina');
    const actualizado = await svc.guardarCaracteristicaProyecto('pJ', USUARIO_A, 'tipoTrabajo', 'Armario');
    expect((actualizado as any).caracteristicas.length).toBe(1);
    expect((actualizado as any).caracteristicas[0].valor).toBe('Armario');
  });
});
