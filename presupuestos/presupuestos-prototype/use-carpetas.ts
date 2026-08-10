import { useState, useEffect, useCallback } from 'react';
import type { Carpeta } from './types.js';
import { generarId } from './mock.js';
import * as api from './api.js';

/** Estado y operaciones sobre las carpetas de dibujos de un cliente. */
export type UseCarpetas = {
  carpetas: Carpeta[];
  cargando: boolean;
  error: string | null;
  recargar: () => void;
  crear: (nombre: string) => Promise<Carpeta>;
  renombrar: (id: string, nombre: string) => Promise<Carpeta>;
  borrar: (id: string) => Promise<void>;
};

/**
 * Hook que gestiona las carpetas de dibujos de un cliente concreto
 * (Fase 2.2) — repositorio central de la documentación gráfica de la
 * ficha del cliente. Mismo patrón que `useDibujos`.
 * @param autenticado Igual que en `useDibujos`/`useClientes`.
 * @param clienteId Ficha de cliente cuyas carpetas se gestionan.
 */
export function useCarpetas(autenticado: boolean, clienteId: string): UseCarpetas {
  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    if (!autenticado || !clienteId) return;
    setCargando(true);
    api
      .listarCarpetas(clienteId)
      .then(setCarpetas)
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  }, [autenticado, clienteId]);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = useCallback(async (nombre: string) => {
    const carpeta = await api.crearCarpeta({ id: generarId(), clienteId, nombre });
    setCarpetas((prev) => [carpeta, ...prev]);
    return carpeta;
  }, [clienteId]);

  const renombrar = useCallback(async (id: string, nombre: string) => {
    const carpeta = await api.renombrarCarpeta(id, nombre);
    setCarpetas((prev) => prev.map((c) => (c.id === id ? carpeta : c)));
    return carpeta;
  }, []);

  const borrar = useCallback(async (id: string) => {
    await api.borrarCarpeta(id);
    setCarpetas((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { carpetas, cargando, error, recargar: cargar, crear, renombrar, borrar };
}
