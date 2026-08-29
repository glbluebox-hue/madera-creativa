import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { ReferenciaMercadoModel } from './cliente.model.js';

/**
 * Referencias de Mercado (Fase 2F, "Consenso de Precio", 29/08/2026) —
 * regresión de aislamiento por usuario (autorización, condición 8: "los
 * datos internos de una empresa deben permanecer completamente aislados
 * por usuario/empresa"). Contra una MongoDB en memoria (nunca Atlas real).
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

const USUARIO_A = 'usuario-a-mercado-test';
const USUARIO_B = 'usuario-b-mercado-test';

function referenciaBase(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    tipoTrabajo: 'Cocina',
    nivelGeografico: 'local' as const,
    zona: 'Tenerife',
    precioMin: 5000,
    precioMax: 6000,
    fuente: 'Test',
    fecha: '2026-06-01',
    creado: new Date().toISOString(),
    // Campos de la ampliación "Ficha Comparable" — alcance es obligatorio, el resto lleva su default seguro.
    alcance: 'mobiliario_encimera' as const,
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
  await ReferenciaMercadoModel.deleteMany({});
});

describe('listarReferenciasMercado — aislamiento por usuario', () => {
  it('el propietario ve sus propias referencias', async () => {
    await svc.crearReferenciaMercado(referenciaBase('r1'), USUARIO_A);
    const lista = await svc.listarReferenciasMercado(USUARIO_A);
    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe('r1');
  });

  it('un usuario NUNCA ve las referencias de otro, aunque las pida explícitamente', async () => {
    await svc.crearReferenciaMercado(referenciaBase('r1'), USUARIO_A);
    await svc.crearReferenciaMercado(referenciaBase('r2'), USUARIO_B);

    const listaA = await svc.listarReferenciasMercado(USUARIO_A);
    const listaB = await svc.listarReferenciasMercado(USUARIO_B);

    expect(listaA).toHaveLength(1);
    expect(listaA[0].id).toBe('r1');
    expect(listaB).toHaveLength(1);
    expect(listaB[0].id).toBe('r2');
  });
});

describe('borrarReferenciaMercado — aislamiento por usuario', () => {
  it('un usuario no puede borrar una referencia de otro usuario mandando su id', async () => {
    await svc.crearReferenciaMercado(referenciaBase('r1'), USUARIO_A);
    await svc.borrarReferenciaMercado('r1', USUARIO_B); // intento de borrado con el usuarioId equivocado
    const sigueAhi = await svc.listarReferenciasMercado(USUARIO_A);
    expect(sigueAhi).toHaveLength(1);
  });

  it('el propietario sí puede borrar la suya', async () => {
    await svc.crearReferenciaMercado(referenciaBase('r1'), USUARIO_A);
    await svc.borrarReferenciaMercado('r1', USUARIO_A);
    const lista = await svc.listarReferenciasMercado(USUARIO_A);
    expect(lista).toHaveLength(0);
  });
});

describe('compatibilidad con datos antiguos (ampliación "Ficha Comparable")', () => {
  it('un documento guardado antes de esta ampliación (sin los 8 campos nuevos) se sigue leyendo, con los defaults seguros', async () => {
    // Inserción directa en Mongo, saltándose crearReferenciaMercado(), simulando una fila real
    // de antes de esta fase — la colección en producción está vacía hoy, pero el esquema debe
    // seguir sirviendo estos documentos si alguna vez existieran.
    await ReferenciaMercadoModel.create({
      id: 'antigua-1', usuarioId: USUARIO_A, tipoTrabajo: 'Cocina', nivelGeografico: 'local',
      zona: 'Tenerife', precioMin: 5000, precioMax: 6000, fuente: 'Test', fecha: '2026-01-01',
      creado: '2026-01-01T00:00:00.000Z',
      alcance: 'mobiliario_encimera', // único campo nuevo obligatorio — sin default posible, ver "Ficha Comparable"
      // Nótese: sin unidad, sin impuestosConocidos, sin tipoPrecio, sin origen, sin obraIncluida,
      // sin electrodomesticosIncluidos, sin nivelCalidad — tal como quedaría un documento mínimo
      // anterior a que el formulario empezara a rellenar estos campos opcionales.
    });
    const lista = await svc.listarReferenciasMercado(USUARIO_A);
    expect(lista).toHaveLength(1);
    const doc = lista[0] as Record<string, unknown>;
    expect(doc.unidad).toBe('total');
    expect(doc.impuestosConocidos).toBe(false);
    expect(doc.tipoPrecio).toBe('publicado');
    expect(doc.origen).toBe('manual');
    expect(doc.obraIncluida).toBe(false);
    expect(doc.electrodomesticosIncluidos).toBeNull();
    expect(doc.nivelCalidad).toBeNull();
  });
});
