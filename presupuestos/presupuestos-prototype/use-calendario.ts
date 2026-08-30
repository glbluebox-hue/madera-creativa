import { useState, useEffect, useCallback, useMemo } from 'react';
import * as api from './api.js';
import { generarId } from './mock.js';
import type { ElementoCalendario, EventoCalendarioMC, VistaCalendario, TipoElementoCalendario } from './calendario-modelo.js';
import { rangoParaVista, hoyISO } from './calendario-modelo.js';

/**
 * Hook del Calendario (30/08/2026) — pide al servidor solo el rango visible
 * de la vista actual (mes/semana/día), no todo el histórico. Recarga sola
 * cada vez que cambia la vista, la fecha de referencia o el filtro de
 * tipos. Mismo patrón optimista que el resto de hooks de esta app para las
 * mutaciones (evento/recordatorio) — el resto de tipos son de solo lectura
 * desde aquí, se editan desde su propia sección (Notas, Tareas, Facturas).
 */
export function useCalendario(autenticado = true) {
  const [vista, setVista] = useState<VistaCalendario>('mes');
  const [fechaRef, setFechaRefState] = useState(() => new Date());
  const [tipos, setTipos] = useState<TipoElementoCalendario[] | undefined>(undefined);
  const [elementos, setElementos] = useState<ElementoCalendario[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const rango = useMemo(() => rangoParaVista(vista, fechaRef), [vista, fechaRef]);

  const cargar = useCallback(() => {
    setCargando(true);
    setError('');
    api.obtenerCalendario(rango.desde, rango.hasta, tipos)
      .then(setElementos)
      .catch(() => setError('No se pudo cargar el calendario.'))
      .finally(() => setCargando(false));
  }, [rango.desde, rango.hasta, tipos]);

  useEffect(() => {
    if (!autenticado) return;
    cargar();
  }, [autenticado, cargar]);

  const irA = (fecha: Date) => setFechaRefState(fecha);
  const irAHoy = () => setFechaRefState(new Date());

  const crearEventoCalendario = async (datos: Omit<EventoCalendarioMC, 'id' | 'creado' | 'actualizado'>): Promise<void> => {
    const ahora = new Date().toISOString();
    const nuevo: EventoCalendarioMC = { ...datos, id: generarId(), creado: ahora, actualizado: ahora };
    await api.guardarEventoCalendario(nuevo);
    cargar();
  };

  const guardarEventoExistente = async (evento: EventoCalendarioMC): Promise<void> => {
    await api.guardarEventoCalendario({ ...evento, actualizado: new Date().toISOString() });
    cargar();
  };

  const borrarEventoCalendario = async (id: string): Promise<void> => {
    await api.borrarEventoCalendario(id);
    cargar();
  };

  return {
    vista, establecerVista: setVista,
    fechaRef, irA, irAHoy,
    tipos, establecerTipos: setTipos,
    elementos, cargando, error, recargar: cargar,
    crearEventoCalendario, guardarEventoExistente, borrarEventoCalendario,
  };
}

/** Fecha de hoy en ISO — reexportado para que los componentes de vista no tengan que importar `calendario-modelo.js` solo para esto. */
export { hoyISO };
