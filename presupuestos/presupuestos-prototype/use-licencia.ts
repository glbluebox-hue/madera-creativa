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

  // 5 segundos de gracia tras login, luego verifica cada 2 minutos
  useEffect(() => {
    if (!usuarioId) return;
    const delay = setTimeout(() => {
      verificar();
      const interval = setInterval(verificar, 2 * 60 * 1000);
      // No podemos retornar cleanup aquí directamente
      (delay as any)._interval = interval;
    }, 5000);
    return () => {
      clearTimeout(delay);
      if ((delay as any)._interval) clearInterval((delay as any)._interval);
    };
  }, [usuarioId, verificar]);
}
