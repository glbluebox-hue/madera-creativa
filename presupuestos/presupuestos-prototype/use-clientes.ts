import { useState, useEffect, useCallback } from 'react';
import type { Cliente } from './types.js';
import * as api from './api.js';

/** Estado de carga y operaciones sobre la lista de clientes. */
export type UseClientes = {
  clientes: Cliente[];
  cargando: boolean;
  /** true mientras se carga una página adicional (distinto de la carga inicial). */
  cargandoMas: boolean;
  /** true si quedan más páginas por cargar. */
  hayMas: boolean;
  error: string | null;
  crear: (cliente: Cliente) => Promise<void>;
  actualizar: (cliente: Cliente) => Promise<void>;
  borrar: (id: string) => Promise<void>;
  cargar: () => void;
  /** Carga la siguiente página y la añade al final de la lista ya cargada. */
  cargarMas: () => void;
};

/**
 * Hook que gestiona la lista de clientes con persistencia en el servidor,
 * cargada por páginas (Incremento 1.5: "cargar más" en vez de traer todo
 * de una vez).
 * @param autenticado Cuando es false no dispara la carga inicial.
 * @returns Estado y operaciones sobre los clientes.
 */
export function useClientes(autenticado = true): UseClientes {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    api
      .obtenerClientes(1)
      .then((datos) => { setClientes(datos.items); setPagina(datos.pagina); setTotalPaginas(datos.totalPaginas); setError(null); })
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

  const cargarMas = useCallback(() => {
    setCargandoMas(true);
    api
      .obtenerClientes(pagina + 1)
      .then((datos) => {
        setClientes((prev) => [...prev, ...datos.items]);
        setPagina(datos.pagina);
        setTotalPaginas(datos.totalPaginas);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargandoMas(false));
  }, [pagina]);

  // Solo cargar cuando el usuario está autenticado
  useEffect(() => {
    if (!autenticado) return;
    cargar();
  }, [autenticado, cargar]);

  // El cierre de sesión ante un token inválido ya lo gestiona de forma
  // centralizada `fetchConAuth()` (ver api.ts): si el access token no es
  // válido y la renovación tampoco funciona, dispara el callback registrado
  // en use-auth.ts. No hace falta una comprobación ad-hoc aquí.

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
    try {
      await api.guardarCliente(cliente);
    } catch {
      // El guardado falló: revertimos el cambio optimista recargando el
      // estado real del servidor, en vez de dejar en pantalla una edición
      // que el usuario cree guardada pero que nunca llegó a persistirse.
      cargar();
    }
  }, [cargar]);

  const borrar = useCallback(async (id: string) => {
    setClientes((prev) => prev.filter((c) => c.id !== id));
    await api.borrarCliente(id);
  }, []);

  return { clientes, cargando, cargandoMas, hayMas: pagina < totalPaginas, error, crear, actualizar, borrar, cargar, cargarMas };
}
