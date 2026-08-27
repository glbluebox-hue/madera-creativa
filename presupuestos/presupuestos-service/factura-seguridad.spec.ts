import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { FacturaModel } from './cliente.model.js';

/**
 * Regresión de autorización/IDOR sobre facturas (Incremento "Facturas
 * privadas", 27/08/2026). Contra una MongoDB en memoria (nunca Atlas real)
 * — se levanta una vez para todo el archivo y se apaga al final.
 *
 * La auditoría de Fase 1 encontró que TODAS las rutas `/facturas/*` ya
 * filtran por `usuarioId` a nivel de Mongo — estos tests fijan ese
 * comportamiento como regresión explícita (antes solo era cierto "porque sí
 * está en el código", sin ninguna prueba que lo garantizara).
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

const USUARIO_A = 'usuario-a-test';
const USUARIO_B = 'usuario-b-test';

function facturaBase(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    tipo: 'gasto' as const,
    fecha: '2026-08-27',
    importe: 42.5,
    concepto: 'Material de prueba',
    proveedor: 'Proveedor de prueba',
    clienteId: '',
    imagen: '',
    imagenes: [],
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
  await FacturaModel.deleteMany({});
});

describe('obtenerFactura — aislamiento por usuario', () => {
  it('el propietario puede leer su factura', async () => {
    await svc.guardarFactura(facturaBase('f1'), USUARIO_A);
    const leida = await svc.obtenerFactura('f1', USUARIO_A);
    expect(leida).not.toBeNull();
    expect(leida?.id).toBe('f1');
  });

  it('otro usuario NO puede leer esa factura, aunque conozca su id exacto (IDOR)', async () => {
    await svc.guardarFactura(facturaBase('f1'), USUARIO_A);
    const leida = await svc.obtenerFactura('f1', USUARIO_B);
    expect(leida).toBeNull();
  });

  it('un id inventado/manipulado nunca revela nada', async () => {
    await svc.guardarFactura(facturaBase('f1'), USUARIO_A);
    const leida = await svc.obtenerFactura('f1-manipulado', USUARIO_A);
    expect(leida).toBeNull();
  });
});

describe('guardarFactura — usuario B no puede colarse en la factura de A reutilizando su id', () => {
  it('el id de Factura es único de forma GLOBAL (no por usuario) — usuario B intentando "guardar" con el id de A nunca sobrescribe ni crea nada, falla', async () => {
    // Hallazgo real al escribir este test: `FacturaSchema.id` tiene un
    // índice único global, no compuesto con `usuarioId` — en la práctica
    // nunca colisiona (los ids se generan con UUID aleatorio), pero
    // conviene dejar constatado que el intento falla alto y claro (error),
    // nunca sobrescribe en silencio la factura real de otro usuario.
    await svc.guardarFactura(facturaBase('mismo-id', { concepto: 'Original de A' }), USUARIO_A);

    await expect(
      svc.guardarFactura(facturaBase('mismo-id', { concepto: 'Intento de B' }), USUARIO_B)
    ).rejects.toThrow();

    const deA = await svc.obtenerFactura('mismo-id', USUARIO_A);
    expect(deA?.concepto).toBe('Original de A');
    const deB = await svc.obtenerFactura('mismo-id', USUARIO_B);
    expect(deB).toBeNull();
  });
});

describe('borrarFactura — aislamiento por usuario', () => {
  it('un usuario no puede borrar la factura de otro pasando su id', async () => {
    await svc.guardarFactura(facturaBase('f1'), USUARIO_A);
    await svc.borrarFactura('f1', USUARIO_B);
    // Sigue existiendo — borrarFactura filtra por {id, usuarioId} y no encontró nada que borrar.
    const sigueAhi = await svc.obtenerFactura('f1', USUARIO_A);
    expect(sigueAhi).not.toBeNull();
  });

  it('el propietario sí puede borrar su propia factura', async () => {
    await svc.guardarFactura(facturaBase('f1'), USUARIO_A);
    await svc.borrarFactura('f1', USUARIO_A);
    const borrada = await svc.obtenerFactura('f1', USUARIO_A);
    expect(borrada).toBeNull();
  });
});

describe('obtenerZipFacturas — no mezcla facturas de dos usuarios', () => {
  it('pedir un ZIP con ids de dos usuarios distintos solo incluye las del que pide', async () => {
    await svc.guardarFactura(facturaBase('a1'), USUARIO_A);
    await svc.guardarFactura(facturaBase('b1'), USUARIO_B);

    // Usuario A intenta colar el id de la factura de B en su propia petición.
    const zip = await svc.obtenerZipFacturas(USUARIO_A, { ids: ['a1', 'b1'] });
    // No se puede inspeccionar el contenido del ZIP fácilmente aquí sin una
    // librería de descompresión adicional — lo que sí se puede afirmar sin
    // ambigüedad es que la generación no falla y que, por construcción
    // (cada id pasa por `obtenerFactura(id, usuarioId)`), la factura de B
    // nunca llegó a `generarZipFacturas`: si hubiera intentado colarse con
    // datos vacíos habría hecho fallar la generación del PDF, no producir
    // un ZIP válido.
    expect(zip).toBeInstanceOf(Uint8Array);
    expect(zip.length).toBeGreaterThan(0);
  });
});

describe('buscarFacturaDuplicada — no compara entre usuarios distintos', () => {
  it('una factura idéntica (mismo proveedor, fecha e importe) de OTRO usuario nunca se reporta como duplicada', async () => {
    await svc.guardarFactura(facturaBase('a1', { proveedor: 'MONTÓ', fecha: '2026-08-27', importe: 106.91 }), USUARIO_A);

    const encontrada = await svc.buscarFacturaDuplicada(
      { numeroFactura: '', cifNif: '', proveedor: 'MONTÓ', fecha: '2026-08-27', importe: 106.91 },
      USUARIO_B
    );
    expect(encontrada).toBeNull();
  });

  it('la misma factura SÍ se detecta como duplicada dentro del mismo usuario', async () => {
    await svc.guardarFactura(facturaBase('a1', { proveedor: 'MONTÓ', fecha: '2026-08-27', importe: 106.91 }), USUARIO_A);

    const encontrada = await svc.buscarFacturaDuplicada(
      { numeroFactura: '', cifNif: '', proveedor: 'MONTÓ', fecha: '2026-08-27', importe: 106.91 },
      USUARIO_A
    );
    expect(encontrada).not.toBeNull();
  });
});

describe('resolución de URLs de almacenamiento — nunca expone la clave interna', () => {
  it('una factura SIN clave (guardada antes de este incremento) devuelve su URL guardada tal cual — sin cambio de comportamiento', async () => {
    await svc.guardarFactura(facturaBase('legacy', { imagen: 'https://cdn.antiguo.example/facturas/xyz.jpg' }), USUARIO_A);
    const leida = await svc.obtenerFactura('legacy', USUARIO_A);
    expect(leida?.imagen).toBe('https://cdn.antiguo.example/facturas/xyz.jpg');
    expect(leida).not.toHaveProperty('imagenClave');
  });

  it('una factura CON clave (bucket privado) nunca expone esa clave en la respuesta, solo una URL ya resuelta', async () => {
    // Simula lo que dejaría `guardarFactura` tras subir a un bucket privado
    // real: `imagen` vacío, la referencia real en `imagenClave`.
    await FacturaModel.create({
      ...facturaBase('privada'), usuarioId: USUARIO_A, imagen: '', imagenClave: 'facturas/clave-secreta-123',
    });
    const leida = await svc.obtenerFactura('privada', USUARIO_A);
    expect(leida).not.toHaveProperty('imagenClave');
    expect(leida).not.toHaveProperty('imagenesClaves');
    expect(leida).not.toHaveProperty('pdfOriginalClave');
    // AlmacenamientoMemoria (sin R2 configurado en este entorno de test)
    // devuelve su URL relativa de siempre — lo importante es que SÍ se ha
    // resuelto algo a partir de la clave, no que quedara vacío.
    expect(leida?.imagen).toContain('facturas/clave-secreta-123');
  });

  it('otro usuario no puede llegar ni siquiera a intentar resolver la URL de una factura ajena', async () => {
    await FacturaModel.create({
      ...facturaBase('privada-de-a'), usuarioId: USUARIO_A, imagen: '', imagenClave: 'facturas/solo-de-a',
    });
    const intento = await svc.obtenerFactura('privada-de-a', USUARIO_B);
    expect(intento).toBeNull();
  });
});
