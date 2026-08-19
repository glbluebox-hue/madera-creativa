// Ver el comentario de `BASE` en api.ts — mismo criterio (Bit local vs. Render combinado).
const BASE = (import.meta as any).env?.VITE_API_BASE ?? '/api/presupuestos-service';

const DOMINIOS_R2 = ['pub-fd9490abec4f4d9a85fa2a5fe237d18b.r2.dev', 'cdn.maderacreativa.com'];

/**
 * Convierte una URL de imagen guardada en R2 en la ruta del proxy propio
 * del servidor (`/imagen-proxy`), en vez de dejar que el navegador vaya
 * directo al dominio público de R2.
 *
 * Confirmado en vivo (19/08/2026): tanto la URL pública antigua de R2
 * (pub-....r2.dev) como el dominio propio nuevo (cdn.maderacreativa.com)
 * devuelven 503 de forma intermitente ante peticiones del navegador — la
 * URL de desarrollo gratuita de R2 nunca estuvo pensada para esto, y el
 * dominio propio comparte la misma puerta de entrada pública. El servidor,
 * en cambio, accede al archivo por la API S3 autenticada (no el dominio
 * público) y nunca ha fallado — es la misma vía que ya usa, de forma
 * fiable, la descarga de PDF.
 *
 * URLs que no son de R2 (por ejemplo `data:` en facturas antiguas
 * guardadas antes de subir a almacenamiento externo) se devuelven tal
 * cual — no necesitan pasar por ningún proxy.
 */
export function urlImagenFiable(url: string | undefined | null): string {
  if (!url) return '';
  try {
    const analizada = new URL(url);
    if (!DOMINIOS_R2.includes(analizada.hostname)) return url;
    return `${BASE}/imagen-proxy?url=${encodeURIComponent(url)}`;
  } catch {
    return url; // no es una URL absoluta (p. ej. una data: URL) — se deja igual
  }
}
