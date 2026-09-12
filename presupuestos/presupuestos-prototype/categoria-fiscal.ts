/**
 * Categorización fiscal de una factura de gasto (Fase 3C.1) — responde
 * ÚNICAMENTE a "¿qué tipo de gasto es?", nunca a "¿es deducible?", "¿qué
 * porcentaje?", "¿tiene IVA o IGIC?", "¿está en REPEP?" ni "¿Canarias o
 * Península?". Esas decisiones pertenecen al futuro motor de reglas
 * fiscales, que consumirá `categoriaFiscal` junto con el contexto fiscal
 * de la empresa — esta pieza no decide ningún tratamiento, solo clasifica
 * qué es el gasto. Por eso ninguna función de aquí acepta `regionFiscal`,
 * `repepActivo` ni `tipoImpuesto` como parámetro.
 *
 * Los tres estados de "no resuelto" son deliberadamente distintos (mismo
 * principio que `null` vs `0` en `cuotaRealDeFactura`, o `'por_revisar'`
 * vs `'no_aplica'` en `estadoDeducibleIrpf`, Fase 2/3A):
 * - ausente (`undefined`) = nunca se ha intentado clasificar — todo el
 *   histórico anterior a esta fase, o una factura nueva sin analizar.
 * - `'por_clasificar'` = se analizó y no se pudo determinar con confianza
 *   suficiente — un "hemos mirado y no está claro", nunca un vacío
 *   accidental.
 * - `'otros'` = se sabe qué es el gasto, simplemente no encaja en ninguna
 *   categoría específica — una clasificación positiva, no una rendición.
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

/**
 * Etiqueta visible para el usuario — el nombre técnico (`categoriaFiscal`,
 * `vehiculo`, `por_clasificar`...) no se muestra nunca en la interfaz.
 * Mismo patrón que `ETIQUETA_ALCANCE`/`ETIQUETA_CALIDAD`
 * (`referencias-mercado-vista.tsx`).
 */
export const ETIQUETA_CATEGORIA_FISCAL: Record<CategoriaFiscal, string> = {
  materiales: 'Materiales',
  herramienta_pequena: 'Herramienta',
  maquinaria_inversion: 'Maquinaria',
  mantenimiento: 'Mantenimiento y reparaciones',
  vehiculo: 'Vehículo',
  combustible: 'Combustible',
  seguros: 'Seguros',
  telefono_internet: 'Teléfono e internet',
  suministros_taller: 'Suministros del taller',
  suministros_vivienda: 'Suministros (taller en casa)',
  alquiler: 'Alquiler',
  servicios_profesionales: 'Gestoría y profesionales',
  software: 'Software',
  publicidad: 'Publicidad',
  formacion: 'Formación',
  ropa_trabajo_epi: 'Ropa de trabajo',
  comidas: 'Dietas',
  viajes: 'Viajes',
  alojamiento: 'Alojamiento',
  bancos: 'Comisiones bancarias',
  material_oficina: 'Material de oficina',
  otros: 'Otro gasto',
  por_clasificar: 'Por clasificar',
};

/** `true` si `valor` es uno de los 22 identificadores + `por_clasificar` — nunca acepta nada fuera del enum cerrado. */
export function esCategoriaFiscalValida(valor: unknown): valor is CategoriaFiscal {
  return typeof valor === 'string' && (CATEGORIAS_FISCALES as readonly string[]).includes(valor);
}

/**
 * Aplica una sugerencia de categoría (típicamente de la IA) — mismo
 * criterio que `sugerirTipoImpuesto`/`tipoImpuestoSugerido` (Fase 2.1):
 * solo se aplica si no hay ya un valor; nunca sobrescribe una decisión
 * existente (de un intento anterior de la IA, o del usuario). Sin
 * heurística de palabras clave — la única fuente de sugerencia es lo que
 * ya haya determinado quien llama a esta función.
 */
export function aplicarSugerenciaCategoriaFiscal(actual: CategoriaFiscal | undefined, sugerida: unknown): CategoriaFiscal | undefined {
  if (actual) return actual;
  return esCategoriaFiscalValida(sugerida) ? sugerida : actual;
}
