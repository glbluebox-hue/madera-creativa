import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { UsuarioModel, conectarUsuarios } from './usuario.model.js';
import { EventoCalendarioModel } from './evento-calendario.model.js';

/**
 * `ejecutarAvisoCalendario` (petición real del usuario, 01/11/2026: "me
 * gustaría que me llegara un día antes y el mismo día por la mañana de
 * esa tarea", refiriéndose a los eventos/recordatorios que apunta a mano
 * en la página Calendario — ver `evento-calendario.model.ts`). El envío
 * push real se simula (`vi.mock`, mismo criterio que
 * `investigacion-mercado.spec.ts`): estos tests comprueban el estado que
 * queda en la base de datos (las guardas `avisoVisperaEnviado`/
 * `avisoMismoDiaEnviado`), no una entrega real.
 */
const enviarNotificacionMock = vi.fn().mockResolvedValue(undefined);
vi.mock('./push.service.js', () => ({
  enviarNotificacion: (...args: unknown[]) => enviarNotificacionMock(...args),
}));

const { ejecutarAvisoCalendario } = await import('./notificaciones-programadas.service.js');

let mongod: MongoMemoryServer;
const USUARIO = 'u-calendario-avisos';

/**
 * 8:00 UTC del día real de HOY — misma hora por defecto que el resto de
 * tipos de notificación (`leerPreferenciaNotif`, `horaDefecto: 8`).
 * Deliberadamente NO una fecha fija: `hoyComoFecha()` (usada dentro de
 * `ejecutarAvisoCalendario`) ignora el `ahora` que se le pasa y usa
 * SIEMPRE el reloj real del sistema (mismo comportamiento ya existente en
 * `recordatorio-horas.service.ts`, no algo nuevo de este archivo) — una
 * fecha fija aquí dejaba de coincidir con "hoy" en cuanto cambiaba el día
 * real (fallo real detectado: tests escritos el 01/11/2026 rotos el
 * 02/11/2026). Solo la HORA/MINUTO de `ahora` importa para `esSuMomento`;
 * el DÍA siempre lo decide el reloj real, así que se usa aquí también.
 */
function hoyALas8Utc(): Date {
  const d = new Date();
  d.setUTCHours(8, 0, 0, 0);
  return d;
}
const A_LAS_8_UTC = hoyALas8Utc();

function hoyISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}
function mananaISO(fecha: Date): string {
  const d = new Date(fecha);
  d.setUTCDate(d.getUTCDate() + 1);
  return hoyISO(d);
}

async function crearUsuarioConPush(id: string): Promise<void> {
  await conectarUsuarios();
  await UsuarioModel.create({
    id,
    nombre: `${id}@example.com`,
    nombreNormalizado: `${id}@example.com`,
    passwordHash: 'x',
    hashAlgo: 'bcrypt',
    estado: 'activo',
    creadoEn: new Date().toISOString(),
    pushSubs: [{ endpoint: `https://push.example/${id}`, keys: { p256dh: 'p', auth: 'a' } }],
  });
}

async function crearEvento(datos: { fecha: string; titulo?: string; avisoVisperaEnviado?: boolean; avisoMismoDiaEnviado?: boolean }) {
  const id = randomUUID();
  const ahora = new Date().toISOString();
  await EventoCalendarioModel.create({
    id, usuarioId: USUARIO, tipo: 'evento', titulo: datos.titulo ?? 'Montaje', descripcion: '',
    fecha: datos.fecha, hora: '', todoElDia: true, duracionMin: 0, clienteId: '', proyectoId: '',
    creado: ahora, actualizado: ahora,
    avisoVisperaEnviado: datos.avisoVisperaEnviado ?? false,
    avisoMismoDiaEnviado: datos.avisoMismoDiaEnviado ?? false,
  });
  return id;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongod.getUri();
  await mongoose.connect(process.env.MONGO_URL);
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  enviarNotificacionMock.mockClear();
  await Promise.all([UsuarioModel.deleteMany({}), EventoCalendarioModel.deleteMany({})]);
});

it('un evento de mañana recibe el aviso de víspera y queda marcado', async () => {
  await crearUsuarioConPush(USUARIO);
  const id = await crearEvento({ fecha: mananaISO(A_LAS_8_UTC), titulo: 'Montaje Santa Cruz' });

  await ejecutarAvisoCalendario(A_LAS_8_UTC);

  expect(enviarNotificacionMock).toHaveBeenCalledTimes(1);
  const [, titulo, cuerpo] = enviarNotificacionMock.mock.calls[0];
  expect(titulo).toContain('Recordatorio');
  expect(cuerpo).toContain('Mañana');
  expect(cuerpo).toContain('Montaje Santa Cruz');

  const doc = await EventoCalendarioModel.findOne({ id }).lean().exec() as any;
  expect(doc.avisoVisperaEnviado).toBe(true);
  expect(doc.avisoMismoDiaEnviado).toBe(false);
});

it('un evento de hoy recibe el aviso de "mismo día" y queda marcado', async () => {
  await crearUsuarioConPush(USUARIO);
  const id = await crearEvento({ fecha: hoyISO(A_LAS_8_UTC), titulo: 'Medición Oscar' });

  await ejecutarAvisoCalendario(A_LAS_8_UTC);

  expect(enviarNotificacionMock).toHaveBeenCalledTimes(1);
  const [, , cuerpo] = enviarNotificacionMock.mock.calls[0];
  expect(cuerpo).toContain('Hoy');
  expect(cuerpo).toContain('Medición Oscar');

  const doc = await EventoCalendarioModel.findOne({ id }).lean().exec() as any;
  expect(doc.avisoMismoDiaEnviado).toBe(true);
});

it('un evento ya avisado no vuelve a enviar nada en una segunda comprobación', async () => {
  await crearUsuarioConPush(USUARIO);
  await crearEvento({ fecha: hoyISO(A_LAS_8_UTC), avisoMismoDiaEnviado: true });
  await crearEvento({ fecha: mananaISO(A_LAS_8_UTC), avisoVisperaEnviado: true });

  await ejecutarAvisoCalendario(A_LAS_8_UTC);

  expect(enviarNotificacionMock).not.toHaveBeenCalled();
});

it('fuera de la hora configurada no envía nada', async () => {
  await crearUsuarioConPush(USUARIO);
  await crearEvento({ fecha: hoyISO(A_LAS_8_UTC) });

  await ejecutarAvisoCalendario(new Date('2026-11-01T14:00:00.000Z'));

  expect(enviarNotificacionMock).not.toHaveBeenCalled();
});

it('un evento de otro día (ni hoy ni mañana) no genera ningún aviso', async () => {
  await crearUsuarioConPush(USUARIO);
  const pasado = new Date(A_LAS_8_UTC);
  pasado.setUTCDate(pasado.getUTCDate() - 3);
  await crearEvento({ fecha: hoyISO(pasado) });

  await ejecutarAvisoCalendario(A_LAS_8_UTC);

  expect(enviarNotificacionMock).not.toHaveBeenCalled();
});

it('sin ninguna suscripción push activa, no intenta enviar nada', async () => {
  await conectarUsuarios();
  await UsuarioModel.create({
    id: USUARIO, nombre: `${USUARIO}@example.com`, nombreNormalizado: `${USUARIO}@example.com`,
    passwordHash: 'x', hashAlgo: 'bcrypt', estado: 'activo', creadoEn: new Date().toISOString(), pushSubs: [],
  });
  await crearEvento({ fecha: hoyISO(A_LAS_8_UTC) });

  await ejecutarAvisoCalendario(A_LAS_8_UTC);

  expect(enviarNotificacionMock).not.toHaveBeenCalled();
});
