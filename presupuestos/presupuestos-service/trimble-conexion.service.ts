import { randomUUID } from 'node:crypto';
import { conectar } from './cliente.model.js';
import { TrimbleConexionModel } from './trimble-conexion.model.js';
import { cifrar, descifrar } from './trimble-cifrado.js';
import { refrescarTokens, obtenerUsuarioTrimble, revocarToken } from './trimble-oauth.js';
import type { TokensTrimble } from './trimble-oauth.js';

/**
 * Gestiona la conexión Trimble de un usuario: guarda el refresh token
 * cifrado (nunca en claro, nunca una contraseña) y resuelve un access
 * token válido bajo demanda, refrescando en silencio cuando hace falta —
 * el resto de la app nunca toca `trimble-oauth.ts` directamente.
 */

/** Se lanza cuando el usuario no tiene ninguna conexión Trimble guardada — el llamante decide cómo responder (banner "Conectar con SketchUp", nunca un error crudo). */
export class ErrorSinConexionTrimble extends Error {
  constructor() {
    super('No tienes conectada tu cuenta de SketchUp/Trimble todavía.');
  }
}

/** Se lanza cuando el refresh token guardado ya no es válido (revocado en Trimble, o caducado a los 9 días de inactividad) — el llamante debe pedir reconectar, nunca fallar en silencio. */
export class ErrorConexionTrimbleCaducada extends Error {
  constructor() {
    super('Tu conexión con SketchUp ha caducado — vuelve a conectarla.');
  }
}

/** Access tokens ya frescos, en memoria — evita gastar el refresh token (de un solo uso) más de una vez por hora y por usuario. Puramente un caché de rendimiento: si el proceso se reinicia, se refresca de nuevo sin problema. */
const cacheAccessToken = new Map<string, { accessToken: string; expira: number }>();
const MARGEN_EXPIRACION_MS = 60_000; // refresca 1 minuto antes de que caduque de verdad, nunca al límite exacto

export async function obtenerEstadoConexion(usuarioId: string): Promise<{ conectado: boolean; trimbleEmail: string }> {
  await conectar();
  const doc = await TrimbleConexionModel.findOne({ usuarioId }).lean().exec();
  return { conectado: !!doc, trimbleEmail: (doc as any)?.trimbleEmail || '' };
}

/** Guarda (o reemplaza) la conexión tras un login o un refresco real — SIEMPRE con el refresh token más reciente, nunca el anterior (de un solo uso). */
async function guardarTokens(usuarioId: string, tokens: TokensTrimble, trimbleEmail?: string): Promise<void> {
  await conectar();
  const ahora = new Date().toISOString();
  const caduca = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString();
  const actualizacion: Record<string, unknown> = {
    refreshTokenCifrado: cifrar(tokens.refreshToken),
    scopes: tokens.scope.split(' ').filter(Boolean),
    refreshTokenCaduca: caduca,
    actualizado: ahora,
  };
  if (trimbleEmail) actualizacion.trimbleEmail = trimbleEmail;
  await TrimbleConexionModel.findOneAndUpdate(
    { usuarioId },
    { $set: actualizacion, $setOnInsert: { id: randomUUID(), usuarioId, creado: ahora } },
    { upsert: true, setDefaultsOnInsert: true }
  ).exec();
  cacheAccessToken.set(usuarioId, { accessToken: tokens.accessToken, expira: Date.now() + tokens.expiraEnSegundos * 1000 - MARGEN_EXPIRACION_MS });
}

/** Se llama justo después del intercambio inicial de `code` por tokens (`trimble-rutas.ts`, callback) — sí conoce el email real de Trimble, a diferencia de un refresco silencioso posterior. */
export async function registrarConexionInicial(usuarioId: string, tokens: TokensTrimble): Promise<void> {
  const { email } = await obtenerUsuarioTrimble(tokens.accessToken).catch(() => ({ email: '' }));
  await guardarTokens(usuarioId, tokens, email);
}

/**
 * Devuelve un access token de Trimble válido para `usuarioId`, refrescando
 * en silencio si hace falta — nunca pide al usuario que vuelva a iniciar
 * sesión salvo que el refresh token guardado ya no sirva (`ErrorConexionTrimbleCaducada`).
 */
export async function obtenerAccessTokenValido(usuarioId: string): Promise<string> {
  const enCache = cacheAccessToken.get(usuarioId);
  if (enCache && enCache.expira > Date.now()) return enCache.accessToken;

  await conectar();
  const doc = await TrimbleConexionModel.findOne({ usuarioId }).lean().exec();
  if (!doc) throw new ErrorSinConexionTrimble();

  let refreshToken: string;
  try {
    refreshToken = descifrar((doc as any).refreshTokenCifrado);
  } catch {
    throw new ErrorConexionTrimbleCaducada();
  }

  try {
    const tokens = await refrescarTokens(refreshToken);
    await guardarTokens(usuarioId, tokens);
    return tokens.accessToken;
  } catch {
    // Un refresh token rechazado por Trimble (revocado, caducado a los 9 días) no se puede
    // distinguir de un fallo de red desde aquí sin arriesgar falsos positivos — se trata
    // siempre como "hay que reconectar", que es la respuesta segura en ambos casos: nunca
    // deja al usuario pensando que sigue conectado cuando no lo está.
    throw new ErrorConexionTrimbleCaducada();
  }
}

/** Desconecta: revoca el token en el propio Trimble (best-effort) y borra la conexión guardada. */
export async function desconectar(usuarioId: string): Promise<void> {
  await conectar();
  const doc = await TrimbleConexionModel.findOne({ usuarioId }).lean().exec();
  if (doc) {
    try {
      await revocarToken(descifrar((doc as any).refreshTokenCifrado));
    } catch {
      // Sigue con el borrado local igualmente — ver `revocarToken`.
    }
  }
  cacheAccessToken.delete(usuarioId);
  await TrimbleConexionModel.deleteOne({ usuarioId }).exec();
}
