import { useEffect, useCallback, useRef } from 'react';
import type { SesionActiva } from './use-auth.js';

const BASE = '/api/presupuestos-service';

/**
 * Hook que verifica periódicamente si la sesión del usuario sigue activa en el servidor.
 * Si el usuario ha sido suspendido, llama a onSuspendido para cerrar la sesión.
 *
 * @param sesion Sesión activa del usuario.
 * @param onSuspendido Callback cuando la cuenta ha sido suspendida o eliminada.
 */
export function useLicencia(sesion: SesionActiva | null, onSuspendido: () => void): void {
  const usuarioId = sesion?.usuarioId ?? null;
  const onSuspRef = useRef(onSuspendido);
  onSuspRef.current = onSuspendido;

  const verificar = useCallback(async () => {
    if (!usuarioId) return;
    try {
      const res = await fetch(`${BASE}/auth/verificar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioId }),
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json() as { activo: boolean; estado: string };
      if (!data.activo) onSuspRef.current();
    } catch {
      // Sin conexión — no cerrar sesión
    }
  }, [usuarioId]);

  // 5 segundos de gracia tras login, luego verifica cada 2 minutos.
  //
  // Bug real corregido (Fase "Integración completa"): `setTimeout` en el
  // navegador devuelve un `number`, no un objeto — intentar guardar el
  // intervalo como una propiedad de ese número (`(delay as any)._interval =
  // interval`) lanzaba un TypeError en cuanto pasaban los 5 segundos.
  // Como el error ocurría *después* de crear el `setInterval`, el intervalo
  // sí llegaba a arrancar, pero la función de limpieza nunca conseguía
  // encontrarlo para cancelarlo — cada remontaje del componente dejaba un
  // intervalo huérfano llamando a `/auth/verificar` cada 2 minutos para
  // siempre. Con varios acumulados, agotaban el límite compartido de
  // `/auth/*` (10 cada 15 min) y bloqueaban también el login/refresh reales.
  useEffect(() => {
    if (!usuarioId) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const delay = setTimeout(() => {
      verificar();
      interval = setInterval(verificar, 2 * 60 * 1000);
    }, 5000);
    return () => {
      clearTimeout(delay);
      if (interval) clearInterval(interval);
    };
  }, [usuarioId, verificar]);
}
