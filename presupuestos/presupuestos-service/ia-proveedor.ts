/**
 * Interfaz de proveedor de IA — abstrae al resto de la aplicación de qué
 * modelo/vendor responde una generación. Ningún módulo fuera de un archivo
 * `ia-proveedor-*.ts` debe conocer los detalles de un proveedor concreto
 * (nombres de campos de su API, autenticación, formato de streaming, etc.).
 *
 * Cambiar o añadir un proveedor implica crear un nuevo `ia-proveedor-*.ts`
 * que implemente `ProveedorIA` — el resto del sistema (`ia-servicio-central.ts`,
 * capacidades, herramientas) no cambia.
 */

/** Rol de un mensaje en la conversación enviada al modelo. */
export type RolMensajeIA = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Mensaje de la conversación. `toolCallId`/`toolName` solo se usan en
 * mensajes de rol `'tool'` — el resultado de haber ejecutado una
 * herramienta de permiso `'lectura'`, reinyectado para que el modelo
 * continúe con esa información.
 */
export type MensajeIA = {
  role: RolMensajeIA;
  content: string;
  toolCallId?: string;
  toolName?: string;
};

/** Definición de una herramienta tal como la necesita el proveedor (JSON Schema de sus parámetros). */
export type DefinicionHerramienta = {
  nombre: string;
  descripcion: string;
  parametrosJsonSchema: Record<string, unknown>;
};

/** Una llamada a herramienta que el modelo decide hacer, con los argumentos que propone. */
export type LlamadaHerramienta = {
  id: string;
  nombre: string;
  argumentos: Record<string, unknown>;
};

/** Resultado de una generación del modelo. */
export type ResultadoGeneracion = {
  texto: string;
  llamadasHerramientas: LlamadaHerramienta[];
  uso: { tokensEntrada: number; tokensSalida: number };
  modelo: string;
  motivoFinalizacion: 'fin' | 'herramientas' | 'longitud_maxima' | 'error';
};

/** Parámetros de una petición de generación al proveedor. */
export type ParametrosGeneracion = {
  modelo: string;
  mensajes: MensajeIA[];
  herramientas?: DefinicionHerramienta[];
  maxTokens?: number;
  temperatura?: number;
};

/**
 * Contrato que debe implementar cualquier proveedor de IA (OpenAI, y en el
 * futuro otros). `ServicioCentralIA` solo conoce esta interfaz, nunca el
 * SDK o la API HTTP concreta de un proveedor.
 */
export interface ProveedorIA {
  /** Nombre corto del proveedor (p. ej. `'openai'`) — se registra en `IaUsoModel`. */
  nombre: string;
  generar(params: ParametrosGeneracion): Promise<ResultadoGeneracion>;
}

/**
 * Clase base de la que heredan los errores "este proveedor no responde"
 * de cada `ia-proveedor-*.ts` (falta de configuración, red caída, timeout,
 * servicio no disponible). `ServicioCentralIA` la usa para decidir si debe
 * probar el siguiente candidato de la cadena de fallback; `ia-rutas.ts` la
 * usa para devolver 503 sin tener que conocer qué proveedores existen.
 */
export class ErrorProveedorInalcanzable extends Error {}
