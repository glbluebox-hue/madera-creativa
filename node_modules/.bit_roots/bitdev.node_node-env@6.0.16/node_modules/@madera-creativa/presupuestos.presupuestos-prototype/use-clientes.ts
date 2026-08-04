import { useState, useEffect, useCallback } from 'react';
import type { Cliente } from './types.js';
import * as api from './api.js';

/** Estado de carga y operaciones sobre la lista de clientes. */
export type UseClientes = {
  clientes: Cliente[];
  cargando: boolean;
  error: string | null;
  crear: (cliente: Cliente) => Promise<void>;
  actualizar: (cliente: Cliente) => Promise<void>;
  borrar: (id: string) => Promise<void>;
  cargar: () => void;
};

/**
 * Hook que gestiona la lista de clientes con persistencia en el servidor.
 * @param autenticado Cuando es false no dispara la carga inicial.
 * @returns Estado y operaciones sobre los clientes.
 */
export function useClientes(autenticado = true): UseClientes {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    api
      .obtenerClientes()
      .then((datos) => { setClientes(datos); setError(null); })
      .catch((e) => {
        // 401 = token inválido (sesión antigua con token de admin)
        // Forzar pantalla vacía sin exponer datos ajenos
        if (String(e).includes('401') || String(e).includes('autori')) {
          setClientes([]);
        } else {
          setError(String(e));
        }
      })
      .finally(() => { setCargando(false); });
  }, []);

  // Solo cargar cuando el usuario está autenticado
  useEffect(() => {
    if (!autenticado) return;
    cargar();
  }, [autenticado, cargar]);

  /** Fuerza cierre de sesión si el token guardado no es válido en el servidor. */
  useEffect(() => {
    if (!autenticado) return;
    const BASE_SVC = '/api/presupuestos-service';
    const token = localStorage.getItem('mc-auth-token');
    // Solo verificar si hay token guardado (usuarios que ya hicieron login)
    if (!token) return;
    fetch(`${BASE_SVC}/auth/yo`, {
      headers: { Authorization: 'Bearer ' + token },
      credentials: 'include',
    }).then(r => {
      if (r.status === 401 || r.status === 403) {
        // Token inválido: limpiar sesión y forzar re-login
        localStorage.removeItem('mc-auth-token');
        localStorage.removeItem('mc_sesion');
        localStorage.removeItem('mc_auth_actividad');
        window.location.reload();
      }
    }).catch(() => { /* sin conexión: ignorar */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autenticado]);

  const crear = useCallback(async (cliente: Cliente) => {
    setClientes((prev) => [cliente, ...prev]);
    try {
      await api.guardarCliente(cliente);
    } catch {
      cargar();
    }
  }, [cargar]);

  const actualizar = useCallback(async (cliente: Cliente) => {
    setClientes((prev) => prev.map((c) => (c.id === cliente.id ? cliente : c)));
    await api.guardarCliente(cliente);
  }, []);

  const borrar = useCallback(async (id: string) => {
    setClientes((prev) => prev.filter((c) => c.id !== id));
    await api.borrarCliente(id);
  }, []);

  return { clientes, cargando, error, crear, actualizar, borrar, cargar };
}
