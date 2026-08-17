import express from 'express';
import { responderError } from './presupuestos-service.app-root.js';
import { validar } from './validacion.middleware.js';
import { limitadorPortalVer, limitadorPortalAceptar } from './rate-limit.middleware.js';
import { esquemaAceptarPortalPublico } from './esquemas-validacion.js';
import { PresupuestosService } from './presupuestos-service.js';

/**
 * Rutas públicas del Portal del cliente — montadas SIN `requireAuth` (mismo
 * patrón que `webauthn-rutas.ts`): el token del enlace es la única
 * autorización, no una sesión. Nunca leen `req.usuarioId` porque no existe;
 * `presupuestos-service.ts` resuelve el usuario propietario a partir del
 * propio enlace.
 *
 * La página humana (React, `/portal/:token`, un solo segmento) y esta API
 * (`/portal/presupuestos/:token`, dos segmentos) no colisionan: Express
 * hace match exacto por segmento, así que una petición a `/portal/<token>`
 * nunca entra a este router y cae al catch-all del frontend estático.
 *
 * Cabeceras deliberadas en las dos rutas: el token va en la URL, así que
 * `Referrer-Policy: no-referrer` evita que se filtre a terceros vía la
 * cabecera Referer; `X-Robots-Tag: noindex` evita que un buscador lo
 * indexe; `Cache-Control: no-store` evita que quede cacheado en un proxy
 * intermedio o en el propio navegador (revisión de seguridad, 17/08/2026).
 */
export function crearRouterPortal(): express.Router {
  const router = express.Router();
  const svc = PresupuestosService.from();

  router.use((_req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/presupuestos/:token', limitadorPortalVer, async (req, res) => {
    try {
      res.json(await svc.obtenerPresupuestoPublico(req.params.token));
    } catch (err) { responderError(req, res, err); }
  });

  router.post('/presupuestos/:token/aceptar', limitadorPortalAceptar, validar(esquemaAceptarPortalPublico), async (req, res) => {
    try {
      const resultado = await svc.aceptarPresupuestoPublico(req.params.token, {
        ip: req.ip || '',
        userAgent: req.get('user-agent') || '',
        firmaDataUrl: req.body.firma,
      });
      res.json(resultado);
    } catch (err) { responderError(req, res, err); }
  });

  return router;
}
