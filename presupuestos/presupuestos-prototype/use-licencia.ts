import { useEffect, useCallback, useRef, useState } from 'react';
import type { SesionActiva } from './use-auth.js';
import { fetchConAuth, obtenerEstadoAcceso, type EstadoAcceso } from './api.js';

/**
 * Hook que verifica periódicamente si la sesión del usuario sigue activa en
 * el servidor, y de paso (05/09/2026, prueba gratuita de 60 días) el estado
 * real de su plan/trial — mismo ciclo de sondeo, para no duplicar una
 * segunda llamada periódica contra `/auth/*` por separado. Si el usuario ha
 * sido suspendido, llama a onSuspendido para cerrar la sesión.
 *
 * @param sesion Sesión activa del usuario.
 * @param onSuspendido Callback cuando la cuenta ha sido suspendida o eliminada.
 * @returns El último `EstadoAcceso` conocido (`null` hasta la primera
 * comprobación) — para que la interfaz muestre "Prueba gratuita · Te
 * quedan X días" sin depender de que `sesion.plan` (fijado solo en el
 * login, nunca se refresca solo) siga siendo correcto si el trial expira
 * con la sesión ya abierta.
 */
export function useLicencia(sesion: SesionActiva | null, onSuspendido: () => void): EstadoAcceso | null {
  const usuarioId = sesion?.usuarioId ?? null;
  const onSuspRef = useRef(onSuspendido);
  onSuspRef.current = onSuspendido;
  const [estadoAcceso, setEstadoAcceso] = useState<EstadoAcceso | null>(null);

  const verificar = useCallback(async () => {
    if (!usuarioId) return;
    try {
      // El id sale de la sesión autenticada (`fetchConAuth`), nunca de un
      // campo que mande el cliente — antes se enviaba `usuarioId` en el body
      // sin exigir sesión, así que cualquiera que conociera el id de otra
      // cuenta podía consultar si estaba activa o suspendida sin autenticarse.
      const res = await fetchConAuth('/auth/verificar', { method: 'POST' });
      if (!res.ok) return;
      const data = await res.json() as { activo: boolean; estado: string };
      if (!data.activo) { onSuspRef.current(); return; }
      // Solo se comprueba el plan/trial si la cuenta sigue activa —
      // evita una petición extra que de todas formas iba a quedar
      // descartada por el cierre de sesión que ya se disparó arriba.
      const estado = await obtenerEstadoAcceso();
      setEstadoAcceso(estado);
    } catch {
      // Sin conexión — no cerrar sesión ni tocar el último estado conocido.
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
    if (!usuarioId) { setEstadoAcceso(null); return; } // cierre de sesión — nunca arrastrar el estado de trial de la sesión anterior
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

  return estadoAcceso;
}
