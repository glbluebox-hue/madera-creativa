import mongoose, { Schema, model, models, Model } from 'mongoose';
import { logger } from './logger.service.js';

/** Estado de un usuario en el sistema de licencias. */
export type EstadoUsuario = 'pendiente' | 'activo' | 'suspendido';

/**
 * Tipo de acceso concedido a la cuenta — capa independiente de `estado`.
 * `estado` decide SI puede entrar; `acceso` decide QUÉ puede usar una vez
 * dentro. Se mantienen separados a propósito: suspender a alguien
 * (`estado: 'suspendido'`) le quita el acceso de inmediato sin tocar ni un
 * campo de `acceso` — si se reactiva más adelante, recupera exactamente el
 * mismo plan que tenía, sin volver a canjear ningún código.
 */
export type TipoAcceso = 'trial' | 'promotional' | 'free' | 'paid';

/**
 * Plan asociado al acceso. `BASIC`/`PRO`/`PREMIUM` no tienen lógica real
 * todavía (no existe sistema de pagos) — existen en el tipo para que,
 * cuando lo haya, no haga falta ninguna migración de esquema.
 */
export type PlanAcceso = 'NONE' | 'LIFETIME_FREE' | 'BASIC' | 'PRO' | 'PREMIUM';

/** Cómo se concedió el acceso actual — trazabilidad, nunca se usa para autorizar nada. */
export type OrigenAcceso = 'registro' | 'codigo' | 'admin' | 'pago';

/** Bloque de acceso/plan de una cuenta — ver `TipoAcceso`. */
export type AccesoUsuario = {
  tipo: TipoAcceso;
  plan: PlanAcceso;
  activadoEn: string | null;
  expiraEn: string | null;
  origen: OrigenAcceso;
  /** Código promocional usado, solo a efectos de auditoría — nunca se relee para decidir acceso. */
  codigoUsado: string | null;
};

/** Valor por defecto de `acceso` para cuentas nuevas sin código (o documentos anteriores a este campo). */
export const ACCESO_POR_DEFECTO: AccesoUsuario = {
  tipo: 'free',
  plan: 'NONE',
  activadoEn: null,
  expiraEn: null,
  origen: 'registro',
  codigoUsado: null,
};

const AccesoSchema = new Schema(
  {
    tipo:        { type: String, enum: ['trial', 'promotional', 'free', 'paid'], default: 'free' },
    plan:        { type: String, enum: ['NONE', 'LIFETIME_FREE', 'BASIC', 'PRO', 'PREMIUM'], default: 'NONE' },
    activadoEn:  { type: String, default: null },
    expiraEn:    { type: String, default: null },
    origen:      { type: String, enum: ['registro', 'codigo', 'admin', 'pago'], default: 'registro' },
    codigoUsado: { type: String, default: null },
  },
  { _id: false }
);

/** Suscripción push de un dispositivo. */
const PushSubscriptionSchema = new Schema(
  {
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { _id: false }
);

/**
 * Algoritmo con el que se generó `passwordHash`.
 * `legacy` = hash no criptográfico anterior a la migración de seguridad;
 * se verifica con `verificarPasswordLegado` y se re-hashea a `bcrypt`
 * automáticamente en el siguiente login correcto (ver `password.service.ts`).
 */
export type AlgoritmoHash = 'legacy' | 'bcrypt';

/** Esquema de usuario registrado en la app. */
const UsuarioSchema = new Schema({
  id:           { type: String, required: true, unique: true, index: true },
  nombre:       { type: String, required: true, unique: true },
  /**
   * `nombre` en minúsculas, usado para el login case-insensitive sin
   * construir un RegExp dinámico a partir de la entrada del usuario.
   * El índice (único) se crea explícitamente en `asegurarIndiceNombreNormalizado()`
   * — sin ningún `index`/`unique` aquí. Declararlo también en el esquema
   * hacía que Mongoose creara automáticamente, al conectar, un índice no
   * único con el mismo nombre autogenerado (`nombreNormalizado_1`) antes de
   * que `asegurarIndiceNombreNormalizado()` pudiera crear su versión única
   * — el intento posterior fallaba por conflicto de nombre, y la
   * restricción de unicidad nunca llegaba a activarse de verdad
   * (diagnosticado en la fase de Integración completa, contra la base real).
   */
  nombreNormalizado: { type: String },
  passwordHash: { type: String, required: true },
  hashAlgo:     { type: String, enum: ['legacy', 'bcrypt'], default: 'legacy' },
  estado:       { type: String, enum: ['pendiente', 'activo', 'suspendido'], default: 'pendiente' },
  esAdmin:      { type: Boolean, default: false },
  creadoEn:     { type: String, required: true },
  ultimoAcceso: { type: String, default: '' },
  pushSubs:     { type: [PushSubscriptionSchema], default: [] },
  /**
   * Nombre para mostrar (barra lateral, saludo de Inicio) — independiente
   * de `nombre`, que es el identificador de acceso (login) y no debería
   * cambiar a la ligera. Vacío hasta que el usuario lo configura desde
   * "Mi perfil"; el frontend usa `nombre` como reserva mientras tanto.
   */
  nombreMostrar: { type: String, default: '' },
  /** Foto de perfil en formato data URL (base64) — mismo patrón que `Empresa.logo`. Vacía si no se ha subido ninguna. */
  foto:         { type: String, default: '' },
  /**
   * Tipo de acceso/plan de la cuenta (sistema de códigos promocionales y,
   * en el futuro, suscripciones de pago). Con `default`, así que los
   * documentos ya existentes en producción lo reciben automáticamente al
   * leerse — no hace falta ninguna migración destructiva.
   */
  acceso:       { type: AccesoSchema, default: () => ACCESO_POR_DEFECTO },
});

/** Modelo Mongoose de Usuario. */
export const UsuarioModel: Model<any> = models.Usuario || model('Usuario', UsuarioSchema);

/**
 * Conecta a MongoDB (reutiliza conexión existente). Mismo pool acotado que
 * `conectar()` en `cliente.model.ts` — ver el comentario allí (auditoría
 * 12/08/2026, alerta real de Atlas por límite de conexiones). En la
 * práctica solo una de las dos funciones llega a llamar a
 * `mongoose.connect()` de verdad (ambas comparten la misma conexión por
 * defecto de mongoose, protegidas por el mismo `readyState === 1`) — se
 * mantienen los mismos valores en ambas para que el resultado no dependa
 * de cuál se invoque primero.
 */
export async function conectarUsuarios(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  const url = process.env.MONGO_URL || 'mongodb://localhost:27017/madera-creativa';
  await mongoose.connect(url, { maxPoolSize: 10, minPoolSize: 0, maxIdleTimeMS: 30_000 });
}

/**
 * Rellena `nombreNormalizado` (nombre en minúsculas) en las cuentas
 * creadas antes de introducir este campo. Idempotente: solo toca
 * documentos que aún no lo tienen.
 *
 * Debe ejecutarse antes de `asegurarIndiceNombreNormalizado()` para que
 * el índice único no se construya contra documentos con el campo vacío.
 */
export async function migrarNombresNormalizados(): Promise<void> {
  await conectarUsuarios();
  const sinNormalizar = await UsuarioModel.find({ nombreNormalizado: { $exists: false } }).lean().exec();
  if (sinNormalizar.length === 0) return;
  await Promise.all(
    (sinNormalizar as any[]).map((u) =>
      UsuarioModel.updateOne({ id: u.id }, { $set: { nombreNormalizado: String(u.nombre).toLowerCase() } })
    )
  );
  logger.info({ cuentasActualizadas: sinNormalizar.length }, 'Migración nombreNormalizado');
}

/**
 * Crea el índice único de `nombreNormalizado` si todavía no existe.
 * Se llama después de `migrarNombresNormalizados()` para garantizar que
 * todos los documentos ya tienen el campo relleno antes de imponer la
 * restricción de unicidad.
 *
 * Si la creación falla (por ejemplo, dos cuentas ya comparten el mismo
 * nombre en distinta capitalización), se registra el error pero no se
 * detiene el arranque del servicio — es una situación de datos a resolver
 * manualmente, no un fallo de la aplicación.
 */
export async function asegurarIndiceNombreNormalizado(): Promise<void> {
  await conectarUsuarios();
  try {
    await UsuarioModel.collection.createIndex({ nombreNormalizado: 1 }, { unique: true });
  } catch (err) {
    logger.error({ err }, 'No se pudo crear el índice único de nombreNormalizado');
  }
}
