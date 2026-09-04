import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { randomBytes, createHash } from 'crypto';
import { UsuarioModel, conectarUsuarios, migrarEmailVerificadoUsuariosExistentes } from './usuario.model.js';

/**
 * Verificación de email (04/09/2026): pruebas contra la base de datos real
 * (mongodb-memory-server), mismo patrón que `horas-ayudante.spec.ts` — el
 * codebase no tiene ninguna prueba a nivel HTTP (ni aquí ni en ningún otro
 * `/auth/*`), así que se prueba la misma lógica de datos que ejecutan las
 * rutas `/auth/registrar`, `/auth/verificar-email` y `/auth/login`, no una
 * petición HTTP real. NO sustituye una prueba en vivo con un email real
 * recibido de verdad — eso no se puede automatizar sin acceso a una
 * bandeja de entrada real (ver informe final).
 */

let mongod: MongoMemoryServer;

function usuarioBase(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    nombre: `${id}@example.com`,
    nombreNormalizado: `${id}@example.com`,
    passwordHash: 'x',
    hashAlgo: 'bcrypt',
    estado: 'activo',
    esAdmin: false,
    creadoEn: new Date().toISOString(),
    ...extra,
  };
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
  await conectarUsuarios();
  await UsuarioModel.deleteMany({});
});

describe('Verificación de email — token (misma lógica que /auth/verificar-email)', () => {
  it('un token válido y no caducado marca emailVerificado y borra el propio token (de un solo uso)', async () => {
    const tokenPlano = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(tokenPlano).digest('hex');
    await UsuarioModel.create(usuarioBase('u1', {
      emailVerificado: false,
      verificacionTokenHash: tokenHash,
      verificacionTokenExpira: new Date(Date.now() + 60_000).toISOString(),
    }));

    // Misma consulta que la ruta real.
    const ahora = new Date().toISOString();
    const encontradoTokenHash = createHash('sha256').update(tokenPlano).digest('hex');
    const u = await UsuarioModel.findOneAndUpdate(
      { verificacionTokenHash: encontradoTokenHash, verificacionTokenExpira: { $gt: ahora } },
      { emailVerificado: true, verificacionTokenHash: null, verificacionTokenExpira: null },
      { new: true }
    ).lean().exec() as any;

    expect(u).not.toBeNull();
    expect(u.emailVerificado).toBe(true);
    expect(u.verificacionTokenHash).toBeNull();

    // Reutilizar el mismo token una segunda vez ya no encuentra nada (de un solo uso).
    const segundaVez = await UsuarioModel.findOne({ verificacionTokenHash: encontradoTokenHash }).lean().exec();
    expect(segundaVez).toBeNull();
  });

  it('un token caducado no verifica nada', async () => {
    const tokenPlano = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(tokenPlano).digest('hex');
    await UsuarioModel.create(usuarioBase('u2', {
      emailVerificado: false,
      verificacionTokenHash: tokenHash,
      verificacionTokenExpira: new Date(Date.now() - 1_000).toISOString(), // ya caducado
    }));

    const ahora = new Date().toISOString();
    const u = await UsuarioModel.findOneAndUpdate(
      { verificacionTokenHash: tokenHash, verificacionTokenExpira: { $gt: ahora } },
      { emailVerificado: true },
      { new: true }
    ).lean().exec();
    expect(u).toBeNull();

    const sigueSinVerificar = await UsuarioModel.findOne({ id: 'u2' }).lean().exec() as any;
    expect(sigueSinVerificar.emailVerificado).toBe(false);
  });

  it('un token que no coincide con ningún usuario no verifica nada', async () => {
    await UsuarioModel.create(usuarioBase('u3', {
      emailVerificado: false,
      verificacionTokenHash: createHash('sha256').update('token-correcto').digest('hex'),
      verificacionTokenExpira: new Date(Date.now() + 60_000).toISOString(),
    }));
    const tokenHashIncorrecto = createHash('sha256').update('token-adivinado').digest('hex');
    const ahora = new Date().toISOString();
    const u = await UsuarioModel.findOneAndUpdate(
      { verificacionTokenHash: tokenHashIncorrecto, verificacionTokenExpira: { $gt: ahora } },
      { emailVerificado: true },
      { new: true }
    ).lean().exec();
    expect(u).toBeNull();
  });
});

describe('migrarEmailVerificadoUsuariosExistentes — backfill de cuentas anteriores al cambio', () => {
  it('marca emailVerificado:true en una cuenta activa que no tenía el campo, para no bloquearla retroactivamente', async () => {
    // Inserción directa sin pasar por el esquema con default (bypass de
    // Mongoose vía `.collection`) — la clave `emailVerificado` queda
    // REALMENTE ausente del documento, tal como una cuenta real creada
    // antes de este cambio (mismo patrón que `trabajo-extra.spec.ts`).
    await UsuarioModel.collection.insertOne(usuarioBase('vieja-activa', { estado: 'activo' }) as any);

    await migrarEmailVerificadoUsuariosExistentes();

    const u = await UsuarioModel.findOne({ id: 'vieja-activa' }).lean().exec() as any;
    expect(u.emailVerificado).toBe(true);
  });

  it('también respalda una cuenta suspendida (ya tuvo acceso concedido, solo se le quitó después)', async () => {
    await UsuarioModel.collection.insertOne(usuarioBase('vieja-suspendida', { estado: 'suspendido' }) as any);
    await migrarEmailVerificadoUsuariosExistentes();
    const u = await UsuarioModel.findOne({ id: 'vieja-suspendida' }).lean().exec() as any;
    expect(u.emailVerificado).toBe(true);
  });

  it('NO toca una cuenta pendiente sin el campo — nunca tuvo acceso concedido, debe seguir exigiendo verificación real', async () => {
    await UsuarioModel.collection.insertOne(usuarioBase('vieja-pendiente', { estado: 'pendiente' }) as any);
    await migrarEmailVerificadoUsuariosExistentes();
    const u = await UsuarioModel.findOne({ id: 'vieja-pendiente' }).lean().exec() as any;
    expect(u.emailVerificado).toBeUndefined();
  });

  it('NO sobrescribe una cuenta que ya tiene emailVerificado:false explícito (una cuenta nueva real, aún sin verificar)', async () => {
    await UsuarioModel.create(usuarioBase('nueva-sin-verificar', { estado: 'activo', emailVerificado: false }));
    await migrarEmailVerificadoUsuariosExistentes();
    const u = await UsuarioModel.findOne({ id: 'nueva-sin-verificar' }).lean().exec() as any;
    expect(u.emailVerificado).toBe(false);
  });

  it('es idempotente — llamarla dos veces no cambia nada la segunda vez', async () => {
    await UsuarioModel.collection.insertOne(usuarioBase('vieja-activa-2', { estado: 'activo' }) as any);
    await migrarEmailVerificadoUsuariosExistentes();
    await migrarEmailVerificadoUsuariosExistentes();
    const u = await UsuarioModel.findOne({ id: 'vieja-activa-2' }).lean().exec() as any;
    expect(u.emailVerificado).toBe(true);
  });
});
