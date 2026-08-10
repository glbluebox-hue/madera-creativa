import mongoose, { Schema, model, models, Model } from 'mongoose';
import { logger } from './logger.service.js';

/** Estado de un usuario en el sistema de licencias. */
export type EstadoUsuario = 'pendiente' | 'activo' | 'suspendido';

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
});

/** Modelo Mongoose de Usuario. */
export const UsuarioModel: Model<any> = models.Usuario || model('Usuario', UsuarioSchema);

/**
 * Conecta a MongoDB (reutiliza conexión existente).
 */
export async function conectarUsuarios(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  const url = process.env.MONGO_URL || 'mongodb://localhost:27017/madera-creativa';
  await mongoose.connect(url);
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
