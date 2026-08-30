import { Schema, model, models, Model } from 'mongoose';

/**
 * Conexión OAuth de un usuario con Trimble Identity (Fase "Diseño 3D /
 * SketchUp", 30/08/2026) — UNA por usuario, nunca por proyecto: el usuario
 * conecta su cuenta de Trimble/SketchUp una sola vez ("Conectar con
 * SketchUp"), y esa conexión se reutiliza para asociar y abrir el modelo
 * de cualquiera de sus proyectos. Mismo patrón que `ia-uso.model.ts`
 * (colección propia, fuera de `cliente.model.ts`, porque es
 * infraestructura de integración, no un dato de negocio del cliente).
 *
 * Nunca se guarda una contraseña — `refreshTokenCifrado` es el único
 * secreto persistido, y siempre cifrado (`trimble-cifrado.ts`, AES-256-GCM).
 */
const TrimbleConexionSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  usuarioId: { type: String, required: true, unique: true, index: true },
  refreshTokenCifrado: { type: String, required: true },
  /** "Conectado como…" en la interfaz — nunca se usa para autenticar nada, solo para mostrarlo. */
  trimbleEmail: { type: String, default: '' },
  scopes: { type: [String], default: [] },
  /** El refresh token de Trimble es de un solo uso y caduca a los 9 días — se recalcula en cada refresco real. */
  refreshTokenCaduca: { type: String, required: true },
  creado: { type: String, required: true },
  actualizado: { type: String, required: true },
});

export const TrimbleConexionModel: Model<any> =
  models.TrimbleConexion || model('TrimbleConexion', TrimbleConexionSchema);
