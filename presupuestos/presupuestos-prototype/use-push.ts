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

  const activar = useCallback(async () => {
    if (!usuarioId || !soportado) return;
    setEstado('activando');
    try {
      const res = await fetch(`${BASE}/push/vapid-public-key`, { credentials: 'include' });
      if (!res.ok) { setEstado(Notification.permission === 'denied' ? 'denegado' : 'sin-pedir'); return; }
      const { key: rawKey } = await res.json() as { key: string };
      const key = rawKey?.trim();
      if (!key) { setEstado('sin-pedir'); return; }

      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') { setEstado(permiso === 'denied' ? 'denegado' : 'sin-pedir'); return; }

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
      setEstado('concedido');
    } catch (err) {
      console.warn('Push no disponible:', err);
      setEstado(Notification.permission === 'denied' ? 'denegado' : 'sin-pedir');
    }
  }, [usuarioId, soportado]);

  useEffect(() => {
    if (!usuarioId || !soportado) return;
    // Silencioso a propósito: si el permiso YA estaba concedido de una
    // sesión anterior, refresca la suscripción sin volver a pedir nada.
    if (Notification.permission !== 'granted') return;
    const t = setTimeout(activar, 3000);
    return () => clearTimeout(t);
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
