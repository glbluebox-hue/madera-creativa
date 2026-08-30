import { randomBytes, createHash } from 'node:crypto';

/**
 * Único archivo autorizado a hablar con `id.trimble.com` (mismo criterio
 * que `ia-proveedor-openai.ts` para OpenAI, `resend.service.ts` para
 * Resend) — Trimble Identity (OAuth2, Authorization Code + PKCE),
 * endpoints confirmados en la documentación oficial actual
 * (developer.trimble.com/docs/authentication/api/, 30/08/2026):
 * `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`, `/oauth/revoke`.
 *
 * Nunca se pide usuario/contraseña dentro de Madera Creativa: `/oauth/authorize`
 * es una URL de `id.trimble.com` a la que se redirige el navegador — el
 * login (o el "ya tienes sesión, ¿autorizas?") ocurre en Trimble, nunca aquí.
 */

const AUTORIZAR_URL = 'https://id.trimble.com/oauth/authorize';
const TOKEN_URL = 'https://id.trimble.com/oauth/token';
const USERINFO_URL = 'https://id.trimble.com/oauth/userinfo';
const REVOKE_URL = 'https://id.trimble.com/oauth/revoke';

/** Scopes mínimos para leer/escribir proyectos y archivos de Trimble Connect e identificar al usuario. Se ajustará si Trimble exige nombres distintos al darlos de alta en el portal de desarrollador. */
const SCOPES = 'openid email tc:project:read tc:project:write';

export class ErrorTrimbleNoConfigurado extends Error {
  constructor() {
    super('TRIMBLE_CLIENT_ID / TRIMBLE_CLIENT_SECRET no están configurados.');
  }
}

function obtenerCredenciales(): { clientId: string; clientSecret: string } {
  const clientId = process.env.TRIMBLE_CLIENT_ID;
  const clientSecret = process.env.TRIMBLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new ErrorTrimbleNoConfigurado();
  return { clientId, clientSecret };
}

/**
 * Estados OAuth pendientes — igual que `ia-trabajos.ts`: en memoria, TTL
 * corto (una autorización real dura segundos, nunca minutos), nunca en
 * Mongo porque es estado puramente transitorio. Guarda el `codeVerifier`
 * de PKCE (nunca debe viajar por el navegador) y qué `usuarioId`/origen
 * inició el flujo, para recuperarlo con seguridad quando Trimble redirige
 * de vuelta a `/trimble/callback` — un `GET` de navegador normal, sin el
 * `Authorization: Bearer` que usa el resto de la API (`requireAuth` no
 * puede aplicarse ahí).
 */
type EstadoOAuthPendiente = { usuarioId: string; codeVerifier: string; origenRedirect: string; creado: number };
const TTL_ESTADO_MS = 10 * 60 * 1000; // 10 minutos — de sobra para completar un login real en Trimble
const estadosPendientes = new Map<string, EstadoOAuthPendiente>();

function podarEstadosAntiguos(): void {
  const limite = Date.now() - TTL_ESTADO_MS;
  for (const [state, e] of estadosPendientes) {
    if (e.creado < limite) estadosPendientes.delete(state);
  }
}

function base64url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Construye la URL de `id.trimble.com` a la que redirigir el navegador
 * ("Conectar con SketchUp") y registra el estado PKCE pendiente. `usuarioId`
 * viene YA autenticado (esta función se llama desde una ruta con
 * `requireAuth`) — el `state` opaco es lo único que viaja por el
 * navegador, y es indistinguible de un valor aleatorio para cualquiera
 * que no sea este servidor.
 */
export function construirUrlAutorizacion(usuarioId: string, redirectUri: string, origenRedirect: string): string {
  podarEstadosAntiguos();
  const { clientId } = obtenerCredenciales();
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
  const state = base64url(randomBytes(24));
  estadosPendientes.set(state, { usuarioId, codeVerifier, origenRedirect, creado: Date.now() });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTORIZAR_URL}?${params.toString()}`;
}

/** Recupera (y consume — de un solo uso, igual que el propio refresh token de Trimble) el estado pendiente asociado a un `state` — `undefined` si no existe o ya caducó/se usó. */
export function consumirEstadoPendiente(state: string): EstadoOAuthPendiente | undefined {
  podarEstadosAntiguos();
  const estado = estadosPendientes.get(state);
  if (estado) estadosPendientes.delete(state);
  return estado;
}

export type TokensTrimble = { accessToken: string; refreshToken: string; expiraEnSegundos: number; scope: string };

async function llamarTokenEndpoint(body: URLSearchParams): Promise<TokensTrimble> {
  const { clientId, clientSecret } = obtenerCredenciales();
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Trimble Identity respondió ${res.status} al pedir tokens: ${detalle}`);
  }
  const datos = await res.json() as any;
  return {
    accessToken: datos.access_token,
    refreshToken: datos.refresh_token,
    expiraEnSegundos: datos.expires_in ?? 3600,
    scope: datos.scope ?? SCOPES,
  };
}

/** Intercambia el `code` de la redirección de Trimble por tokens reales — paso final del login. */
export function intercambiarCodigoPorTokens(code: string, codeVerifier: string, redirectUri: string): Promise<TokensTrimble> {
  return llamarTokenEndpoint(new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  }));
}

/**
 * Refresca el access token. El refresh token de Trimble es de UN SOLO USO
 * (documentado, 9 días de validez) — la respuesta SIEMPRE trae uno nuevo
 * que hay que guardar en lugar del anterior; usar el viejo tras esto
 * fallaría. El llamante (`trimble-conexion.service.ts`) es responsable de
 * persistir el `refreshToken` devuelto aquí, no solo el `accessToken`.
 */
export function refrescarTokens(refreshToken: string): Promise<TokensTrimble> {
  return llamarTokenEndpoint(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }));
}

/** Datos del usuario de Trimble dueño del access token — solo para mostrar "conectado como…", nunca para autorizar nada. */
export async function obtenerUsuarioTrimble(accessToken: string): Promise<{ email: string }> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Trimble Identity respondió ${res.status} al pedir el usuario.`);
  const datos = await res.json() as any;
  return { email: datos.email ?? '' };
}

/** Revoca el refresh token en el propio Trimble al desconectar — nunca deja una autorización viva del lado de Trimble tras "Desconectar" en Madera Creativa. Nunca lanza: si Trimble ya lo invalidó por su cuenta, el resultado deseado (desconectado) es el mismo. */
export async function revocarToken(refreshToken: string): Promise<void> {
  try {
    const { clientId, clientSecret } = obtenerCredenciales();
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken, client_id: clientId, client_secret: clientSecret }).toString(),
    });
  } catch {
    // Best-effort — ver comentario de la función.
  }
}
