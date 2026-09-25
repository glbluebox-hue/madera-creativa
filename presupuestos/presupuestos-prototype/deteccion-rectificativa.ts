/**
 * Detección de posible factura rectificativa/devolución (Fase interfaz,
 * 25/09/2026) — mismo patrón que `identificacion-gasto.ts`: función pura,
 * sin `fetch` ni estado, que solo SUGIERE a partir de evidencias textuales
 * ya disponibles (lo que la IA ha extraído del documento: `concepto`,
 * `numeroFactura`, `importe`). Nunca decide por sí sola — el resultado es
 * siempre una sugerencia con su evidencia, y es la interfaz quien pide
 * confirmación explícita al usuario antes de marcar `naturaleza:'rectificativa'`.
 *
 * No se añade ningún campo nuevo a lo que la IA ya devuelve (Fase actual no
 * incluye ampliar el prompt de extracción) — se trabaja solo con lo que ya
 * existe en el flujo de `extraerConIA` (`escaner-factura.tsx`).
 */

export type EvidenciaRectificativa =
  | { tipo: 'palabra_clave'; detalle: string }
  | { tipo: 'importe_negativo'; detalle: string };

export type SugerenciaRectificativa = {
  /** true si hay al menos una evidencia — nunca implica certeza, solo que vale la pena preguntar. */
  sugerido: boolean;
  /** 'media' con al menos una palabra clave explícita; 'baja' si solo hay indicios indirectos (p. ej. solo importe negativo). */
  confianza: 'media' | 'baja';
  evidencias: EvidenciaRectificativa[];
};

/** Frases que, si aparecen en el concepto/descripción leído del documento, son indicio directo de una rectificativa/devolución — nunca decisivo por sí solo, ver comentario de arriba. */
const PALABRAS_CLAVE = [
  'factura rectificativa',
  'rectificativa',
  'abono',
  'nota de crédito',
  'nota de credito',
  'devolución',
  'devolucion',
  'factura original',
  'número de factura original',
  'numero de factura original',
];

/** Minúsculas y sin acentos, para comparar tolerando mayúsculas/tildes — mismo criterio que `normalizarNombre` de `identificacion-factura.ts`. */
function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Evalúa las evidencias disponibles de una factura recién extraída (o en
 * edición) y devuelve una sugerencia — SOLO sugerencia, ver comentario del
 * módulo. `importeExtraido` es el importe tal como lo ha leído la IA del
 * documento, ANTES de forzarlo a positivo en el formulario (si el propio
 * documento trae un importe en negativo, es un indicio real, aunque el
 * campo `Factura.importe` final siempre se guarde en positivo).
 */
export function detectarPosibleRectificativa(datos: {
  concepto?: string | null;
  numeroFactura?: string | null;
  importeExtraido?: number | null;
}): SugerenciaRectificativa {
  const evidencias: EvidenciaRectificativa[] = [];
  const texto = normalizarTexto(`${datos.concepto ?? ''} ${datos.numeroFactura ?? ''}`);

  for (const palabra of PALABRAS_CLAVE) {
    if (texto.includes(normalizarTexto(palabra))) {
      evidencias.push({ tipo: 'palabra_clave', detalle: palabra });
    }
  }
  if (typeof datos.importeExtraido === 'number' && datos.importeExtraido < 0) {
    evidencias.push({ tipo: 'importe_negativo', detalle: String(datos.importeExtraido) });
  }

  return {
    sugerido: evidencias.length > 0,
    confianza: evidencias.some((e) => e.tipo === 'palabra_clave') ? 'media' : 'baja',
    evidencias,
  };
}
