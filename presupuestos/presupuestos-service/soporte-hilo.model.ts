import { randomUUID } from 'node:crypto';
import { Schema, model, models, Model } from 'mongoose';
import { conectarUsuarios } from './usuario.model.js';

/**
 * Comentarios/sugerencias/incidencias de un usuario hacia el admin
 * (26/08/2026) — petición real: "un portal donde el cliente [usuario de la
 * app] pueda dejarme comentarios de mejoras/incidencias/problemas y yo
 * comunicarme directamente con él". Modelado como hilo de conversación
 * (no un simple buzón de una sola vía): el mensaje inicial del usuario
 * abre el hilo, y tanto el usuario como el admin pueden seguir añadiendo
 * mensajes al mismo hilo después — cubre tanto una duda rápida como una
 * ida y vuelta más larga, sin montar un sistema de chat completo.
 */

export type TipoHiloSoporte = 'mejora' | 'incidencia' | 'problema';
export type EstadoHiloSoporte = 'abierto' | 'resuelto';
export type AutorMensajeSoporte = 'usuario' | 'admin';

const MensajeSoporteSchema = new Schema({
  id: { type: String, required: true },
  autor: { type: String, enum: ['usuario', 'admin'], required: true },
  texto: { type: String, required: true },
  fecha: { type: String, required: true },
}, { _id: false });

const SoporteHiloSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true },
  /** Nombre/email del usuario en el momento de abrir el hilo — desnormalizado a propósito, para que el admin no tenga que cruzar con `UsuarioModel` solo para listar los hilos. */
  usuarioNombre: { type: String, required: true },
  tipo: { type: String, enum: ['mejora', 'incidencia', 'problema'], required: true },
  estado: { type: String, enum: ['abierto', 'resuelto'], default: 'abierto' },
  mensajes: { type: [MensajeSoporteSchema], default: [] },
  creadoEn: { type: String, required: true },
  actualizadoEn: { type: String, required: true },
});

export const SoporteHiloModel: Model<any> = models.SoporteHilo || model('SoporteHilo', SoporteHiloSchema);

/** Reutiliza la misma conexión/pool que el resto de modelos de usuario. */
export async function conectarSoporte(): Promise<void> {
  await conectarUsuarios();
}

export function generarIdHiloSoporte(): string {
  return randomUUID();
}
