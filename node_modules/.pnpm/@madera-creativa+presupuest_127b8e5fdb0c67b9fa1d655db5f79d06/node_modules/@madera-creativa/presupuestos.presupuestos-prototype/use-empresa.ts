import { useState, useEffect, useCallback } from 'react';
import logoMadera from './assets/logo.png';
import * as api from './api.js';

/** Datos de marca / empresa configurables por el usuario. */
export type Empresa = {
  /** Nombre de la empresa mostrado en la cabecera. */
  nombre: string;
  /** Eslogan o descripción corta. */
  eslogan: string;
  /** Logo en formato data URL (base64), o null si no hay logo. */
  logo: string | null;
};

/** Datos por defecto para el admin — marca Madera Creativa. */
const EMPRESA_ADMIN: Empresa = {
  nombre: 'Madera Creativa',
  eslogan: 'Presupuestos y seguimiento de proyectos',
  logo: logoMadera,
};

/** Datos vacíos para usuarios normales — cada uno pone su propia marca. */
const EMPRESA_USUARIO: Empresa = {
  nombre: '',
  eslogan: '',
  logo: null,
};

/**
 * Hook para leer y guardar los datos de empresa (nombre, eslogan, logo).
 * El admin ve Madera Creativa por defecto; los usuarios normales ven su propia marca.
 * @param esAdmin Si el usuario autenticado es administrador.
 */
export function useEmpresa(esAdmin = false): {
  empresa: Empresa;
  actualizar: (cambios: Partial<Empresa>) => void;
} {
  const inicial = esAdmin ? EMPRESA_ADMIN : EMPRESA_USUARIO;
  const [empresa, setEmpresa] = useState<Empresa>(inicial);

  useEffect(() => {
    let activo = true;
    api
      .obtenerEmpresa()
      .then((datos) => {
        if (!activo) return;
        setEmpresa({
          nombre: datos.nombre || inicial.nombre,
          eslogan: datos.eslogan || inicial.eslogan,
          logo: datos.logo || inicial.logo,
        });
      })
      .catch(() => { /* sin conexión: mantener valores por defecto */ });
    return () => { activo = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAdmin]);

  const actualizar = useCallback((cambios: Partial<Empresa>) => {
    setEmpresa((prev) => {
      const siguiente = { ...prev, ...cambios };
      api.guardarEmpresa(siguiente).catch(() => { /* noop */ });
      return siguiente;
    });
  }, []);

  return { empresa, actualizar };
}
