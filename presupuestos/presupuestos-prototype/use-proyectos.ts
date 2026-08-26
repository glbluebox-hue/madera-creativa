import { useState, useEffect, useCallback } from 'react';
import type { Proyecto } from './types.js';
import * as api from './api.js';
import type { ProyectoResumen } from './api.js';

/** Estado de carga y operaciones sobre la lista de proyectos. */
export type UseProyectos = {
  proyectos: ProyectoResumen[];
  cargando: boolean;
  error: string | null;
  /** Reemplaza en la lista local un proyecto ya guardado en el servidor. Rechaza si el guardado falla — quien llama debe avisar al usuario, no asumir que se guardó. */
  actualizar: (proyecto: Proyecto) => Promise<void>;
  /** Cambia la fecha de montaje/medición de un proyecto (recordatorio del dashboard) — pide el proyecto completo, lo actualiza y refresca la lista. */
  actualizarRecordatorio: (proyectoId: string, cambios: { fechaMontaje?: string; fechaMedicion?: string }) => Promise<void>;
  borrar: (id: string) => Promise<void>;
  cargar: () => void;
  /** Añade un proyecto recién creado a la lista local sin volver a pedirla entera. */
  agregarLocal: (proyecto: Proyecto & { nombreCliente: string }) => void;
};

/**
 * Hook que gestiona la lista de proyectos con persistencia en el
 * servidor — incremento "Cliente ≠ Proyecto" (20/08/2026), sustituye al
 * antiguo `useClientes`. Sin paginación (a diferencia del antiguo hook):
 * el resumen ya es ligero (sin fotos/adjuntos/dibujos/movimientos), mismo
 * criterio que ya usaba `/clientes/resumen` para `SeccionPresupuestos`.
 * @param autenticado Cuando es false no dispara la carga inicial.
 */
export function useProyectos(autenticado = true): UseProyectos {
  const [proyectos, setProyectos] = useState<ProyectoResumen[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    api
      .obtenerResumenProyectos()
      .then((datos) => { setProyectos(datos); setError(null); })
      .catch((e) => {
        // 401 = token inválido (sesión antigua con token de admin)
        // Forzar pantalla vacía sin exponer datos ajenos
        if (String(e).includes('401') || String(e).includes('autori')) {
          setProyectos([]);
        } else {
          setError(String(e));
        }
      })
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (!autenticado) return;
    cargar();
  }, [autenticado, cargar]);

  const actualizar = useCallback(async (proyecto: Proyecto) => {
    setProyectos((prev) => prev.map((p) => (p.id === proyecto.id ? { ...p, proyecto: proyecto.proyecto, estado: proyecto.estado, presupuesto: proyecto.presupuesto } : p)));
    try {
      await api.guardarProyecto(proyecto);
    } catch (e) {
      // El guardado falló: revertimos el cambio optimista recargando el
      // estado real del servidor, en vez de dejar en pantalla una edición
      // que el usuario cree guardada pero que nunca llegó a persistirse.
      // Relanzamos el error — bug real, 26/08/2026: antes se tragaba aquí
      // y quien llamaba (p. ej. subir fotos) nunca se enteraba del fallo,
      // así que el usuario veía la foto en pantalla como si se hubiera
      // guardado y solo descubría que no al volver a abrir el proyecto.
      cargar();
      throw e;
    }
  }, [cargar]);

  const actualizarRecordatorio = useCallback(async (proyectoId: string, cambios: { fechaMontaje?: string; fechaMedicion?: string }) => {
    const fresco = await api.obtenerProyecto(proyectoId);
    await api.guardarProyecto({ ...fresco, ...cambios });
    cargar();
  }, [cargar]);

  const borrar = useCallback(async (id: string) => {
    setProyectos((prev) => prev.filter((p) => p.id !== id));
    await api.borrarProyecto(id);
  }, []);

  const agregarLocal = useCallback((proyecto: Proyecto & { nombreCliente: string }) => {
    setProyectos((prev) => [
      { id: proyecto.id, clienteId: proyecto.clienteId, nombre: proyecto.nombreCliente, proyecto: proyecto.proyecto, estado: proyecto.estado, presupuesto: proyecto.presupuesto, creado: proyecto.creado },
      ...prev,
    ]);
  }, []);

  return { proyectos, cargando, error, actualizar, actualizarRecordatorio, borrar, cargar, agregarLocal };
}
