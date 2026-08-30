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
  // alarga un fallo real sin aportar nada.
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

/**
 * A partir de aquí: dos funciones NUEVAS (Fase "Investigación de Mercado
 * con IA", 30/08/2026) que usan la **Responses API** de OpenAI en vez de
 * Chat Completions — `generar()`/`ProveedorOpenAI` no se tocan, ninguna
 * capacidad existente pasa por aquí.
 *
 * `ProveedorIA`/`ServicioCentralIA` están pensados para un bucle de
 * function-calling propio (herramientas que ejecutamos nosotros y
 * reinyectamos) — no encajan con `web_search_preview`, que es una
 * herramienta ALOJADA: el propio OpenAI navega y devuelve el resultado ya
 * dentro de la respuesta, con citas. Por eso esta pieza vive fuera del
 * núcleo de capacidades, aunque en el mismo (único) archivo autorizado a
 * hablar con el SDK de OpenAI.
 */

/** Modelo por defecto para investigación de mercado — mismo criterio de coste que el resto de la app (`ia-selector-modelo.ts`: gpt-4o-mini). Redefinible por env sin tocar código. */
function obtenerModeloMercado(): string {
  return process.env.OPENAI_MODEL_MERCADO?.trim() || 'gpt-4o-mini';
}

export type ResultadoBusquedaWeb = {
  /** Texto en prosa, con las fuentes citadas inline — nunca estructurado todavía, eso lo hace `extraerJsonEstructurado`. */
  textoGrounded: string;
  /** URLs reales que el propio OpenAI adjuntó como citas (`annotations` de tipo `url_citation`) — la única fuente de verdad de "esta URL es real", nunca una URL que el modelo escriba luego por su cuenta en el paso de extracción. */
  urlsCitadas: string[];
  tokensEntrada: number;
  tokensSalida: number;
  modelo: string;
};

/**
 * Paso 1: búsqueda real en la web vía la herramienta alojada
 * `web_search_preview`. Devuelve prosa + las URLs que OpenAI certifica
 * como fuente real (via citas) — nunca se le pide JSON aquí: mezclar
 * `tools: web_search_preview` con salida estructurada en la misma llamada
 * no es un patrón documentado de forma fiable, así que se separa en dos
 * llamadas (ver `extraerJsonEstructurado`).
 */
export async function buscarEnWeb(prompt: string, modelo = obtenerModeloMercado()): Promise<ResultadoBusquedaWeb> {
  const cliente = obtenerCliente();

  const respuesta = await cliente.responses.create({
    model: modelo,
    tools: [{ type: 'web_search_preview' }],
    input: prompt,
  });

  const urlsCitadas = new Set<string>();
  for (const item of respuesta.output ?? []) {
    if (item.type !== 'message') continue;
    for (const contenido of item.content ?? []) {
      if (contenido.type !== 'output_text') continue;
      for (const anotacion of contenido.annotations ?? []) {
        if (anotacion.type === 'url_citation' && anotacion.url) urlsCitadas.add(anotacion.url);
      }
    }
  }

  return {
    textoGrounded: respuesta.output_text ?? '',
    urlsCitadas: [...urlsCitadas],
    tokensEntrada: respuesta.usage?.input_tokens ?? 0,
    tokensSalida: respuesta.usage?.output_tokens ?? 0,
    modelo: respuesta.model,
  };
}

export type ParametrosExtraccionJson = {
  prompt: string;
  /** Nombre corto del esquema (requisito de la API, sin espacios). */
  nombreEsquema: string;
  /** JSON Schema en modo `strict` — todas las propiedades listadas en `required`, `additionalProperties: false` (requisito de OpenAI Structured Outputs). */
  esquemaJsonSchema: Record<string, unknown>;
  modelo?: string;
};

export type ResultadoExtraccionJson<T> = {
  datos: T;
  tokensEntrada: number;
  tokensSalida: number;
  modelo: string;
};

/**
 * Paso 2: convierte texto libre (el `textoGrounded` del paso 1) en JSON con
 * forma garantizada, vía Structured Outputs (`text.format: json_schema`,
 * `strict: true`) — sin herramientas, sin red: es una extracción de texto a
 * texto, nunca inventa nada que no estuviera ya en el `prompt` recibido
 * (la disciplina de "no inventar" la impone el prompt, ver
 * `investigacion-mercado-prompt.ts`, no esta función).
 */
export async function extraerJsonEstructurado<T>(params: ParametrosExtraccionJson): Promise<ResultadoExtraccionJson<T>> {
  const cliente = obtenerCliente();
  const modelo = params.modelo ?? obtenerModeloMercado();

  const respuesta = await cliente.responses.create({
    model: modelo,
    input: params.prompt,
    text: {
      format: {
        type: 'json_schema',
        name: params.nombreEsquema,
        schema: params.esquemaJsonSchema,
        strict: true,
      },
    },
  });

  const texto = respuesta.output_text ?? '{}';
  let datos: T;
  try {
    datos = JSON.parse(texto) as T;
  } catch {
    throw new Error('La respuesta de OpenAI no era JSON válido pese a Structured Outputs.');
  }

  return {
    datos,
    tokensEntrada: respuesta.usage?.input_tokens ?? 0,
    tokensSalida: respuesta.usage?.output_tokens ?? 0,
    modelo: respuesta.model,
  };
}
