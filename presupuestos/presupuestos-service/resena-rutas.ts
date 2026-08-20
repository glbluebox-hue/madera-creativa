import express from 'express';
import { limitadorResena } from './rate-limit.middleware.js';
import { PresupuestosService } from './presupuestos-service.js';

const PAGINA_NO_DISPONIBLE =
  '<!doctype html><html lang="es"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>Enlace no disponible</title>' +
  '<body style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;text-align:center;color:#3a332b;padding:0 1.5rem">' +
  '<p style="font-size:1.05rem">Este enlace ya no está disponible.</p>' +
  '<p style="font-size:0.9rem;color:#8a8175">Pide uno nuevo a quien te lo compartió.</p>' +
  '</body></html>';

/** Escapa para insertar de forma segura dentro de un atributo HTML entre comillas dobles. */
function escaparAtributoHtml(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Página que ve el cliente al abrir su enlace/QR — el cartel de
 * agradecimiento propio de la empresa (si lo subió en Ajustes de empresa)
 * seguido de un botón grande hacia SU ficha de Google (petición del
 * usuario, 20/08/2026: antes esta ruta redirigía directo a una URL fija de
 * Madera Creativa, compartida por todas las cuentas — ver
 * `resolverEnlaceResena` en `presupuestos-service.ts`).
 */
function paginaResena(urlGoogle: string, imagenResena: string): string {
  const urlEscapada = escaparAtributoHtml(urlGoogle);
  const imagen = imagenResena
    ? `<img src="${escaparAtributoHtml(imagenResena)}" alt="Gracias por confiar en nosotros" style="width:100%;max-width:420px;border-radius:18px;box-shadow:0 12px 32px rgba(24,20,15,0.18)">`
    : '';
  return (
    '<!doctype html><html lang="es"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Déjanos tu reseña</title>' +
    '<body style="margin:0;font-family:system-ui,sans-serif;background:#f3ede4;display:flex;flex-direction:column;align-items:center;padding:1.5rem 1rem 3rem">' +
    imagen +
    `<a href="${urlEscapada}" style="margin-top:1.75rem;width:100%;max-width:420px;box-sizing:border-box;text-align:center;background:#3a2e22;color:#fff;font-size:1.05rem;font-weight:700;text-decoration:none;padding:1rem;border-radius:12px;box-shadow:0 4px 14px rgba(24,20,15,0.2)">Dejar mi reseña en Google →</a>` +
    '</body></html>'
  );
}

/**
 * Ruta pública que resuelve el enlace individual de reseña de un cliente
 * (`GET /resena/:token`) — montada SIN `requireAuth` (mismo patrón que
 * `portal-rutas.ts`): el token en la URL es la única autorización, no una
 * sesión, y nunca identifica al cliente en la respuesta.
 *
 * Deliberadamente un único segmento (`/resena/:token`, no `/resena/enlaces/:token`
 * como el Portal): esta ruta no compite con ninguna página propia del
 * frontend — todo lo que ve el cliente (cartel + botón) lo sirve esta
 * misma ruta como HTML plano, sin pasar por el SPA de React.
 *
 * Si el token no existe, ya fue revocado, o la empresa ya no tiene un
 * enlace de Google configurado, se responde con una página mínima
 * explicándolo en vez de mostrar cualquier cosa a medias — un enlace
 * revocado debe dejar de funcionar de verdad, no solo dejar de mostrarse
 * en la app.
 */
export function crearRouterResena(): express.Router {
  const router = express.Router();
  const svc = PresupuestosService.from();

  router.use((_req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/:token', limitadorResena, async (req, res) => {
    try {
      const { urlGoogle, imagenResena } = await svc.resolverEnlaceResena(req.params.token);
      res.send(paginaResena(urlGoogle, imagenResena));
    } catch {
      res.status(410).send(PAGINA_NO_DISPONIBLE);
    }
  });

  return router;
}
