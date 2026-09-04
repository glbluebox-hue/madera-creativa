import { useState, useCallback, useEffect, useRef } from 'react';
import { alPerderSesion, cerrarSesionServidor, refrescarSesion } from './api.js';
import type { PlanAcceso } from './planes.js';

// ── Claves de almacenamiento ──────────────────────────────────────────────────
const KEY_SESION       = 'mc_sesion';           // usuario activo
const KEY_ACTIVIDAD    = 'mc_auth_actividad';   // timestamp última actividad
const KEY_USUARIOS     = 'mc_usuarios';          // array de usuarios registrados

/** Minutos de inactividad antes del cierre automático de sesión. */
const MINUTOS_INACTIVIDAD = 5;
const MS_INACTIVIDAD = MINUTOS_INACTIVIDAD * 60 * 1000;

const EVENTOS_ACTIVIDAD = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;

// ── Tipos ─────────────────────────────────────────────────────────────────────

/** Datos de un usuario registrado en la app. */
export type UsuarioRegistrado = {
  id: string;
  nombre: string;
  passwordHash: string;
  creadoEn: string;
};

/** Sesión activa. */
export type SesionActiva = {
  usuarioId: string;
  nombre: string;
  esAdmin?: boolean;
  /** Plan comercial actual de la cuenta (Fase 1, 04/09/2026) — viene de la respuesta del servidor al iniciar sesión, nunca se calcula en el cliente. */
  plan?: PlanAcceso;
};

/** Resultado del hook de autenticación. */
export type UseAuthResult = {
  autenticado: boolean;
  /**
   * true mientras se renueva en silencio el access token tras recargar la
   * página (Dirección Creativa — corrige una carrera real: sin esto, la app
   * se renderizaba ya autenticada, con todas las pantallas disparando sus
   * peticiones, antes de tener un access token válido en memoria. Cada
   * petición se recuperaba sola reintentando tras la renovación, pero al
   * ser una carrera y no una garantía, alguna quedaba vacía de forma
   * intermitente — típicamente "clientes").
   */
  verificando: boolean;
  sesion: SesionActiva | null;
  /** Prefijo único para separar los datos de cada usuario en localStorage. */
  storagePrefix: string;
  login: (nombre: string, password: string) => { ok: boolean; error?: string };
  /** Establece la sesión directamente sin verificar en localStorage (para login validado por servidor). */
  loginDirecto: (id: string, nombre: string, esAdmin: boolean, plan?: PlanAcceso) => void;
  registrar: (nombre: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
};

// ── Utilidades ────────────────────────────────────────────────────────────────

/** Hash simple para contraseñas (no criptográfico — suficiente para uso local). */
function hashSimple(texto: string): string {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return 'h' + Math.abs(hash).toString(36);
}

function generarId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function cargarUsuarios(): UsuarioRegistrado[] {
  try { return JSON.parse(localStorage.getItem(KEY_USUARIOS) ?? '[]') as UsuarioRegistrado[]; } catch { return []; }
}

function guardarUsuarios(us: UsuarioRegistrado[]): void {
  try { localStorage.setItem(KEY_USUARIOS, JSON.stringify(us)); } catch { /* noop */ }
}

/**
 * Lee la sesión guardada tal cual, SIN comprobar inactividad aquí — esa
 * comprobación vivía antes en esta función y borraba la sesión local en
 * cuanto pasaban 5 minutos desde el último toque/scroll registrado, ANTES
 * de darle al servidor (que sí conoce la validez real, mucho más larga,
 * del refresh token en su cookie httpOnly) la oportunidad de confirmar si
 * la sesión seguía activa. Cualquier recarga de página (recargar
 * manualmente, el gesto de "tirar hacia abajo" en móvil…) que llegara tras
 * más de 5 minutos sin esos eventos concretos desconectaba al usuario aun
 * con una sesión de servidor perfectamente válida (reportado 19/08/2026).
 * El cierre por inactividad de verdad sigue existiendo — ver el `useEffect`
 * de más abajo con `resetTimer()`/`setTimeout(logout, ...)`, que solo actúa
 * mientras la pestaña sigue abierta, nunca al volver a cargarla.
 */
function cargarSesion(): SesionActiva | null {
  try {
    const raw = localStorage.getItem(KEY_SESION);
    if (!raw) return null;
    return JSON.parse(raw) as SesionActiva;
  } catch { return null; }
}

function guardarSesion(s: SesionActiva): void {
  try {
    localStorage.setItem(KEY_SESION, JSON.stringify(s));
    localStorage.setItem(KEY_ACTIVIDAD, String(Date.now()));
  } catch { /* noop */ }
}

function borrarSesion(): void {
  try {
    localStorage.removeItem(KEY_SESION);
    localStorage.removeItem(KEY_ACTIVIDAD);
    // Limpieza de una clave de versiones anteriores a la migración a
    // JWT + Refresh Tokens (el access token ya no vive en localStorage).
    localStorage.removeItem('mc-auth-token');
  } catch { /* noop */ }
}

// ── Compatibilidad con cuenta maestra antigua ─────────────────────────────────
// Si el usuario ya tenía sesión con el sistema anterior (mc-auth-token) se migra
function migrarCuentaMaestra(): void {
  try {
    const tokenViejo = localStorage.getItem('mc-auth-token');
    if (!tokenViejo) return;
    const usuarios = cargarUsuarios();
    const yaExiste = usuarios.some(u => u.nombre === 'admin');
    if (!yaExiste) {
      const admin: UsuarioRegistrado = {
        id: 'admin',
        nombre: 'admin',
        passwordHash: hashSimple('admin'),
        creadoEn: new Date().toISOString(),
      };
      guardarUsuarios([admin, ...usuarios]);
    }
    localStorage.removeItem('mc-auth-token');
    localStorage.removeItem('mc-auth-actividad');
  } catch { /* noop */ }
}

// ── Hook principal ────────────────────────────────────────────────────────────

/**
 * Hook de autenticación multi-usuario.
 * Cierra sesión automáticamente tras 5 minutos de inactividad.
 */
export function useAuth(): UseAuthResult {
  migrarCuentaMaestra();

  const [sesion, setSesion] = useState<SesionActiva | null>(cargarSesion);
  // Si hay sesión guardada, aún no sabemos si el access token en memoria es
  // válido (se pierde en cada recarga) — hay que confirmarlo antes de dejar
  // que el resto de la app dispare peticiones protegidas.
  const [verificando, setVerificando] = useState<boolean>(() => !!cargarSesion());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    cerrarSesionServidor(); // fire-and-forget: revoca el refresh token en servidor
    borrarSesion();
    setSesion(null);
  }, []);

  const resetTimer = useCallback(() => {
    try { localStorage.setItem(KEY_ACTIVIDAD, String(Date.now())); } catch { /* noop */ }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(logout, MS_INACTIVIDAD);
  }, [logout]);

  // Temporizador de inactividad
  useEffect(() => {
    if (!sesion) { if (timerRef.current) clearTimeout(timerRef.current); return; }
    resetTimer();
    const handler = () => resetTimer();
    EVENTOS_ACTIVIDAD.forEach(ev => window.addEventListener(ev, handler, { passive: true }));
    // Volver a primer plano tras abrir la cámara del sistema (o cualquier
    // app externa: compartir, selector de archivos…) cuenta como actividad
    // real — sin esto, el propio `setTimeout` de abajo sigue contando
    // tiempo real mientras la pestaña está en segundo plano, y una sesión
    // de escaneo que se demore lo suficiente (o que llegue ya cerca del
    // límite tras un rato sin tocar la pantalla, p. ej. leyendo algo antes
    // de escanear) puede cerrar la sesión a mitad de la captura — se
    // percibe como que "la app se cierra y vuelve al principio" justo al
    // volver de la cámara, sin tener nada que ver con el escáner en sí.
    const handlerVisibilidad = () => { if (document.visibilityState === 'visible') resetTimer(); };
    document.addEventListener('visibilitychange', handlerVisibilidad);
    return () => {
      EVENTOS_ACTIVIDAD.forEach(ev => window.removeEventListener(ev, handler));
      document.removeEventListener('visibilitychange', handlerVisibilidad);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sesion, resetTimer]);

  // Registra el cierre de sesión como reacción única a "el refresh token ya
  // no es válido" (lo dispara fetchConAuth en api.ts cuando ni el access
  // token ni su renovación funcionan).
  useEffect(() => { alPerderSesion(logout); }, [logout]);

  // Restaura la sesión tras recargar la página: el access token vive solo
  // en memoria (nunca en localStorage) por seguridad, así que se pierde en
  // cada carga. Si había una sesión guardada, se renueva en silencio contra
  // el refresh token (cookie httpOnly); si ya no es válido, se cierra sesión.
  useEffect(() => {
    if (!sesion) { setVerificando(false); return; }
    refrescarSesion()
      .then((ok) => { if (!ok) logout(); })
      .finally(() => setVerificando(false));
    // Solo debe ejecutarse una vez, al montar — no en cada cambio de sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Inicia sesión con usuario y contraseña. */
  const login = useCallback((nombre: string, password: string): { ok: boolean; error?: string } => {
    const usuarios = cargarUsuarios();
    const hash = hashSimple(password);
    const usuario = usuarios.find(u => u.nombre.toLowerCase() === nombre.toLowerCase() && u.passwordHash === hash);
    if (!usuario) return { ok: false, error: 'Usuario o contraseña incorrectos.' };
    const s: SesionActiva = { usuarioId: usuario.id, nombre: usuario.nombre };
    guardarSesion(s);
    setSesion(s);
    return { ok: true };
  }, []);

  /** Registra un nuevo usuario. */
  const registrar = useCallback((nombre: string, password: string): { ok: boolean; error?: string } => {
    if (!nombre.trim() || nombre.length < 3) return { ok: false, error: 'El nombre debe tener al menos 3 caracteres.' };
    if (!password || password.length < 4) return { ok: false, error: 'La contraseña debe tener al menos 4 caracteres.' };
    const usuarios = cargarUsuarios();
    if (usuarios.some(u => u.nombre.toLowerCase() === nombre.toLowerCase())) {
      return { ok: false, error: 'Ese nombre de usuario ya existe.' };
    }
    const nuevo: UsuarioRegistrado = {
      id: generarId(),
      nombre: nombre.trim(),
      passwordHash: hashSimple(password),
      creadoEn: new Date().toISOString(),
    };
    guardarUsuarios([...usuarios, nuevo]);
    const s: SesionActiva = { usuarioId: nuevo.id, nombre: nuevo.nombre };
    guardarSesion(s);
    setSesion(s);
    return { ok: true };
  }, []);

  /**
   * Establece la sesión directamente desde la respuesta del servidor (sin
   * lookup local). El access token ya se guardó en memoria dentro de
   * `loginEnServidor()` (ver `use-registro.ts` / `api.ts`) — esta función
   * solo fija la identidad de sesión para la interfaz.
   */
  const loginDirecto = useCallback((id: string, nombre: string, esAdmin: boolean, plan?: PlanAcceso) => {
    const s: SesionActiva = { usuarioId: id, nombre, esAdmin, plan };
    guardarSesion(s);
    setSesion(s);
  }, []);

  const storagePrefix = sesion ? `mc_${sesion.usuarioId}_` : 'mc_';

  return { autenticado: !!sesion, verificando, sesion, storagePrefix, login, loginDirecto, registrar, logout };
}
