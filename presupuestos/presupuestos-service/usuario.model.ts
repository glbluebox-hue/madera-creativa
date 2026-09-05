import { Schema, model, models, Model } from 'mongoose';
import { logger } from './logger.service.js';
import { conectarMongo } from './mongo-conexion.js';

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
 * Plan asociado al acceso. `BASIC`/`PRO`/`PREMIUM` tienen lógica real y
 * completa desde la Fase 1+2 de planes (`planes.ts`) y el sistema de
 * cuota de almacenamiento (`almacenamiento-cuota.ts`) — el comentario
 * anterior ("no tienen lógica real todavía") quedó desactualizado.
 * `NONE`/`LIFETIME_FREE` nunca cumplen ningún requisito comercial (ver
 * `PLANES_COMERCIALES` en `planes.ts`).
 */
export type PlanAcceso = 'NONE' | 'LIFETIME_FREE' | 'BASIC' | 'PRO' | 'PREMIUM';

/**
 * Cómo se concedió el acceso actual — trazabilidad, nunca se usa para
 * autorizar nada (la autorización real siempre pasa por
 * `planes.ts`/`calcularPlanEfectivo`, nunca compara este campo). `'trial'`
 * (05/09/2026, prueba gratuita de 60 días) — igual que `'codigo'`/`'pago'`,
 * es solo de cara a mostrar/auditar de dónde vino el acceso.
 */
export type OrigenAcceso = 'registro' | 'codigo' | 'admin' | 'pago' | 'trial';

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
    origen:      { type: String, enum: ['registro', 'codigo', 'admin', 'pago', 'trial'], default: 'registro' },
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
 * Un tipo de notificación concreto — activo/inactivo y a qué hora
 * (18/08/2026, ampliado a hora+minuto propios por tipo: antes horas y
 * margen/cobros/briefing compartían una única hora fija de servidor, sin
 * poder cambiarla desde la app — pedido explícito del usuario: "todo esto
 * tiene que ser editable y con la posibilidad de poner una hora y también
 * minutos"). `Schema.Types.Mixed` en vez de un sub-schema tipado a
 * propósito: `notifPrefs.horas` empezó siendo un `Boolean` liso (versión
 * anterior, sigue así en cuentas que no lo hayan vuelto a guardar) — un
 * sub-schema con casting estricto fallaría al leer ese valor antiguo. La
 * interpretación (booleano viejo vs. objeto nuevo vs. ausente del todo) la
 * hace siempre `leerPreferenciaNotif()`, nunca Mongoose.
 */
const PreferenciasNotificacionesSchema = new Schema(
  {
    horas: { type: Schema.Types.Mixed, default: true },
    cobrosPendientes: { type: Schema.Types.Mixed, default: true },
    margenBajo: { type: Schema.Types.Mixed, default: true },
    briefingDiario: { type: Schema.Types.Mixed, default: true },
  },
  { _id: false }
);

/** Un tipo de notificación ya interpretado — activo/inactivo y su hora (UTC). */
export type PreferenciaNotifTipo = { activo: boolean; hora: number; minuto: number };

/**
 * Lee un campo de `notifPrefs` con compatibilidad hacia atrás: puede venir
 * ausente (cuenta nunca guardó nada), como `Boolean` liso (formato
 * anterior, solo activo/inactivo, hora fija de servidor) o como el objeto
 * nuevo `{activo, hora, minuto}`. `horaDefecto` es la hora fija que tenía
 * ese tipo antes de poder configurarse (20h para horas, 8h para el resto)
 * — se usa tanto si el campo está ausente como si es el booleano antiguo,
 * para que una cuenta que no lo haya vuelto a tocar siga disparando a la
 * misma hora de siempre.
 */
export function leerPreferenciaNotif(notifPrefs: any, tipo: string, horaDefecto: number): PreferenciaNotifTipo {
  const v = notifPrefs?.[tipo];
  if (v === undefined || v === null) return { activo: true, hora: horaDefecto, minuto: 0 };
  if (typeof v === 'boolean') return { activo: v, hora: horaDefecto, minuto: 0 };
  return {
    activo: v.activo ?? true,
    hora: Number.isInteger(v.hora) && v.hora >= 0 && v.hora <= 23 ? v.hora : horaDefecto,
    minuto: Number.isInteger(v.minuto) && v.minuto >= 0 && v.minuto <= 59 ? v.minuto : 0,
  };
}

/**
 * Recordatorio propio del usuario — texto libre, repetido cada día a la
 * hora elegida mientras `activo` (mismo patrón de "una vez al día" que
 * `recordatorio-horas.service.ts`, no un aviso único). Vive en el propio
 * usuario, no en ninguna colección aparte: son pocos por cuenta y siempre
 * se leen todos juntos, nunca por separado.
 */
const RecordatorioPersonalizadoSchema = new Schema(
  {
    id: { type: String, required: true },
    texto: { type: String, required: true },
    /** Hora del día (0-23, hora UTC — mismo criterio que `RECORDATORIO_HORAS_HORA`). */
    hora: { type: Number, required: true, min: 0, max: 23 },
    activo: { type: Boolean, default: true },
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
  /**
   * Historial de logins con éxito (fecha ISO cada uno), más reciente al
   * final — petición real, 25/08/2026: `ultimoAcceso` solo guarda el
   * último, sin ningún rastro de accesos anteriores. Acotado a los últimos
   * 50 (ver `$slice` en la ruta de login) para no crecer sin límite.
   */
  historialAccesos: { type: [String], default: [] },
  /**
   * Recuperación de contraseña por email (26/08/2026) — mismo patrón que
   * `refresh-token.model.ts`: nunca se guarda el token en claro, solo su
   * hash SHA-256, así que una fuga de la base de datos no basta para
   * suplantar a nadie. `null` cuando no hay ninguna recuperación pendiente
   * (nunca se pidió, ya se usó, o expiró); un solo campo, no una colección
   * aparte — solo puede haber una recuperación válida a la vez por cuenta,
   * pedir una nueva invalida la anterior sin más.
   */
  resetTokenHash:   { type: String, default: null },
  resetTokenExpira: { type: String, default: null },
  /**
   * Verificación de email (04/09/2026) — pasa a ser el único requisito
   * para poder entrar en una cuenta NUEVA, independiente de `estado`
   * (que sigue siendo el interruptor manual del admin: suspender/
   * reactivar). Mismo patrón de token que `resetTokenHash`: solo se
   * guarda el hash SHA-256, nunca el token en claro. Con `default:
   * false` los documentos ya existentes en producción lo recibirían así
   * al leerse — para que eso no bloquee retroactivamente a nadie que ya
   * tenía acceso, `migrarEmailVerificadoUsuariosExistentes()` los marca
   * `true` una sola vez al arrancar (ver más abajo).
   */
  emailVerificado: { type: Boolean, default: false },
  verificacionTokenHash:   { type: String, default: null },
  verificacionTokenExpira: { type: String, default: null },
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
  notifPrefs:   { type: PreferenciasNotificacionesSchema, default: () => ({}) },
  recordatoriosPersonalizados: { type: [RecordatorioPersonalizadoSchema], default: [] },
});

/** Modelo Mongoose de Usuario. */
export const UsuarioModel: Model<any> = models.Usuario || model('Usuario', UsuarioSchema);

/**
 * Conecta a MongoDB (reutiliza conexión existente). Delega en
 * `conectarMongo()` (`mongo-conexion.ts`) — antes esta función y `conectar()`
 * en `cliente.model.ts` llamaban cada una a `mongoose.connect()` por su
 * cuenta, con la guarda `readyState === 1` (solo descarta "ya conectada",
 * no "conectando ahora mismo"). Al arrancar el servidor, varias peticiones
 * a rutas distintas disparaban su propia conexión a la vez, compitiendo
 * entre sí — causa real (confirmada con `duracionMs` en los logs de
 * Render, 19/08/2026) de logins y refrescos de sesión tardando decenas de
 * segundos justo tras cada despliegue.
 */
export async function conectarUsuarios(): Promise<void> {
  await conectarMongo();
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

/**
 * Verificación de email (04/09/2026): marca `emailVerificado:true` en las
 * cuentas que YA tenían acceso concedido bajo las reglas anteriores
 * (`estado` distinto de `pendiente`) y todavía no tienen el campo — nunca
 * se les mandó ningún email que pudieran verificar, así que exigírselo
 * ahora les cortaría el acceso sin aviso. Solo las cuentas registradas a
 * partir de este cambio (que sí reciben el email) empiezan en `false` de
 * verdad. Idempotente, mismo criterio que `migrarNombresNormalizados`.
 */
export async function migrarEmailVerificadoUsuariosExistentes(): Promise<void> {
  await conectarUsuarios();
  const resultado = await UsuarioModel.updateMany(
    { emailVerificado: { $exists: false }, estado: { $ne: 'pendiente' } },
    { $set: { emailVerificado: true } }
  );
  if (resultado.modifiedCount > 0) {
    logger.info({ cuentasActualizadas: resultado.modifiedCount }, 'Migración emailVerificado (cuentas ya activas antes del cambio)');
  }
}
