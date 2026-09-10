import { useState, useEffect, useCallback } from 'react';
import * as api from './api.js';
import type { ResumenEconomico } from './api.js';
import { rangoPeriodo, type ClavePeriodo, type RangoPeriodo } from './periodos.js';

/** Estado del resumen económico del dashboard para un período. */
export type UseResumenEconomico = {
  resumen: ResumenEconomico;
  rango: RangoPeriodo;
  cargando: boolean;
  error: string | null;
  /** Vuelve a pedir el resumen del período actual (p. ej. tras borrar una factura). */
  recargar: () => void;
};

const LINEA_VACIA = {
  base: 0, conDesglose: 0, cuotaImpuesto: 0, importeSinDesglose: 0, total: 0, num: 0, numSinDesglose: 0,
};

/** Resumen a cero mientras carga o si falla — nunca `null`, para no tener que comprobarlo en cada render. */
function vacio(rango: RangoPeriodo): ResumenEconomico {
  return {
    periodo: { desde: rango.desde, hasta: rango.hasta, criterio: 'devengo' },
    ingresos: { ...LINEA_VACIA },
    gastos: { ...LINEA_VACIA },
    resultado: 0,
    numIngresos: 0,
    numGastos: 0,
    hayFacturasSinDesglose: false,
    fuente: 'facturas',
  };
}

/**
 * Pide al backend el resumen económico (ingresos / gastos / resultado) del
 * período indicado. Fuente de verdad: `GET /facturas/resumen-economico` —
 * el frontend nunca recalcula estos totales (ver auditoría económica,
 * sección "una única fuente de verdad").
 *
 * @param clave Período seleccionado en el dashboard.
 * @param autenticado Cuando es `false` no dispara ninguna petición (mismo
 *   criterio que `useFacturas`: no pedir rutas protegidas antes de tener
 *   sesión confirmada).
 */
export function useResumenEconomico(clave: ClavePeriodo, autenticado = true): UseResumenEconomico {
  const rango = rangoPeriodo(clave);
  const [resumen, setResumen] = useState<ResumenEconomico>(() => vacio(rango));
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const recargar = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!autenticado) return;
    const { desde, hasta } = rangoPeriodo(clave);
    let activo = true;
    setCargando(true);
    setError(null);
    api.obtenerResumenEconomico(desde, hasta)
      .then((r) => { if (activo) setResumen(r); })
      .catch((e) => { if (activo) { setError(String(e)); setResumen(vacio(rangoPeriodo(clave))); } })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [clave, autenticado, tick]);

  return { resumen, rango, cargando, error, recargar };
}
