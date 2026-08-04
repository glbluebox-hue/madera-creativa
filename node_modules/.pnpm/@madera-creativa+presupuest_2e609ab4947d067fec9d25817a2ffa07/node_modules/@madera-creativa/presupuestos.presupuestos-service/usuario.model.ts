import mongoose, { Schema, model, models, Model } from 'mongoose';

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

/** Esquema de usuario registrado en la app. */
const UsuarioSchema = new Schema({
  id:           { type: String, required: true, unique: true, index: true },
  nombre:       { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
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
