import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser';
import { fetchConAuth, establecerAccessToken } from './api.js';
import type { PlanAcceso } from './planes.js';

/**
 * Acceso biométrico (WebAuthn/passkeys) del lado del cliente: registra y
 * usa el autenticador seguro del propio dispositivo (huella, Face ID, PIN
 * del sistema) a través de las APIs estándar del navegador —
 * `@simplewebauthn/browser` solo traduce entre JSON y los tipos nativos de
 * `navigator.credentials`. Nunca hay cámara, reconocimiento facial propio
 * ni dato biométrico que pase por este código: el sistema operativo lo
 * resuelve en local y aquí solo se ve el resultado firmado.
 *
 * Mismo patrón que `use-registro.ts`: funciones planas, no un hook de
 * React — las rutas del servidor están en `webauthn-rutas.ts`.
 */

// Ver el comentario de `BASE` en api.ts — mismo criterio (Bit local vs. Render combinado).
const BASE = (import.meta as any).env?.VITE_API_BASE ?? '/api/presupuestos-service';

/** Dispositivo con acceso biométrico registrado (sin ningún dato sensible). */
export type CredencialBiometrica = {
  id: string;
  nombreDispositivo: string;
  creadoEn: string;
  ultimoUso: string;
};

/** Código de error específico para poder mostrar el mensaje adecuado en la interfaz. */
export type CodigoErrorBiometria =
  | 'no-soportado'      // el navegador no implementa WebAuthn
  | 'sin-autenticador'   // el dispositivo no tiene autenticador de plataforma disponible
  | 'cancelado'          // el usuario canceló, o no había ninguna credencial que ofrecer
  | 'sesion-expirada'    // 401/403 en una llamada que exige sesión
  | 'error-red'
  | 'otro';

export type ResultadoBiometria<T = undefined> =
  | ({ ok: true } & (T extends undefined ? {} : T))
  | { ok: false; error: string; codigo: CodigoErrorBiometria };

/** true si el navegador implementa la API WebAuthn (comprobación síncrona, sin preguntar al dispositivo). */
export function soportaWebAuthn(): boolean {
  return browserSupportsWebAuthn();
}

/**
 * true si el dispositivo tiene disponible un autenticador de plataforma
 * (huella, Face ID, Windows Hello, PIN...) — a diferencia de
 * `soportaWebAuthn()`, esto sí le pregunta al sistema operativo, así que es
 * asíncrono. Nunca lanza: cualquier fallo de la propia comprobación se
 * interpreta como "no disponible".
 */
export async function hayAutenticadorDePlataforma(): Promise<boolean> {
  if (!soportaWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

/** Traduce un error lanzado por `startRegistration`/`startAuthentication` a un código estable para la interfaz. */
function clasificarErrorCeremonia(err: unknown): { error: string; codigo: CodigoErrorBiometria } {
  const nombre = err instanceof Error ? err.name : '';
  // NotAllowedError cubre tanto "el usuario canceló el diálogo" como "el
  // dispositivo no tenía ninguna credencial que ofrecer" — el navegador no
  // distingue ambos casos por diseño (evita que una web pueda averiguar si
  // existe o no una passkey concreta).
  if (nombre === 'NotAllowedError') {
    return { error: 'No se ha completado la verificación con tu autenticador.', codigo: 'cancelado' };
  }
  if (nombre === 'InvalidStateError') {
    return { error: 'Este dispositivo ya está registrado.', codigo: 'otro' };
  }
  if (err instanceof Error && err.message) {
    return { error: err.message, codigo: 'otro' };
  }
  return { error: 'No se ha podido completar la operación con tu autenticador.', codigo: 'otro' };
}

/** Lanza error con codigo, igual que `api.ts`, para que el llamante pueda distinguir sesión caducada de otros fallos. */
async function comprobarRespuestaBiometria(res: Response, mensajePorDefecto: string): Promise<{ ok: true } | { ok: false; error: string; codigo: CodigoErrorBiometria }> {
  if (res.ok) return { ok: true };
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar con tu contraseña.', codigo: 'sesion-expirada' };
  }
  const cuerpo = await res.json().catch(() => null) as { error?: string } | null;
  return { ok: false, error: cuerpo?.error || mensajePorDefecto, codigo: 'otro' };
}

// ── Registro (activar el acceso biométrico desde Ajustes) ──────────────────────

/**
 * Ceremonia completa de registro: pide opciones al servidor, invoca al
 * autenticador del dispositivo y envía la respuesta a verificar. Requiere
 * sesión ya iniciada por contraseña (`fetchConAuth`).
 */
export async function registrarAccesoBiometrico(nombreDispositivo: string): Promise<ResultadoBiometria> {
  if (!soportaWebAuthn()) {
    return { ok: false, error: 'Este dispositivo o navegador no admite acceso biométrico.', codigo: 'no-soportado' };
  }
  try {
    const resOpciones = await fetchConAuth('/auth/webauthn/registro/opciones', { method: 'POST' });
    const comprobacionOpciones = await comprobarRespuestaBiometria(resOpciones, 'No se pudieron preparar las opciones de registro.');
    if (!comprobacionOpciones.ok) return comprobacionOpciones;
    const opciones = await resOpciones.json();

    let respuesta;
    try {
      respuesta = await startRegistration({ optionsJSON: opciones });
    } catch (err) {
      return { ok: false, ...clasificarErrorCeremonia(err) };
    }

    const resVerificar = await fetchConAuth('/auth/webauthn/registro/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respuesta, nombreDispositivo: nombreDispositivo.trim() || 'Este dispositivo' }),
    });
    const comprobacionVerificar = await comprobarRespuestaBiometria(resVerificar, 'No se pudo verificar el registro.');
    if (!comprobacionVerificar.ok) return comprobacionVerificar;
    return { ok: true };
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor.', codigo: 'error-red' };
  }
}

/** Lista los dispositivos con acceso biométrico registrados para la cuenta activa. */
export async function listarCredencialesBiometricas(): Promise<CredencialBiometrica[]> {
  const res = await fetchConAuth('/auth/webauthn/credenciales');
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/** Elimina un dispositivo registrado (desactivar, o paso previo a volver a registrar). */
export async function borrarCredencialBiometrica(id: string): Promise<void> {
  const res = await fetchConAuth(`/auth/webauthn/credenciales/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(String(res.status));
}

// ── Login (entrar con el autenticador del dispositivo) ──────────────────────────

/** Resultado de un login biométrico exitoso — mismo shape que `ResultadoAuth` de `use-registro.ts`. */
export type SesionBiometrica = { id: string; nombre: string; esAdmin: boolean; estado: string; plan?: PlanAcceso };

/**
 * Ceremonia completa de login: sin sesión previa. Pide opciones (sin
 * indicar usuario — credenciales "discoverable"/passkeys), deja que el
 * usuario elija en el diálogo nativo del dispositivo, y verifica la
 * respuesta contra el servidor. Si tiene éxito, guarda el access token en
 * memoria igual que `loginEnServidor`.
 */
export async function iniciarSesionBiometrica(): Promise<ResultadoBiometria<SesionBiometrica>> {
  if (!soportaWebAuthn()) {
    return { ok: false, error: 'Este dispositivo o navegador no admite acceso biométrico.', codigo: 'no-soportado' };
  }
  try {
    const resOpciones = await fetch(`${BASE}/auth/webauthn/login/opciones`, { method: 'POST', credentials: 'include' });
    if (!resOpciones.ok) {
      return { ok: false, error: 'No se pudo iniciar el acceso biométrico.', codigo: 'otro' };
    }
    const opciones = await resOpciones.json();

    let respuesta;
    try {
      respuesta = await startAuthentication({ optionsJSON: opciones });
    } catch (err) {
      return { ok: false, ...clasificarErrorCeremonia(err) };
    }

    const resVerificar = await fetch(`${BASE}/auth/webauthn/login/verificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ respuesta }),
    });
    const data = await resVerificar.json().catch(() => null) as any;
    if (!resVerificar.ok) {
      return { ok: false, error: data?.error || 'No se pudo verificar tu acceso biométrico.', codigo: 'otro' };
    }
    establecerAccessToken(data.accessToken);
    return { ok: true, id: data.id, nombre: data.nombre, esAdmin: !!data.esAdmin, estado: data.estado, plan: data.plan };
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor.', codigo: 'error-red' };
  }
}
