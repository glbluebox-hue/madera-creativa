import express from 'express';
import type { AuthRequest } from './presupuestos-service.app-root.js';
import {
  construirUrlAutorizacion, consumirEstadoPendiente, intercambiarCodigoPorTokens, ErrorTrimbleNoConfigurado,
} from './trimble-oauth.js';
import {
  obtenerEstadoConexion, registrarConexionInicial, desconectar, obtenerAccessTokenValido,
  ErrorSinConexionTrimble, ErrorConexionTrimbleCaducada,
} from './trimble-conexion.service.js';

/**
 * Router de la integración Trimble/SketchUp (Fase "Diseño 3D", 30/08/2026)
 * — mismo patrón que `crearRouterIA()`: se monta bajo `/trimble` con
 * `requireAuth` YA aplicado por el llamante, EXCEPTO `/callback`, que
 * Trimble alcanza con una navegación de navegador normal (sin el header
 * `Authorization: Bearer` que usa el resto de la API) — su seguridad viene
 * del `state` opaco de un solo uso (`consumirEstadoPendiente`), no de
 * `requireAuth`. Por eso `/callback` se monta en un router APARTE, sin
 * `requireAuth`, y el resto conserva la protección normal.
 */

const REDIRECT_URI_ENV = 'TRIMBLE_REDIRECT_URI';

function redirectUriConfigurado(): string {
  const uri = process.env[REDIRECT_URI_ENV];
  if (!uri) throw new Error(`${REDIRECT_URI_ENV} no está configurada — debe coincidir EXACTAMENTE con la registrada en el portal de Trimble.`);
  return uri;
}

function responderErrorTrimble(res: express.Response, err: unknown): void {
  if (err instanceof ErrorTrimbleNoConfigurado) { res.status(503).json({ error: 'La integración con SketchUp no está configurada todavía.' }); return; }
  if (err instanceof ErrorSinConexionTrimble) { res.status(409).json({ error: err.message, codigo: 'sin_conexion' }); return; }
  if (err instanceof ErrorConexionTrimbleCaducada) { res.status(409).json({ error: err.message, codigo: 'conexion_caducada' }); return; }
  res.status(500).json({ error: 'No se pudo completar la operación con SketchUp/Trimble.' });
}

/** Rutas autenticadas normales — montar como `app.use('/trimble', requireAuth, crearRouterTrimble())`. */
export function crearRouterTrimble(): express.Router {
  const router = express.Router();

  router.get('/estado', async (req: AuthRequest, res) => {
    try { res.json(await obtenerEstadoConexion(req.usuarioId!)); }
    catch (err) { responderErrorTrimble(res, err); }
  });

  /**
   * Devuelve la URL de `id.trimble.com` a la que el FRONTEND debe navegar
   * (`window.location.href = url`) — nunca se redirige desde aquí mismo,
   * porque esta ruta se llama con `fetch` (Bearer token), no con una
   * navegación de página completa. El origen al que volver tras el login
   * se deriva de `TRIMBLE_REDIRECT_URI` (nunca del header `Origin`: en
   * producción el frontend y esta API comparten dominio bajo un prefijo
   * de proxy, y `Origin` no siempre viaja en peticiones del mismo
   * origen) — un único dominio público, sin ambigüedad posible.
   */
  router.get('/url-conectar', (req: AuthRequest, res) => {
    try {
      const origen = new URL(redirectUriConfigurado()).origin;
      const url = construirUrlAutorizacion(req.usuarioId!, redirectUriConfigurado(), origen);
      res.json({ url });
    } catch (err) { responderErrorTrimble(res, err); }
  });

  router.delete('/conexion', async (req: AuthRequest, res) => {
    try { await desconectar(req.usuarioId!); res.json({ ok: true }); }
    catch (err) { responderErrorTrimble(res, err); }
  });

  /** Access token de corta duración (60 min) para que el frontend lo pase a `embed.setTokens()` del Workspace API de Trimble — nunca el refresh token, ver `trimble-conexion.service.ts`. */
  router.get('/token-embed', async (req: AuthRequest, res) => {
    try { res.json({ accessToken: await obtenerAccessTokenValido(req.usuarioId!) }); }
    catch (err) { responderErrorTrimble(res, err); }
  });

  return router;
}

/** Callback OAuth — SIN `requireAuth` (ver comentario de arriba). Montar como `app.use('/trimble', crearRouterTrimbleCallback())`, ANTES o DESPUÉS del router autenticado da igual: las rutas no se solapan. */
export function crearRouterTrimbleCallback(): express.Router {
  const router = express.Router();

  router.get('/callback', async (req, res) => {
    const { code, state, error: errorTrimble } = req.query as Record<string, string | undefined>;
    const pendiente = typeof state === 'string' ? consumirEstadoPendiente(state) : undefined;
    // Sin `pendiente` no hay ni `usuarioId` ni origen seguro a los que volver — un `state`
    // desconocido/reutilizado/caducado no puede tratarse como un error de UN usuario
    // concreto (podría ser un intento de replay), así que responde genérico, sin redirigir.
    if (!pendiente) { res.status(400).send('Enlace de conexión con SketchUp inválido o caducado — vuelve a intentarlo desde Madera Creativa.'); return; }

    const volver = (query: string) => res.redirect(`${pendiente.origenRedirect}/?${query}`);

    if (errorTrimble || typeof code !== 'string') { volver('trimble=error'); return; }

    try {
      const tokens = await intercambiarCodigoPorTokens(code, pendiente.codeVerifier, redirectUriConfigurado());
      await registrarConexionInicial(pendiente.usuarioId, tokens);
      volver('trimble=conectado');
    } catch {
      volver('trimble=error');
    }
  });

  return router;
}
