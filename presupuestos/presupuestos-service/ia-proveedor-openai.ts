import OpenAI from 'openai';
import type { ProveedorIA, ParametrosGeneracion, ResultadoGeneracion } from './ia-proveedor.js';
import { ErrorProveedorInalcanzable } from './ia-proveedor.js';
import { mensajesAOpenAI, herramientasAOpenAI, llamadasHerramientasDesde, motivoFinalizacionDesde } from './ia-formato-openai.js';

/**
 * Único archivo de todo el monorepo autorizado a construir un cliente
 * `openai` apuntando a la API real de OpenAI. `ServicioCentralIA` y todo lo
 * demás solo conocen `ProveedorIA` (`ia-proveedor.ts`) — si mañana se
 * cambia de proveedor, el cambio queda confinado a este archivo.
 */

/** Se lanza cuando `OPENAI_API_KEY` no está configurada — el llamante decide cómo responder (503, log, etc.). */
export class ErrorProveedorNoConfigurado extends ErrorProveedorInalcanzable {
  constructor() {
    super('OPENAI_API_KEY no está configurada.');
  }
}

/** Timeout por defecto de una llamada a OpenAI — el servicio real rara vez tarda, salvo caída. */
const TIMEOUT_MS_DEFECTO = 20_000;

function obtenerTimeoutMs(): number {
  const raw = process.env.OPENAI_TIMEOUT_MS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : TIMEOUT_MS_DEFECTO;
}

let clienteCache: OpenAI | null = null;

/** Crea (o reutiliza) el cliente del SDK, leyendo la API key en el momento de uso, no al importar el módulo. */
function obtenerCliente(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ErrorProveedorNoConfigurado();
  // maxRetries:0 — ServicioCentralIA ya tiene su propia cadena de fallback
  // entre proveedores; dejar que el SDK reintente además por su cuenta solo
  // alarga un fallo real sin aportar nada (ver ia-proveedor-ollama.ts).
  if (!clienteCache) clienteCache = new OpenAI({ apiKey, timeout: obtenerTimeoutMs(), maxRetries: 0 });
  return clienteCache;
}

/** Única implementación de `ProveedorIA` para la API real de OpenAI — llama a Chat Completions vía el SDK oficial. */
export class ProveedorOpenAI implements ProveedorIA {
  nombre = 'openai';

  async generar(params: ParametrosGeneracion): Promise<ResultadoGeneracion> {
    const cliente = obtenerCliente();

    const respuesta = await cliente.chat.completions.create({
      model: params.modelo,
      messages: mensajesAOpenAI(params.mensajes),
      tools: herramientasAOpenAI(params.herramientas),
      max_tokens: params.maxTokens ?? 600,
      temperature: params.temperatura ?? 0.4,
    });

    const eleccion = respuesta.choices[0];

    return {
      texto: eleccion?.message?.content ?? '',
      llamadasHerramientas: llamadasHerramientasDesde(eleccion?.message),
      uso: {
        tokensEntrada: respuesta.usage?.prompt_tokens ?? 0,
        tokensSalida: respuesta.usage?.completion_tokens ?? 0,
      },
      modelo: respuesta.model,
      motivoFinalizacion: motivoFinalizacionDesde(eleccion?.finish_reason),
    };
  }
}
