import type { Factura, Proveedor } from './types.js';
import { nombresCoinciden } from './identificacion-factura.js';

/** Dirección/código postal/CIF que la IA ha leído en el documento — ver `EscanerFacturaProps.onGuardar` en `escaner-factura.tsx`. */
export type DatosProveedorDetectados = { direccion?: string; codigoPostal?: string; cifNif?: string };

/**
 * Resuelve con qué proveedor debe quedar vinculada una factura al
 * guardarla, creando la ficha automáticamente si de verdad no existe
 * todavía — con los datos que la IA haya podido leer en el documento
 * (dirección/código postal/CIF), si los hay. Devuelve el `proveedorId`
 * final: úsalo para completar `factura.proveedorId` antes de guardar.
 *
 * Si el proveedor YA existe, completa los campos que tuviera vacíos con
 * esos mismos datos detectados — nunca sobrescribe un valor que el usuario
 * ya hubiera guardado a mano. Petición explícita del usuario (27/08/2026):
 * que la IA complete la ficha del proveedor sola al escanear sus facturas,
 * en vez de tener que rellenarla siempre a mano.
 *
 * Dos reglas añadidas tras un hallazgo real del usuario (03/09/2026): un
 * mismo proveedor ("Madera Santana", "Leroy Merlin"…) terminaba con varias
 * fichas duplicadas.
 * 1. Si la factura YA trae `proveedorId` (el escáner ya la vinculó de
 *    verdad, con IA o a mano), se respeta tal cual y no se busca ni se
 *    crea nada más — antes esta función ignoraba esa relación y buscaba
 *    SIEMPRE por el texto exacto de `proveedor`, creando una ficha nueva
 *    cada vez que ese texto no coincidía carácter a carácter con el
 *    nombre ya registrado (mayúsculas, tildes, "S.L." de más…), aunque la
 *    factura ya estuviera bien vinculada.
 * 2. Cuando SÍ hace falta buscar por texto (factura sin vincular todavía),
 *    usa la misma coincidencia tolerante que ya usa el escáner al detectar
 *    el proveedor con IA (`nombresCoinciden`) en vez de una igualdad
 *    exacta — que con texto libre casi nunca se da.
 */
export function autoCrearProveedorDeFactura(
  factura: Factura,
  proveedores: Proveedor[],
  onCrearProveedor?: (p: Omit<Proveedor, 'id' | 'creado'>) => Proveedor,
  onActualizarProveedor?: (p: Proveedor) => void,
  datosDetectados?: DatosProveedorDetectados
): string {
  if (!factura.proveedor?.trim()) return factura.proveedorId ?? '';

  const completarDatos = (existente: Proveedor) => {
    if (!datosDetectados || !onActualizarProveedor) return;
    const cambios: Partial<Proveedor> = {};
    if (!existente.direccion && datosDetectados.direccion) cambios.direccion = datosDetectados.direccion;
    if (!existente.codigoPostal && datosDetectados.codigoPostal) cambios.codigoPostal = datosDetectados.codigoPostal;
    if (!existente.cifNif && datosDetectados.cifNif) cambios.cifNif = datosDetectados.cifNif;
    if (Object.keys(cambios).length > 0) onActualizarProveedor({ ...existente, ...cambios });
  };

  // Regla 1 — ver comentario de arriba.
  if (factura.proveedorId) {
    const existente = proveedores.find((p) => p.id === factura.proveedorId);
    if (existente) completarDatos(existente);
    return factura.proveedorId;
  }

  // Regla 2 — búsqueda tolerante, no exacta.
  const existente = proveedores.find((p) => nombresCoinciden(p.nombre, factura.proveedor));
  if (existente) {
    completarDatos(existente);
    return existente.id;
  }

  const creado = onCrearProveedor?.({
    nombre: factura.proveedor.trim(),
    contacto: '', telefono: '', email: '', notas: '',
    direccion: datosDetectados?.direccion || '',
    codigoPostal: datosDetectados?.codigoPostal || '',
    cifNif: datosDetectados?.cifNif || '',
  });
  return creado?.id ?? '';
}
