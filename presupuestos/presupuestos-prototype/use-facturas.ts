import { useState, useEffect, useCallback } from 'react';
import type { Factura } from './types.js';
import type { ResumenFacturas } from './api.js';
import * as api from './api.js';

export type { ResumenFacturas } from './api.js';

/** Tipo de filtro aplicado en el servidor. */
export type FiltroFacturas = 'ingreso' | 'gasto' | 'todas';

/** Estado y operaciones sobre la colección de facturas. */
export type UseFacturas = {
  facturas: Factura[];
  resumen: ResumenFacturas;
  cargando: boolean;
  cargandoMas: boolean;
  hayMas: boolean;
  filtro: FiltroFacturas;
  establecerFiltro: (f: FiltroFacturas) => void;
  error: string | null;
  guardar: (f: Factura) => Promise<void>;
  borrar: (id: string) => Promise<void>;
  cargarMas: () => void;
};

const RESUMEN_VACIO: ResumenFacturas = {
  totalIngresos: 0, totalGastos: 0, balance: 0, numIngresos: 0, numGastos: 0, numFacturas: 0,
};

/**
 * Hook que gestiona las facturas con persistencia en el servidor, cargadas
 * por páginas y con los totales resueltos aparte en el servidor (Incremento
 * 1.5), para que sean correctos con independencia de cuántas páginas haya.
 * @param autenticado Cuando es false no dispara ninguna carga (evita
 * peticiones protegidas antes de tener sesión, o antes de confirmar el
 * access token tras recargar la página — Dirección Creativa).
 * @returns Estado y operaciones sobre las facturas.
 */
export function useFacturas(autenticado = true): UseFacturas {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [resumen, setResumen] = useState<ResumenFacturas>(RESUMEN_VACIO);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [filtro, setFiltro] = useState<FiltroFacturas>('todas');
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargarResumen = useCallback(() => {
    api.obtenerResumenFacturas().then(setResumen).catch((e) => setError(String(e)));
  }, []);

  // Recarga desde la página 1 cada vez que cambia el filtro.
  useEffect(() => {
    if (!autenticado) return;
    let activo = true;
    setCargando(true);
    api
      .obtenerFacturas(1, undefined, filtro)
      .then((datos) => { if (activo) { setFacturas(datos.items); setPagina(datos.pagina); setTotalPaginas(datos.totalPaginas); } })
      .catch((e) => { if (activo) setError(String(e)); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [filtro, autenticado]);

  useEffect(() => {
    if (!autenticado) return;
    cargarResumen();
  }, [cargarResumen, autenticado]);

  const cargarMas = useCallback(() => {
    setCargandoMas(true);
    api
      .obtenerFacturas(pagina + 1, undefined, filtro)
      .then((datos) => {
        setFacturas((prev) => [...prev, ...datos.items]);
        setPagina(datos.pagina);
        setTotalPaginas(datos.totalPaginas);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setCargandoMas(false));
  }, [pagina, filtro]);

  const guardar = useCallback(async (f: Factura) => {
    setFacturas((prev) => {
      const existe = prev.find((x) => x.id === f.id);
      return existe ? prev.map((x) => (x.id === f.id ? f : x)) : [f, ...prev];
    });
    await api.guardarFactura(f);
    cargarResumen();
  }, [cargarResumen]);

  const borrar = useCallback(async (id: string) => {
    setFacturas((prev) => prev.filter((f) => f.id !== id));
    await api.borrarFactura(id);
    cargarResumen();
  }, [cargarResumen]);

  return {
    facturas, resumen, cargando, cargandoMas, hayMas: pagina < totalPaginas,
    filtro, establecerFiltro: setFiltro, error, guardar, borrar, cargarMas,
  };
}
