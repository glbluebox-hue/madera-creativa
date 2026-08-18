import { useEffect, useState, useCallback, useRef } from 'react';
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
 * navegador.
 *
 * `estado` se deriva siempre de la realidad comprobable (el permiso del
 * navegador + si existe de verdad una `PushSubscription`), nunca solo de
 * si la última llamada a `activar()` terminó sin error — el usuario
 * reportó exactamente ese fallo (18/08/2026): concedía el permiso, el
 * propio navegador lo confirmaba ("Permitidas"), y el banner seguía
 * diciendo que faltaba activarlas, sin volver a comprobar nunca la
 * suscripción real. `sincronizar()` es la única función que decide
 * `estado`, y se llama tanto al montar como al volver a la pestaña como
 * tras pulsar "Activar" — un único camino, sin estados que puedan quedar
 * desincronizados entre sí.
 *
 * @param sesion Sesión activa del usuario.
 */
export function usePush(sesion: SesionActiva | null): { estado: EstadoPush; error: string; activar: () => Promise<void> } {
  const usuarioId = sesion?.usuarioId ?? null;
  const soportado = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [estado, setEstado] = useState<EstadoPush>(() => {
    if (!soportado) return 'no-soportado';
    if (Notification.permission === 'granted') return 'concedido';
    if (Notification.permission === 'denied') return 'denegado';
    return 'sin-pedir';
  });
  /**
   * Motivo técnico del último fallo al suscribir, para poder mostrarlo en
   * el panel — sin esto, un permiso ya concedido que aun así no llega a
   * suscribirse deja al usuario viendo solo "todavía no has activado...",
   * indistinguible de no haber pulsado nada, sin ninguna pista de qué
   * falla de verdad.
   */
  const [error, setError] = useState('');
  // Evita solapar dos sincronizaciones a la vez (p. ej. el timer de 3s y un
  // cambio de visibilidad casi simultáneos) — sin esto podían pisarse una
  // a otra y dejar `estado` a medias.
  const sincronizando = useRef(false);

  /**
   * Confirma (o crea) una `PushSubscription` real y la registra en el
   * servidor. Reutiliza la suscripción existente del dispositivo si ya hay
   * una (`getSubscription()`, comprobación local, sin red) en vez de
   * darla siempre de baja y pedir una nueva — así que si el permiso ya
   * estaba concedido de antes, esto puede confirmar "todo en orden" sin
   * volver a mostrar ningún diálogo. Solo pide una nueva suscripción al
   * navegador cuando no existe ninguna todavía.
   */
  const asegurarSuscripcion = useCallback(async (): Promise<boolean> => {
    try {
      // Mismo scope explícito que presupuestos-prototype.app-root.tsx, para
      // que ambas llamadas resuelvan siempre al mismo registro (controlando
      // toda la app, no solo /assets/).
      const registro = await navigator.serviceWorker.register('/assets/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      let sub = await registro.pushManager.getSubscription();
      if (!sub) {
        const res = await fetch(`${BASE}/push/vapid-public-key`, { credentials: 'include' });
        if (!res.ok) { setError(`No se pudo obtener la clave del servidor (${res.status}).`); return false; }
        const { key: rawKey } = await res.json() as { key: string };
        const key = rawKey?.trim();
        if (!key) { setError('El servidor no tiene configurada la clave de notificaciones.'); return false; }
        sub = await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
        });
      }

      // Se reenvía siempre al servidor, exista ya o se acabe de crear —
      // barato e idempotente (`push.service.ts` la guarda por endpoint) y
      // así se autocorrige un registro que hubiera fallado en un intento
      // anterior sin que el usuario tenga que hacer nada más. El usuario
      // sale de la sesión autenticada (`fetchConAuth`), nunca de un campo
      // que mande el cliente — ver historial de este archivo.
      const resSub = await fetchConAuth('/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!resSub.ok) { setError(`El servidor no guardó la suscripción (${resSub.status}).`); return false; }
      setError('');
      return true;
    } catch (err) {
      console.warn('Push no disponible:', err);
      setError(err instanceof Error ? err.message : 'Error desconocido al suscribirse.');
      return false;
    }
  }, []);

  /**
   * Único punto que decide `estado` — nunca pide permiso (eso solo lo hace
   * `activar()`, con gesto real del usuario), solo comprueba la realidad
   * actual y, si el permiso ya está concedido, confirma la suscripción.
   */
  const sincronizar = useCallback(async () => {
    if (!soportado) { setEstado('no-soportado'); return; }
    if (Notification.permission === 'denied') { setEstado('denegado'); return; }
    if (Notification.permission !== 'granted') { setEstado('sin-pedir'); return; }
    if (sincronizando.current) return;
    sincronizando.current = true;
    try {
      const ok = await asegurarSuscripcion();
      setEstado(ok ? 'concedido' : 'sin-pedir');
    } finally {
      sincronizando.current = false;
    }
  }, [soportado, asegurarSuscripcion]);

  const activar = useCallback(async () => {
    if (!usuarioId || !soportado) return;
    setEstado('activando');
    setError('');
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') { setEstado(permiso === 'denied' ? 'denegado' : 'sin-pedir'); return; }
    await sincronizar();
  }, [usuarioId, soportado, sincronizar]);

  useEffect(() => {
    if (!usuarioId || !soportado) return;

    const t = setTimeout(sincronizar, 3000);

    // `Notification.permission` puede cambiar mientras la app sigue
    // montada sin recargarse — típico en una PWA instalada: el usuario
    // sale a los ajustes del sistema para conceder el permiso a mano y
    // vuelve a la app (en Android esto normalmente NO recarga la página).
    // Sin este listener, el banner se quedaba fijo con el valor que tenía
    // al montar, aunque el permiso cambiara después (reportado 18/08/2026).
    const alVolverVisible = () => {
      if (document.visibilityState === 'visible') sincronizar();
    };
    document.addEventListener('visibilitychange', alVolverVisible);

    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', alVolverVisible);
    };
  }, [usuarioId, soportado, sincronizar]);

  return { estado, error, activar };
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
