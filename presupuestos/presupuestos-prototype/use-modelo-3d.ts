import { useState } from 'react';
import * as api from './api.js';
import type { Proyecto } from './types.js';
import { leerArchivoComoBase64 } from './archivos.js';
import { validarModelo3D } from './modelo-3d-archivo.js';
import { prepararSubidaModelo3D } from './subida-modelo-3d.js';

/**
 * Estado y acciones de "Diseño 3D" (30/08/2026) — separado en un hook
 * para poder incrustar el botón de subida y la tarjeta del modelo en
 * sitios distintos de la interfaz (cabecera de "Archivos del proyecto" y
 * la propia tarjeta), compartiendo el mismo estado.
 */
export function useModelo3D(proyectoId: string, onActualizarProyecto: (proyecto: Proyecto) => void) {
  const [subiendo, setSubiendo] = useState(false);
  const [desasociando, setDesasociando] = useState(false);
  const [error, setError] = useState('');

  const subirArchivo = async (file: File) => {
    setError('');
    const validacion = validarModelo3D(file);
    if (validacion.valido === false) { setError(validacion.motivo); return; }

    setSubiendo(true);
    try {
      const { nombreArchivo, blob } = await prepararSubidaModelo3D(file);
      const url = await leerArchivoComoBase64(blob);
      onActualizarProyecto(await api.subirModelo3DArchivo(proyectoId, { nombreArchivo, url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el modelo 3D.');
    } finally {
      setSubiendo(false);
    }
  };

  const eliminar = async () => {
    setDesasociando(true);
    setError('');
    try {
      onActualizarProyecto(await api.quitarModelo3D(proyectoId));
    } catch {
      setError('No se pudo eliminar el modelo — inténtalo de nuevo.');
    } finally {
      setDesasociando(false);
    }
  };

  return { subiendo, desasociando, error, subirArchivo, eliminar };
}
