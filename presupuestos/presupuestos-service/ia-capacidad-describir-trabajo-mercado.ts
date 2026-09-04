import type { CapacidadIA } from './ia-capacidad.js';
import type { ConstructorContexto } from './ia-contexto.js';
import { registrarCapacidad } from './ia-registro-capacidades.js';
import { construirSystemPromptDescribirTrabajoMercado } from './ia-prompt-describir-trabajo-mercado.js';

/**
 * Contexto de `describir-trabajo-mercado` — mismo patrón que
 * `contextoCopilotoPresupuesto` (`ia-capacidad-copiloto-presupuesto.ts`):
 * `referencias.medidas` es texto ya formateado por el frontend a partir de
 * `Proyecto.estancias` (`formatearMedidasParaIA`, `candidatos-mercado.ts`)
 * o escrito a mano si el trabajo no tiene ninguna estancia medida — nunca
 * datos que esta capacidad calcule o adivine por su cuenta.
 */
const contextoDescribirTrabajoMercado: ConstructorContexto = {
  async construir(referencias) {
    const medidas = typeof referencias.medidas === 'string' ? referencias.medidas : '';
    const resumenParaPrompt = medidas
      ? `MEDIDAS REALES DADAS POR EL USUARIO (úsalas para estimar el número de módulos, no las cambies ni las redondees de forma que parezcan otra cosa):\n${medidas}`
      : 'No se han dado medidas — estima el número de módulos solo a partir de lo que se ve en la foto, dejando claro que es una estimación menos fiable sin medidas reales.';
    return { resumenParaPrompt, datosParaHerramientas: {} };
  },
};

/**
 * Manifiesto de `describir-trabajo-mercado` (30/08/2026) — paso previo
 * opcional de "Buscar con IA" (`candidatos-mercado-vista.tsx`): convierte
 * foto(s) + medidas reales en una descripción de texto (materiales,
 * acabado, módulos estimados) que alimenta después la búsqueda de mercado
 * como `descripcionLibre`. Sin herramientas: nunca escribe nada, solo
 * describe — el texto se muestra siempre al usuario antes de usarse
 * (mismo criterio que `extraer-datos-factura`).
 */
export const capacidadDescribirTrabajoMercado: CapacidadIA = {
  nombre: 'describir-trabajo-mercado',
  descripcion: 'Describe (materiales, acabado, módulos estimados) un trabajo a partir de foto(s) y medidas reales, para dar más contexto a la búsqueda de mercado — nunca busca ni da un precio.',
  promptSistema: construirSystemPromptDescribirTrabajoMercado,
  constructorContexto: contextoDescribirTrabajoMercado,
  herramientas: [],
  permisosRequeridos: [],
  perfilModelo: 'vision',
  planMinimo: 'PREMIUM', // Fase 2, 04/09/2026 — parte de Investigación de Mercado, Estrategia V3 sección 9.
  activa: true,
};

registrarCapacidad(capacidadDescribirTrabajoMercado);
