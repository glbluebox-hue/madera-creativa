import type { ProveedorIA, ParametrosGeneracion, ResultadoGeneracion, MensajeIA, LlamadaHerramienta } from './ia-proveedor.js';
import { ErrorProveedorInalcanzable } from './ia-proveedor.js';

/**
 * Proveedor de IA local vía Ollama — usa la API NATIVA de Ollama
 * (`/api/chat`), no la compatible con OpenAI (`/v1/chat/completions`).
 *
 * Hallazgo real de la Fase 5 (medido, no supuesto): Qwen3 es un modelo
 * "híbrido" con un modo de razonamiento extendido ("thinking") activado por
 * defecto, que en este hardware añade decenas de segundos incluso a
 * respuestas triviales (33-37s para responder solo "hola"). El parámetro
 * que lo desactiva (`think: false`) **solo lo respeta el endpoint nativo**
 * — el compatible con OpenAI lo ignora en silencio y sigue "pensando".
 * Verificado con el mismo prompt: 33-37s vía `/v1/chat/completions` con
 * `think` ignorado, 1,8s vía `/api/chat` con `think:false` respetado, y el
 * function-calling nativo (`tools`) sigue funcionando igual de bien con el
 * razonamiento desactivado.
 *
 * Por eso este proveedor no reutiliza `ia-formato-openai.ts` (ese dialecto
 * es específico de la API compatible con OpenAI) — el formato nativo de
 * Ollama es distinto aunque parecido: los argumentos de una llamada a
 * herramienta ya llegan como objeto, no como JSON en texto que haya que
 * parsear.
 */

/** Se lanza cuando no se puede conectar con Ollama (servicio caído, URL errónea, timeout, modelo no encontrado). */
export class ErrorProveedorNoConfigurado extends ErrorProveedorInalcanzable {
  constructor(causa?: string) {
    super(`No se pudo conectar con Ollama en ${obtenerBaseUrl()}${causa ? `: ${causa}` : '.'}`);
  }
}

/**
 * Con el razonamiento extendido desactivado (`think:false`), una respuesta
 * con herramientas ronda 15-40s en este hardware (medido) — 120s deja
 * margen amplio para un prompt más largo o una carga en frío del modelo,
 * sin ser tan corto como para disparar el fallback innecesariamente.
 */
const TIMEOUT_MS_DEFECTO = 120_000;

/**
 * Modelo local elegido para validar la integración: anuncia soporte nativo
 * de `tools` en sus capacidades de Ollama (`ollama show qwen3:8b`), lo que
 * resuelve de raíz el mayor riesgo abierto del diseño (fiabilidad del
 * function-calling vía Ollama). Sustituye a `qwen2.5:7b-instruct` (el
 * modelo originalmente aprobado) porque ya estaba descargado en el equipo
 * de pruebas — decisión confirmada explícitamente por el usuario.
 */
const MODELO_DEFECTO = 'qwen3:8b';

function obtenerBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
}

function obtenerTimeoutMs(): number {
  const raw = process.env.OLLAMA_TIMEOUT_MS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : TIMEOUT_MS_DEFECTO;
}

/** Modelo local a usar por defecto — leído aquí y también desde `ia-selector-modelo.ts` al construir la cadena de candidatos. */
export function obtenerModeloOllama(): string {
  return process.env.OLLAMA_MODEL || MODELO_DEFECTO;
}

/** Mensaje en el dialecto nativo de Ollama — muy parecido al de OpenAI, pero sin `tool_call_id`. */
type MensajeOllama = { role: string; content: string };

function mensajesAOllama(mensajes: MensajeIA[]): MensajeOllama[] {
  return mensajes.map((m) => ({ role: m.role, content: m.content }));
}

function herramientasAOllama(herramientas: ParametrosGeneracion['herramientas']) {
  if (!herramientas?.length) return undefined;
  return herramientas.map((h) => ({
    type: 'function',
    function: { name: h.nombre, description: h.descripcion, parameters: h.parametrosJsonSchema },
  }));
}

type RespuestaOllama = {
  model: string;
  message?: {
    content?: string;
    tool_calls?: { id?: string; function: { name: string; arguments: Record<string, unknown> } }[];
  };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
};

function llamadasHerramientasDesdeOllama(mensaje: RespuestaOllama['message']): LlamadaHerramienta[] {
  return (mensaje?.tool_calls ?? []).map((tc, i) => ({
    id: tc.id ?? `ollama-tool-${i}`,
    nombre: tc.function.name,
    // A diferencia de OpenAI, Ollama ya entrega los argumentos como objeto — no hace falta parsear JSON.
    argumentos: tc.function.arguments ?? {},
  }));
}

function motivoFinalizacionDesdeOllama(mensaje: RespuestaOllama['message'], doneReason: string | undefined): ResultadoGeneracion['motivoFinalizacion'] {
  if (mensaje?.tool_calls?.length) return 'herramientas';
  if (doneReason === 'length') return 'longitud_maxima';
  if (doneReason === 'stop') return 'fin';
  return 'error';
}

export class ProveedorOllama implements ProveedorIA {
  nombre = 'ollama';

  async generar(params: ParametrosGeneracion): Promise<ResultadoGeneracion> {
    const controlador = new AbortController();
    const timeoutId = setTimeout(() => controlador.abort(), obtenerTimeoutMs());

    let respuesta: RespuestaOllama;
    try {
      const res = await fetch(`${obtenerBaseUrl()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controlador.signal,
        body: JSON.stringify({
          model: params.modelo,
          messages: mensajesAOllama(params.mensajes),
          tools: herramientasAOllama(params.herramientas),
          think: false,
          stream: false,
          options: { temperature: params.temperatura ?? 0.4, num_predict: params.maxTokens ?? 600 },
        }),
      });
      if (!res.ok) {
        const detalle = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${detalle ? `: ${detalle.slice(0, 200)}` : ''}`);
      }
      respuesta = await res.json();
    } catch (err) {
      // Cualquier fallo de red/conexión/timeout/HTTP se homogeneiza a un
      // único tipo de error reconocible por `ServicioCentralIA` para
      // decidir el fallback.
      const causa = err instanceof Error && err.name === 'AbortError' ? 'Request timed out.' : (err instanceof Error ? err.message : String(err));
      throw new ErrorProveedorNoConfigurado(causa);
    } finally {
      clearTimeout(timeoutId);
    }

    return {
      texto: respuesta.message?.content ?? '',
      llamadasHerramientas: llamadasHerramientasDesdeOllama(respuesta.message),
      uso: {
        tokensEntrada: respuesta.prompt_eval_count ?? 0,
        tokensSalida: respuesta.eval_count ?? 0,
      },
      modelo: respuesta.model,
      motivoFinalizacion: motivoFinalizacionDesdeOllama(respuesta.message, respuesta.done_reason),
    };
  }
}
