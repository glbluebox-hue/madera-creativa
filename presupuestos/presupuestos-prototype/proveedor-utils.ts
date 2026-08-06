import type { Factura, Proveedor } from './types.js';

/**
 * Si la factura tiene un proveedor cuyo nombre no existe todavía en la
 * lista (comparación insensible a mayúsculas), lo crea automáticamente
 * con los demás campos vacíos. No hace nada si falta el nombre de
 * proveedor o si ya existe uno con ese nombre.
 */
export function autoCrearProveedorDeFactura(
  factura: Factura,
  proveedores: Proveedor[],
  onCrearProveedor?: (p: Omit<Proveedor, 'id' | 'creado'>) => Proveedor
): void {
  if (!factura.proveedor?.trim() || !onCrearProveedor) return;
  const existe = proveedores.some((p) => p.nombre.toLowerCase() === factura.proveedor.toLowerCase());
  if (!existe) {
    onCrearProveedor({ nombre: factura.proveedor.trim(), contacto: '', telefono: '', email: '', direccion: '', notas: '' });
  }
}
