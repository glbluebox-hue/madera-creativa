import type { CategoriaFiscal } from './categoria-fiscal.js';

/**
 * Identificación del tipo de gasto (Fase 3C.3, puerto backend) — mismo
 * contenido que `presupuestos-prototype/identificacion-gasto.ts` (patrón de
 * duplicación ya aceptado en este proyecto). Responde ÚNICAMENTE a "¿qué
 * tipo de gasto es, a partir de lo que dice la propia factura?", nunca a si
 * es deducible — solo lee `proveedor`/`concepto`/`categoria` (texto libre).
 *
 * Principio de no invención: si la evidencia de proveedor+concepto no es
 * suficiente, el resultado es `'por_clasificar'` con confianza
 * `'insuficiente'` — un proveedor generalista SIN un concepto que lo
 * confirme NUNCA se da por bueno solo por el nombre del proveedor.
 */

type FacturaIdentificable = { proveedor?: string; concepto?: string; categoria?: string };

export type HechoFiscalRequerido = 'vehiculoUsoExclusivo' | 'dispositivoUsoExclusivo' | 'gestoriaSoloActividad';

export type ResultadoIdentificacion = {
  categoriaFiscal: CategoriaFiscal;
  confianza: 'alta' | 'media' | 'insuficiente';
  hechoRequerido?: HechoFiscalRequerido;
};

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function contieneAlguna(texto: string, palabras: string[]): boolean {
  return palabras.some((p) => texto.includes(p));
}

const PROVEEDOR_MONOPRODUCTO: { proveedorContiene: string[]; categoriaFiscal: CategoriaFiscal; hechoRequerido?: HechoFiscalRequerido }[] = [
  { proveedorContiene: ['maderas santana'], categoriaFiscal: 'materiales' },
  { proveedorContiene: ['pazrey herrajes', 'pazrey'], categoriaFiscal: 'materiales' },
  { proveedorContiene: ['justo leon ramos', 'justo león ramos'], categoriaFiscal: 'materiales' },
  { proveedorContiene: ['hooba'], categoriaFiscal: 'software' },
  { proveedorContiene: ['tenerife business partners'], categoriaFiscal: 'servicios_profesionales' },
  { proveedorContiene: ['parte automoviles', 'parte automóviles'], categoriaFiscal: 'vehiculo', hechoRequerido: 'vehiculoUsoExclusivo' },
  { proveedorContiene: ['pratiche auto'], categoriaFiscal: 'vehiculo', hechoRequerido: 'vehiculoUsoExclusivo' },
];

const CONCEPTO_VEHICULO = ['furgon', 'furgoneta', 'matricula', 'vehiculo', 'neumatico', 'itv', 'culata', 'carroceria'];
const CONCEPTO_DECLARACION_PERSONAL = ['declaracion de la renta', 'declaracion renta'];
const CONCEPTO_GESTORIA_ACTIVIDAD = ['trimestral', 'resumen anual', 'gestoria', 'asesoria', 'modelo 130', 'modelo 303', 'contabilidad'];
const CONCEPTO_DISPOSITIVO = ['tablet', 'portatil', 'movil', 'ordenador', 'laptop', 'telefono movil', 'smartphone'];
const CONCEPTO_SOFTWARE = ['facturacion', 'licencia', 'suscripcion', 'software'];
const CONCEPTO_HERRAMIENTA = ['formon', 'sierra', 'taladro', 'broca', 'destornillador', 'martillo', 'lija', 'herramienta'];
const CONCEPTO_MATERIALES = [
  'tablero', 'tablon', 'madera', 'tornill', 'bisagra', 'herraje', 'tirador', 'perfil', 'canto',
  'grapa', 'embel', 'pernio', 'mdf', 'aglomerado', 'contrachapado', 'liston', 'tapacanto',
];
const CONCEPTO_PUBLICIDAD = ['publicidad', 'logo', 'promocion', 'merchandising'];
const CONCEPTO_OFICINA_CONSUMIBLE = ['papel', 'tinta', 'toner', 'folios', 'papeleria'];

export function identificarTipoGasto(f: FacturaIdentificable): ResultadoIdentificacion {
  const proveedor = normalizar(f.proveedor ?? '');
  const concepto = normalizar(f.concepto ?? '');
  const categoriaLibre = normalizar(f.categoria ?? '');
  const texto = `${concepto} ${categoriaLibre}`;

  if (contieneAlguna(texto, CONCEPTO_DECLARACION_PERSONAL)) {
    return { categoriaFiscal: 'servicios_profesionales', confianza: 'alta', hechoRequerido: 'gestoriaSoloActividad' };
  }
  if (contieneAlguna(texto, CONCEPTO_VEHICULO)) {
    return { categoriaFiscal: 'vehiculo', confianza: 'alta', hechoRequerido: 'vehiculoUsoExclusivo' };
  }

  for (const regla of PROVEEDOR_MONOPRODUCTO) {
    if (contieneAlguna(proveedor, regla.proveedorContiene)) {
      return { categoriaFiscal: regla.categoriaFiscal, confianza: 'alta', hechoRequerido: regla.hechoRequerido };
    }
  }

  if (contieneAlguna(texto, CONCEPTO_GESTORIA_ACTIVIDAD)) {
    return { categoriaFiscal: 'servicios_profesionales', confianza: 'alta' };
  }
  if (contieneAlguna(texto, CONCEPTO_DISPOSITIVO)) {
    return { categoriaFiscal: 'material_oficina', confianza: 'alta', hechoRequerido: 'dispositivoUsoExclusivo' };
  }
  if (contieneAlguna(texto, CONCEPTO_SOFTWARE)) {
    return { categoriaFiscal: 'software', confianza: 'alta' };
  }
  if (contieneAlguna(texto, CONCEPTO_HERRAMIENTA)) {
    return { categoriaFiscal: 'herramienta_pequena', confianza: 'alta' };
  }
  if (contieneAlguna(texto, CONCEPTO_MATERIALES)) {
    return { categoriaFiscal: 'materiales', confianza: 'alta' };
  }
  if (contieneAlguna(texto, CONCEPTO_PUBLICIDAD)) {
    return { categoriaFiscal: 'publicidad', confianza: 'media' };
  }
  if (contieneAlguna(texto, CONCEPTO_OFICINA_CONSUMIBLE)) {
    return { categoriaFiscal: 'material_oficina', confianza: 'alta' };
  }

  return { categoriaFiscal: 'por_clasificar', confianza: 'insuficiente' };
}
