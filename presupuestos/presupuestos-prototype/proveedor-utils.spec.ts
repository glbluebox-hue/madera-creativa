import { autoCrearProveedorDeFactura } from './proveedor-utils.js';
import type { Factura, Proveedor } from './types.js';

/**
 * Hallazgo real del usuario, 03/09/2026: un mismo proveedor ("Madera
 * Santana", "Leroy Merlin"…) terminaba con varias fichas duplicadas.
 * Causa: esta función buscaba SIEMPRE por igualdad exacta de texto,
 * ignorando que la factura ya pudiera traer `proveedorId` (vinculada de
 * verdad por el escáner) — bastaba con que el texto no coincidiera
 * carácter a carácter (mayúsculas, tildes, "S.L." de más) para crear una
 * ficha nueva sobre una ya existente.
 */

function proveedor(nombre: string, extra: Partial<Proveedor> = {}): Proveedor {
  return { id: `prov-${nombre.toLowerCase().replace(/\s+/g, '-')}`, nombre, creado: new Date().toISOString(), ...extra };
}

function factura(extra: Partial<Factura> = {}): Factura {
  return { id: 'f1', tipo: 'gasto', fecha: '2026-09-01', concepto: '', importe: 100, proveedor: '', clienteId: '', creado: new Date().toISOString(), ...extra };
}

describe('autoCrearProveedorDeFactura — no duplica fichas ya vinculadas o parecidas', () => {
  it('si la factura ya trae proveedorId, lo respeta y no crea ni busca nada más — aunque el texto no coincida con ningún proveedor registrado', () => {
    const existente = proveedor('Madera Santana');
    const crear = vi.fn();
    const id = autoCrearProveedorDeFactura(
      factura({ proveedor: 'MADERAS SANTANA CANARIAS, S.L. (texto distinto)', proveedorId: existente.id }),
      [existente],
      crear,
    );
    expect(id).toBe(existente.id);
    expect(crear).not.toHaveBeenCalled();
  });

  it('sin proveedorId, encuentra el proveedor ya registrado por nombre aunque el texto no sea idéntico (mayúsculas, tildes, "S.L." de más)', () => {
    const existente = proveedor('Madera Santana');
    const crear = vi.fn();
    const id = autoCrearProveedorDeFactura(
      factura({ proveedor: 'MADERAS SANTANA, S.L.', proveedorId: '' }),
      [existente],
      crear,
    );
    expect(id).toBe(existente.id);
    expect(crear).not.toHaveBeenCalled();
  });

  it('crea una ficha nueva solo cuando de verdad no hay ningún proveedor parecido', () => {
    const existente = proveedor('Leroy Merlin');
    const nuevo = proveedor('Ferretería Desconocida S.L.');
    const crear = vi.fn().mockReturnValue(nuevo);
    const id = autoCrearProveedorDeFactura(
      factura({ proveedor: 'Ferretería Desconocida S.L.', proveedorId: '' }),
      [existente],
      crear,
    );
    expect(crear).toHaveBeenCalledTimes(1);
    expect(id).toBe(nuevo.id);
  });

  it('sin proveedorId ni proveedores registrados, no falla y devuelve vacío si no se pasa onCrearProveedor', () => {
    const id = autoCrearProveedorDeFactura(factura({ proveedor: 'Cualquiera', proveedorId: '' }), []);
    expect(id).toBe('');
  });
});
