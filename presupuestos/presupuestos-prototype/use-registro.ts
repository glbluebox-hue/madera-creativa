/**
 * Utilidades para registrar y autenticar usuarios contra el servidor de Madera Creativa.
 * El servidor es la fuente de verdad para el control de acceso.
 *
 * La contraseña se envía en claro sobre HTTPS — el hashing con sal (bcrypt)
 * ocurre exclusivamente en el servidor, nunca en el cliente. Ver `password.service.ts`
 * en `presupuestos-service`.
 *
 * El access token que devuelve el login se guarda a través de
 * `establecerAccessToken()` (ver `api.ts`) — nunca en `localStorage`. El
 * refresh token viaja en una cookie httpOnly que el navegador gestiona solo.
 */

import { establecerAccessToken } from './api.js';
import type { PlanAcceso } from './planes.js';

// Ver el comentario de `BASE` en api.ts — mismo criterio (Bit local vs. Render combinado).
const BASE = (import.meta as any).env?.VITE_API_BASE ?? '/api/presupuestos-service';

/** Resultado de un intento de login/registro. */
export type ResultadoAuth = {
  ok: boolean;
  id?: string;
  nombre?: string;
  esAdmin?: boolean;
  estado?: string;
  /** Plan comercial actual (Fase 1, 04/09/2026) — presente en login/verificación de acceso, no en registro/recuperación. */
  plan?: PlanAcceso;
  error?: string;
  codigo?: 'pendiente' | 'suspendido' | 'email-no-verificado' | 'error-red' | 'credenciales';
  /** Solo en registro: si se indicó un código y no era válido, explica por qué (el registro no se bloquea por esto). */
  avisoCodigo?: string;
};

/**
 * Registra un nuevo usuario en el servidor. Verificación de email
 * (04/09/2026): la cuenta queda `activa` de inmediato siempre, con o sin
 * código — pero no puede iniciar sesión hasta verificar el email que el
 * servidor le manda (ver `loginEnServidor`, código `'email-no-verificado'`).
 */
export async function registrarEnServidor(nombre: string, password: string, codigoPromocional?: string): Promise<ResultadoAuth> {
  try {
    const res = await fetch(`${BASE}/auth/registrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ nombre, password, ...(codigoPromocional ? { codigoPromocional } : {}) }),
    });
    const data = await res.json() as any;
    if (res.status === 409) return { ok: false, error: 'Ese nombre de usuario ya existe.', codigo: 'credenciales' };
    // 400 = datos inválidos (p. ej. contraseña demasiado corta) — es un error del
    // usuario, no de conexión: no debe caer al registro local como si el servidor
    // no respondiera.
    if (res.status === 400) {
      return { ok: false, error: data.detalles?.[0]?.mensaje || data.error || 'Datos inválidos.', codigo: 'credenciales' };
    }
    if (!res.ok) return { ok: false, error: data.error || 'Error al registrarse.', codigo: 'error-red' };
    return { ok: true, id: data.id, estado: data.estado, avisoCodigo: data.avisoCodigo };
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor.', codigo: 'error-red' };
  }
}

/**
 * Pide el enlace de recuperación de contraseña por email (26/08/2026).
 * Siempre responde `ok: true` si el servidor respondió — nunca revela si
 * ese email existe o no (lo decide el propio servidor, ver
 * `/auth/solicitar-recuperacion`).
 */
export async function solicitarRecuperacion(nombre: string): Promise<ResultadoAuth> {
  try {
    const res = await fetch(`${BASE}/auth/solicitar-recuperacion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || 'No se pudo procesar la solicitud.', codigo: 'error-red' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor.', codigo: 'error-red' };
  }
}

/** Consume el token del enlace de recuperación y fija la contraseña nueva. */
export async function restablecerPassword(token: string, passwordNueva: string): Promise<ResultadoAuth> {
  try {
    const res = await fetch(`${BASE}/auth/restablecer-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, passwordNueva }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || 'No se pudo restablecer la contraseña.', codigo: 'credenciales' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor.', codigo: 'error-red' };
  }
}

/** Consume el token del enlace de verificación de email (04/09/2026, ver `/auth/verificar-email`). */
export async function verificarEmail(token: string): Promise<ResultadoAuth> {
  try {
    const res = await fetch(`${BASE}/auth/verificar-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || 'No se pudo verificar el email.', codigo: 'credenciales' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor.', codigo: 'error-red' };
  }
}

/**
 * Inicia sesión verificando credenciales contra el servidor.
 * Devuelve error específico si la cuenta está pendiente o suspendida.
 */
export async function loginEnServidor(nombre: string, password: string): Promise<ResultadoAuth> {
  try {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ nombre, password }),
    });
    const data = await res.json() as any;
    if (res.status === 403 && data.error === 'pendiente') {
      return { ok: false, error: data.mensaje, codigo: 'pendiente' };
    }
    if (res.status === 403 && data.error === 'suspendido') {
      return { ok: false, error: data.mensaje, codigo: 'suspendido' };
    }
    if (res.status === 403 && data.error === 'email-no-verificado') {
      return { ok: false, error: data.mensaje, codigo: 'email-no-verificado' };
    }
    if (!res.ok) return { ok: false, error: data.error || 'Usuario o contraseña incorrectos.', codigo: 'credenciales' };
    establecerAccessToken(data.accessToken);
    return { ok: true, id: data.id, nombre: data.nombre, esAdmin: data.esAdmin, estado: data.estado, plan: data.plan };
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor. Inténtalo de nuevo.', codigo: 'error-red' };
  }
}
