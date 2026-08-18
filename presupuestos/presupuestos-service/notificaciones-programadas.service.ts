import { ClienteModel, PresupuestoModel, conectar } from './cliente.model.js';
import { UsuarioModel, conectarUsuarios } from './usuario.model.js';
import { enviarNotificacion } from './push.service.js';
import type { PushSub } from './push.service.js';
import { logger } from './logger.service.js';
import { hoyComoFecha } from './recordatorio-horas.service.js';

/**
 * Resto de notificaciones del panel (18/08/2026), aparte de
 * `recordatorio-horas.service.ts`: cobros pendientes, margen bajo,
 * briefing diario, y los recordatorios propios de cada usuario. Mismo
 * patrón de siempre — `setInterval` cada pocos minutos, cada tipo con su
 * propia guarda "ya se ejecutó hoy/hoy a esta hora" en memoria (no
 * sobrevive a un reinicio del proceso, riesgo aceptado, ver
 * `recordatorio-horas.service.ts`).
 */

const INTERVALO_COMPROBACION_MS = 5 * 60 * 1000;

/** Hora UTC (0-23) de los avisos "de mañana" — briefing diario, cobros pendientes, margen bajo. Configurable, igual que `RECORDATORIO_HORAS_HORA`. */
const HORA_MANANA = (() => {
  const desdeEnv = Number(process.env.RECORDATORIO_MANANA_HORA);
  return Number.isInteger(desdeEnv) && desdeEnv >= 0 && desdeEnv <= 23 ? desdeEnv : 8;
})();

/** Margen mínimo aceptable (%) antes de avisar — fijo, no configurable por ahora (pedido explícito del usuario: "por debajo de 40%"). */
const UMBRAL_MARGEN_BAJO = 40;

let ultimaFechaManana = '';
/** Por usuario+recordatorio, para no repetir el mismo recordatorio dos veces el mismo día. */
const ultimaFechaRecordatorio = new Map<string, string>();

/** Réplica exacta de `calcularResumen` (`presupuestos-prototype/calculos.ts`) — mismo cálculo, lado servidor. Si una fórmula cambia, cambiar las dos. */
function calcularMargenPorcentaje(cliente: any): number {
  const movimientos = (cliente.movimientos ?? []) as any[];
  const totalIngresos = movimientos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + (m.importe || 0), 0);
  const totalGastos = movimientos.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + (m.importe || 0), 0);
  const totalHoras = ((cliente.horas ?? []) as any[]).reduce((s, h) => s + (h.horas || 0), 0);
  const costeManoObra = totalHoras * (cliente.tarifaHora || 0);
  const costeTotal = totalGastos + costeManoObra;
  const margen = totalIngresos - costeTotal;
  return totalIngresos > 0 ? (margen / totalIngresos) * 100 : 0;
}

/** Cobros pendientes: presupuestos aceptados con algún hito sin `cobradoEn`. Exportada aparte para poder probarla directamente, igual que `ejecutarRecordatorioHorasDiario`. */
export async function ejecutarAvisoCobrosPendientes(): Promise<void> {
  await conectar();
  await conectarUsuarios();
  const usuarios = await UsuarioModel.find({ estado: 'activo' }).lean().exec() as any[];

  for (const usuario of usuarios) {
    const subs = (usuario.pushSubs ?? []) as PushSub[];
    if (subs.length === 0) continue;
    if (usuario.notifPrefs?.cobrosPendientes === false) continue;

    const presupuestos = await PresupuestoModel.find({ usuarioId: usuario.id, estado: 'aceptado' })
      .select('cobros titulo')
      .lean()
      .exec() as any[];

    let totalPendiente = 0;
    let numPendientes = 0;
    for (const p of presupuestos) {
      for (const c of (p.cobros ?? [])) {
        if (!c.cobradoEn) { totalPendiente += c.importe || 0; numPendientes++; }
      }
    }
    if (numPendientes === 0) continue;

    const cuerpo = numPendientes === 1
      ? `Tienes 1 cobro pendiente por ${totalPendiente.toFixed(2)}€.`
      : `Tienes ${numPendientes} cobros pendientes por un total de ${totalPendiente.toFixed(2)}€.`;

    for (const sub of subs) {
      await enviarNotificacion(sub, 'Cobros pendientes', cuerpo, { tipo: 'cobros-pendientes' })
        .catch((err) => logger.error({ err, usuarioId: usuario.id }, '[notificaciones] Error enviando aviso de cobros pendientes'));
    }
  }
}

/** Margen bajo: una vez por proyecto mientras siga por debajo del umbral (ver `Cliente.margenAvisado`). Exportada aparte, mismo motivo. */
export async function ejecutarAvisoMargenBajo(): Promise<void> {
  await conectar();
  await conectarUsuarios();
  const usuarios = await UsuarioModel.find({ estado: 'activo' }).lean().exec() as any[];

  for (const usuario of usuarios) {
    const subs = (usuario.pushSubs ?? []) as PushSub[];
    if (subs.length === 0) continue;
    if (usuario.notifPrefs?.margenBajo === false) continue;

    const clientesActivos = await ClienteModel.find({ usuarioId: usuario.id, estado: 'en_curso' })
      .select('nombre movimientos horas tarifaHora margenAvisado')
      .lean()
      .exec() as any[];

    for (const cliente of clientesActivos) {
      const margenPorcentaje = calcularMargenPorcentaje(cliente);
      const bajo = margenPorcentaje < UMBRAL_MARGEN_BAJO;

      if (bajo && !cliente.margenAvisado) {
        await ClienteModel.updateOne({ id: cliente.id }, { $set: { margenAvisado: true } }).exec();
        for (const sub of subs) {
          await enviarNotificacion(
            sub,
            'Margen bajo',
            `El margen de "${cliente.nombre || 'un proyecto'}" ha bajado al ${margenPorcentaje.toFixed(1)}%.`,
            { tipo: 'margen-bajo', clienteId: cliente.id }
          ).catch((err) => logger.error({ err, usuarioId: usuario.id }, '[notificaciones] Error enviando aviso de margen bajo'));
        }
      } else if (!bajo && cliente.margenAvisado) {
        // Se recupera por encima del umbral — se limpia la guarda para que una caída futura sí vuelva a avisar.
        await ClienteModel.updateOne({ id: cliente.id }, { $set: { margenAvisado: false } }).exec();
      }
    }
  }
}

/** Briefing diario: un resumen corto de proyectos activos y cobros pendientes. Exportada aparte, mismo motivo. */
export async function ejecutarBriefingDiario(): Promise<void> {
  await conectar();
  await conectarUsuarios();
  const usuarios = await UsuarioModel.find({ estado: 'activo' }).lean().exec() as any[];

  for (const usuario of usuarios) {
    const subs = (usuario.pushSubs ?? []) as PushSub[];
    if (subs.length === 0) continue;
    if (usuario.notifPrefs?.briefingDiario === false) continue;

    const [numActivos, presupuestos] = await Promise.all([
      ClienteModel.countDocuments({ usuarioId: usuario.id, estado: 'en_curso' }).exec(),
      PresupuestoModel.find({ usuarioId: usuario.id, estado: 'aceptado' }).select('cobros').lean().exec() as Promise<any[]>,
    ]);
    let totalPendiente = 0;
    for (const p of presupuestos) for (const c of (p.cobros ?? [])) if (!c.cobradoEn) totalPendiente += c.importe || 0;

    const partes = [`${numActivos} proyecto${numActivos === 1 ? '' : 's'} activo${numActivos === 1 ? '' : 's'}`];
    if (totalPendiente > 0) partes.push(`${totalPendiente.toFixed(2)}€ pendientes de cobro`);

    for (const sub of subs) {
      await enviarNotificacion(sub, 'Buenos días', partes.join(' · '), { tipo: 'briefing-diario' })
        .catch((err) => logger.error({ err, usuarioId: usuario.id }, '[notificaciones] Error enviando briefing diario'));
    }
  }
}

/** Recordatorios propios: cada uno se dispara a SU hora configurada, no a `HORA_MANANA`. */
async function ejecutarRecordatoriosPersonalizados(ahora: Date): Promise<void> {
  await conectarUsuarios();
  const hoy = hoyComoFecha();
  const horaActual = ahora.getUTCHours();
  const usuarios = await UsuarioModel.find({ estado: 'activo' }).lean().exec() as any[];

  for (const usuario of usuarios) {
    const subs = (usuario.pushSubs ?? []) as PushSub[];
    if (subs.length === 0) continue;
    const recordatorios = (usuario.recordatoriosPersonalizados ?? []) as any[];
    for (const r of recordatorios) {
      if (!r.activo || r.hora !== horaActual) continue;
      const clave = `${usuario.id}:${r.id}`;
      if (ultimaFechaRecordatorio.get(clave) === hoy) continue;
      ultimaFechaRecordatorio.set(clave, hoy);
      for (const sub of subs) {
        await enviarNotificacion(sub, 'Recordatorio', r.texto, { tipo: 'recordatorio-personalizado', id: r.id })
          .catch((err) => logger.error({ err, usuarioId: usuario.id }, '[notificaciones] Error enviando recordatorio personalizado'));
      }
    }
  }
}

/**
 * Arranca la comprobación periódica de este archivo — llamar UNA vez al
 * iniciar el servidor, junto a `iniciarRecordatorioHorasDiario()`. No lanza
 * ninguna excepción hacia fuera (mismo motivo que esa función).
 */
export function iniciarNotificacionesProgramadas(): void {
  setInterval(() => {
    const ahora = new Date();
    const hoy = hoyComoFecha();

    if (ahora.getUTCHours() === HORA_MANANA && ultimaFechaManana !== hoy) {
      ultimaFechaManana = hoy;
      ejecutarAvisoCobrosPendientes().catch((err) => logger.error({ err }, '[notificaciones] Error en el aviso de cobros pendientes'));
      ejecutarAvisoMargenBajo().catch((err) => logger.error({ err }, '[notificaciones] Error en el aviso de margen bajo'));
      ejecutarBriefingDiario().catch((err) => logger.error({ err }, '[notificaciones] Error en el briefing diario'));
    }

    ejecutarRecordatoriosPersonalizados(ahora).catch((err) => logger.error({ err }, '[notificaciones] Error en los recordatorios personalizados'));
  }, INTERVALO_COMPROBACION_MS);
}
