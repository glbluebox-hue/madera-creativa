import { conectar } from './cliente.model.js';
import { ContadorAlmacenamientoModel } from './contador-almacenamiento.model.js';
import type { PlanAcceso } from './usuario.model.js';

/**
 * Cuota de almacenamiento por plan (05/09/2026) — encargo del usuario,
 * decisión definitiva: BASIC 5 GB, PRO 25 GB, PREMIUM 100 GB, ADMIN sin
 * límite. Punto único de verdad de los límites en bytes — nunca repetir
 * el número en ningún otro archivo.
 *
 * Mismo criterio arquitectónico que `numeracion-presupuestos.ts`: un
 * contador simple (`ContadorAlmacenamientoModel`) actualizado con `$inc`
 * atómico, nunca "leer total, comparar, escribir" en dos pasos (ver
 * `reclamarEspacioAlmacenamiento` para el porqué del patrón "incrementar
 * primero, revertir si se pasa", en vez de una comprobación previa).
 *
 * GiB (1024^3), no GB (1000^3) — mismo criterio que el resto de límites en
 * bytes de este código (`LIMITE_BLOBS_CLIENTE_BYTES`, `LIMITE_RECURSO_BYTES`...),
 * todos definidos como potencias de 1024.
 */
const GIB = 1024 * 1024 * 1024;

export const LIMITES_ALMACENAMIENTO_GB: Record<'BASIC' | 'PRO' | 'PREMIUM', number> = {
  BASIC: 5,
  PRO: 25,
  PREMIUM: 100,
};

export const LIMITES_ALMACENAMIENTO_BYTES: Record<'BASIC' | 'PRO' | 'PREMIUM', number> = {
  BASIC: LIMITES_ALMACENAMIENTO_GB.BASIC * GIB,
  PRO: LIMITES_ALMACENAMIENTO_GB.PRO * GIB,
  PREMIUM: LIMITES_ALMACENAMIENTO_GB.PREMIUM * GIB,
};

/**
 * Límite en bytes para el plan de una cuenta. `PlanAcceso` incluye también
 * `'NONE'`/`'LIFETIME_FREE'` (cuentas sin un plan comercial asignado,
 * mismo caso ya documentado en `planes.ts` — "ninguna decisión de producto
 * dice que un código de acceso vitalicio gratuito deba equivaler a
 * BASIC/PRO/PREMIUM"). Decisión DEFINITIVA confirmada por el usuario
 * (05/09/2026): ambas se tratan exactamente como BASIC (5 GB) — no hace
 * falta ninguna otra excepción.
 */
export function limiteAlmacenamientoBytes(plan: PlanAcceso): number {
  if (plan === 'PRO') return LIMITES_ALMACENAMIENTO_BYTES.PRO;
  if (plan === 'PREMIUM') return LIMITES_ALMACENAMIENTO_BYTES.PREMIUM;
  return LIMITES_ALMACENAMIENTO_BYTES.BASIC; // BASIC, NONE, LIFETIME_FREE
}

/**
 * Se lanza cuando una subida superaría la cuota de almacenamiento del
 * plan. `responderError` (`presupuestos-service.app-root.ts`) la reconoce
 * específicamente y responde 413 con `error: 'cuota_almacenamiento_superada'`
 * — un código identificable para que el frontend distinga esto de
 * `plan_insuficiente` (el plan SÍ permite la función; es la cuenta la que
 * se ha quedado sin espacio) sin tener que interpretar el mensaje.
 */
export class ErrorCuotaAlmacenamientoSuperada extends Error {
  constructor(public bytesUsados: number, public limiteBytes: number, public bytesSolicitados: number) {
    super(
      `Se ha alcanzado el límite de almacenamiento de tu plan (${(bytesUsados / GIB).toFixed(2)} GB de ${(limiteBytes / GIB).toFixed(0)} GB usados). Libera espacio borrando archivos o cambia de plan para poder subir esto.`
    );
  }
}

/**
 * Reclama espacio de forma atómica y seguro ante concurrencia: incrementa
 * primero (`$inc`, atómico por documento en MongoDB — nunca "leer +
 * comparar + escribir" en pasos separados), y si el resultado se pasa del
 * límite, revierte el mismo incremento y rechaza. Dos peticiones
 * simultáneas nunca pueden colarse ambas por debajo del límite: MongoDB
 * serializa los `findOneAndUpdate` sobre el mismo documento, así que cada
 * llamada ve siempre el total ya actualizado por cualquier otra que la
 * haya precedido.
 *
 * `usuarioId === 'admin'` (mismo criterio que `requirePlan`/
 * `capacidadPermitidaParaPlan`, `planes.ts` — nunca una segunda definición
 * de "admin"): incrementa el contador igualmente (para que su propio uso
 * quede visible si algún día se muestra), pero JAMÁS rechaza.
 */
export async function reclamarEspacioAlmacenamiento(usuarioId: string, bytes: number, plan: PlanAcceso): Promise<void> {
  if (bytes <= 0) return;
  await conectar();
  const doc = await ContadorAlmacenamientoModel.findOneAndUpdate(
    { usuarioId },
    { $inc: { bytesUsados: bytes } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec() as any;

  if (usuarioId === 'admin') return; // ilimitado — nunca rechaza, pero el contador sigue siendo real.

  const limite = limiteAlmacenamientoBytes(plan);
  if (doc.bytesUsados > limite) {
    // Revierte el mismo incremento — atómico también, nunca deja el
    // contador por encima de lo que de verdad hay subido.
    await ContadorAlmacenamientoModel.updateOne({ usuarioId }, { $inc: { bytesUsados: -bytes } }).exec();
    throw new ErrorCuotaAlmacenamientoSuperada(doc.bytesUsados - bytes, limite, bytes);
  }
}

/**
 * Reclama espacio para una subida que puede ser un REEMPLAZO de un
 * archivo que ya ocupaba espacio (`tamanoAntiguo`) — solo reserva la
 * DIFERENCIA (`tamanoNuevo - tamanoAntiguo`). Así sustituir un archivo por
 * otro igual o más pequeño nunca puede rechazarse por cuota (nunca hay que
 * "liberar primero y reclamar después", que dejaría una ventana en la que
 * otra subida concurrente podría colarse en el espacio del archivo que se
 * está reemplazando). `tamanoAntiguo = 0` para un archivo nuevo — se
 * comporta exactamente igual que `reclamarEspacioAlmacenamiento`.
 */
export async function reclamarEspacioParaSustitucion(
  usuarioId: string, plan: PlanAcceso, tamanoNuevo: number, tamanoAntiguo: number
): Promise<void> {
  const delta = tamanoNuevo - tamanoAntiguo;
  if (delta <= 0) {
    if (delta < 0) await liberarEspacioAlmacenamiento(usuarioId, -delta);
    return;
  }
  await reclamarEspacioAlmacenamiento(usuarioId, delta, plan);
}

/**
 * Libera espacio al borrar un archivo (o sustituirlo por uno más pequeño)
 * — `$inc` negativo, mismo criterio atómico. Nunca lanza ni deja el
 * contador por debajo de 0 en la lectura (`obtenerUsoAlmacenamiento`
 * aplica `Math.max(0, ...)` defensivamente; ver el comentario ahí).
 */
export async function liberarEspacioAlmacenamiento(usuarioId: string, bytes: number): Promise<void> {
  if (bytes <= 0) return;
  await conectar();
  await ContadorAlmacenamientoModel.updateOne(
    { usuarioId },
    { $inc: { bytesUsados: -bytes } },
    { upsert: true }
  ).exec();
}

export type UsoAlmacenamiento = {
  bytesUsados: number;
  limiteBytes: number;
  plan: PlanAcceso;
  ilimitado: boolean;
  porcentaje: number;
  /** `'normal' | 'aviso' | 'lleno'` — para que el frontend decida el color/mensaje sin repetir el umbral. */
  estado: 'normal' | 'aviso' | 'lleno';
};

/** A partir de qué porcentaje de uso se considera "aviso" (amarillo) en vez de "normal". */
const UMBRAL_AVISO_PORCENTAJE = 90;

/**
 * Uso actual de almacenamiento de una cuenta — para `GET /almacenamiento/uso`
 * y para que el frontend muestre "X de Y GB". `admin` se muestra como
 * ilimitado (`limiteBytes: Infinity`, `porcentaje: 0`) aunque su
 * `bytesUsados` real siga siendo el correcto.
 */
export async function obtenerUsoAlmacenamiento(usuarioId: string, plan: PlanAcceso): Promise<UsoAlmacenamiento> {
  await conectar();
  const doc = await ContadorAlmacenamientoModel.findOne({ usuarioId }).lean().exec() as any;
  const bytesUsados = Math.max(0, doc?.bytesUsados ?? 0);
  const ilimitado = usuarioId === 'admin';
  const limiteBytes = ilimitado ? Infinity : limiteAlmacenamientoBytes(plan);
  const porcentaje = ilimitado ? 0 : Math.min(100, (bytesUsados / limiteBytes) * 100);
  const estado: UsoAlmacenamiento['estado'] = ilimitado ? 'normal' : porcentaje >= 100 ? 'lleno' : porcentaje >= UMBRAL_AVISO_PORCENTAJE ? 'aviso' : 'normal';
  return { bytesUsados, limiteBytes, plan, ilimitado, porcentaje, estado };
}

/** Tamaño en bytes de un valor tal como se guarda en Mongo (JSON, UTF-8) — usado para `Dibujo.contenido`, que nunca se sube a almacenamiento externo (embebido en Base64 dentro del propio documento). */
export function tamanoContenidoJson(valor: unknown): number {
  return Buffer.byteLength(JSON.stringify(valor ?? null), 'utf8');
}
