import { ClienteModel, conectar } from './cliente.model.js';
import { UsuarioModel, conectarUsuarios, leerPreferenciaNotif } from './usuario.model.js';
import { enviarNotificacion } from './push.service.js';
import type { PushSub } from './push.service.js';
import { logger } from './logger.service.js';

/**
 * Recordatorio inteligente de horas (roadmap, Sección 10 — prioridad alta).
 * Al final de la jornada, si un usuario tiene proyectos activos
 * (`Cliente.estado === 'en_curso'`) sin ninguna hora registrada HOY, se le
 * envía UNA notificación push indicando cuántos. Si no hay ningún proyecto
 * pendiente de horas (porque ya las registró todas, o porque no tiene
 * ningún proyecto activo), no se envía nada — el propio roadmap pide
 * explícitamente evitar avisos innecesarios.
 *
 * Hora de disparo: cada usuario tiene la suya propia, editable desde el
 * panel de notificaciones (`notifPrefs.horas`, ver `usuario.model.ts` —
 * ampliado 18/08/2026, antes era una única hora fija de servidor vía
 * `RECORDATORIO_HORAS_HORA`, sin poder cambiarla desde la app). Por
 * defecto 20:00 UTC para quien no la haya tocado nunca, una hora
 * razonable de "fin de la jornada" para un oficio manual. Siempre en UTC
 * — la app no guarda huso horario por usuario, y "hoy" también se calcula
 * en UTC más abajo, así que la comparación usa el mismo reloj en los dos
 * sitios a propósito (el frontend convierte la hora local del usuario a
 * UTC antes de guardarla, ver `panel-notificaciones.tsx`).
 *
 * Implementación deliberada sin librería de cron nueva: un único
 * `setInterval` cada minuto que comprueba, por usuario, si es su hora
 * exacta y si hoy todavía no se ha ejecutado para él — no hacía falta
 * añadir una dependencia para esto. La guarda por usuario+día no
 * sobrevive a un reinicio del proceso; riesgo aceptado (mucho más barato
 * que persistir el estado para un caso tan raro), nunca silencioso: queda
 * registrado en el log si ocurre.
 */

const INTERVALO_COMPROBACION_MS = 60 * 1000;

/** Por usuarioId, para no repetir el aviso dos veces el mismo día. */
const ultimaFechaPorUsuario = new Map<string, string>();

/** UTC — ver el comentario de arriba. Reutilizada por `notificaciones-programadas.service.ts` para el resto de tipos de notificación, por el mismo motivo (mismo reloj para "qué hora es" y "qué día es hoy"). */
export function hoyComoFecha(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Ejecuta el recordatorio para todos los usuarios activos a quienes les
 * toque en `ahora` — exportado aparte de `iniciarRecordatorioHorasDiario`
 * para poder llamarlo directamente en pruebas, sin depender del reloj real.
 */
export async function ejecutarRecordatorioHorasDiario(ahora: Date = new Date()): Promise<void> {
  await conectar();
  await conectarUsuarios();

  const hoy = hoyComoFecha();
  const usuarios = await UsuarioModel.find({ estado: 'activo' }).lean().exec() as any[];

  for (const usuario of usuarios) {
    const subs = (usuario.pushSubs ?? []) as PushSub[];
    if (subs.length === 0) continue; // Sin ningún dispositivo suscrito, no hay a quién avisar.

    const pref = leerPreferenciaNotif(usuario.notifPrefs, 'horas', 20);
    if (!pref.activo || pref.hora !== ahora.getUTCHours() || pref.minuto !== ahora.getUTCMinutes()) continue;
    if (ultimaFechaPorUsuario.get(usuario.id) === hoy) continue;
    ultimaFechaPorUsuario.set(usuario.id, hoy);

    const clientesActivos = await ClienteModel.find({ usuarioId: usuario.id, estado: 'en_curso' })
      .select('horas')
      .lean()
      .exec() as any[];
    if (clientesActivos.length === 0) continue; // Nada pendiente — no hay proyecto activo alguno.

    const sinHorasHoy = clientesActivos.filter((c) => !(c.horas ?? []).some((h: any) => h.fecha === hoy));
    if (sinHorasHoy.length === 0) continue; // Ya registró horas hoy en todos sus proyectos activos.

    const cuerpo = sinHorasHoy.length === 1
      ? 'Tienes 1 proyecto activo sin horas registradas hoy. Es un dato importante para calcular la rentabilidad real.'
      : `Tienes ${sinHorasHoy.length} proyectos activos sin horas registradas hoy. Es un dato importante para calcular la rentabilidad real.`;

    for (const sub of subs) {
      await enviarNotificacion(sub, 'Antes de terminar el día', cuerpo, { tipo: 'recordatorio-horas' })
        .catch((err) => logger.error({ err, usuarioId: usuario.id }, '[recordatorio-horas] Error enviando notificación push'));
    }
  }
}

/**
 * Arranca la comprobación periódica — llamar UNA vez al iniciar el
 * servidor (ver `presupuestos-service.app-root.ts`). No lanza ninguna
 * excepción: un fallo en la comprobación de una ventana no debe tumbar el
 * proceso ni impedir que se siga comprobando en la siguiente.
 */
export function iniciarRecordatorioHorasDiario(): void {
  setInterval(() => {
    ejecutarRecordatorioHorasDiario(new Date())
      .catch((err) => logger.error({ err }, '[recordatorio-horas] Error ejecutando el recordatorio diario'));
  }, INTERVALO_COMPROBACION_MS);
}
