import { Schema, model, models, Model } from 'mongoose';
import { conectar } from './cliente.model.js';

/**
 * Colección propia y pequeña del Calendario (Fase "Calendario", 30/08/2026)
 * — solo para lo que no vive en ningún otro sitio de la app: un
 * evento/cita puntual, o un recordatorio puntual con fecha propia
 * (distinto de `Usuario.recordatoriosPersonalizados`, que se repite cada
 * día a una hora fija en vez de caer en una fecha concreta). El resto del
 * Calendario (proyectos, tareas, notas, facturas, clientes) NUNCA se copia
 * aquí — se agrega en caliente desde sus propias colecciones, ver
 * `PresupuestosService.obtenerCalendario` y `calendario-tipos.ts`.
 */
const EventoCalendarioSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true },
  tipo: { type: String, enum: ['evento', 'recordatorio'], required: true },
  titulo: { type: String, required: true },
  descripcion: { type: String, default: '' },
  /** Fecha ISO (AAAA-MM-DD). */
  fecha: { type: String, required: true },
  /** Hora ISO ("HH:mm") — vacía si `todoElDia`. */
  hora: { type: String, default: '' },
  todoElDia: { type: Boolean, default: true },
  /** Solo tiene sentido para `tipo === 'evento'` con hora — 0 en el resto. */
  duracionMin: { type: Number, default: 0 },
  /** Enlace opcional a un cliente/proyecto ya existente — informativo, para poder abrir "la ficha de este cliente" desde el propio evento. Nunca obligatorio: un evento puede no pertenecer a ningún cliente/proyecto. */
  clienteId: { type: String, default: '' },
  proyectoId: { type: String, default: '' },
  creado: { type: String, required: true },
  actualizado: { type: String, required: true },
});
/** Consulta principal: elementos del usuario dentro de un rango de fechas (vista mensual/semanal/diaria). */
EventoCalendarioSchema.index({ usuarioId: 1, fecha: 1 });

export const EventoCalendarioModel: Model<any> =
  models.EventoCalendario || model('EventoCalendario', EventoCalendarioSchema);

/** Reutiliza la misma conexión/pool que el resto de modelos de negocio. */
export async function conectarEventosCalendario(): Promise<void> {
  await conectar();
}
