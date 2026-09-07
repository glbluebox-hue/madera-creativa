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

/**
 * Versión de texto plano derivada del HTML (08/09/2026, mejora de
 * entregabilidad — reporte real del cliente: "el email siempre llega a
 * spam") — un correo transaccional que SOLO trae `html` (sin `text`
 * alternativo) es una de las señales que los filtros antispam de Gmail/
 * Outlook penalizan; añadirla no soluciona por sí sola el problema (ver
 * el resto de comprobaciones en el comentario de `enviarEmail`), pero es
 * la única mejora que se puede hacer desde el código — el resto vive en
 * la configuración de Resend/DNS, fuera del repositorio.
 */
export function textoPlanoDesdeHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Envía un único email transaccional. Lanza si Resend no está configurada
 * o si la API responde con error.
 *
 * Si los emails llegan sistemáticamente a spam (reporte real del
 * cliente, 08/09/2026), esto NUNCA se arregla desde el código de la app
 * — hay que revisar, en este orden:
 * 1. Que `RESEND_FROM` esté configurada de verdad en Render con el
 *    dominio propio (`Madera Creativa <noreply@maderacreativa.com>`) — si
 *    no lo está, este archivo cae automáticamente en
 *    `onboarding@resend.dev` (el dominio de pruebas COMPARTIDO de
 *    Resend), que los filtros ya conocen y penalizan por el volumen de
 *    remitentes distintos que lo usan.
 * 2. Que en el panel de Resend, el dominio `maderacreativa.com` figure
 *    como "Verified" con SUS TRES registros DNS en verde (SPF, DKIM y
 *    DMARC) — añadir el dominio no basta, hay que confirmar que los tres
 *    registros están puestos en el proveedor de DNS y ya se han
 *    verificado.
 * 3. Reputación: un dominio recién verificado, con poco volumen de envío
 *    todavía, tarda un tiempo (días/semanas de envíos reales y
 *    constantes) en ganarse la confianza de Gmail/Outlook — no hay
 *    atajo de configuración para esto, es solo cuestión de tiempo y uso.
 */
export async function enviarEmail(destinatario: string, asunto: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new ErrorEmailNoConfigurado();
  const from = process.env.RESEND_FROM || REMITENTE_POR_DEFECTO;
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [destinatario], subject: asunto, html, text: textoPlanoDesdeHtml(html) }),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Resend respondió ${res.status}: ${detalle}`);
  }
}
