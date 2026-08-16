import { randomUUID } from 'node:crypto';
import { Schema, model, models, Model } from 'mongoose';
import { conectarUsuarios } from './usuario.model.js';
import type { TipoAcceso, PlanAcceso } from './usuario.model.js';

/**
 * Código promocional/de acceso gratuito — lo crea y gestiona el admin desde
 * el panel (nunca el propio usuario). Un código solo sirve para ESTAMPAR
 * `acceso` en el documento del usuario en el momento del canje (ver
 * `canjearCodigo` más abajo); una vez canjeado, el código nunca se vuelve a
 * consultar para decidir si esa cuenta puede entrar — eso lo decide siempre
 * `estado` (ver `usuario.model.ts`). Por eso desactivar un código no le
 * quita el acceso a quien ya lo usó: para eso está suspender a esa persona
 * en concreto desde el panel de usuarios.
 */
const CodigoPromocionalSchema = new Schema({
  id:                  { type: String, required: true, unique: true, index: true },
  /** Siempre en mayúsculas (ver `normalizarCodigo`) — la comparación al canjear es case-insensitive de facto. */
  codigo:              { type: String, required: true, unique: true, index: true },
  /** El admin lo apaga sin borrarlo — conserva el histórico de usos. */
  activo:              { type: Boolean, default: true },
  tipoAccesoConcedido: { type: String, enum: ['trial', 'promotional', 'free', 'paid'], required: true },
  planConcedido:       { type: String, enum: ['NONE', 'LIFETIME_FREE', 'BASIC', 'PRO', 'PREMIUM'], required: true },
  /** Días de validez del ACCESO concedido a partir del canje — null = sin caducidad (p. ej. MADERA26). No es la caducidad del propio código. */
  duracionDias:        { type: Number, default: null },
  /** Usos totales permitidos del código — null = ilimitado. */
  usosMaximos:         { type: Number, default: null },
  usosActuales:        { type: Number, default: 0, required: true },
  /** Ventana en la que el CÓDIGO se puede canjear (ISO 8601) — null = sin límite en ese extremo. */
  fechaInicio:         { type: String, default: null },
  fechaExpiracion:     { type: String, default: null },
  creadoEn:            { type: String, required: true },
  creadoPor:           { type: String, default: 'admin' },
  notas:               { type: String, default: '' },
});

export const CodigoPromocionalModel: Model<any> =
  models.CodigoPromocional || model('CodigoPromocional', CodigoPromocionalSchema);

/** Reutiliza la misma conexión/pool que el resto de modelos de usuario. */
export async function conectarCodigos(): Promise<void> {
  await conectarUsuarios();
}

export function generarIdCodigo(): string {
  return randomUUID();
}

/** Mismo criterio de normalización en todos los sitios que tocan un código: mayúsculas, sin espacios sobrantes. */
export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

export type ResultadoCanjeCodigo =
  | { ok: true; codigo: string; tipoAcceso: TipoAcceso; plan: PlanAcceso; expiraEn: string | null }
  | { ok: false; razon: 'no_existe' | 'inactivo' | 'fuera_de_fecha' | 'agotado' };

/**
 * Intenta canjear un código. Válido y con cupo → incrementa `usosActuales`
 * y devuelve qué acceso conceder; si no, explica por qué (solo a efectos de
 * mensaje al usuario — la decisión real ya se tomó de forma atómica arriba).
 *
 * La comprobación de cupo/fecha/actividad y el incremento son LA MISMA
 * operación (`findOneAndUpdate` con esas condiciones en el propio filtro),
 * igual que la rotación de refresh tokens (`refresh-token.model.ts`) — así
 * dos canjes simultáneos del último hueco disponible no pueden dejar
 * `usosActuales` por encima de `usosMaximos`: cada petición concurrente ve
 * el contador ya actualizado por la anterior en el momento de evaluar su
 * propio filtro, nunca un valor obsoleto.
 */
export async function canjearCodigo(codigoTexto: string): Promise<ResultadoCanjeCodigo> {
  await conectarCodigos();
  const codigo = normalizarCodigo(codigoTexto);
  const ahora = new Date().toISOString();

  const actualizado = await CodigoPromocionalModel.findOneAndUpdate(
    {
      codigo,
      activo: true,
      $and: [
        { $or: [{ fechaInicio: null }, { fechaInicio: { $lte: ahora } }] },
        { $or: [{ fechaExpiracion: null }, { fechaExpiracion: { $gte: ahora } }] },
        { $or: [{ usosMaximos: null }, { $expr: { $lt: ['$usosActuales', '$usosMaximos'] } }] },
      ],
    },
    { $inc: { usosActuales: 1 } },
    { new: true }
  ).exec() as any;

  if (actualizado) {
    return {
      ok: true,
      codigo: actualizado.codigo,
      tipoAcceso: actualizado.tipoAccesoConcedido,
      plan: actualizado.planConcedido,
      expiraEn: actualizado.duracionDias
        ? new Date(Date.now() + actualizado.duracionDias * 24 * 60 * 60 * 1000).toISOString()
        : null,
    };
  }

  const existente = await CodigoPromocionalModel.findOne({ codigo }).lean().exec() as any;
  if (!existente) return { ok: false, razon: 'no_existe' };
  if (!existente.activo) return { ok: false, razon: 'inactivo' };
  if (existente.usosMaximos !== null && existente.usosActuales >= existente.usosMaximos) return { ok: false, razon: 'agotado' };
  return { ok: false, razon: 'fuera_de_fecha' };
}
