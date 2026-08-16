import { useEffect, useCallback } from 'react';
import type { SesionActiva } from './use-auth.js';
import { fetchConAuth } from './api.js';

const BASE = '/api/presupuestos-service';

/**
 * Hook que solicita permiso de notificaciones push y registra la suscripción
 * en el servidor para el usuario activo.
 * Solo activo cuando el usuario es administrador.
 *
 * @param sesion Sesión activa del usuario.
 */
export function usePush(sesion: SesionActiva | null): void {
  const usuarioId = sesion?.usuarioId ?? null;

  const registrar = useCallback(async () => {
    if (!usuarioId) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      // Obtener clave pública VAPID
      const res = await fetch(`${BASE}/push/vapid-public-key`, { credentials: 'include' });
      if (!res.ok) return;
      const { key: rawKey } = await res.json() as { key: string };
      const key = rawKey?.trim();
      if (!key) return;

      // Pedir permiso al usuario
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') return;

      // Registrar service worker desde assets
      const registro = await navigator.serviceWorker.register('/assets/sw.js');
      await navigator.serviceWorker.ready;

      // Suscribirse al push
      const sub = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
      });

      // Enviar suscripción al servidor — el usuario sale de la sesión
      // autenticada (`fetchConAuth`), nunca de un campo que mande el
      // cliente: antes se enviaba `usuarioId` en el body sin exigir sesión,
      // así que cualquiera que conociera el id de otra cuenta podía
      // registrar su propio navegador como destino de sus notificaciones.
      await fetchConAuth('/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
    } catch (err) {
      console.warn('Push no disponible:', err);
    }
  }, [usuarioId]);

  useEffect(() => {
    if (!usuarioId) return;
    const t = setTimeout(registrar, 3000);
    return () => clearTimeout(t);
  }, [usuarioId, registrar]);
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
