import { ClienteModel, conectar } from './cliente.model.js';
import { UsuarioModel, conectarUsuarios } from './usuario.model.js';
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
 * Hora de disparo configurable vía `RECORDATORIO_HORAS_HORA` (0-23, hora
 * UTC — la app no guarda huso horario por usuario, y "hoy" también se
 * calcula en UTC más abajo, así que la comparación usa el mismo reloj en
 * los dos sitios a propósito). Por defecto 20 (las 20:00 UTC), una hora
 * razonable de "fin de la jornada" para un oficio manual.
 *
 * Implementación deliberada sin librería de cron nueva: un único
 * `setInterval` que comprueba cada pocos minutos si ya es la hora
 * objetivo y si hoy todavía no se ha ejecutado — no hacía falta añadir
 * una dependencia para esto. `ultimaFechaEjecutada` es la guarda contra
 * disparos repetidos dentro de la misma ventana horaria (varias
 * comprobaciones del intervalo caen dentro de la misma hora objetivo);
 * NO sobrevive a un reinicio del proceso, así que un reinicio justo en la
 * ventana objetivo podría, en el peor caso, repetir el aviso ese día — un
 * riesgo aceptado (mucho más barato que persistir el estado para un caso
 * tan raro), nunca silencioso: queda registrado en el log si ocurre.
 */

const HORA_OBJETIVO = (() => {
  const desdeEnv = Number(process.env.RECORDATORIO_HORAS_HORA);
  return Number.isInteger(desdeEnv) && desdeEnv >= 0 && desdeEnv <= 23 ? desdeEnv : 20;
})();

const INTERVALO_COMPROBACION_MS = 5 * 60 * 1000;

let ultimaFechaEjecutada = '';

function hoyComoFecha(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Ejecuta el recordatorio para todos los usuarios activos — exportado
 * aparte de `iniciarRecordatorioHorasDiario` para poder llamarlo
 * directamente en pruebas, sin depender del reloj real.
 */
export async function ejecutarRecordatorioHorasDiario(): Promise<void> {
  await conectar();
  await conectarUsuarios();

  const hoy = hoyComoFecha();
  const usuarios = await UsuarioModel.find({ estado: 'activo' }).lean().exec() as any[];

  for (const usuario of usuarios) {
    const subs = (usuario.pushSubs ?? []) as PushSub[];
    if (subs.length === 0) continue; // Sin ningún dispositivo suscrito, no hay a quién avisar.

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
    const ahora = new Date();
    const hoy = hoyComoFecha();
    // `getUTCHours()`, no `getHours()` — `hoyComoFecha()` ya usa
    // `toISOString()` (UTC); si se comparara la hora objetivo con la hora
    // LOCAL del proceso, "qué hora es" y "qué día es hoy" usarían dos
    // relojes distintos, coincidiendo solo porque el servidor de Render
    // corre en UTC hoy (fragilidad detectada en la auditoría de
    // seguridad, 18/08/2026, antes de que llegara a ser un fallo real).
    if (ahora.getUTCHours() !== HORA_OBJETIVO || ultimaFechaEjecutada === hoy) return;
    ultimaFechaEjecutada = hoy;
    ejecutarRecordatorioHorasDiario().catch((err) => logger.error({ err }, '[recordatorio-horas] Error ejecutando el recordatorio diario'));
  }, INTERVALO_COMPROBACION_MS);
}
