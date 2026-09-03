import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService, ErrorDeNegocio } from './presupuestos-service.js';
import { ProveedorModel, FacturaModel, ProductoModel } from './cliente.model.js';

/**
 * Hallazgo real del usuario, 03/09/2026: un mismo proveedor real ("Madera
 * Santana", "Leroy Merlin"…) terminaba con varias fichas duplicadas —
 * `fusionarProveedores` deja que el usuario las consolide en una sola: las
 * facturas y materiales de la ficha duplicada pasan a la superviviente y
 * la duplicada desaparece.
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();
const USUARIO = 'usuario-fusion-proveedores-test';
const OTRO_USUARIO = 'otro-usuario-fusion-test';

function proveedor(id: string, extra: Record<string, unknown> = {}) {
  return { id, usuarioId: USUARIO, nombre: id, creado: new Date().toISOString(), ...extra };
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
  await ProveedorModel.deleteMany({});
  await FacturaModel.deleteMany({});
  await ProductoModel.deleteMany({});
});

describe('fusionarProveedores', () => {
  it('mueve las facturas y materiales del duplicado al superviviente, y borra el duplicado', async () => {
    await ProveedorModel.create(proveedor('prov-super', { cifNif: 'B11111111' }));
    await ProveedorModel.create(proveedor('prov-dup', { telefono: '600111222', cifNif: '' }));
    await FacturaModel.create({ id: 'f1', usuarioId: USUARIO, tipo: 'gasto', fecha: '2026-09-01', importe: 50, proveedor: 'Duplicado', proveedorId: 'prov-dup', creado: new Date().toISOString() });
    await ProductoModel.create({ id: 'p1', usuarioId: USUARIO, nombre: 'Tornillos', unidad: 'caja', precio: 5, proveedorId: 'prov-dup' });

    const resultado = await svc.fusionarProveedores('prov-super', 'prov-dup', USUARIO);

    expect((resultado as any).id).toBe('prov-super');
    // El teléfono del duplicado rellena el hueco del superviviente…
    expect((resultado as any).telefono).toBe('600111222');
    // …pero el CIF del superviviente, que ya lo tenía, nunca se pisa.
    expect((resultado as any).cifNif).toBe('B11111111');

    const factura = await FacturaModel.findOne({ id: 'f1' }).lean().exec();
    expect((factura as any).proveedorId).toBe('prov-super');
    const producto = await ProductoModel.findOne({ id: 'p1' }).lean().exec();
    expect((producto as any).proveedorId).toBe('prov-super');
    const duplicadoBorrado = await ProveedorModel.findOne({ id: 'prov-dup' }).lean().exec();
    expect(duplicadoBorrado).toBeNull();
  });

  it('también mueve facturas vinculadas SOLO por texto al duplicado (sin proveedorId todavía) — nunca quedan huérfanas al borrar la ficha duplicada', async () => {
    await ProveedorModel.create(proveedor('prov-super'));
    await ProveedorModel.create(proveedor('prov-dup', { nombre: 'Hooba' }));
    // Nunca tuvo proveedorId real — solo el texto coincide con el nombre del duplicado.
    await FacturaModel.create({ id: 'f-texto', usuarioId: USUARIO, tipo: 'gasto', fecha: '2026-04-07', importe: 15, proveedor: 'Hooba', proveedorId: '', creado: new Date().toISOString() });

    await svc.fusionarProveedores('prov-super', 'prov-dup', USUARIO);

    const factura = await FacturaModel.findOne({ id: 'f-texto' }).lean().exec();
    expect((factura as any).proveedorId).toBe('prov-super');
  });

  it('rechaza fusionar un proveedor consigo mismo', async () => {
    await ProveedorModel.create(proveedor('prov-solo'));
    await expect(svc.fusionarProveedores('prov-solo', 'prov-solo', USUARIO)).rejects.toBeInstanceOf(ErrorDeNegocio);
  });

  it('nunca fusiona entre usuarios distintos, ni aunque los ids coincidan', async () => {
    await ProveedorModel.create(proveedor('prov-super'));
    await ProveedorModel.create({ id: 'prov-otro', usuarioId: OTRO_USUARIO, nombre: 'De otro usuario', creado: new Date().toISOString() });
    await expect(svc.fusionarProveedores('prov-super', 'prov-otro', USUARIO)).rejects.toBeInstanceOf(ErrorDeNegocio);
    // El proveedor del otro usuario sigue existiendo tal cual, sin tocar.
    const intacto = await ProveedorModel.findOne({ id: 'prov-otro' }).lean().exec();
    expect(intacto).not.toBeNull();
  });
});
