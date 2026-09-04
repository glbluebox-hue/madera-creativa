import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { UsuarioModel, conectarUsuarios } from './usuario.model.js';
import { ClienteModel, ProyectoModel } from './cliente.model.js';
import {
  PLANES_COMERCIALES, PRO_O_SUPERIOR, SOLO_PREMIUM,
  planesDesde, planPermiteAcceso, obtenerPlanUsuario, requirePlan,
} from './planes.js';
import { capacidadPermitidaParaPlan } from './ia-rutas.js';
import { PresupuestosService } from './presupuestos-service.js';
import './ia-capacidad-asistente-global.js';
import './ia-capacidad-extraer-factura.js';
import './ia-capacidad-copiloto-presupuesto.js';
import './ia-capacidad-describir-trabajo-mercado.js';

/**
 * Motor de planes (Fase 1+2, 04/09/2026) — el backend es la autoridad: cada
 * comprobación aquí ejercita la MISMA función que usan las rutas reales
 * (`requirePlan`, `capacidadPermitidaParaPlan`), no una reimplementación
 * paralela para el test.
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

async function crearUsuarioConPlan(id: string, plan: string | null): Promise<void> {
  await conectarUsuarios();
  await UsuarioModel.create({
    id,
    nombre: `${id}@example.com`,
    nombreNormalizado: `${id}@example.com`,
    passwordHash: 'x',
    hashAlgo: 'bcrypt',
    estado: 'activo',
    esAdmin: false,
    creadoEn: new Date().toISOString(),
    ...(plan ? { acceso: { tipo: 'paid', plan, activadoEn: null, expiraEn: null, origen: 'admin', codigoUsado: null } } : {}),
  });
}

/** Mock mínimo de req/res/next — suficiente para ejercitar `requirePlan` sin levantar un servidor Express real (mismo criterio del proyecto: probar la lógica de datos, no la capa HTTP). */
function mockReqResNext(usuarioId: string) {
  const req: any = { usuarioId };
  let status = 200;
  let body: any = null;
  const res: any = {
    status(s: number) { status = s; return this; },
    json(b: any) { body = b; return this; },
  };
  let siguio = false;
  const next = () => { siguio = true; };
  return { req, res, next, resultado: () => ({ status, body, siguio }) };
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
  await Promise.all([UsuarioModel.deleteMany({}), ClienteModel.deleteMany({}), ProyectoModel.deleteMany({})]);
});

describe('planesDesde / planPermiteAcceso — tabla de orden, única fuente de verdad', () => {
  it('BASIC solo se cumple a sí mismo', () => {
    expect(planesDesde('BASIC')).toEqual(['BASIC', 'PRO', 'PREMIUM']);
  });
  it('PREMIUM es el único que cumple "mínimo PREMIUM"', () => {
    expect(planesDesde('PREMIUM')).toEqual(['PREMIUM']);
  });
  it('un plan NONE/LIFETIME_FREE nunca cumple ningún requisito comercial', () => {
    expect(planPermiteAcceso('NONE', PLANES_COMERCIALES as any)).toBe(false);
    expect(planPermiteAcceso('LIFETIME_FREE', PLANES_COMERCIALES as any)).toBe(false);
  });
});

describe('obtenerPlanUsuario', () => {
  it('devuelve el plan real de cada cuenta, aislado por usuarioId', async () => {
    await crearUsuarioConPlan('u-basic', 'BASIC');
    await crearUsuarioConPlan('u-premium', 'PREMIUM');
    expect(await obtenerPlanUsuario('u-basic')).toBe('BASIC');
    expect(await obtenerPlanUsuario('u-premium')).toBe('PREMIUM');
  });
  it('una cuenta sin acceso asignado explícitamente cae en NONE (ACCESO_POR_DEFECTO)', async () => {
    await crearUsuarioConPlan('u-sin-plan', null);
    expect(await obtenerPlanUsuario('u-sin-plan')).toBe('NONE');
  });
});

describe('requirePlan — la autoridad real de las rutas protegidas', () => {
  it('BASIC recibe 403 en una ruta PRO+', async () => {
    await crearUsuarioConPlan('u-basic2', 'BASIC');
    const { req, res, next, resultado } = mockReqResNext('u-basic2');
    await requirePlan(PRO_O_SUPERIOR)(req, res, next);
    const r = resultado();
    expect(r.siguio).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('plan_insuficiente');
  });

  it('PRO puede acceder a una ruta PRO+', async () => {
    await crearUsuarioConPlan('u-pro', 'PRO');
    const { req, res, next, resultado } = mockReqResNext('u-pro');
    await requirePlan(PRO_O_SUPERIOR)(req, res, next);
    expect(resultado().siguio).toBe(true);
  });

  it('PRO recibe 403 en una ruta solo PREMIUM', async () => {
    await crearUsuarioConPlan('u-pro2', 'PRO');
    const { req, res, next, resultado } = mockReqResNext('u-pro2');
    await requirePlan(SOLO_PREMIUM)(req, res, next);
    const r = resultado();
    expect(r.siguio).toBe(false);
    expect(r.status).toBe(403);
  });

  it('PREMIUM puede acceder a una ruta solo PREMIUM', async () => {
    await crearUsuarioConPlan('u-premium2', 'PREMIUM');
    const { req, res, next, resultado } = mockReqResNext('u-premium2');
    await requirePlan(SOLO_PREMIUM)(req, res, next);
    expect(resultado().siguio).toBe(true);
  });

  it('la cuenta admin nunca queda bloqueada por un gate de plan, tenga el plan que tenga', async () => {
    await crearUsuarioConPlan('admin', null); // admin real sin acceso explícito (equivalente a NONE)
    const { req, res, next, resultado } = mockReqResNext('admin');
    await requirePlan(SOLO_PREMIUM)(req, res, next);
    expect(resultado().siguio).toBe(true);
  });
});

describe('capacidadPermitidaParaPlan — mismo motor aplicado a las capacidades de IA', () => {
  it('escáner de facturas (PRO): BASIC bloqueado, PRO permitido', async () => {
    await crearUsuarioConPlan('u-ia-basic', 'BASIC');
    await crearUsuarioConPlan('u-ia-pro', 'PRO');
    expect(await capacidadPermitidaParaPlan('u-ia-basic', 'PRO')).toBe(false);
    expect(await capacidadPermitidaParaPlan('u-ia-pro', 'PRO')).toBe(true);
  });
  it('copiloto visual (PREMIUM): PRO bloqueado, PREMIUM permitido', async () => {
    await crearUsuarioConPlan('u-ia-pro2', 'PRO');
    await crearUsuarioConPlan('u-ia-premium', 'PREMIUM');
    expect(await capacidadPermitidaParaPlan('u-ia-pro2', 'PREMIUM')).toBe(false);
    expect(await capacidadPermitidaParaPlan('u-ia-premium', 'PREMIUM')).toBe(true);
  });
  it('una capacidad sin planMinimo (p. ej. el asistente global, hoy sin separar navegación de cifras) está disponible para cualquier plan, incluido BASIC', async () => {
    await crearUsuarioConPlan('u-ia-basic2', 'BASIC');
    expect(await capacidadPermitidaParaPlan('u-ia-basic2', undefined)).toBe(true);
  });
});

describe('Dibujo.proyectoId — conexión con el proyecto (Fase 1)', () => {
  const USUARIO = 'usuario-dibujo-proyecto-test';

  it('guardarDibujo persiste proyectoId cuando se crea desde dentro de un proyecto', async () => {
    const guardado = await svc.guardarDibujo({
      id: 'd1', clienteId: 'p1', proyectoId: 'p1', carpetaId: '', nombre: 'Medición cocina',
      miniatura: '', contenido: {}, version: 1, etiquetas: [],
      creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString(),
    }, USUARIO);
    expect((guardado as any).proyectoId).toBe('p1');
  });

  it('un dibujo creado sin contexto de proyecto (bandeja general) conserva proyectoId vacío', async () => {
    const guardado = await svc.guardarDibujo({
      id: 'd2', clienteId: '', proyectoId: '', carpetaId: '', nombre: 'Boceto suelto',
      miniatura: '', contenido: {}, version: 1, etiquetas: [],
      creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString(),
    }, USUARIO);
    expect((guardado as any).proyectoId).toBe('');
  });

  it('GET /dibujos?proyectoId= (listarDibujos) filtra correctamente y respeta el aislamiento por usuarioId', async () => {
    await svc.guardarDibujo({
      id: 'd3', clienteId: 'p2', proyectoId: 'p2', carpetaId: '', nombre: 'Medición armario',
      miniatura: '', contenido: {}, version: 1, etiquetas: [],
      creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString(),
    }, USUARIO);
    // Mismo proyecto, OTRO usuario — nunca debe aparecer en la lista del primero.
    await svc.guardarDibujo({
      id: 'd4', clienteId: 'p2', proyectoId: 'p2', carpetaId: '', nombre: 'Dibujo de otro usuario',
      miniatura: '', contenido: {}, version: 1, etiquetas: [],
      creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString(),
    }, 'otro-usuario-distinto');

    const lista = await svc.listarDibujos(USUARIO, { proyectoId: 'p2' });
    expect(lista.map((d: any) => d.id)).toEqual(['d3']);
  });
});
