import type { ReferenciaMercado, NivelGeografico, AlcanceTrabajo } from './mercado-local.js';
import type { CandidatoMercado } from './api.js';
import type { Estancia } from './types.js';

export type { CandidatoMercado };

function normalizar(s: string): string {
  return s.normalize('NFD').replace(new RegExp(`[${String.fromCodePoint(0x300)}-${String.fromCodePoint(0x36f)}]`, 'g'), '').toLowerCase().trim();
}

/**
 * Contexto real para "Buscar con IA" (30/08/2026) — busca, entre las
 * estancias YA MEDIDAS del proyecto (Pizarra de medición,
 * `Proyecto.estancias`), una cuyo nombre coincida con el tipo de trabajo
 * (p. ej. una estancia "Cocina" para un presupuesto de tipo "Cocina").
 * Nunca adivina entre varias que no coinciden por nombre — en ese caso
 * (o si hay más de una coincidencia) se deja `null` para que el usuario
 * elija en la interfaz, en vez de asumir la primera.
 */
export function detectarEstanciaMedida(estancias: Estancia[] | undefined, tipoTrabajo: string): Estancia | null {
  if (!estancias?.length) return null;
  const tipo = normalizar(tipoTrabajo);
  const coincidencias = estancias.filter((e) => {
    const nombre = normalizar(e.nombre);
    return nombre.includes(tipo) || tipo.includes(nombre);
  });
  return coincidencias.length === 1 ? coincidencias[0] : null;
}

const ETIQUETA_MEDIDA: Record<string, string> = {
  ancho: 'ancho', alto: 'alto', fondo: 'fondo', altura: 'altura', anchura: 'anchura', profundidad: 'profundidad',
};

/** Convierte una `Estancia` (medidas reales, nunca inventadas) en una línea de texto para el prompt de IA. */
export function formatearEstancia(estancia: Estancia): string {
  const medidas = (Object.keys(ETIQUETA_MEDIDA) as (keyof typeof ETIQUETA_MEDIDA)[])
    .map((campo) => {
      const valor = estancia[campo as keyof Estancia];
      return typeof valor === 'number' ? `${ETIQUETA_MEDIDA[campo]} ${valor} m` : null;
    })
    .filter((s): s is string => !!s);
  if (medidas.length === 0) return '';
  return `Estancia "${estancia.nombre}" — medidas reales: ${medidas.join(', ')}.`;
}

/**
 * Convierte un candidato de IA ya confirmado por el usuario en el mismo
 * `Omit<ReferenciaMercado, 'id'|'creado'>` que consume
 * `api.crearReferenciaMercado` — función pura, sin red, separada del
 * componente (`candidatos-mercado-vista.tsx`) para poder testear la parte
 * que de verdad importa (encargo, puntos 3 y 9: "nunca inventar un dato")
 * sin tener que simular clics — mismo criterio que separa `mercado-local.ts`
 * (lógica pura) de `referencias-mercado-vista.tsx` (interfaz).
 */
export function candidatoAReferenciaMercado(
  candidato: CandidatoMercado & { precio: number },
  contexto: { tipoTrabajo: string; nivelGeografico: NivelGeografico; zona: string; alcance: AlcanceTrabajo; fechaInvestigacion: string }
): Omit<ReferenciaMercado, 'id' | 'creado'> {
  return {
    tipoTrabajo: contexto.tipoTrabajo,
    nivelGeografico: contexto.nivelGeografico,
    zona: contexto.zona,
    precioMin: candidato.precio,
    precioMax: candidato.precio,
    fuente: candidato.fuente || '',
    fecha: candidato.fechaReferencia || new Date().toISOString().slice(0, 10),
    alcance: contexto.alcance,
    obraIncluida: false,
    electrodomesticosIncluidos: null,
    nivelCalidad: candidato.calidad,
    tamano: null,
    unidad: 'total',
    // El precio de un candidato es un único valor detectado, no un rango con techo
    // verificado por el propio usuario — se guarda como "desde" para que nunca
    // defina artificialmente el techo del mercado (mismo criterio que un "desde"
    // manual, ver `mercado-local.ts`).
    impuestosConocidos: candidato.ivaIncluido === 'si',
    tipoPrecio: 'desde',
    origen: 'ia_web',
    fuenteUrl: candidato.url || '',
    extracto: candidato.extracto || '',
    fechaInvestigacion: contexto.fechaInvestigacion,
  };
}
