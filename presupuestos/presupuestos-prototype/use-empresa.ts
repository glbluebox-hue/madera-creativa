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
  /** Teléfono mostrado en la cabecera de presupuestos con plantilla. */
  telefono: string;
  /** Email mostrado en la cabecera de presupuestos con plantilla. */
  email: string;
  /** IBAN mostrado en presupuestos con condiciones de pago. */
  iban: string;
  /** Condiciones de pago por defecto — se copian (y quedan congeladas) al crear un presupuesto en modo lienzo. */
  condicionesPagoDefecto: string;
  /** Validez en días por defecto — se copia (y queda congelada) al crear un presupuesto en modo lienzo. */
  validezDiasDefecto: number;
};

/** Datos por defecto para el admin — marca Madera Creativa. */
const EMPRESA_ADMIN: Empresa = {
  nombre: 'Madera Creativa',
  eslogan: 'Presupuestos y seguimiento de proyectos',
  logo: logoMadera,
  telefono: '671737663',
  email: 'Holamaderacreativa@gmail.com',
  iban: '',
  condicionesPagoDefecto: '60% al aceptar el presupuesto / 40% al finalizar el trabajo.',
  validezDiasDefecto: 30,
};

/** Datos vacíos para usuarios normales — cada uno pone su propia marca. */
const EMPRESA_USUARIO: Empresa = {
  nombre: '',
  eslogan: '',
  logo: null,
  telefono: '',
  email: '',
  iban: '',
  condicionesPagoDefecto: '60% al aceptar el presupuesto / 40% al finalizar el trabajo.',
  validezDiasDefecto: 30,
};

/**
 * Hook para leer y guardar los datos de empresa (nombre, eslogan, logo).
 * El admin ve Madera Creativa por defecto; los usuarios normales ven su propia marca.
 * @param autenticado Cuando es false no dispara la carga (evita peticiones
 * protegidas antes de tener sesión o antes de confirmar el access token
 * tras recargar la página — Dirección Creativa).
 * @param esAdmin Si el usuario autenticado es administrador.
 */
export function useEmpresa(autenticado = false, esAdmin = false): {
  empresa: Empresa;
  actualizar: (cambios: Partial<Empresa>) => void;
} {
  const inicial = esAdmin ? EMPRESA_ADMIN : EMPRESA_USUARIO;
  const [empresa, setEmpresa] = useState<Empresa>(inicial);

  useEffect(() => {
    if (!autenticado) return;
    let activo = true;
    api
      .obtenerEmpresa()
      .then((datos) => {
        if (!activo) return;
        setEmpresa({
          nombre: datos.nombre || inicial.nombre,
          eslogan: datos.eslogan || inicial.eslogan,
          logo: datos.logo || inicial.logo,
          telefono: datos.telefono || inicial.telefono,
          email: datos.email || inicial.email,
          iban: datos.iban || inicial.iban,
          condicionesPagoDefecto: datos.condicionesPagoDefecto || inicial.condicionesPagoDefecto,
          validezDiasDefecto: datos.validezDiasDefecto || inicial.validezDiasDefecto,
        });
      })
      .catch(() => { /* sin conexión: mantener valores por defecto */ });
    return () => { activo = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autenticado, esAdmin]);

  const actualizar = useCallback((cambios: Partial<Empresa>) => {
    setEmpresa((prev) => {
      const siguiente = { ...prev, ...cambios };
      api.guardarEmpresa(siguiente).catch(() => { /* noop */ });
      return siguiente;
    });
  }, []);

  return { empresa, actualizar };
}
