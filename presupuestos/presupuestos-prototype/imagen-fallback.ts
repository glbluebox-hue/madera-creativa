/**
 * Recuperación automática para imágenes guardadas con la URL antigua y
 * gratuita de Cloudflare R2 (`pub-....r2.dev`) — esa URL está pensada por
 * Cloudflare solo para desarrollo, con límites de tráfico estrictos, y
 * devuelve 503 de forma intermitente bajo cualquier uso real (confirmado
 * en vivo, 19/08/2026). Se migró a un dominio propio
 * (`cdn.maderacreativa.com`, mismo bucket, misma clave de objeto — solo
 * cambia el origen público) para las subidas nuevas, pero las imágenes
 * YA GUARDADAS antes de esa migración siguen teniendo la URL antigua
 * grabada en la base de datos.
 *
 * En vez de migrar cada documento uno a uno, si una imagen falla al
 * cargar desde el dominio antiguo, se reintenta una vez con el dominio
 * nuevo — mismo archivo, puerta de entrada distinta. Transparente para
 * el usuario y no requiere tocar ningún dato guardado.
 */
const ORIGEN_R2_ANTIGUO = 'pub-fd9490abec4f4d9a85fa2a5fe237d18b.r2.dev';
const ORIGEN_R2_NUEVO = 'cdn.maderacreativa.com';

/** Handler `onError` para `<img>`: reintenta una vez con el dominio nuevo. */
export function reintentarConDominioR2Nuevo(evento: { currentTarget: HTMLImageElement }): void {
  const img = evento.currentTarget;
  if (img.dataset.reintentoR2 === '1') return; // ya se reintentó — evita bucle si el nuevo también fallara
  if (!img.src.includes(ORIGEN_R2_ANTIGUO)) return;
  img.dataset.reintentoR2 = '1';
  img.src = img.src.replace(ORIGEN_R2_ANTIGUO, ORIGEN_R2_NUEVO);
}
