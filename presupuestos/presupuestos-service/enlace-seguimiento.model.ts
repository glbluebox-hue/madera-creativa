import { randomBytes, createHash } from 'node:crypto';
import { Schema, model, models, Model } from 'mongoose';

/**
 * Enlace público de seguimiento de un presupuesto — mismo patrón que
 * `enlace-resena.model.ts`: solo se guarda el hash SHA-256 del token, nunca
 * el valor en claro.
 *
 * A diferencia de `enlace-presupuesto.model.ts`, este NO lleva `expiraEn`
 * (decisión del dueño del negocio, 25/10/2026: el enlace de seguimiento no
 * caduca) y SÍ permite responder más de una vez: cada envío sobrescribe
 * `respuesta`/`respondidoEn` en vez de bloquear el enlace tras el primer uso.
 */
const EnlaceSeguimientoSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  presupuestoId: { type: String, required: true, index: true },
  clienteId: { type: String, required: true, index: true },
  usuarioId: { type: String, required: true, index: true },
  creadoEn: { type: Date, required: true },
  revocadoEn: { type: Date, default: null },
  /** Momento del primer clic — `null` mientras el cliente no lo haya usado nunca. */
  primerUsoEn: { type: Date, default: null },
  /** Nº de veces que se ha resuelto este enlace (visitas), incluida la primera. */
  usos: { type: Number, default: 0 },
  /** Fecha del envío más reciente del cuestionario — `null` mientras no haya respondido nunca. */
  respondidoEn: { type: Date, default: null },
  respuesta: {
    type: new Schema({
      valoracion: { type: String, default: '' },
      loQueGusta: { type: String, default: '' },
      loQueNoConvence: { type: String, default: '' },
      ayudaNecesaria: { type: [String], default: [] },
      quiereContacto: { type: String, default: '' },
      comentario: { type: String, default: '' },
    }, { _id: false }),
    default: null,
  },
  /** Nota del profesional — nunca la ve el cliente. */
  notaInterna: { type: String, default: '' },
  /** generado | enviado | respondido | contactoSolicitado | pausa | cerrado */
  estado: { type: String, default: 'generado' },
});

export const EnlaceSeguimientoModel: Model<any> = models.EnlaceSeguimiento || model('EnlaceSeguimiento', EnlaceSeguimientoSchema);

function hashearToken(tokenPlano: string): string {
  return createHash('sha256').update(tokenPlano).digest('hex');
}

/** Formato esperado de un token de enlace de seguimiento: 64 caracteres hex (`randomBytes(32).toString('hex')`). */
export function formatoTokenValidoSeguimiento(tokenPlano: string): boolean {
  return /^[a-f0-9]{64}$/.test(tokenPlano);
}

/**
 * Genera un enlace de seguimiento nuevo para un presupuesto y revoca (soft)
 * cualquier enlace anterior todavía activo del mismo presupuesto — mismo
 * orden deliberado que `crearEnlacePresupuesto`/`crearEnlaceResena`: crea el
 * nuevo ANTES de revocar los anteriores, así que como mucho deja dos
 * enlaces válidos a la vez si el proceso cae entre medias, nunca cero.
 */
export async function crearEnlaceSeguimiento(params: { presupuestoId: string; clienteId: string; usuarioId: string }): Promise<{ token: string }> {
  const ahora = new Date();
  const tokenPlano = randomBytes(32).toString('hex');
  const tokenHash = hashearToken(tokenPlano);

  await EnlaceSeguimientoModel.create({
    tokenHash,
    presupuestoId: params.presupuestoId,
    clienteId: params.clienteId,
    usuarioId: params.usuarioId,
    creadoEn: ahora,
    revocadoEn: null,
    primerUsoEn: null,
    usos: 0,
    respondidoEn: null,
    respuesta: null,
    notaInterna: '',
    estado: 'generado',
  });

  await EnlaceSeguimientoModel.updateMany(
    { presupuestoId: params.presupuestoId, usuarioId: params.usuarioId, revocadoEn: null, tokenHash: { $ne: tokenHash } },
    { $set: { revocadoEn: ahora } }
  ).exec();

  return { token: tokenPlano };
}

/** Busca un enlace de seguimiento por su token en claro (compara por hash). `null` si no existe. */
export async function buscarEnlaceSeguimientoPorToken(tokenPlano: string): Promise<any | null> {
  return EnlaceSeguimientoModel.findOne({ tokenHash: hashearToken(tokenPlano) }).exec();
}

/**
 * Registra una visita del enlace — atómico vía pipeline de actualización
 * (mismo patrón que `registrarUsoEnlaceResena`): incrementa `usos` y, solo
 * si `primerUsoEn` seguía a `null`, lo fija a ahora.
 */
export async function registrarUsoEnlaceSeguimiento(tokenPlano: string): Promise<void> {
  const ahora = new Date();
  await EnlaceSeguimientoModel.updateOne(
    { tokenHash: hashearToken(tokenPlano) },
    [{ $set: { usos: { $add: ['$usos', 1] }, primerUsoEn: { $ifNull: ['$primerUsoEn', ahora] } } }],
    { updatePipeline: true }
  ).exec();
}

/** Busca el enlace de seguimiento activo (ni revocado) de un presupuesto, para un usuario dado. `null` si nunca se generó ninguno. */
export async function buscarEnlaceSeguimientoActivo(presupuestoId: string, usuarioId: string): Promise<any | null> {
  return EnlaceSeguimientoModel.findOne({ presupuestoId, usuarioId, revocadoEn: null }).exec();
}
