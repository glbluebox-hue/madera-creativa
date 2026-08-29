import { UMBRAL_MINIMO_TRABAJOS } from './metricas-por-tipo.js';

/**
 * Mercado local (Fase 2F, "Consenso de Precio", 29/08/2026) — función pura,
 * determinista, sin IA ni llamada a red: resuelve qué referencias de
 * mercado (introducidas a mano por el usuario, ver `referencias-mercado-vista.tsx`)
 * aplican a un tipo de trabajo, escalando SIEMPRE en el orden
 * local → regional → nacional, y solo cuando el nivel más cercano no
 * tiene ninguna referencia (autorización Fase 2F, condiciones 1 y 6:
 * "no sustituir silenciosamente Canarias por Madrid o por España").
 *
 * La isla tiene prioridad sobre la provincia como nivel "local" (condición
 * 1) — una provincia canaria agrupa varias islas con mercados de
 * instalación físicamente distintos (ver "Brújula de Mercado", sección B).
 */

export type NivelGeografico = 'local' | 'regional' | 'nacional';

/** Solo hay un nivel de confianza 'alta' reservado para una fuente oficial con metodología pública (INE/ISTAC) — no implementada todavía (ver limitaciones). Con solo referencias manuales, el techo real es 'media'. */
export type NivelConfianzaMercado = 'alta' | 'media' | 'baja';

export type ReferenciaMercado = {
  id: string;
  tipoTrabajo: string;
  nivelGeografico: NivelGeografico;
  /** Debe coincidir EXACTAMENTE con el campo de ubicación de la Empresa al que corresponde (isla/provincia para 'local', comunidadAutonoma para 'regional', 'España' para 'nacional') — así se evita cualquier ambigüedad de texto libre al comparar. */
  zona: string;
  precioMin: number;
  precioMax: number;
  fuente: string;
  fecha: string;
  creado: string;
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
      precioMin: number;
      precioMax: number;
      numReferencias: number;
      confianza: NivelConfianzaMercado;
      fuentes: string[];
    }
  | { disponible: false };

/** Mismo umbral que ya usa el Histórico Inteligente (Fase 2D) para "histórico suficiente" — reutilizado tal cual, no una constante nueva, para no inventar un segundo criterio de "cuántas muestras bastan". */
const UMBRAL_MINIMO_REFERENCIAS = UMBRAL_MINIMO_TRABAJOS;

/** El nivel "local" de una empresa — la isla manda si existe (condición 1), si no la provincia. `null` si la empresa no ha configurado ninguna de las dos. */
export function resolverZonaLocal(ubicacion: UbicacionEmpresa): string | null {
  if (ubicacion.isla) return ubicacion.isla;
  if (ubicacion.provincia) return ubicacion.provincia;
  return null;
}

function confianzaPara(numReferencias: number): NivelConfianzaMercado {
  return numReferencias >= UMBRAL_MINIMO_REFERENCIAS ? 'media' : 'baja';
}

function combinar(refs: ReferenciaMercado[]): { precioMin: number; precioMax: number; fuentes: string[] } {
  return {
    precioMin: Math.min(...refs.map((r) => r.precioMin)),
    precioMax: Math.max(...refs.map((r) => r.precioMax)),
    fuentes: [...new Set(refs.map((r) => r.fuente).filter(Boolean))],
  };
}

/**
 * Resuelve el mercado local de una empresa para un tipo de trabajo.
 * Nunca mezcla referencias de dos zonas ni de dos niveles en un mismo
 * resultado — se detiene en el primer nivel (empezando por el más
 * cercano) que tenga al menos una referencia propia de ese tipo de
 * trabajo, y lo indica explícitamente en `nivelUsado`/`zona`.
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
    const enEsteNivel = delTipo.filter((r) => r.nivelGeografico === nivel && r.zona === zona);
    if (enEsteNivel.length === 0) continue;
    const { precioMin, precioMax, fuentes } = combinar(enEsteNivel);
    return {
      disponible: true,
      nivelUsado: nivel,
      zona,
      precioMin,
      precioMax,
      numReferencias: enEsteNivel.length,
      confianza: confianzaPara(enEsteNivel.length),
      fuentes,
    };
  }
  return { disponible: false };
}
