import { ProyectoModel, PresupuestoModel, conectar } from './cliente.model.js';
import { UsuarioModel, conectarUsuarios, leerPreferenciaNotif } from './usuario.model.js';
import { enviarNotificacion } from './push.service.js';
import type { PushSub } from './push.service.js';
import { logger } from './logger.service.js';
import { hoyComoFecha } from './recordatorio-horas.service.js';

/**
 * Resto de notificaciones del panel (18/08/2026), aparte de
 * `recordatorio-horas.service.ts`: cobros pendientes, margen bajo,
 * briefing diario, y los recordatorios propios de cada usuario.
 *
 * Cada tipo dispara a la hora (y minuto) que cada usuario tenga
 * configurados en `notifPrefs` — ampliado 18/08/2026: antes los tres
 * (cobros/margen/briefing) compartían una única hora fija de servidor sin
 * poder cambiarla desde la app ("todo esto tiene que ser editable y con
 * la posibilidad de poner una hora y también minutos"). El intervalo de
 * comprobación baja de 5 a 1 minuto para poder acertar el minuto exacto
 * — coste insignificante a esta escala (una app de un solo negocio):
 * cada función vuelve a consultar todos los usuarios activos cada minuto,
 * pero descarta en el acto los que no tengan suscripción o cuya hora no
 * coincida, sin hacer ningún trabajo pesado por ellos.
 */

const INTERVALO_COMPROBACION_MS = 60 * 1000;

/** Margen mínimo aceptable (%) antes de avisar — fijo, no configurable por ahora (pedido explícito del usuario: "por debajo de 40%"). */
const UMBRAL_MARGEN_BAJO = 40;

/** Por clave "tipo:usuarioId" (o "recordatorio:usuarioId:id"), para no repetir el mismo aviso dos veces el mismo día aunque el minuto exacto se compruebe varias veces (arranques, reintentos). */
const ultimaFechaPorClave = new Map<string, string>();

/** `true` si, para este usuario, `tipo` está activo y su hora+minuto configurados coinciden con `ahora`. */
function esSuMomento(notifPrefs: any, tipo: string, horaDefecto: number, ahora: Date): boolean {
  const pref = leerPreferenciaNotif(notifPrefs, tipo, horaDefecto);
  return pref.activo && pref.hora === ahora.getUTCHours() && pref.minuto === ahora.getUTCMinutes();
}

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

/**
 * Cobros pendientes: presupuestos aceptados con algún hito sin
 * `cobradoEn`. `ahora` decide a quién le toca — exportada aparte para
 * poder probarla directamente pasando una fecha concreta, igual que
 * `ejecutarRecordatorioHorasDiario`.
 */
export async function ejecutarAvisoCobrosPendientes(ahora: Date = new Date()): Promise<void> {
  await conectar();
  await conectarUsuarios();
  const hoy = hoyComoFecha();
  const usuarios = await UsuarioModel.find({ estado: 'activo' }).lean().exec() as any[];

  for (const usuario of usuarios) {
    const subs = (usuario.pushSubs ?? []) as PushSub[];
    if (subs.length === 0) continue;
    if (!esSuMomento(usuario.notifPrefs, 'cobrosPendientes', 8, ahora)) continue;
    const clave = `cobrosPendientes:${usuario.id}`;
    if (ultimaFechaPorClave.get(clave) === hoy) continue;
    ultimaFechaPorClave.set(clave, hoy);

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

/** Margen bajo: una vez por proyecto mientras siga por debajo del umbral (ver `Proyecto.margenAvisado`). `ahora` decide a quién le toca. Exportada aparte, mismo motivo. */
export async function ejecutarAvisoMargenBajo(ahora: Date = new Date()): Promise<void> {
  await conectar();
  await conectarUsuarios();
  const hoy = hoyComoFecha();
  const usuarios = await UsuarioModel.find({ estado: 'activo' }).lean().exec() as any[];

  for (const usuario of usuarios) {
    const subs = (usuario.pushSubs ?? []) as PushSub[];
    if (subs.length === 0) continue;
    if (!esSuMomento(usuario.notifPrefs, 'margenBajo', 8, ahora)) continue;
    const clave = `margenBajo:${usuario.id}`;
    if (ultimaFechaPorClave.get(clave) === hoy) continue;
    ultimaFechaPorClave.set(clave, hoy);

    const proyectosActivos = await ProyectoModel.find({ usuarioId: usuario.id, estado: 'en_curso' })
      .select('id proyecto movimientos horas tarifaHora margenAvisado')
      .lean()
      .exec() as any[];

    for (const proyecto of proyectosActivos) {
      const margenPorcentaje = calcularMargenPorcentaje(proyecto);
      const bajo = margenPorcentaje < UMBRAL_MARGEN_BAJO;

      if (bajo && !proyecto.margenAvisado) {
        await ProyectoModel.updateOne({ id: proyecto.id }, { $set: { margenAvisado: true } }).exec();
        for (const sub of subs) {
          await enviarNotificacion(
            sub,
            'Margen bajo',
            `El margen de "${proyecto.proyecto || 'un proyecto'}" ha bajado al ${margenPorcentaje.toFixed(1)}%.`,
            { tipo: 'margen-bajo', proyectoId: proyecto.id }
          ).catch((err) => logger.error({ err, usuarioId: usuario.id }, '[notificaciones] Error enviando aviso de margen bajo'));
        }
      } else if (!bajo && proyecto.margenAvisado) {
        // Se recupera por encima del umbral — se limpia la guarda para que una caída futura sí vuelva a avisar.
        await ProyectoModel.updateOne({ id: proyecto.id }, { $set: { margenAvisado: false } }).exec();
      }
    }
  }
}

/** Briefing diario: un resumen corto de proyectos activos y cobros pendientes. `ahora` decide a quién le toca. Exportada aparte, mismo motivo. */
export async function ejecutarBriefingDiario(ahora: Date = new Date()): Promise<void> {
  await conectar();
  await conectarUsuarios();
  const hoy = hoyComoFecha();
  const usuarios = await UsuarioModel.find({ estado: 'activo' }).lean().exec() as any[];

  for (const usuario of usuarios) {
    const subs = (usuario.pushSubs ?? []) as PushSub[];
    if (subs.length === 0) continue;
    if (!esSuMomento(usuario.notifPrefs, 'briefingDiario', 8, ahora)) continue;
    const clave = `briefingDiario:${usuario.id}`;
    if (ultimaFechaPorClave.get(clave) === hoy) continue;
    ultimaFechaPorClave.set(clave, hoy);

    const [numActivos, presupuestos] = await Promise.all([
      ProyectoModel.countDocuments({ usuarioId: usuario.id, estado: 'en_curso' }).exec(),
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

/** Recordatorios propios: cada uno se dispara a SU hora+minuto configurados. */
async function ejecutarRecordatoriosPersonalizados(ahora: Date): Promise<void> {
  await conectarUsuarios();
  const hoy = hoyComoFecha();
  const usuarios = await UsuarioModel.find({ estado: 'activo' }).lean().exec() as any[];

  for (const usuario of usuarios) {
    const subs = (usuario.pushSubs ?? []) as PushSub[];
    if (subs.length === 0) continue;
    const recordatorios = (usuario.recordatoriosPersonalizados ?? []) as any[];
    for (const r of recordatorios) {
      if (!r.activo || r.hora !== ahora.getUTCHours() || (r.minuto ?? 0) !== ahora.getUTCMinutes()) continue;
      const clave = `recordatorio:${usuario.id}:${r.id}`;
      if (ultimaFechaPorClave.get(clave) === hoy) continue;
      ultimaFechaPorClave.set(clave, hoy);
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
    ejecutarAvisoCobrosPendientes(ahora).catch((err) => logger.error({ err }, '[notificaciones] Error en el aviso de cobros pendientes'));
    ejecutarAvisoMargenBajo(ahora).catch((err) => logger.error({ err }, '[notificaciones] Error en el aviso de margen bajo'));
    ejecutarBriefingDiario(ahora).catch((err) => logger.error({ err }, '[notificaciones] Error en el briefing diario'));
    ejecutarRecordatoriosPersonalizados(ahora).catch((err) => logger.error({ err }, '[notificaciones] Error en los recordatorios personalizados'));
  }, INTERVALO_COMPROBACION_MS);
}
