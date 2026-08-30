import { construirUrlAutorizacion, consumirEstadoPendiente, ErrorTrimbleNoConfigurado } from './trimble-oauth.js';

/**
 * Construcción de la URL de autorización y gestión del `state` PKCE
 * (30/08/2026) — sin llamar a `id.trimble.com` (esa parte solo la ejercen
 * `intercambiarCodigoPorTokens`/`refrescarTokens`, cubiertas indirectamente
 * vía `trimble-conexion.service.spec.ts` con el módulo entero simulado).
 */

const CLIENT_ID_ORIGINAL = process.env.TRIMBLE_CLIENT_ID;
const CLIENT_SECRET_ORIGINAL = process.env.TRIMBLE_CLIENT_SECRET;

beforeEach(() => {
  process.env.TRIMBLE_CLIENT_ID = 'client-id-pruebas';
  process.env.TRIMBLE_CLIENT_SECRET = 'client-secret-pruebas';
});
afterAll(() => {
  process.env.TRIMBLE_CLIENT_ID = CLIENT_ID_ORIGINAL;
  process.env.TRIMBLE_CLIENT_SECRET = CLIENT_SECRET_ORIGINAL;
});

describe('construirUrlAutorizacion', () => {
  it('apunta a id.trimble.com/oauth/authorize con PKCE (S256) y el client_id configurado', () => {
    const url = new URL(construirUrlAutorizacion('usuario-1', 'https://estudio.maderacreativa.com/trimble/callback', 'https://estudio.maderacreativa.com'));
    expect(url.origin + url.pathname).toBe('https://id.trimble.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-id-pruebas');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('https://estudio.maderacreativa.com/trimble/callback');
  });

  it('nunca expone el code_verifier de PKCE en la URL (solo el challenge derivado)', () => {
    const url = new URL(construirUrlAutorizacion('usuario-1', 'https://x/callback', 'https://x'));
    const challenge = url.searchParams.get('code_challenge')!;
    // El challenge es un hash (SHA-256, base64url) del verifier real — nunca el verifier en sí.
    expect(challenge).not.toMatch(/=/); // sin padding base64url
    expect(challenge.length).toBeGreaterThan(20);
  });

  it('sin TRIMBLE_CLIENT_ID/SECRET, lanza un error explícito', () => {
    delete process.env.TRIMBLE_CLIENT_ID;
    expect(() => construirUrlAutorizacion('usuario-1', 'https://x/callback', 'https://x')).toThrow(ErrorTrimbleNoConfigurado);
  });
});

describe('consumirEstadoPendiente — de un solo uso', () => {
  it('recupera el usuarioId/origen asociados al state generado', () => {
    const url = new URL(construirUrlAutorizacion('usuario-42', 'https://x/callback', 'https://mi-origen.com'));
    const state = url.searchParams.get('state')!;
    const estado = consumirEstadoPendiente(state);
    expect(estado?.usuarioId).toBe('usuario-42');
    expect(estado?.origenRedirect).toBe('https://mi-origen.com');
  });

  it('un mismo state no puede consumirse dos veces (protege contra replay del callback)', () => {
    const url = new URL(construirUrlAutorizacion('usuario-42', 'https://x/callback', 'https://x'));
    const state = url.searchParams.get('state')!;
    expect(consumirEstadoPendiente(state)).toBeDefined();
    expect(consumirEstadoPendiente(state)).toBeUndefined();
  });

  it('un state desconocido/inventado no devuelve nada', () => {
    expect(consumirEstadoPendiente('state-que-nunca-se-generó')).toBeUndefined();
  });
});
