import { useState, useEffect, useCallback } from 'react';
import logoMadera from './assets/logo.png';
import cartelResenaMadera from './assets/cartel-resena.jpg';
import * as api from './api.js';
import type { TemaMC } from './documento-modelo.js';

/** Datos de marca / empresa configurables por el usuario. */
export type Empresa = {
  /** Nombre de la empresa mostrado en la cabecera. */
  nombre: string;
  /**
   * Nombre y apellidos del titular real de la actividad (autónomo) —
   * distinto del nombre comercial (`nombre`). Necesario para que la IA de
   * facturas reconozca al usuario como emisor en facturas de ingreso,
   * donde el documento suele llevar el nombre legal, no la marca.
   */
  titular: string;
  /** Eslogan o descripción corta. */
  eslogan: string;
  /** Logo en formato data URL (base64), o null si no hay logo. */
  logo: string | null;
  /** CIF/NIF de la propia empresa, para las facturas/presupuestos que ella emite — no confundir con el CIF/NIF de cada factura de gasto, que es del proveedor. */
  nifCif: string;
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
  /** Tema por defecto del Motor Documental (Incremento 3) — identidad corporativa; `null` hasta que se personalice. */
  temaPorDefecto: TemaMC | null;
  /** Región fiscal (Fase Facturas Profesional) — determina si el Trimestral calcula IGIC (Canarias) o IVA (Península). Vacío hasta que se configura. */
  regionFiscal: 'canarias' | 'peninsula' | '';
  /** REPEP activo (exención de IGIC por bajo volumen, solo relevante en Canarias) — decisión del usuario, nunca inferida. */
  repepActivo: boolean;
  /** Ancho en píxeles del logo en la barra lateral — ajustable a mano por el usuario (Ajustes de empresa). */
  logoTamano: number;
  /** Enlace de Google My Business — destino de "Pedir reseña". Vacío hasta que el negocio lo configura en Ajustes de empresa; sin él, ese botón no se ofrece. */
  enlaceResenaGoogle: string;
  /** Cartel de agradecimiento (imagen) mostrado antes del botón de reseña — opcional, mismo formato que `logo`. */
  imagenResena: string | null;
  /** Firma dibujada del titular (PNG data URL), reutilizada en todos los presupuestos con el elemento "Firma de la empresa" — null hasta que se dibuja una vez en Ajustes de empresa. */
  firmaEmpresa: string | null;
  /** Minutos de inactividad antes de cerrar sesión sola y volver al login — `null` = nunca (petición real, 25/08/2026). */
  tiempoInactividadMin: number | null;
  /** Margen objetivo (%) del negocio (Inteligencia de Precios, Fase 1) — `null` = sin configurar; nunca se asume un valor por defecto. */
  margenObjetivoPorcentaje: number | null;
};

/** Datos por defecto para el admin — marca Madera Creativa. */
const EMPRESA_ADMIN: Empresa = {
  nombre: 'Madera Creativa',
  // Vacío a propósito: el nombre y apellidos reales del titular no se
  // inventan ni se copian de ningún sitio — se rellena a mano en Ajustes
  // de empresa la primera vez que haga falta.
  titular: '',
  eslogan: 'Presupuestos y seguimiento de proyectos',
  logo: logoMadera,
  nifCif: '',
  telefono: '671737663',
  email: 'Holamaderacreativa@gmail.com',
  iban: '',
  condicionesPagoDefecto: '60% al aceptar el presupuesto / 40% al finalizar el trabajo.',
  validezDiasDefecto: 30,
  temaPorDefecto: null,
  // Cuenta real de Madera Creativa: Canarias con REPEP activo (confirmado
  // por el usuario 11/08/2026) — ver auditoría fiscal de la Fase Facturas
  // Profesional.
  regionFiscal: 'canarias',
  repepActivo: true,
  logoTamano: 187,
  enlaceResenaGoogle: 'https://g.page/r/CdtYE6HZ9ap5EBM/review',
  imagenResena: cartelResenaMadera,
  firmaEmpresa: null,
  tiempoInactividadMin: null,
  margenObjetivoPorcentaje: null,
};

/** Datos vacíos para usuarios normales — cada uno pone su propia marca. */
const EMPRESA_USUARIO: Empresa = {
  nombre: '',
  titular: '',
  eslogan: '',
  logo: null,
  nifCif: '',
  telefono: '',
  email: '',
  iban: '',
  condicionesPagoDefecto: '60% al aceptar el presupuesto / 40% al finalizar el trabajo.',
  validezDiasDefecto: 30,
  temaPorDefecto: null,
  // Sin configurar por defecto — cada negocio debe elegir su región fiscal
  // explícitamente antes de que el Trimestral calcule ningún impuesto
  // indirecto (nunca se asume Canarias/Península por defecto).
  regionFiscal: '',
  repepActivo: false,
  logoTamano: 187,
  enlaceResenaGoogle: '',
  imagenResena: null,
  firmaEmpresa: null,
  tiempoInactividadMin: null,
  margenObjetivoPorcentaje: null,
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
  /**
   * `true` mientras todavía no se sabe si hay un logo/tamaño propios
   * guardados en el servidor. Para el admin, `empresa` empieza con el logo
   * de Madera Creativa por defecto (`EMPRESA_ADMIN.logo`) — sin esta
   * bandera, ese logo por defecto se pintaba de inmediato y, en cuanto
   * respondía `/empresa` (normalmente en menos de un segundo, pero
   * perceptible), se sustituía por el logo propio del negocio con su
   * tamaño real: un parpadeo de "logo equivocado" en cada carga, reportado
   * varias veces (18/08/2026) y confundido al principio con un problema de
   * service worker o de compresión de imagen — el verdadero origen era
   * este optimistic-render con datos por defecto que no eran los reales.
   */
  cargando: boolean;
  /**
   * Guarda los cambios en el servidor y solo entonces actualiza el estado
   * local — antes se actualizaba de inmediato y el guardado real fallaba en
   * silencio (`.catch(() => {})`), mismo fallo ya diagnosticado y corregido
   * en `use-perfil.ts` pero nunca replicado aquí: un fallo de red/sesión al
   * cambiar `regionFiscal`/`repepActivo` dejaba el modal cerrado como si se
   * hubiera guardado, con el Trimestral calculando impuestos con la
   * configuración fiscal antigua sin que nadie se enterase. Devuelve si
   * tuvo éxito para que el modal pueda avisar en vez de cerrarse como si nada.
   */
  actualizar: (cambios: Partial<Empresa>) => Promise<boolean>;
} {
  const inicial = esAdmin ? EMPRESA_ADMIN : EMPRESA_USUARIO;
  const [empresa, setEmpresa] = useState<Empresa>(inicial);
  const [cargando, setCargando] = useState(autenticado);

  useEffect(() => {
    if (!autenticado) { setCargando(false); return; }
    let activo = true;
    setCargando(true);
    api
      .obtenerEmpresa()
      .then((datos) => {
        if (!activo) return;
        setEmpresa({
          nombre: datos.nombre || inicial.nombre,
          titular: datos.titular || inicial.titular,
          eslogan: datos.eslogan || inicial.eslogan,
          logo: datos.logo || inicial.logo,
          nifCif: datos.nifCif || inicial.nifCif,
          telefono: datos.telefono || inicial.telefono,
          email: datos.email || inicial.email,
          iban: datos.iban || inicial.iban,
          condicionesPagoDefecto: datos.condicionesPagoDefecto || inicial.condicionesPagoDefecto,
          validezDiasDefecto: datos.validezDiasDefecto ?? inicial.validezDiasDefecto,
          temaPorDefecto: datos.temaPorDefecto ?? null,
          regionFiscal: datos.regionFiscal ?? inicial.regionFiscal,
          repepActivo: datos.repepActivo ?? inicial.repepActivo,
          logoTamano: datos.logoTamano ?? inicial.logoTamano,
          enlaceResenaGoogle: datos.enlaceResenaGoogle || inicial.enlaceResenaGoogle,
          imagenResena: datos.imagenResena || inicial.imagenResena,
          firmaEmpresa: datos.firmaEmpresa || inicial.firmaEmpresa,
          tiempoInactividadMin: datos.tiempoInactividadMin ?? inicial.tiempoInactividadMin,
          margenObjetivoPorcentaje: datos.margenObjetivoPorcentaje ?? inicial.margenObjetivoPorcentaje,
        });
      })
      .catch(() => { /* sin conexión: mantener valores por defecto */ })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autenticado, esAdmin]);

  const actualizar = useCallback(async (cambios: Partial<Empresa>): Promise<boolean> => {
    const siguiente = { ...empresa, ...cambios };
    try {
      await api.guardarEmpresa(siguiente);
      setEmpresa(siguiente);
      return true;
    } catch {
      return false;
    }
  }, [empresa]);

  return { empresa, cargando, actualizar };
}
