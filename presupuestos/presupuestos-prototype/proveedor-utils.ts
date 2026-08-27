import type { Factura, Proveedor } from './types.js';

/** Dirección/código postal/CIF que la IA ha leído en el documento — ver `EscanerFacturaProps.onGuardar` en `escaner-factura.tsx`. */
export type DatosProveedorDetectados = { direccion?: string; codigoPostal?: string; cifNif?: string };

/**
 * Si la factura tiene un proveedor cuyo nombre no existe todavía en la
 * lista (comparación insensible a mayúsculas), lo crea automáticamente —
 * con los datos que la IA haya podido leer en el documento
 * (dirección/código postal/CIF), si los hay.
 *
 * Si el proveedor YA existe, completa los campos que tuviera vacíos con
 * esos mismos datos detectados — nunca sobrescribe un valor que el usuario
 * ya hubiera guardado a mano. Petición explícita del usuario (27/08/2026):
 * que la IA complete la ficha del proveedor sola al escanear sus facturas,
 * en vez de tener que rellenarla siempre a mano.
 */
export function autoCrearProveedorDeFactura(
  factura: Factura,
  proveedores: Proveedor[],
  onCrearProveedor?: (p: Omit<Proveedor, 'id' | 'creado'>) => Proveedor,
  onActualizarProveedor?: (p: Proveedor) => void,
  datosDetectados?: DatosProveedorDetectados
): void {
  if (!factura.proveedor?.trim()) return;
  const existente = proveedores.find((p) => p.nombre.toLowerCase() === factura.proveedor.toLowerCase());

  if (!existente) {
    onCrearProveedor?.({
      nombre: factura.proveedor.trim(),
      contacto: '', telefono: '', email: '', notas: '',
      direccion: datosDetectados?.direccion || '',
      codigoPostal: datosDetectados?.codigoPostal || '',
      cifNif: datosDetectados?.cifNif || '',
    });
    return;
  }

  if (!datosDetectados || !onActualizarProveedor) return;
  const cambios: Partial<Proveedor> = {};
  if (!existente.direccion && datosDetectados.direccion) cambios.direccion = datosDetectados.direccion;
  if (!existente.codigoPostal && datosDetectados.codigoPostal) cambios.codigoPostal = datosDetectados.codigoPostal;
  if (!existente.cifNif && datosDetectados.cifNif) cambios.cifNif = datosDetectados.cifNif;
  if (Object.keys(cambios).length > 0) onActualizarProveedor({ ...existente, ...cambios });
}
