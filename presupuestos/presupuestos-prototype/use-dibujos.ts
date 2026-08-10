import { useState, useEffect, useCallback } from 'react';
import type { Dibujo } from './types.js';
import * as api from './api.js';

/** Filtro de qué dibujos cargar — ver `listarDibujos` para el significado exacto de cada campo. */
export type FiltroDibujos = { clienteId?: string; carpetaId?: string; temporales?: boolean };

/** Estado y operaciones sobre la colección de dibujos. */
export type UseDibujos = {
  dibujos: Dibujo[];
  cargando: boolean;
  error: string | null;
  recargar: () => void;
  guardar: (d: Dibujo) => Promise<Dibujo>;
  borrar: (id: string) => Promise<void>;
  duplicar: (id: string) => Promise<Dibujo>;
};

/**
 * Hook que gestiona los dibujos del módulo profesional de dibujo (Fase 2.1),
 * opcionalmente acotados a un cliente y/o carpeta concretos (ficha de
 * cliente > apartado "Dibujos") o a la bandeja de temporales (sin cliente).
 * Sin paginación: el volumen de dibujos de un negocio pequeño está acotado
 * por diseño, igual que otras listas sin paginar de la app
 * (`listarFacturasDeCliente`, `listarFacturasPorAnio`).
 * @param autenticado Cuando es false no dispara ninguna carga (evita
 * peticiones protegidas antes de confirmar el access token — Dirección
 * Creativa, mismo motivo que en `useClientes`/`useFacturas`).
 * @param filtro Qué subconjunto de dibujos cargar.
 */
export function useDibujos(autenticado = true, filtro?: FiltroDibujos): UseDibujos {
  const [dibujos, setDibujos] = useState<Dibujo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    if (!autenticado) return;
    setCargando(true);
    api
      .listarDibujos(filtro)
      .then(setDibujos)
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  }, [autenticado, filtro?.clienteId, filtro?.carpetaId, filtro?.temporales]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = useCallback(async (d: Dibujo) => {
    const guardado = await api.guardarDibujo(d);
    // La versión ligera de la lista no lleva `contenido` (vectorial pesado) —
    // mismo motivo que `listarDibujos` no lo pide en el servidor.
    const { contenido: _contenido, ...ligero } = guardado;
    // El guardado puede sacar al dibujo de este subconjunto (p. ej. se le
    // asigna cliente desde la bandeja de temporales, o se mueve a otra
    // carpeta) — sin esta comprobación se quedaría visible en una lista a
    // la que ya no pertenece hasta recargar la página.
    const sigueCoincidiendo =
      (filtro?.temporales ? ligero.clienteId === '' : true) &&
      (filtro?.clienteId === undefined || ligero.clienteId === filtro.clienteId) &&
      (filtro?.carpetaId === undefined || ligero.carpetaId === filtro.carpetaId);
    setDibujos((prev) => {
      const existe = prev.find((x) => x.id === guardado.id);
      if (!sigueCoincidiendo) return existe ? prev.filter((x) => x.id !== guardado.id) : prev;
      return existe ? prev.map((x) => (x.id === guardado.id ? ligero : x)) : [ligero, ...prev];
    });
    return guardado;
  }, [filtro?.clienteId, filtro?.carpetaId, filtro?.temporales]);

  const borrar = useCallback(async (id: string) => {
    setDibujos((prev) => prev.filter((d) => d.id !== id));
    await api.borrarDibujo(id);
  }, []);

  const duplicar = useCallback(async (id: string) => {
    const copia = await api.duplicarDibujo(id);
    const { contenido: _contenido, ...ligero } = copia;
    setDibujos((prev) => [ligero, ...prev]);
    return copia;
  }, []);

  return { dibujos, cargando, error, recargar: cargar, guardar, borrar, duplicar };
}
