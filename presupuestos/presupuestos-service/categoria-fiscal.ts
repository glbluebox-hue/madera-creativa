/**
 * Categorización fiscal de una factura de gasto (Fase 3C.1, puerto backend
 * Fase 3C.3) — responde ÚNICAMENTE a "¿qué tipo de gasto es?", nunca a
 * "¿es deducible?". Mismo contenido que `presupuestos-prototype/categoria-fiscal.ts`
 * (patrón de duplicación ya aceptado en este proyecto, ver `motor-fiscal.ts`)
 * — se necesita aquí porque, desde 3C.3, el motor de resolución fiscal se
 * ejecuta en el backend (`guardarFactura()`), no solo en el frontend.
 */

export type CategoriaFiscal =
  | 'materiales'
  | 'herramienta_pequena'
  | 'maquinaria_inversion'
  | 'mantenimiento'
  | 'vehiculo'
  | 'combustible'
  | 'seguros'
  | 'telefono_internet'
  | 'suministros_taller'
  | 'suministros_vivienda'
  | 'alquiler'
  | 'servicios_profesionales'
  | 'software'
  | 'publicidad'
  | 'formacion'
  | 'ropa_trabajo_epi'
  | 'comidas'
  | 'viajes'
  | 'alojamiento'
  | 'bancos'
  | 'material_oficina'
  | 'otros'
  | 'por_clasificar';

/** Las 22 categorías específicas + `por_clasificar` — mismo orden en TypeScript, Mongoose y Zod. */
export const CATEGORIAS_FISCALES: readonly CategoriaFiscal[] = [
  'materiales', 'herramienta_pequena', 'maquinaria_inversion', 'mantenimiento',
  'vehiculo', 'combustible', 'seguros', 'telefono_internet', 'suministros_taller',
  'suministros_vivienda', 'alquiler', 'servicios_profesionales', 'software',
  'publicidad', 'formacion', 'ropa_trabajo_epi', 'comidas', 'viajes',
  'alojamiento', 'bancos', 'material_oficina', 'otros', 'por_clasificar',
];

/** `true` si `valor` es uno de los 22 identificadores + `por_clasificar` — nunca acepta nada fuera del enum cerrado. */
export function esCategoriaFiscalValida(valor: unknown): valor is CategoriaFiscal {
  return typeof valor === 'string' && (CATEGORIAS_FISCALES as readonly string[]).includes(valor);
}

/**
 * Aplica una sugerencia de categoría (típicamente de la identificación
 * automática, Fase 3C.3) — mismo criterio que `sugerirTipoImpuesto` (Fase
 * 2.1): solo se aplica si no hay ya un valor; nunca sobrescribe una
 * decisión existente (de un intento anterior, o del usuario).
 */
export function aplicarSugerenciaCategoriaFiscal(actual: CategoriaFiscal | undefined, sugerida: unknown): CategoriaFiscal | undefined {
  if (actual) return actual;
  return esCategoriaFiscalValida(sugerida) ? sugerida : actual;
}
