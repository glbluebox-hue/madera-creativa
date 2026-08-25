/**
 * Envío de emails transaccionales vía Resend (26/08/2026) — una llamada
 * directa a su API REST con `fetch`, sin SDK: un único endpoint (POST
 * /emails) no justifica una dependencia nueva. Único archivo de todo el
 * monorepo autorizado a hablar con Resend — si algún día cambia de
 * proveedor, el cambio queda confinado aquí (mismo criterio que
 * `ia-proveedor-openai.ts` para OpenAI).
 */

const RESEND_API_URL = 'https://api.resend.com/emails';

/** Se lanza cuando `RESEND_API_KEY` no está configurada — el llamante decide cómo responder. */
export class ErrorEmailNoConfigurado extends Error {
  constructor() {
    super('RESEND_API_KEY no está configurada.');
  }
}

/**
 * Remitente por defecto — el dominio de pruebas de Resend, que funciona
 * sin verificar nada propio pero no llega como "Madera Creativa". En
 * cuanto se verifique un dominio real en Resend, se configura
 * `RESEND_FROM` (p. ej. `Madera Creativa <noreply@maderacreativa.com>`)
 * como variable de entorno — este archivo no necesita cambiar.
 */
const REMITENTE_POR_DEFECTO = 'Madera Creativa <onboarding@resend.dev>';

/** Envía un único email transaccional. Lanza si Resend no está configurada o si la API responde con error. */
export async function enviarEmail(destinatario: string, asunto: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new ErrorEmailNoConfigurado();
  const from = process.env.RESEND_FROM || REMITENTE_POR_DEFECTO;
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [destinatario], subject: asunto, html }),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Resend respondió ${res.status}: ${detalle}`);
  }
}
