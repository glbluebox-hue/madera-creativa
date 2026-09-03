import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { FacturaModel } from './cliente.model.js';

/**
 * Hallazgo real del usuario, 03/09/2026: subía una factura nueva y quedaba
 * en la lista general de Facturas (y, si elegía cliente, en la ficha de
 * ese cliente), pero nunca aparecía en la ficha del PROVEEDOR que la
 * emitía, aunque el escáner ya guarda `proveedorId` correctamente al
 * detectar o elegir el proveedor.
 *
 * Causa real: `listarFacturasDeProveedor` (la consulta que llena la lista
 * de facturas dentro de la ficha de un proveedor) solo miraba el campo de
 * TEXTO `proveedor`, nunca el id real `proveedorId` — así que una factura
 * bien vinculada podía no aparecer si el texto no coincidía EXACTAMENTE
 * con el nombre registrado del proveedor (mayúsculas, "S.L." de más, un
 * renombrado posterior…). Este test reproduce justo ese caso: texto
 * distinto, id correcto.
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();
const USUARIO = 'usuario-facturas-proveedor-id-test';

function facturaBase(id: string, extra: Record<string, unknown> = {}) {
  return {
    id, usuarioId: USUARIO, tipo: 'gasto' as const, fecha: '2026-09-01',
    importe: 100, creado: new Date().toISOString(),
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

describe('listarFacturasDeProveedor — une texto y proveedorId', () => {
  it('encuentra una factura vinculada por proveedorId aunque el texto del proveedor no coincida con el nombre registrado', async () => {
    await FacturaModel.create(facturaBase('f1', {
      // Sin tildes, tal como a veces lo extrae la IA del documento — no es
      // substring literal de "Ferretería Martínez" (con tildes), aunque la
      // relación real (proveedorId) sí sea correcta.
      proveedor: 'Ferreteria Martinez SL',
      proveedorId: 'prov-martinez',
    }));

    const sinId = await svc.listarFacturasDeProveedor(USUARIO, 'Ferretería Martínez');
    expect(sinId.length).toBe(0); // reproduce el fallo real: por texto solo, no la encuentra

    const conId = await svc.listarFacturasDeProveedor(USUARIO, 'Ferretería Martínez', 'prov-martinez');
    expect(conId.length).toBe(1);
    expect((conId[0] as any).id).toBe('f1');
  });

  it('sigue encontrando facturas antiguas que solo tienen el texto, sin proveedorId', async () => {
    await FacturaModel.create(facturaBase('f2', { proveedor: 'Ferretería Pérez', proveedorId: '' }));

    const items = await svc.listarFacturasDeProveedor(USUARIO, 'Ferretería Pérez', 'id-que-no-tiene-esta-factura');
    expect(items.length).toBe(1);
    expect((items[0] as any).id).toBe('f2');
  });

  it('nunca mezcla facturas de otro proveedor', async () => {
    await FacturaModel.create(facturaBase('f3', { proveedor: 'Otro proveedor', proveedorId: 'prov-otro' }));
    await FacturaModel.create(facturaBase('f4', { proveedor: 'Leroy Merlin', proveedorId: 'prov-leroy' }));

    const items = await svc.listarFacturasDeProveedor(USUARIO, 'Leroy Merlin', 'prov-leroy');
    expect(items.map((i: any) => i.id)).toEqual(['f4']);
  });
});
