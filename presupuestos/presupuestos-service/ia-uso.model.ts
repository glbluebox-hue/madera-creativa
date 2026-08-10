import { Schema, model, models, Model } from 'mongoose';
import { conectar } from './cliente.model.js';
import { logger } from './logger.service.js';
import { calcularCosteUsd } from './ia-precios.js';

/**
 * Registro de uso de IA — colección de solo-inserción (append-only), nunca
 * se actualiza ni se borra un registro existente. Se escribe en CADA llamada
 * a `ServicioCentralIA.generar()`, con éxito o con error, desde el día 1 —
 * el objetivo es "primero conocer el comportamiento real" antes de aplicar
 * ningún límite de coste/uso (fuera de alcance de esta fase).
 *
 * Mismo patrón que `NotaSchema`/`NotaModel` (`cliente.model.ts`): `id` único
 * indexado, `usuarioId` con default `'admin'`, índices compuestos por
 * `{usuarioId,creado}`.
 */
const IaUsoSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, index: true, default: 'admin' },
  capacidad: { type: String, required: true, index: true },
  proveedor: { type: String, required: true },
  modelo: { type: String, required: true },
  tokensEntrada: { type: Number, default: 0 },
  tokensSalida: { type: Number, default: 0 },
  costeEstimadoUsd: { type: Number, default: 0 },
  duracionMs: { type: Number, default: 0 },
  iteracionesHerramientas: { type: Number, default: 0 },
  herramientasLlamadas: { type: [String], default: [] },
  exito: { type: Boolean, required: true },
  error: { type: String, default: '' },
  requestId: { type: String, default: '' },
  /** 1 = candidato principal; 2+ = se llegó a él tras el fallo de uno o más candidatos anteriores (Fase 4). */
  intentoNumero: { type: Number, default: 1 },
  /** `true` si esta petición necesitó probar más de un proveedor — evita agrupar por `requestId` solo para saberlo. */
  huboFallback: { type: Boolean, default: false },
  creado: { type: String, required: true },
});
IaUsoSchema.index({ usuarioId: 1, creado: -1 });
IaUsoSchema.index({ capacidad: 1, creado: -1 });

export const IaUsoModel: Model<any> = models.IaUso || model('IaUso', IaUsoSchema);

/** Datos de un registro de uso, antes de calcular el coste estimado y generar el id/fecha. */
export type RegistroUsoIA = {
  usuarioId: string;
  capacidad: string;
  proveedor: string;
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
  duracionMs: number;
  iteracionesHerramientas: number;
  herramientasLlamadas: string[];
  exito: boolean;
  error?: string;
  requestId?: string;
  /** 1 = candidato principal; 2+ = fallback. Default 1 si se omite (llamadas sin cadena de candidatos). */
  intentoNumero?: number;
  /** Default false si se omite. */
  huboFallback?: boolean;
};

/**
 * Registra un uso de IA. Nunca lanza — un fallo al guardar la telemetría no
 * debe tumbar la respuesta real al usuario, solo se registra en el log
 * (mismo criterio que `notificarAdminNuevoUsuario` en `presupuestos-service.app-root.ts`).
 */
export async function registrarUsoIA(registro: RegistroUsoIA): Promise<void> {
  try {
    await conectar();
    await IaUsoModel.create({
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`,
      ...registro,
      costeEstimadoUsd: calcularCosteUsd(registro.modelo, registro.tokensEntrada, registro.tokensSalida),
      error: registro.error ?? '',
      requestId: registro.requestId ?? '',
      intentoNumero: registro.intentoNumero ?? 1,
      huboFallback: registro.huboFallback ?? false,
      creado: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn({ err, capacidad: registro.capacidad, usuarioId: registro.usuarioId }, '[ia-uso] No se pudo registrar el uso de IA');
  }
}
