import { useState, useEffect, useCallback } from 'react';
import * as api from './api.js';

/** "Mi perfil" — nombre para mostrar y foto, independientes del usuario/contraseña de acceso. */
export type Perfil = {
  /** Nombre para mostrar (barra lateral, saludo de Inicio). Vacío hasta que el usuario lo configura. */
  nombreMostrar: string;
  /** Foto de perfil en formato data URL (base64), o vacía si no hay ninguna. */
  foto: string;
};

const PERFIL_VACIO: Perfil = { nombreMostrar: '', foto: '' };

const CLAVE_CACHE_NOMBRE = 'mc_perfil_nombre_cache';

/**
 * Solo el nombre (no la foto, demasiado grande para localStorage) para
 * pintar la barra lateral al instante en la siguiente carga, mientras
 * `obtenerPerfil()` termina de resolver. Sin esto, `nombreParaMostrar` caía
 * al nombre de cuenta (usuario de login) durante ese hueco y luego saltaba
 * al nombre real configurado — un parpadeo visible en cada entrada a la app.
 */
function leerNombreCache(): string {
  try { return localStorage.getItem(CLAVE_CACHE_NOMBRE) ?? ''; } catch { return ''; }
}
function guardarNombreCache(nombre: string): void {
  try { localStorage.setItem(CLAVE_CACHE_NOMBRE, nombre); } catch { /* localStorage no disponible: sin caché, sin problema */ }
}

/**
 * Hook para leer y guardar "Mi perfil" — mismo patrón que `use-empresa.ts`.
 * @param autenticado Cuando es false no dispara la carga (evita peticiones
 * protegidas antes de tener sesión — mismo motivo que en `useEmpresa`).
 */
export function usePerfil(autenticado = false): {
  perfil: Perfil;
  /**
   * Guarda los cambios en el servidor y solo entonces actualiza el estado
   * local — antes se actualizaba el estado de inmediato y el guardado real
   * fallaba en silencio (`.catch(() => {})`), así que un error de red o del
   * servidor dejaba al usuario viendo su cambio "puesto" en la interfaz sin
   * que se hubiera guardado de verdad. Devuelve si tuvo éxito para que el
   * modal pueda avisar en vez de cerrarse como si nada.
   */
  actualizar: (cambios: Partial<Perfil>) => Promise<boolean>;
} {
  const [perfil, setPerfil] = useState<Perfil>(() => ({ ...PERFIL_VACIO, nombreMostrar: leerNombreCache() }));

  useEffect(() => {
    if (!autenticado) return;
    let activo = true;
    api.obtenerPerfil()
      .then((datos) => {
        if (!activo) return;
        setPerfil(datos);
        guardarNombreCache(datos.nombreMostrar);
      })
      .catch(() => { /* sin conexión: mantener valores por defecto (o los de caché) */ });
    return () => { activo = false; };
  }, [autenticado]);

  const actualizar = useCallback(async (cambios: Partial<Perfil>): Promise<boolean> => {
    const siguiente = { ...perfil, ...cambios };
    try {
      await api.guardarPerfil(siguiente);
      setPerfil(siguiente);
      guardarNombreCache(siguiente.nombreMostrar);
      return true;
    } catch {
      return false;
    }
  }, [perfil]);

  return { perfil, actualizar };
}
