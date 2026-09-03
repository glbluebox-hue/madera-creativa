import { useState, useEffect, useCallback } from 'react';
import type { Proveedor, Producto } from './types.js';
import { generarId } from './mock.js';
import * as api from './api.js';

/**
 * Hook que gestiona proveedores y catálogo de productos contra el servidor
 * (Fase "Integración completa") — antes vivían solo en el `localStorage`
 * del navegador, sin persistencia real ni compartida entre dispositivos.
 * Mismo patrón optimista que `useClientes`/`useFacturas`: la interfaz
 * pública no cambia respecto a la versión anterior, para no tener que
 * tocar los componentes que ya la consumen.
 *
 * @param autenticado Cuando es false no dispara la carga inicial.
 */
export function useProveedores(autenticado = true) {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);

  const cargar = useCallback(() => {
    api.obtenerProveedores().then(setProveedores).catch(() => setProveedores([]));
    api.obtenerProductos().then(setProductos).catch(() => setProductos([]));
  }, []);

  useEffect(() => {
    if (!autenticado) return;
    cargar();
  }, [autenticado, cargar]);

  const crearProveedor = (datos: Omit<Proveedor, 'id' | 'creado'>): Proveedor => {
    const nuevo: Proveedor = { ...datos, id: generarId(), creado: new Date().toISOString() };
    setProveedores((prev) => [nuevo, ...prev]);
    api.guardarProveedor(nuevo).catch(() => cargar());
    return nuevo;
  };

  const actualizarProveedor = (p: Proveedor) => {
    setProveedores((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    api.guardarProveedor(p).catch(() => cargar());
  };

  const borrarProveedor = (id: string) => {
    setProveedores((prev) => prev.filter((p) => p.id !== id));
    setProductos((prev) => prev.filter((p) => p.proveedorId !== id));
    api.borrarProveedor(id).catch(() => cargar());
  };

  /**
   * Fusiona dos fichas de proveedor duplicadas (hallazgo real del usuario,
   * 03/09/2026). A diferencia del resto de acciones de este hook, NO es
   * optimista: mueve datos reales en el servidor (facturas, materiales) y
   * es irreversible, así que se espera la respuesta antes de tocar el
   * estado local, y con el resultado real del servidor (no una suposición
   * local de cómo habrá quedado la ficha fusionada).
   */
  const fusionarProveedores = async (supervivienteId: string, duplicadoId: string): Promise<void> => {
    const actualizado = await api.fusionarProveedores(supervivienteId, duplicadoId);
    setProveedores((prev) => prev.filter((p) => p.id !== duplicadoId).map((p) => (p.id === supervivienteId ? actualizado : p)));
    setProductos((prev) => prev.map((p) => (p.proveedorId === duplicadoId ? { ...p, proveedorId: supervivienteId } : p)));
  };

  const crearProducto = (datos: Omit<Producto, 'id'>): Producto => {
    const nuevo: Producto = { ...datos, id: generarId() };
    setProductos((prev) => [nuevo, ...prev]);
    api.guardarProducto(nuevo).catch(() => cargar());
    return nuevo;
  };

  const actualizarProducto = (p: Producto) => {
    setProductos((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    api.guardarProducto(p).catch(() => cargar());
  };

  const borrarProducto = (id: string) => {
    setProductos((prev) => prev.filter((p) => p.id !== id));
    api.borrarProducto(id).catch(() => cargar());
  };

  return {
    proveedores, productos,
    crearProveedor, actualizarProveedor, borrarProveedor, fusionarProveedores,
    crearProducto, actualizarProducto, borrarProducto,
  };
}
