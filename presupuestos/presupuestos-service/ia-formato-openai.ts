import type OpenAI from 'openai';
import type { MensajeIA, ParametrosGeneracion, LlamadaHerramienta, ResultadoGeneracion } from './ia-proveedor.js';

/**
 * Conversión al/del dialecto de la API "Chat Completions" de OpenAI, usado
 * por `ia-proveedor-openai.ts`. Si en el futuro se añade un proveedor con
 * un formato genuinamente distinto (Anthropic, Gemini nativo), ese
 * proveedor no usará este módulo — tendrá el suyo propio.
 */

export function mensajesAOpenAI(mensajes: MensajeIA[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return mensajes.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content, tool_call_id: m.toolCallId ?? '' };
    }
    // Un mensaje 'assistant' que representa "aquí propuse una herramienta"
    // necesita `tool_calls` de verdad — sin esto, el 'tool' que le sigue
    // (con el resultado real ya ejecutado) no es una respuesta válida a
    // nada para la API de OpenAI y la rechaza con un 400.
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.nombre, arguments: JSON.stringify(tc.argumentos) },
        })),
      };
    }
    // Mensaje con imágenes (perfil `vision`, Fase Facturas Profesional) —
    // "content parts" en vez de un string plano, formato que solo entiende
    // `user`; el resto de roles nunca llevan `imagenes`.
    if (m.role === 'user' && m.imagenes?.length) {
      return {
        role: 'user',
        content: [
          { type: 'text', text: m.content },
          ...m.imagenes.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
        ],
      };
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
