import { UMBRAL_MINIMO_TRABAJOS, dispersionBaja } from './metricas-por-tipo.js';

/**
 * Mercado local (Fase 2F "Consenso de Precio", ampliada en "Ficha
 * Comparable", 29/08/2026) — función pura, determinista, sin IA ni
 * llamada a red: resuelve qué referencias de mercado (introducidas a mano
 * por el usuario, ver `referencias-mercado-vista.tsx`) aplican a un tipo
 * de trabajo, escalando SIEMPRE en el orden local → regional → nacional,
 * y solo cuando el nivel más cercano no tiene ninguna referencia.
 *
 * La isla tiene prioridad sobre la provincia como nivel "local" — una
 * provincia canaria agrupa varias islas con mercados de instalación
 * físicamente distintos (ver "Brújula de Mercado").
 *
 * Ampliación "Ficha Comparable": ya no basta con que dos referencias
 * compartan tipo de trabajo y zona — deben compartir también ALCANCE y
 * UNIDAD antes de combinarse en un mismo rango (ver auditoría "Filtro de
 * Mercado": mezclar "cocina solo mobiliario" con "cocina reforma
 * integral" duplicaba el precio aparente). Nunca se convierte
 * automáticamente entre alcances, unidades ni impuestos.
 */

export type NivelGeografico = 'local' | 'regional' | 'nacional';

/** Alcance real del trabajo — la dimensión que la auditoría demostró imprescindible para no comparar cosas distintas bajo el mismo nombre. */
export type AlcanceTrabajo = 'solo_mobiliario' | 'mobiliario_encimera' | 'reforma_completa';

export type NivelCalidad = 'economico' | 'estandar' | 'alto';

export type UnidadPrecio = 'total' | 'm2' | 'metro_lineal' | 'unidad';

/** Un precio "desde" nunca se trata como rango completo ni como techo de mercado (autorización, punto 5). */
export type TipoPrecioReferencia = 'publicado' | 'medio' | 'desde' | 'indice_oficial';

/** Único valor posible hoy — declarado explícito para no tener que migrar de nuevo el día que exista un origen distinto de "manual" (ver "Ficha Comparable", sección B). */
export type OrigenReferencia = 'manual';

/** Solo hay un nivel de confianza 'alta' reservado para un origen distinto de 'manual' (fuente oficial con metodología pública) — no implementado todavía. Mientras el origen sea 'manual', el techo real es 'media'. */
export type NivelConfianzaMercado = 'alta' | 'media' | 'baja';

export type ReferenciaMercado = {
  id: string;
  tipoTrabajo: string;
  nivelGeografico: NivelGeografico;
  /** Debe coincidir EXACTAMENTE con el campo de ubicación de la Empresa al que corresponde (isla/provincia para 'local', comunidadAutonoma para 'regional', 'España' para 'nacional'). */
  zona: string;
  precioMin: number;
  precioMax: number;
  fuente: string;
  fecha: string;
  creado: string;
  alcance: AlcanceTrabajo;
  obraIncluida: boolean;
  /** `null` = no aplica o desconocido (solo tiene sentido declarado para cocinas) — nunca se asume `false` por defecto. */
  electrodomesticosIncluidos: boolean | null;
  /** `null` = desconocido — nunca se asume "estándar" por defecto. */
  nivelCalidad: NivelCalidad | null;
  tamano: number | null;
  unidad: UnidadPrecio;
  /** `false` = no se sabe si el precio incluye IGIC/IVA — nunca se adivina la tasa. */
  impuestosConocidos: boolean;
  tipoPrecio: TipoPrecioReferencia;
  origen: OrigenReferencia;
};

export type UbicacionEmpresa = {
  comunidadAutonoma: string;
  provincia: string;
  isla: string;
};

export type ResultadoMercadoLocal =
  | {
      disponible: true;
      nivelUsado: NivelGeografico;
      zona: string;
      /** Alcance/unidad del grupo realmente combinado — transparencia de qué se está mostrando. */
      alcance: AlcanceTrabajo;
      unidad: UnidadPrecio;
      precioMin: number;
      precioMax: number;
      numReferencias: number;
      confianza: NivelConfianzaMercado;
      fuentes: string[];
      /** Referencias del mismo tipo/nivel/zona que NO se combinaron por no compartir alcance/unidad — nunca entran en el cálculo, pero se muestran (autorización, punto 10), nunca desaparecen en silencio. */
      referenciasNoComparables: ReferenciaMercado[];
    }
  | { disponible: false };

/** Mismo umbral que ya usa el Histórico Inteligente (Fase 2D) para "histórico suficiente" — reutilizado tal cual. */
const UMBRAL_MINIMO_REFERENCIAS = UMBRAL_MINIMO_TRABAJOS;

/** El nivel "local" de una empresa — la isla manda si existe, si no la provincia. `null` si la empresa no ha configurado ninguna de las dos. */
export function resolverZonaLocal(ubicacion: UbicacionEmpresa): string | null {
  if (ubicacion.isla) return ubicacion.isla;
  if (ubicacion.provincia) return ubicacion.provincia;
  return null;
}

/**
 * Dos referencias son comparables cuando comparten tipo de trabajo,
 * alcance y unidad — exactamente las tres condiciones de la autorización
 * (punto 3). Nunca fuzzy matching, nunca conversión automática entre
 * alcances o unidades.
 */
export function sonComparables(a: ReferenciaMercado, b: ReferenciaMercado): boolean {
  return a.tipoTrabajo === b.tipoTrabajo && a.alcance === b.alcance && a.unidad === b.unidad;
}

/**
 * Como no existe (todavía) un alcance/unidad declarado para el trabajo
 * que se está presupuestando, la comparabilidad se aplica ENTRE las
 * propias referencias candidatas: se toma la más reciente como ancla y
 * solo se combinan las que comparten alcance y unidad con ella — nunca
 * se mezclan grupos distintos en un mismo rango (autorización, punto 3 y
 * 10). Las que no encajan no desaparecen: se devuelven aparte.
 */
function agruparPorComparabilidad(candidatas: ReferenciaMercado[]): { comparables: ReferenciaMercado[]; noComparables: ReferenciaMercado[] } {
  const ancla = [...candidatas].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const comparables = candidatas.filter((r) => sonComparables(r, ancla));
  const noComparables = candidatas.filter((r) => !sonComparables(r, ancla));
  return { comparables, noComparables };
}

/**
 * Combina el precio de un grupo ya comparable. Un precio "desde" nunca
 * define el techo del rango (autorización, punto 5): aporta a un posible
 * mínimo observado, pero su propio `precioMax` se ignora al calcular el
 * máximo del grupo. Si TODAS las referencias del grupo son "desde", el
 * máximo conocido es el propio mínimo — nunca se inventa un techo mayor.
 */
function combinar(refs: ReferenciaMercado[]): { precioMin: number; precioMax: number; fuentes: string[] } {
  const precioMin = Math.min(...refs.map((r) => r.precioMin));
  const conTecho = refs.filter((r) => r.tipoPrecio !== 'desde');
  const precioMax = conTecho.length > 0 ? Math.max(...conTecho.map((r) => r.precioMax)) : precioMin;
  const fuentes = [...new Set(refs.map((r) => r.fuente).filter(Boolean))];
  return { precioMin, precioMax, fuentes };
}

const RANGO_CONFIANZA_MERCADO: Record<NivelConfianzaMercado, number> = { baja: 0, media: 1, alta: 2 };

/** Techo alcanzable por origen — mientras solo exista 'manual', el techo real es 'media' (autorización, punto 8), declarado explícito para no romperse el día que exista otro origen. */
function techoParaOrigen(origen: OrigenReferencia): NivelConfianzaMercado {
  return origen === 'manual' ? 'media' : 'alta';
}

/**
 * Confianza del mercado combinado (autorización, punto 8):
 * - una sola referencia nunca produce confianza alta (aquí, nunca pasa de 'baja').
 * - impuestos desconocidos en cualquiera de las referencias usadas → techo 'baja', nunca se adivina la tasa.
 * - dispersión alta entre las referencias usadas → techo 'baja'.
 * - en cualquier otro caso, 'media' a partir de `UMBRAL_MINIMO_REFERENCIAS`, 'baja' por debajo.
 * - el resultado nunca supera el techo del origen menos fiable presente (hoy siempre 'manual' → 'media').
 */
function confianzaPara(refs: ReferenciaMercado[]): NivelConfianzaMercado {
  if (refs.length === 1) return 'baja';
  if (refs.some((r) => !r.impuestosConocidos)) return 'baja';
  const precios = refs.flatMap((r) => [r.precioMin, r.precioMax]);
  if (!dispersionBaja(precios)) return 'baja';

  const base: NivelConfianzaMercado = refs.length >= UMBRAL_MINIMO_REFERENCIAS ? 'media' : 'baja';
  const techoOrigen = refs
    .map((r) => techoParaOrigen(r.origen))
    .reduce((min, t) => (RANGO_CONFIANZA_MERCADO[t] < RANGO_CONFIANZA_MERCADO[min] ? t : min));
  return RANGO_CONFIANZA_MERCADO[base] <= RANGO_CONFIANZA_MERCADO[techoOrigen] ? base : techoOrigen;
}

/**
 * Resuelve el mercado local de una empresa para un tipo de trabajo.
 * Nunca mezcla referencias de dos zonas, dos niveles ni dos alcances/
 * unidades distintas en un mismo resultado — se detiene en el primer
 * nivel geográfico (empezando por el más cercano) que tenga al menos una
 * referencia propia de ese tipo de trabajo, y dentro de ese nivel solo
 * combina las que son comparables entre sí.
 */
export function resolverMercadoLocal(
  ubicacion: UbicacionEmpresa,
  referencias: ReferenciaMercado[],
  tipoTrabajo: string | null
): ResultadoMercadoLocal {
  if (!tipoTrabajo) return { disponible: false };
  const delTipo = referencias.filter((r) => r.tipoTrabajo === tipoTrabajo);
  if (delTipo.length === 0) return { disponible: false };

  const zonaLocal = resolverZonaLocal(ubicacion);
  const niveles: { nivel: NivelGeografico; zona: string | null }[] = [
    { nivel: 'local', zona: zonaLocal },
    { nivel: 'regional', zona: ubicacion.comunidadAutonoma || null },
    { nivel: 'nacional', zona: 'España' },
  ];

  for (const { nivel, zona } of niveles) {
    if (!zona) continue;
    const candidatas = delTipo.filter((r) => r.nivelGeografico === nivel && r.zona === zona);
    if (candidatas.length === 0) continue;

    const { comparables, noComparables } = agruparPorComparabilidad(candidatas);
    const { precioMin, precioMax, fuentes } = combinar(comparables);
    return {
      disponible: true,
      nivelUsado: nivel,
      zona,
      alcance: comparables[0].alcance,
      unidad: comparables[0].unidad,
      precioMin,
      precioMax,
      numReferencias: comparables.length,
      confianza: confianzaPara(comparables),
      fuentes,
      referenciasNoComparables: noComparables,
    };
  }
  return { disponible: false };
}
