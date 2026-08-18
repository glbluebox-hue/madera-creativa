import { useEffect, useState, useCallback } from 'react';
import type { SesionActiva } from './use-auth.js';
import { fetchConAuth } from './api.js';

// Ver el comentario de `BASE` en api.ts — mismo criterio (Bit local vs. Render combinado).
const BASE = (import.meta as any).env?.VITE_API_BASE ?? '/api/presupuestos-service';

/** Estado de la suscripción push, tal como lo puede mostrar la interfaz. */
export type EstadoPush =
  | 'no-soportado' // el navegador no tiene Notification/PushManager (ej. Safari en iOS sin PWA instalada)
  | 'sin-pedir'     // nunca se ha pedido permiso (o el usuario lo ignoró)
  | 'concedido'     // permiso concedido y suscripción activa en el servidor
  | 'denegado'      // el usuario denegó el permiso — solo se puede revertir desde los ajustes del propio navegador
  | 'activando';    // pidiendo permiso / registrando la suscripción ahora mismo

/**
 * Hook que gestiona el permiso de notificaciones push y la suscripción en
 * el servidor para el usuario activo.
 *
 * Antes se intentaba en automático 3s tras iniciar sesión — sin un gesto
 * directo del usuario, varios navegadores (Chrome incluido, según el
 * "engagement" del sitio) degradan la petición a un icono discreto en la
 * barra de direcciones en vez de un aviso visible, así que en la práctica
 * muchos usuarios nunca llegaban a verlo. Ahora expone `estado` y
 * `activar()` para que la propia interfaz ofrezca un botón explícito
 * (petición del usuario, 18/08/2026: "activar las notificaciones push de
 * alguna manera") — un clic real siempre dispara el aviso nativo del
 * navegador. El intento automático se mantiene, pero solo para refrescar
 * en silencio una suscripción que YA estaba concedida (no para pedir
 * permiso por primera vez).
 *
 * @param sesion Sesión activa del usuario.
 */
export function usePush(sesion: SesionActiva | null): { estado: EstadoPush; activar: () => Promise<void> } {
  const usuarioId = sesion?.usuarioId ?? null;
  const soportado = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [estado, setEstado] = useState<EstadoPush>(() => {
    if (!soportado) return 'no-soportado';
    if (Notification.permission === 'granted') return 'concedido';
    if (Notification.permission === 'denied') return 'denegado';
    return 'sin-pedir';
  });

  /**
   * Suscribe de verdad (sin pedir permiso — se asume ya concedido) y lo
   * registra en el servidor. Extraída de `activar()` para poder reutilizarla
   * también cuando se detecta el permiso concedido SIN que el usuario haya
   * pulsado el botón (ver el listener de `visibilitychange` más abajo): sin
   * esto, un permiso concedido desde fuera de la app (ajustes del sistema)
   * nunca llegaba a crear una suscripción real, así que aunque el banner
   * desapareciera las notificaciones seguirían sin poder llegar.
   */
  const asegurarSuscripcion = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE}/push/vapid-public-key`, { credentials: 'include' });
      if (!res.ok) return false;
      const { key: rawKey } = await res.json() as { key: string };
      const key = rawKey?.trim();
      if (!key) return false;

      // Mismo scope explícito que presupuestos-prototype.app-root.tsx, para
      // que ambas llamadas resuelvan siempre al mismo registro (controlando
      // toda la app, no solo /assets/).
      const registro = await navigator.serviceWorker.register('/assets/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      const sub = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
      });

      // El usuario sale de la sesión autenticada (`fetchConAuth`), nunca de
      // un campo que mande el cliente — ver historial de este archivo.
      await fetchConAuth('/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      return true;
    } catch (err) {
      console.warn('Push no disponible:', err);
      return false;
    }
  }, []);

  const activar = useCallback(async () => {
    if (!usuarioId || !soportado) return;
    setEstado('activando');
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') { setEstado(permiso === 'denied' ? 'denegado' : 'sin-pedir'); return; }
    const ok = await asegurarSuscripcion();
    setEstado(ok ? 'concedido' : (Notification.permission === 'denied' ? 'denegado' : 'sin-pedir'));
  }, [usuarioId, soportado, asegurarSuscripcion]);

  useEffect(() => {
    if (!usuarioId || !soportado) return;

    // Silencioso a propósito: si el permiso YA estaba concedido (de una
    // sesión anterior, o concedido fuera de la app — ajustes del sistema —
    // antes de que este componente llegara a montarse), refresca la
    // suscripción sin volver a pedir nada.
    const refrescarSiConcedido = () => {
      if (Notification.permission === 'granted') {
        asegurarSuscripcion().then((ok) => setEstado(ok ? 'concedido' : 'sin-pedir'));
      }
    };

    const t = setTimeout(refrescarSiConcedido, 3000);

    // `Notification.permission` puede cambiar mientras la app sigue
    // montada sin recargarse — típico en una PWA instalada: el usuario
    // sale a los ajustes del sistema para conceder el permiso a mano y
    // vuelve a la app (en Android esto normalmente NO recarga la página,
    // así que el `useState` inicial nunca vuelve a evaluarse). Sin este
    // listener, el aviso "todavía no has activado las notificaciones" se
    // quedaba fijo aunque el permiso ya estuviera concedido (reportado
    // 18/08/2026, tras reinstalar la PWA y activar el permiso desde los
    // ajustes de Android en vez de desde el botón de la app).
    const alVolverVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!soportado) return;
      if (Notification.permission === 'denied') { setEstado('denegado'); return; }
      if (Notification.permission === 'granted') { refrescarSiConcedido(); return; }
      setEstado('sin-pedir');
    };
    document.addEventListener('visibilitychange', alVolverVisible);

    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', alVolverVisible);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId, soportado]);

  return { estado, activar };
}

/** Convierte una clave base64url a Uint8Array para la API de push. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
