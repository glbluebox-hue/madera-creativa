import type OpenAI from 'openai';
import type { MensajeIA, ParametrosGeneracion, LlamadaHerramienta, ResultadoGeneracion } from './ia-proveedor.js';

/**
 * Conversión compartida al/del dialecto de la API "Chat Completions" de
 * OpenAI — usado tanto por `ia-proveedor-openai.ts` como por
 * `ia-proveedor-ollama.ts`, ya que Ollama expone un endpoint compatible con
 * OpenAI (`/v1/chat/completions`) y ambos proveedores son, técnicamente,
 * clientes del mismo dialecto con una `baseURL` distinta. Si en el futuro se
 * añade un proveedor con un formato genuinamente distinto (Anthropic, Gemini
 * nativo), ese proveedor no usará este módulo — tendrá el suyo propio.
 */

export function mensajesAOpenAI(mensajes: MensajeIA[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return mensajes.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content, tool_call_id: m.toolCallId ?? '' };
    }
    return { role: m.role, content: m.content };
  });
}

export function herramientasAOpenAI(herramientas: ParametrosGeneracion['herramientas']): OpenAI.Chat.ChatCompletionTool[] | undefined {
  if (!herramientas?.length) return undefined;
  return herramientas.map((h) => ({
    type: 'function',
    function: {
      name: h.nombre,
      description: h.descripcion,
      parameters: h.parametrosJsonSchema,
    },
  }));
}

export function parsearArgumentos(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function llamadasHerramientasDesde(mensaje: OpenAI.Chat.ChatCompletionMessage | undefined): LlamadaHerramienta[] {
  return (mensaje?.tool_calls ?? [])
    .filter((tc): tc is OpenAI.Chat.ChatCompletionMessageToolCall & { type: 'function' } => tc.type === 'function')
    .map((tc) => ({
      id: tc.id,
      nombre: tc.function.name,
      argumentos: parsearArgumentos(tc.function.arguments),
    }));
}

export function motivoFinalizacionDesde(finishReason: string | null | undefined): ResultadoGeneracion['motivoFinalizacion'] {
  return finishReason === 'tool_calls' ? 'herramientas'
    : finishReason === 'length' ? 'longitud_maxima'
    : finishReason === 'stop' ? 'fin'
    : 'error';
}
