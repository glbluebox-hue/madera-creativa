import { firmarAccessToken } from './token.service.js';
import { crearRefreshToken } from './refresh-token.model.js';

/**
 * Emite el par access+refresh token de una sesión — exactamente lo mismo
 * que hacía `/auth/login` en línea. Extraído para que `/auth/webauthn/login/verificar`
 * (`webauthn-rutas.ts`) pueda emitir la misma sesión real tras verificar una
 * credencial WebAuthn, sin duplicar la lógica de firma de tokens.
 */
export async function emitirSesion(usuarioId: string, esAdmin: boolean): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = firmarAccessToken({ sub: usuarioId, esAdmin });
  const refreshToken = await crearRefreshToken(usuarioId);
  return { accessToken, refreshToken };
}
