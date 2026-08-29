import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { FacturaModel } from './cliente.model.js';
import { verificarTokenArchivo } from './token.service.js';

/**
 * Flujo completo de "Facturas privadas" tras la incidencia real del
 * 29/08/2026 (R2 devolviendo 503 de forma intermitente a peticiones
 * directas del navegador): `resolverUrlsFactura` ya no expone una URL
 * firmada de R2, sino una ruta propia (`/almacenamiento-privado?token=`)
 * cuya autorización viene de un token firmado por el servidor — nunca de
 * una clave que el cliente pudiera manipular. Este test cubre el flujo
 * entero a nivel de servicio (sin R2 real, con `AlmacenamientoMemoria` de
 * desarrollo) y, sobre todo, que un usuario ajeno nunca llega ni siquiera
 * a obtener un token para una factura que no es suya.
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

const USUARIO_A = 'usuario-a-archivo-privado-test';
const USUARIO_B = 'usuario-b-archivo-privado-test';

function facturaConImagenPrivada(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    tipo: 'gasto' as const,
    fecha: '2026-08-29',
    importe: 100,
    concepto: 'Factura con imagen en bucket privado (simulada)',
    proveedor: 'Proveedor de prueba',
    clienteId: '',
    imagen: '',
    imagenes: [],
    // Simula lo que `guardarFactura` deja tras subir de verdad al bucket privado —
    // aquí se fija directamente para no depender de R2 real en el test.
    imagenClave: `facturas-privado/${id}-imagen`,
    creado: new Date().toISOString(),
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongod.getUri();
  process.env.JWT_SECRET = 'secreto-de-pruebas-suficientemente-largo-1234567890';
  await mongoose.connect(process.env.MONGO_URL);
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await FacturaModel.deleteMany({});
});

describe('resolverUrlsFactura — token propio en vez de URL firmada de R2', () => {
  it('la factura devuelta lleva la ruta del proxy propio, nunca una URL de r2.cloudflarestorage.com', async () => {
    await svc.guardarFactura(facturaConImagenPrivada('f1'), USUARIO_A);
    const leida = await svc.obtenerFactura('f1', USUARIO_A);
    expect(leida?.imagen).toMatch(/^\/almacenamiento-privado\?token=/);
    expect(leida?.imagen).not.toContain('r2.cloudflarestorage.com');
  });

  it('el token de la URL verifica exactamente a la clave real de esa factura', async () => {
    await svc.guardarFactura(facturaConImagenPrivada('f1'), USUARIO_A);
    const leida = await svc.obtenerFactura('f1', USUARIO_A);
    const token = decodeURIComponent((leida?.imagen as string).split('token=')[1]);
    expect(verificarTokenArchivo(token)).toBe('facturas-privado/f1-imagen');
  });
});

describe('guardarFactura (reguardado) nunca borra la clave del archivo privado', () => {
  it('editar un campo cualquiera (ej. importe) preserva imagenClave aunque el frontend nunca la reenvíe', async () => {
    await svc.guardarFactura(facturaConImagenPrivada('f1'), USUARIO_A);
    const leida = await svc.obtenerFactura('f1', USUARIO_A);
    // Lo que el frontend recibe (y por tanto reenviaría en un guardado
    // posterior) nunca trae `imagenClave` — `resolverUrlsFactura` la quita
    // antes de responder. Simula exactamente ese reguardado real: el mismo
    // objeto que llegó del servidor, solo con el importe cambiado.
    expect((leida as any).imagenClave).toBeUndefined();
    await svc.guardarFactura({ ...(leida as any), importe: 999 }, USUARIO_A);

    const trasEditar = await svc.obtenerFactura('f1', USUARIO_A);
    expect((trasEditar as any).importe).toBe(999);
    expect(trasEditar?.imagen).toMatch(/^\/almacenamiento-privado\?token=/);
    const token = decodeURIComponent((trasEditar?.imagen as string).split('token=')[1]);
    expect(verificarTokenArchivo(token)).toBe('facturas-privado/f1-imagen');
  });
});

describe('Aislamiento: un usuario ajeno nunca obtiene un token para una factura que no es suya', () => {
  it('obtenerFactura de otro usuario devuelve null -- nunca llega a construirse ningún token', async () => {
    await svc.guardarFactura(facturaConImagenPrivada('f1'), USUARIO_A);
    const comoB = await svc.obtenerFactura('f1', USUARIO_B);
    expect(comoB).toBeNull();
  });

  it('listarFacturas de B nunca incluye la factura de A, aunque coincidan fechas', async () => {
    await svc.guardarFactura(facturaConImagenPrivada('f1'), USUARIO_A);
    await svc.guardarFactura(facturaConImagenPrivada('f2'), USUARIO_B);
    const listaB = await svc.listarFacturas(USUARIO_B, { pagina: 1, limite: 30, tipo: 'todas' });
    expect(listaB.items.map((f: any) => f.id)).toEqual(['f2']);
    expect(listaB.items.map((f: any) => f.id)).not.toContain('f1');
  });
});
