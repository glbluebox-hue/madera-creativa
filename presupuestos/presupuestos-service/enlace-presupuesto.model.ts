import { randomBytes, createHash } from 'node:crypto';
import { Schema, model, models, Model } from 'mongoose';

/**
 * Enlace público de un presupuesto (Portal del cliente) — mismo patrón que
 * `refresh-token.model.ts`: solo se guarda el hash SHA-256 del token, nunca
 * el valor en claro (solo existe una vez, en la URL que se comparte).
 *
 * `contenidoHash` es la firma de integridad del CONTENIDO del presupuesto en
 * el momento de generar el enlace (ver `hashContenidoPublico` en
 * `presupuestos-service.ts`) — al aceptar, se recalcula sobre el presupuesto
 * actual y debe coincidir. Sin esto, el carpintero podría editar precios
 * después de generar el enlace y el cliente firmaría una versión distinta
 * de la que vio (hallazgo de la revisión de seguridad, 17/08/2026).
 *
 * IMPORTANTE: esta colección NUNCA debe llevar un índice TTL sobre
 * `expiraEn` — un enlace caducado deja de ser válido para verse/aceptarse
 * (comprobación en la propia consulta), pero el documento debe persistir
 * indefinidamente: `aceptadoEn`/`aceptadoIp`/`firmaUrl` SON la evidencia de
 * aceptación, y una expiración de Mongo la borraría junto con el enlace.
 */
const EnlacePresupuestoSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  presupuestoId: { type: String, required: true, index: true },
  usuarioId: { type: String, required: true, index: true },
  contenidoHash: { type: String, required: true },
  creadoEn: { type: Date, required: true },
  expiraEn: { type: Date, required: true },
  revocadoEn: { type: Date, default: null },
  aceptadoEn: { type: Date, default: null },
  aceptadoIp: { type: String, default: '' },
  aceptadoUserAgent: { type: String, default: '' },
  firmaUrl: { type: String, default: '' },
});

export const EnlacePresupuestoModel: Model<any> = models.EnlacePresupuesto || model('EnlacePresupuesto', EnlacePresupuestoSchema);

function hashearToken(tokenPlano: string): string {
  return createHash('sha256').update(tokenPlano).digest('hex');
}

/** Formato esperado de un token de enlace: 64 caracteres hex (`randomBytes(32).toString('hex')`). */
export function formatoTokenValido(tokenPlano: string): boolean {
  return /^[a-f0-9]{64}$/.test(tokenPlano);
}

/**
 * Genera un enlace nuevo para un presupuesto y revoca (soft) cualquier
 * enlace anterior todavía activo del mismo presupuesto — solo uno válido a
 * la vez, para que nunca haya duda de cuál es "el de verdad". Como solo se
 * guarda el hash, un token ya generado no se puede recuperar ni reutilizar:
 * cada llamada crea uno nuevo.
 */
export async function crearEnlacePresupuesto(params: {
  presupuestoId: string;
  usuarioId: string;
  contenidoHash: string;
  validezDias: number;
}): Promise<{ token: string; expiraEn: Date }> {
  const ahora = new Date();
  const expiraEn = new Date(ahora.getTime() + Math.max(1, params.validezDias) * 24 * 60 * 60 * 1000);

  // Crear el nuevo ANTES de revocar los anteriores (no al revés) — son dos
  // operaciones separadas, no una transacción; si el proceso cae justo
  // entre medias, este orden deja como mucho DOS enlaces válidos a la vez
  // (inofensivo — "Generar enlace" está pensado para eso), nunca CERO
  // (que dejaría al presupuesto sin ningún enlace utilizable hasta que
  // alguien vuelva a pulsar el botón). Hallazgo de la auditoría de
  // seguridad, 18/08/2026.
  const tokenPlano = randomBytes(32).toString('hex');
  await EnlacePresupuestoModel.create({
    tokenHash: hashearToken(tokenPlano),
    presupuestoId: params.presupuestoId,
    usuarioId: params.usuarioId,
    contenidoHash: params.contenidoHash,
    creadoEn: ahora,
    expiraEn,
    revocadoEn: null,
    aceptadoEn: null,
    aceptadoIp: '',
    aceptadoUserAgent: '',
    firmaUrl: '',
  });

  await EnlacePresupuestoModel.updateMany(
    { presupuestoId: params.presupuestoId, usuarioId: params.usuarioId, revocadoEn: null, tokenHash: { $ne: hashearToken(tokenPlano) } },
    { $set: { revocadoEn: ahora } }
  ).exec();

  return { token: tokenPlano, expiraEn };
}

/** Busca un enlace por su token en claro (compara por hash). `null` si no existe. */
export async function buscarEnlacePorToken(tokenPlano: string): Promise<any | null> {
  return EnlacePresupuestoModel.findOne({ tokenHash: hashearToken(tokenPlano) }).exec();
}

/**
 * `presupuestoId -> {expiraEn, contenidoHash}` de los enlaces activos (ni
 * revocados ni caducados) de un usuario — para que la lista de
 * presupuestos sepa, SIN el token en claro (nunca se guarda), si ya
 * existe uno vigente y avisar antes de generar otro que lo revocaría.
 * Bug real, 26/08/2026: sin esto, recargar la página perdía el estado
 * local de "ya generé un enlace para este" y volvía a mostrar "Generar
 * enlace" — un segundo clic revocaba en silencio el que ya se le había
 * mandado a un cliente real, sin ningún aviso.
 *
 * `contenidoHash` se incluye desde el 31/08/2026 por un segundo hallazgo
 * real del usuario: si edita el presupuesto DESPUÉS de mandar el enlace,
 * el enlace deja de servir para firmar (el cliente ve "el presupuesto ha
 * cambiado, pide uno nuevo" — integridad ya existente, revisión de
 * seguridad 17/08/2026) pero la propia app seguía diciéndole "ya hay un
 * enlace activo" sin avisar de que ESE enlace concreto ya no vale — se
 * enteró porque se lo dijo el cliente, no la aplicación. El llamador
 * (`listarPresupuestos` y afines, `presupuestos-service.ts`) recalcula el
 * hash del contenido actual y lo compara con este para distinguir "enlace
 * activo y válido" de "enlace activo pero roto por una edición posterior".
 */
export async function enlacesActivosDeUsuario(usuarioId: string): Promise<Record<string, { expiraEn: string; contenidoHash: string }>> {
  const activos = await EnlacePresupuestoModel.find({
    usuarioId, revocadoEn: null, expiraEn: { $gt: new Date() },
  }).select('presupuestoId expiraEn contenidoHash').lean().exec();
  const mapa: Record<string, { expiraEn: string; contenidoHash: string }> = {};
  for (const e of activos as any[]) mapa[e.presupuestoId] = { expiraEn: e.expiraEn.toISOString(), contenidoHash: e.contenidoHash };
  return mapa;
}

/**
 * Reclama el enlace como aceptado — atómico y con el propio filtro
 * (`aceptadoEn: null`) como guarda contra doble envío concurrente (mismo
 * patrón que `rotarRefreshToken`). Si no hay coincidencia, el enlace ya
 * estaba aceptado (por esta misma petición reintentada, o por una
 * concurrente) y el llamador debe tratarlo como éxito idempotente, no como
 * error.
 *
 * Deliberadamente SIN `firmaUrl` todavía — quien llama debe reclamar
 * PRIMERO y subir la imagen de la firma DESPUÉS, solo si gana la carrera.
 * Al revés (subir primero, reclamar después) el perdedor de una carrera ya
 * habría subido su imagen para nada, dejando un archivo huérfano en el
 * almacenamiento (hallazgo de la auditoría de seguridad, 18/08/2026).
 */
export async function reclamarEnlaceAceptado(tokenPlano: string, evidencia: { ip: string; userAgent: string }): Promise<any | null> {
  return EnlacePresupuestoModel.findOneAndUpdate(
    { tokenHash: hashearToken(tokenPlano), aceptadoEn: null },
    { $set: { aceptadoEn: new Date(), aceptadoIp: evidencia.ip, aceptadoUserAgent: evidencia.userAgent } },
    { new: true }
  ).exec();
}

/** Guarda la URL de la firma en un enlace ya reclamado (ver `reclamarEnlaceAceptado`). */
export async function guardarFirmaEnlace(tokenPlano: string, firmaUrl: string): Promise<void> {
  await EnlacePresupuestoModel.updateOne(
    { tokenHash: hashearToken(tokenPlano) },
    { $set: { firmaUrl } }
  ).exec();
}
