import { useState, useEffect } from 'react';
import type { Proveedor, Producto } from './types.js';
import { generarId } from './mock.js';

const LEGACY_KEY_PROV = 'mc_proveedores';
const LEGACY_KEY_PROD = 'mc_productos';

function load<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[]; } catch { return []; }
}
function save<T>(key: string, data: T[]) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
}

/**
 * Migra los datos de las claves antiguas (mc_proveedores / mc_productos)
 * a las nuevas claves por usuario, si las nuevas están vacías.
 */
function migrarSiNecesario(keyProv: string, keyProd: string) {
  if (keyProv === LEGACY_KEY_PROV) return; // admin ya usa la clave legacy
  const yaHayProv = localStorage.getItem(keyProv);
  if (!yaHayProv) {
    const legacyProv = localStorage.getItem(LEGACY_KEY_PROV);
    if (legacyProv) localStorage.setItem(keyProv, legacyProv);
  }
  const yaHayProd = localStorage.getItem(keyProd);
  if (!yaHayProd) {
    const legacyProd = localStorage.getItem(LEGACY_KEY_PROD);
    if (legacyProd) localStorage.setItem(keyProd, legacyProd);
  }
}

/**
 * Hook que gestiona proveedores y catálogo de productos en localStorage.
 * Las claves son únicas por usuario (prefijo) para evitar que distintos
 * usuarios compartan los mismos datos en el mismo navegador.
 *
 * @param prefijo Prefijo único del usuario (usuarioId o storagePrefix).
 */
export function useProveedores(prefijo = 'mc') {
  const keyProv = prefijo === 'admin' ? LEGACY_KEY_PROV : `${prefijo}_proveedores`;
  const keyProd = prefijo === 'admin' ? LEGACY_KEY_PROD : `${prefijo}_productos`;

  const [proveedores, setProveedores] = useState<Proveedor[]>(() => {
    migrarSiNecesario(keyProv, keyProd);
    return load<Proveedor>(keyProv);
  });
  const [productos, setProductos] = useState<Producto[]>(() => load<Producto>(keyProd));

  // Recargar cuando cambia el prefijo (cambio de sesión)
  useEffect(() => {
    migrarSiNecesario(keyProv, keyProd);
    setProveedores(load<Proveedor>(keyProv));
    setProductos(load<Producto>(keyProd));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefijo]);

  useEffect(() => { save(keyProv, proveedores); }, [keyProv, proveedores]);
  useEffect(() => { save(keyProd, productos); }, [keyProd, productos]);

  const crearProveedor = (datos: Omit<Proveedor, 'id' | 'creado'>) => {
    const nuevo: Proveedor = { ...datos, id: generarId(), creado: new Date().toISOString() };
    setProveedores(prev => [nuevo, ...prev]);
    return nuevo;
  };

  const actualizarProveedor = (p: Proveedor) =>
    setProveedores(prev => prev.map(x => x.id === p.id ? p : x));

  const borrarProveedor = (id: string) => {
    setProveedores(prev => prev.filter(p => p.id !== id));
    setProductos(prev => prev.filter(p => p.proveedorId !== id));
  };

  const crearProducto = (datos: Omit<Producto, 'id'>) => {
    const nuevo: Producto = { ...datos, id: generarId() };
    setProductos(prev => [nuevo, ...prev]);
    return nuevo;
  };

  const actualizarProducto = (p: Producto) =>
    setProductos(prev => prev.map(x => x.id === p.id ? p : x));

  const borrarProducto = (id: string) =>
    setProductos(prev => prev.filter(p => p.id !== id));

  return {
    proveedores, productos,
    crearProveedor, actualizarProveedor, borrarProveedor,
    crearProducto, actualizarProducto, borrarProducto,
  };
}
