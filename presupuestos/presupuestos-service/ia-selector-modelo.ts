import type { PerfilModeloRequerido, ConfiguracionModelo } from './ia-modelo-perfil.js';
import { obtenerModeloOllama } from './ia-proveedor-ollama.js';

/**
 * Tabla de candidatos por perfil, en el orden en que se prueban por defecto
 * si `AI_PROVIDER` no dice lo contrario — `ServicioCentralIA` recorre esta
 * lista hasta que uno responda (cadena de fallback). Deliberadamente
 * incompleta: `vision`/`ocr`/`voz` no tienen entrada, y `razonamiento` no
 * incluye Ollama todavía — un modelo local de 7B por CPU no es un candidato
 * razonable para tareas de razonamiento pesado.
 */
const MAPA_PERFILES: Partial<Record<PerfilModeloRequerido, ConfiguracionModelo[]>> = {
  razonamiento: [
    { proveedor: 'openai', modelo: 'gpt-4o' },
  ],
  rapido_economico: [
    { proveedor: 'openai', modelo: 'gpt-4o-mini' },
    { proveedor: 'ollama', modelo: obtenerModeloOllama() },
  ],
};

/**
 * Reservado para un futuro selector con lógica real de decisión — hoy no se
 * usa (`seleccionarModelo` sigue recibiendo solo `perfil`+`permitidos`).
 * Declarado para dejar constancia del punto de extensión sin forzar una
 * firma de función especulativa antes de que haya una necesidad real.
 */
export type CriteriosSeleccion = {
  perfil: PerfilModeloRequerido;
  prioridad?: 'coste' | 'velocidad' | 'calidad';
  tamanoContextoAprox?: number;
};

/** Se lanza cuando se pide un perfil sin ningún candidato disponible (o ninguno dentro de la allowlist indicada). */
export class ErrorPerfilNoDisponible extends Error {
  constructor(perfil: PerfilModeloRequerido) {
    super(`El perfil de modelo "${perfil}" no tiene ningún proveedor configurado todavía.`);
  }
}

/**
 * Reordena los candidatos según `AI_PROVIDER` — nunca excluye, solo cambia
 * qué se prueba primero. Sin la variable definida (o con un valor que no
 * coincide con ningún candidato), el orden es el declarado en `MAPA_PERFILES`.
 */
function ordenPorAiProvider(candidatos: ConfiguracionModelo[]): ConfiguracionModelo[] {
  const preferido = process.env.AI_PROVIDER;
  if (!preferido) return candidatos;
  const conPreferido = candidatos.filter((c) => c.proveedor === preferido);
  const resto = candidatos.filter((c) => c.proveedor !== preferido);
  return [...conPreferido, ...resto];
}

/**
 * Resuelve la cadena de candidatos (proveedor+modelo) a intentar en orden
 * para el perfil dado.
 * @param perfil Tipo de tarea que necesita la capacidad que llama.
 * @param permitidos Allowlist opcional de la propia capacidad (`CapacidadIA.modelosPermitidos`)
 *   — si se indica, la cadena se filtra a la intersección; si eso la vacía,
 *   se lanza `ErrorPerfilNoDisponible`.
 */
export function seleccionarModelo(perfil: PerfilModeloRequerido, permitidos?: ConfiguracionModelo[]): ConfiguracionModelo[] {
  const candidatos = MAPA_PERFILES[perfil];
  if (!candidatos?.length) throw new ErrorPerfilNoDisponible(perfil);
  const filtrados = permitidos?.length
    ? candidatos.filter((c) => permitidos.some((p) => p.proveedor === c.proveedor && p.modelo === c.modelo))
    : candidatos;
  if (!filtrados.length) throw new ErrorPerfilNoDisponible(perfil);
  return ordenPorAiProvider(filtrados);
}
