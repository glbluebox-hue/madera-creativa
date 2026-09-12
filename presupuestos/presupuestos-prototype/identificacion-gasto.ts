import type { CategoriaFiscal } from './categoria-fiscal.js';
import type { Factura } from './types.js';

/**
 * Identificación del tipo de gasto (Fase 3C.3) — responde ÚNICAMENTE a "¿qué
 * tipo de gasto es, a partir de lo que dice la propia factura?", nunca a si
 * es deducible. Capa separada del motor de reglas (`motor-resolucion-fiscal.ts`):
 * esta pieza solo lee `proveedor`/`concepto`/`categoria` (texto libre) —
 * nunca `categoriaFiscal` ya existente (eso lo decide quien llama, con el
 * mismo criterio de no-sobrescritura que `aplicarSugerenciaCategoriaFiscal`),
 * ni `tipoImpuesto`/`regionFiscal`/`repepActivo`.
 *
 * Principio de no invención: si la evidencia de proveedor+concepto no es
 * suficiente, el resultado es `'por_clasificar'` con confianza
 * `'insuficiente'` — un proveedor generalista (ferretería/bricolaje de gran
 * superficie) SIN un concepto que lo confirme NUNCA se da por bueno solo
 * por el nombre del proveedor.
 */

/**
 * Hecho factual que el usuario debe confirmar antes de que el motor pueda
 * resolver automáticamente el tratamiento — nunca "¿es deducible?", siempre
 * un hecho verificable (auditoría 3C.3, apartados 6-8).
 */
export type HechoFiscalRequerido = 'vehiculoUsoExclusivo' | 'dispositivoUsoExclusivo' | 'gestoriaSoloActividad';

export type ResultadoIdentificacion = {
  /** `'por_clasificar'` si no hay evidencia suficiente — nunca se inventa una categoría. */
  categoriaFiscal: CategoriaFiscal;
  confianza: 'alta' | 'media' | 'insuficiente';
  /** Presente cuando la categoría identificada, tal como se ha detectado en ESTA factura, exige un hecho que el motor no puede saber por sí mismo. */
  hechoRequerido?: HechoFiscalRequerido;
};

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // quita acentos, para comparar "básica" == "basica"
}

function contieneAlguna(texto: string, palabras: string[]): boolean {
  return palabras.some((p) => texto.includes(p));
}

/**
 * Proveedores "monoproducto" — todo lo que factura este proveedor es, en la
 * práctica, siempre del mismo tipo de gasto, así que su sola presencia basta
 * (alta confianza) sin necesitar además una coincidencia de concepto.
 * Deliberadamente NO incluye comercios generalistas (Leroy Merlín, Media
 * Markt, Sagrera) — ahí el proveedor por sí solo no dice nada del tipo de
 * gasto real, hace falta el concepto (ver `identificarTipoGasto`).
 */
const PROVEEDOR_MONOPRODUCTO: { proveedorContiene: string[]; categoriaFiscal: CategoriaFiscal; hechoRequerido?: HechoFiscalRequerido }[] = [
  { proveedorContiene: ['maderas santana'], categoriaFiscal: 'materiales' },
  { proveedorContiene: ['pazrey herrajes', 'pazrey'], categoriaFiscal: 'materiales' },
  { proveedorContiene: ['justo leon ramos', 'justo león ramos'], categoriaFiscal: 'materiales' },
  { proveedorContiene: ['hooba'], categoriaFiscal: 'software' },
  { proveedorContiene: ['tenerife business partners'], categoriaFiscal: 'servicios_profesionales' },
  { proveedorContiene: ['parte automoviles', 'parte automóviles'], categoriaFiscal: 'vehiculo', hechoRequerido: 'vehiculoUsoExclusivo' },
  { proveedorContiene: ['pratiche auto'], categoriaFiscal: 'vehiculo', hechoRequerido: 'vehiculoUsoExclusivo' },
];

// Palabras de concepto — se usan siempre (con cualquier proveedor, incluido uno desconocido), y son las que
// permiten identificar el gasto en comercios generalistas donde el proveedor por sí solo no basta.
const CONCEPTO_VEHICULO = ['furgon', 'furgoneta', 'matricula', 'vehiculo', 'neumatico', 'itv', 'culata', 'carroceria'];
/** "Declaración de la renta" es la única frase que dispara la pregunta — "declaración" a secas no, para no atrapar "declaración censal" u otras gestiones de la actividad. */
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

export function identificarTipoGasto(f: Pick<Factura, 'proveedor' | 'concepto' | 'categoria'>): ResultadoIdentificacion {
  const proveedor = normalizar(f.proveedor ?? '');
  const concepto = normalizar(f.concepto ?? '');
  const categoriaLibre = normalizar(f.categoria ?? '');
  const texto = `${concepto} ${categoriaLibre}`;

  // El concepto de "declaración de la renta" es una excepción que debe ganar incluso a un
  // proveedor monoproducto de gestoría (Tenerife Business Partners): la MISMA gestoría puede
  // facturar tanto gestión pura de la actividad como la confección de la declaración personal,
  // y solo el concepto distingue una de otra — comprobarlo antes evita que el proveedor la tape.
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

  // Proveedor generalista (o desconocido) sin concepto suficiente — nunca se inventa.
  return { categoriaFiscal: 'por_clasificar', confianza: 'insuficiente' };
}
