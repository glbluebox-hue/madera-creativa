import express from 'express';
import { responderError } from './presupuestos-service.app-root.js';
import { validar } from './validacion.middleware.js';
import { limitadorSeguimientoVer, limitadorSeguimientoResponder } from './rate-limit.middleware.js';
import { esquemaResponderSeguimientoPublico } from './esquemas-validacion.js';
import { PresupuestosService } from './presupuestos-service.js';

/**
 * Rutas públicas del Seguimiento de presupuestos — montadas SIN `requireAuth`
 * (mismo patrón que `portal-rutas.ts`): el token del enlace es la única
 * autorización, no una sesión.
 *
 * API JSON (no HTML crudo como `resena-rutas.ts`): el cuestionario de 7
 * pantallas es interactivo y lo sirve el propio SPA de React en
 * `/seguimiento/:token` (`cuestionario-seguimiento.tsx`) — esta ruta
 * (`/seguimiento/presupuestos/:token`, dos segmentos) solo resuelve datos,
 * igual que `/portal/presupuestos/:token` no colisiona con `/portal/:token`.
 *
 * Mismas cabeceras deliberadas que el Portal: el token va en la URL.
 */
export function crearRouterSeguimiento(): express.Router {
  const router = express.Router();
  const svc = PresupuestosService.from();

  router.use((_req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.get('/presupuestos/:token', limitadorSeguimientoVer, async (req, res) => {
    try {
      res.json(await svc.obtenerSeguimientoPublico(req.params.token));
    } catch (err) { responderError(req, res, err); }
  });

  router.post('/presupuestos/:token/responder', limitadorSeguimientoResponder, validar(esquemaResponderSeguimientoPublico), async (req, res) => {
    try {
      res.json(await svc.guardarRespuestaSeguimientoPublico(req.params.token, req.body));
    } catch (err) { responderError(req, res, err); }
  });

  return router;
}
