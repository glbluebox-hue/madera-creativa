import express from 'express';
import { limitadorResena } from './rate-limit.middleware.js';
import { PresupuestosService } from './presupuestos-service.js';

/**
 * Destino final de toda solicitud de reseña — la ficha de Google My
 * Business del negocio. Es un único perfil público (no hay uno distinto
 * por cliente ni por cuenta), así que vive aquí como constante en vez de
 * en la base de datos.
 */
const URL_RESENA_GOOGLE = 'https://g.page/r/CdtYE6HZ9ap5EBM/review';

/**
 * Ruta pública que resuelve el enlace individual de reseña de un cliente
 * (`GET /resena/:token`) — montada SIN `requireAuth` (mismo patrón que
 * `portal-rutas.ts`): el token en la URL es la única autorización, no una
 * sesión, y nunca identifica al cliente en la respuesta.
 *
 * Deliberadamente un único segmento (`/resena/:token`, no `/resena/enlaces/:token`
 * como el Portal): a diferencia del Portal, esta ruta no compite con ninguna
 * página propia del frontend — el cliente que escanea el QR o pulsa el
 * enlace nunca ve una pantalla de esta app, solo la redirección final a
 * Google, así que no hace falta reservar el segmento simple para una ruta
 * de React.
 *
 * Si el token no existe o ya fue revocado (p. ej. se generó uno nuevo y
 * este es un QR antiguo que sigue circulando), se responde con una página
 * mínima explicándolo en vez de redirigir igualmente a Google — un enlace
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
      await svc.registrarClicResena(req.params.token);
      res.redirect(302, URL_RESENA_GOOGLE);
    } catch {
      res.status(410).send(
        '<!doctype html><html lang="es"><meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width, initial-scale=1">' +
          '<title>Enlace no disponible</title>' +
          '<body style="font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;text-align:center;color:#3a332b;padding:0 1.5rem">' +
          '<p style="font-size:1.05rem">Este enlace ya no está disponible.</p>' +
          '<p style="font-size:0.9rem;color:#8a8175">Pide uno nuevo a quien te lo compartió.</p>' +
          '</body></html>'
      );
    }
  });

  return router;
}
