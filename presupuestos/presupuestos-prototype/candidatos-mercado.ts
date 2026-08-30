import type { ReferenciaMercado, NivelGeografico, AlcanceTrabajo } from './mercado-local.js';
import type { CandidatoMercado } from './api.js';

export type { CandidatoMercado };

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
