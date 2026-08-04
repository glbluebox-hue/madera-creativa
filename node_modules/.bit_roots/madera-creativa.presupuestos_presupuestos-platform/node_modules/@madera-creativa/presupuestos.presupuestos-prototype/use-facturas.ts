import { useState, useEffect, useCallback } from 'react';
import type { Factura } from './types.js';
import * as api from './api.js';

/** Estado y operaciones sobre la colección de facturas. */
export type UseFacturas = {
  facturas: Factura[];
  cargando: boolean;
  error: string | null;
  guardar: (f: Factura) => Promise<void>;
  borrar: (id: string) => Promise<void>;
};

/**
 * Hook que gestiona las facturas con persistencia en el servidor.
 * @returns Estado y operaciones sobre las facturas.
 */
export function useFacturas(): UseFacturas {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    api
      .obtenerFacturas()
      .then((datos) => { if (activo) setFacturas(datos); })
      .catch((e) => { if (activo) setError(String(e)); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, []);

  const guardar = useCallback(async (f: Factura) => {
    setFacturas((prev) => {
      const existe = prev.find((x) => x.id === f.id);
      return existe ? prev.map((x) => (x.id === f.id ? f : x)) : [f, ...prev];
    });
    await api.guardarFactura(f);
  }, []);

  const borrar = useCallback(async (id: string) => {
    setFacturas((prev) => prev.filter((f) => f.id !== id));
    await api.borrarFactura(id);
  }, []);

  return { facturas, cargando, error, guardar, borrar };
}
