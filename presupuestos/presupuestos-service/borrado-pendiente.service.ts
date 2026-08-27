import { BorradoPendienteModel } from './borrado-pendiente.model.js';
import { conectar } from './cliente.model.js';
import { almacenamiento } from './almacenamiento.service.js';
import { logger } from './logger.service.js';

/**
 * Reintento de borrados fallidos en el almacenamiento (Incremento
 * "Facturas privadas", 27/08/2026) — petición explícita del usuario: un
 * fallo al borrar un archivo en R2 ya no puede perderse en silencio
 * (`.catch(() => {})`, como antes en `borrarFactura()`/`guardarFactura()`).
 *
 * Mismo patrón que `recordatorio-horas.service.ts`/
 * `notificaciones-programadas.service.ts`: un único `setInterval`, sin
 * añadir ninguna cola/librería nueva — no hay Redis ni cola persistida en
 * este proyecto, y no hacía falta para esto. La diferencia es que aquí el
 * estado pendiente SÍ se guarda en Mongo (no en memoria): un borrado
 * pendiente debe sobrevivir a un reinicio del proceso, a diferencia de la
 * guarda "ya avisé hoy" de los recordatorios, que no importa perder.
 */

const INTERVALO_REINTENTO_MS = 5 * 60 * 1000;
/** Tope de reintentos automáticos — pasado este número, queda para revisión manual (se registra en el log, sin datos personales). */
const MAX_INTENTOS = 5;
/** Cuántos pendientes procesar por pasada — acota el trabajo de una única ejecución del intervalo. */
const LOTE_MAXIMO = 50;

/** Registra (o incrementa) un borrado pendiente — nunca guarda contenido del archivo ni datos personales, solo la clave técnica y el mensaje de error. */
async function registrarBorradoPendiente(clave: string, error: string): Promise<void> {
  await conectar();
  const ahora = new Date().toISOString();
  await BorradoPendienteModel.findOneAndUpdate(
    { clave },
    { $inc: { intentos: 1 }, $set: { ultimoError: error, actualizado: ahora }, $setOnInsert: { creado: ahora } },
    { upsert: true }
  ).exec();
}

/**
 * Intenta borrar un archivo del almacenamiento; si falla, lo deja
 * registrado como pendiente en vez de descartar el error. Sustituye a cada
 * `almacenamiento.borrar(clave).catch(() => {})` que había antes en
 * `presupuestos-service.ts`.
 */
export async function intentarBorrarArchivo(clave: string): Promise<void> {
  try {
    await almacenamiento.borrar(clave);
  } catch (err) {
    await registrarBorradoPendiente(clave, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Reintenta los borrados pendientes que no hayan agotado ya sus intentos —
 * exportada aparte de `iniciarReintentoBorrados` para poder llamarla
 * directamente en pruebas, sin depender del reloj real.
 */
export async function ejecutarReintentoBorrados(): Promise<void> {
  await conectar();
  const pendientes = await BorradoPendienteModel.find({ intentos: { $lt: MAX_INTENTOS } })
    .limit(LOTE_MAXIMO)
    .lean()
    .exec() as any[];

  for (const p of pendientes) {
    try {
      await almacenamiento.borrar(p.clave);
      await BorradoPendienteModel.deleteOne({ clave: p.clave }).exec();
    } catch (err) {
      await BorradoPendienteModel.updateOne(
        { clave: p.clave },
        { $inc: { intentos: 1 }, $set: { ultimoError: err instanceof Error ? err.message : String(err), actualizado: new Date().toISOString() } }
      ).exec();
    }
  }

  const agotados = await BorradoPendienteModel.countDocuments({ intentos: { $gte: MAX_INTENTOS } }).exec();
  if (agotados > 0) {
    logger.warn({ agotados }, '[borrado-pendiente] Hay archivos que no se han podido borrar tras agotar los reintentos automáticos — requieren revisión manual.');
  }
}

/** Arranca la comprobación periódica — llamar UNA vez al iniciar el servidor (ver `presupuestos-service.app-root.ts`). */
export function iniciarReintentoBorrados(): void {
  setInterval(() => {
    ejecutarReintentoBorrados().catch((err) => logger.error({ err }, '[borrado-pendiente] Error ejecutando el reintento de borrados'));
  }, INTERVALO_REINTENTO_MS);
}
