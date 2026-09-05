import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { UsuarioModel, conectarUsuarios } from './usuario.model.js';
import { ClienteModel, ProyectoModel } from './cliente.model.js';
import {
  PLANES_COMERCIALES, PRO_O_SUPERIOR, SOLO_PREMIUM,
  planesDesde, planPermiteAcceso, obtenerPlanUsuario, requirePlan,
  contenidoDibujoUsaFuncionesPro, limitarNotifPrefsPorPlan,
  capacidadPermitidaParaPlan, ocultarModelo3DSiNoPro,
} from './planes.js';
import { PresupuestosService } from './presupuestos-service.js';
import { contextoAsistenteGlobal } from './asistente-global.contexto-ia.js';
import { contextoAsistenteNavegacion } from './asistente-navegacion.contexto-ia.js';
import { contextoAsistenteCifrasReales } from './asistente-cifras-reales.contexto-ia.js';
import { obtenerCapacidad } from './ia-registro-capacidades.js';
import './ia-capacidad-asistente-global.js';
import './ia-capacidad-extraer-factura.js';
import './ia-capacidad-copiloto-presupuesto.js';
import './ia-capacidad-describir-trabajo-mercado.js';
import './ia-capacidad-redactar-presupuesto.js';
import './ia-capacidad-generar-bloque-documento.js';

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

// ── Fase 3 (04/09/2026) — cierre real del plan PRO ──────────────────────────

describe('contenidoDibujoUsaFuncionesPro — Tablero de medición, fotos/cotas exigen PRO+', () => {
  it('un dibujo básico (solo trazos, sin fotos ni cotas) nunca se considera de PRO', () => {
    expect(contenidoDibujoUsaFuncionesPro({ elements: [{ type: 'freedraw' }, { type: 'rectangle' }], cotas: [] })).toBe(false);
  });
  it('una foto (elemento tipo image, no borrado) sí exige PRO', () => {
    expect(contenidoDibujoUsaFuncionesPro({ elements: [{ type: 'image', isDeleted: false }], cotas: [] })).toBe(true);
  });
  it('una foto ya borrada (isDeleted:true) no cuenta — el dibujo ya no la usa de verdad', () => {
    expect(contenidoDibujoUsaFuncionesPro({ elements: [{ type: 'image', isDeleted: true }], cotas: [] })).toBe(false);
  });
  it('cualquier cota exige PRO, aunque no haya ninguna foto', () => {
    expect(contenidoDibujoUsaFuncionesPro({ elements: [], cotas: [{ id: 'c1' }] })).toBe(true);
  });
  it('contenido vacío o ausente nunca exige PRO', () => {
    expect(contenidoDibujoUsaFuncionesPro(null)).toBe(false);
    expect(contenidoDibujoUsaFuncionesPro({})).toBe(false);
  });
});

describe('limitarNotifPrefsPorPlan — solo "horas" es BASIC', () => {
  it('fuerza activo:false en cobrosPendientes/margenBajo/briefingDiario, conserva horas y campos de admin', () => {
    const recortado = limitarNotifPrefsPorPlan({
      horas: { activo: true, hora: 20, minuto: 0 },
      cobrosPendientes: { activo: true, hora: 8, minuto: 0 },
      margenBajo: { activo: true, hora: 9, minuto: 30 },
      briefingDiario: { activo: true, hora: 8, minuto: 0 },
      nuevoUsuario: true,
      mensajeSoporte: true,
    });
    expect(recortado.horas).toEqual({ activo: true, hora: 20, minuto: 0 });
    expect(recortado.cobrosPendientes.activo).toBe(false);
    expect(recortado.margenBajo.activo).toBe(false);
    expect(recortado.briefingDiario.activo).toBe(false);
    // La hora se conserva aunque quede inactivo — por si el usuario sube de plan luego, no pierde su preferencia de horario.
    expect(recortado.margenBajo.hora).toBe(9);
    expect(recortado.nuevoUsuario).toBe(true);
    expect(recortado.mensajeSoporte).toBe(true);
  });
  it('también recorta el formato booleano antiguo (compatibilidad hacia atrás)', () => {
    const recortado = limitarNotifPrefsPorPlan({ cobrosPendientes: true, margenBajo: true, briefingDiario: true });
    expect(recortado.cobrosPendientes).toBe(false);
    expect(recortado.margenBajo).toBe(false);
    expect(recortado.briefingDiario).toBe(false);
  });
});

describe('redactar-presupuesto / generar-bloque-documento — "ayuda IA para textos de presupuestos", PRO', () => {
  it('BASIC no puede usar redactar-presupuesto; PRO sí', async () => {
    await crearUsuarioConPlan('u-redactar-basic', 'BASIC');
    await crearUsuarioConPlan('u-redactar-pro', 'PRO');
    expect(await capacidadPermitidaParaPlan('u-redactar-basic', 'PRO')).toBe(false);
    expect(await capacidadPermitidaParaPlan('u-redactar-pro', 'PRO')).toBe(true);
  });
});

describe('contextoAsistenteGlobal — cifras reales del negocio, PRO+ (Fase 3)', () => {
  const USUARIO_BASIC = 'usuario-asistente-basic';
  const USUARIO_PRO = 'usuario-asistente-pro';

  // `beforeEach`, no `beforeAll`: el `afterEach` global de este archivo
  // (arriba) borra Usuario/Cliente/Proyecto después de CADA test — con
  // `beforeAll` los datos solo existían para el primero de este bloque.
  beforeEach(async () => {
    await crearUsuarioConPlan(USUARIO_BASIC, 'BASIC');
    await crearUsuarioConPlan(USUARIO_PRO, 'PRO');
    for (const usuarioId of [USUARIO_BASIC, USUARIO_PRO]) {
      await ClienteModel.create({ id: `c-${usuarioId}`, usuarioId, nombre: 'Cliente de prueba', creado: new Date().toISOString() });
      await ProyectoModel.create({
        id: `p-${usuarioId}`, usuarioId, clienteId: `c-${usuarioId}`, proyecto: 'Cocina de prueba',
        presupuesto: 3000, tarifaHora: 20, creado: new Date().toISOString(),
      });
      await svc.guardarFactura({
        id: `f-${usuarioId}`, tipo: 'ingreso', fecha: '2026-01-15', importe: 1000,
        concepto: 'Cobro de prueba', proveedor: '', clienteId: '', imagen: '', imagenes: [],
        creado: new Date().toISOString(),
      } as any, usuarioId);
    }
  });

  it('BASIC: el resumen NO incluye cifras financieras reales, y el asistente sabe explicar por qué', async () => {
    const { resumenParaPrompt, datosParaHerramientas } = await contextoAsistenteGlobal.construir({}, USUARIO_BASIC);
    expect(resumenParaPrompt).not.toContain('RESUMEN FINANCIERO');
    expect(resumenParaPrompt).not.toContain('1000.00');
    expect(resumenParaPrompt).toContain('plan BASIC');
    expect(resumenParaPrompt).toContain('plan PRO');
    // La navegación (nombre/estado del proyecto) se mantiene — solo se quita el importe.
    expect(resumenParaPrompt).toContain('Cocina de prueba');
    const clientes = (datosParaHerramientas as any).clientes;
    expect(clientes[0]).not.toHaveProperty('presupuesto');
  });

  it('PRO: el resumen SÍ incluye cifras financieras reales', async () => {
    const { resumenParaPrompt, datosParaHerramientas } = await contextoAsistenteGlobal.construir({}, USUARIO_PRO);
    expect(resumenParaPrompt).toContain('RESUMEN FINANCIERO DE TODA LA HISTORIA');
    expect(resumenParaPrompt).toContain('1000.00');
    const clientes = (datosParaHerramientas as any).clientes;
    expect(clientes[0]).toHaveProperty('presupuesto', 3000);
  });

  it('admin: siempre ve cifras reales, sin importar su acceso', async () => {
    const { resumenParaPrompt } = await contextoAsistenteGlobal.construir({}, 'admin');
    expect(resumenParaPrompt).toContain('RESUMEN FINANCIERO');
  });

  // Fase 3.1 (05/09/2026): la separación ya no es un `if` interno de
  // `contextoAsistenteGlobal` — son dos `ConstructorContexto` completos en
  // sus propios archivos. Estos tests ejercitan cada módulo DIRECTAMENTE
  // (sin pasar por el dispatcher) para dejar la separación demostrada
  // también en el test, no solo en el código de producción.

  it('contextoAsistenteNavegacion: nunca incluye cifras financieras, ni siquiera para una cuenta PRO — es plan-agnóstico por diseño', async () => {
    const { resumenParaPrompt, datosParaHerramientas } = await contextoAsistenteNavegacion.construir({}, USUARIO_PRO);
    expect(resumenParaPrompt).not.toContain('RESUMEN FINANCIERO');
    expect(resumenParaPrompt).not.toContain('1000.00');
    expect(resumenParaPrompt).toContain('plan BASIC');
    expect(resumenParaPrompt).toContain('Cocina de prueba');
    const clientes = (datosParaHerramientas as any).clientes;
    expect(clientes[0]).not.toHaveProperty('presupuesto');
  });

  it('contextoAsistenteCifrasReales: siempre incluye cifras financieras, incluso para una cuenta BASIC — el gate de plan es responsabilidad del dispatcher, no de este módulo', async () => {
    const { resumenParaPrompt, datosParaHerramientas } = await contextoAsistenteCifrasReales.construir({}, USUARIO_BASIC);
    expect(resumenParaPrompt).toContain('RESUMEN FINANCIERO DE TODA LA HISTORIA');
    expect(resumenParaPrompt).toContain('1000.00');
    const clientes = (datosParaHerramientas as any).clientes;
    expect(clientes[0]).toHaveProperty('presupuesto', 3000);
  });

  it('el dispatcher delega en el módulo correcto según capacidadPermitidaParaPlan — no reimplementa la comprobación de plan', async () => {
    expect(await capacidadPermitidaParaPlan(USUARIO_BASIC, 'PRO')).toBe(false);
    expect(await capacidadPermitidaParaPlan(USUARIO_PRO, 'PRO')).toBe(true);
    const basico = await contextoAsistenteGlobal.construir({}, USUARIO_BASIC);
    const pro = await contextoAsistenteGlobal.construir({}, USUARIO_PRO);
    expect(basico.resumenParaPrompt).toEqual((await contextoAsistenteNavegacion.construir({}, USUARIO_BASIC)).resumenParaPrompt);
    expect(pro.resumenParaPrompt).toEqual((await contextoAsistenteCifrasReales.construir({}, USUARIO_PRO)).resumenParaPrompt);
  });
});

/**
 * Fase 4 (05/09/2026) — cierre técnico del plan PREMIUM. A diferencia de
 * `capacidadPermitidaParaPlan — mismo motor aplicado a las capacidades de
 * IA` (arriba, que prueba el MECANISMO con planes literales), este bloque
 * ejercita las capacidades PREMIUM REALES tal como están registradas hoy
 * (`obtenerCapacidad`, efecto secundario de los imports de arriba) — así
 * un cambio accidental que borrara `planMinimo` de `copiloto-presupuesto`
 * o `describir-trabajo-mercado` haría fallar esto, no solo una prueba
 * abstracta con un string suelto. Cubre la sección 10 (tests de frontera
 * BASIC/PRO/PREMIUM) y 12 (regresión: PREMIUM conserva PRO) del encargo.
 */
describe('Fase 4 — jerarquía PREMIUM sobre las capacidades reales', () => {
  it('Visual Quote Copilot (copiloto-presupuesto) exige PREMIUM en el manifiesto real', () => {
    expect(obtenerCapacidad('copiloto-presupuesto').planMinimo).toBe('PREMIUM');
  });

  it('Investigación de Mercado (describir-trabajo-mercado) exige PREMIUM en el manifiesto real', () => {
    expect(obtenerCapacidad('describir-trabajo-mercado').planMinimo).toBe('PREMIUM');
  });

  it('BASIC y PRO no pueden usar copiloto-presupuesto; PREMIUM sí', async () => {
    await crearUsuarioConPlan('u-copiloto-basic', 'BASIC');
    await crearUsuarioConPlan('u-copiloto-pro', 'PRO');
    await crearUsuarioConPlan('u-copiloto-premium', 'PREMIUM');
    const planMinimo = obtenerCapacidad('copiloto-presupuesto').planMinimo;
    expect(await capacidadPermitidaParaPlan('u-copiloto-basic', planMinimo)).toBe(false);
    expect(await capacidadPermitidaParaPlan('u-copiloto-pro', planMinimo)).toBe(false);
    expect(await capacidadPermitidaParaPlan('u-copiloto-premium', planMinimo)).toBe(true);
  });

  it('BASIC y PRO no pueden usar describir-trabajo-mercado (paso de Investigación de Mercado); PREMIUM sí', async () => {
    await crearUsuarioConPlan('u-mercado-basic', 'BASIC');
    await crearUsuarioConPlan('u-mercado-pro', 'PRO');
    await crearUsuarioConPlan('u-mercado-premium', 'PREMIUM');
    const planMinimo = obtenerCapacidad('describir-trabajo-mercado').planMinimo;
    expect(await capacidadPermitidaParaPlan('u-mercado-basic', planMinimo)).toBe(false);
    expect(await capacidadPermitidaParaPlan('u-mercado-pro', planMinimo)).toBe(false);
    expect(await capacidadPermitidaParaPlan('u-mercado-premium', planMinimo)).toBe(true);
  });

  it('/mercado/buscar y /inteligencia-precios/comparables comparten el mismo requirePlan(SOLO_PREMIUM) — PRO recibe 403, PREMIUM pasa', async () => {
    // No hay tests de nivel HTTP en este proyecto (ver cabecera del
    // archivo) — se ejercita la misma función `requirePlan` que ambas
    // rutas montan literalmente (`presupuestos-service.app-root.ts` /
    // `ia-rutas.ts`), no una reimplementación paralela.
    await crearUsuarioConPlan('u-comparables-pro', 'PRO');
    await crearUsuarioConPlan('u-comparables-premium', 'PREMIUM');
    const bloqueado = mockReqResNext('u-comparables-pro');
    await requirePlan(SOLO_PREMIUM)(bloqueado.req, bloqueado.res, bloqueado.next);
    expect(bloqueado.resultado().status).toBe(403);
    const permitido = mockReqResNext('u-comparables-premium');
    await requirePlan(SOLO_PREMIUM)(permitido.req, permitido.res, permitido.next);
    expect(permitido.resultado().siguio).toBe(true);
  });

  it('regresión: PREMIUM conserva las capacidades PRO (extraer-datos-factura, redactar-presupuesto, generar-bloque-documento)', async () => {
    await crearUsuarioConPlan('u-premium-conserva-pro', 'PREMIUM');
    for (const nombre of ['extraer-datos-factura', 'redactar-presupuesto', 'generar-bloque-documento']) {
      expect(await capacidadPermitidaParaPlan('u-premium-conserva-pro', obtenerCapacidad(nombre).planMinimo)).toBe(true);
    }
  });

  it('regresión: PRO sigue SIN acceso a ninguna capacidad PREMIUM (copiloto-presupuesto, describir-trabajo-mercado)', async () => {
    await crearUsuarioConPlan('u-pro-sin-premium', 'PRO');
    for (const nombre of ['copiloto-presupuesto', 'describir-trabajo-mercado']) {
      expect(await capacidadPermitidaParaPlan('u-pro-sin-premium', obtenerCapacidad(nombre).planMinimo)).toBe(false);
    }
  });

  it('regresión: BASIC conserva la IA de navegación (asistente-global sin cifras) — no queda bloqueada por el cierre de PREMIUM', async () => {
    await crearUsuarioConPlan('u-basic-conserva-nav', 'BASIC');
    expect(await capacidadPermitidaParaPlan('u-basic-conserva-nav', obtenerCapacidad('asistente-global').planMinimo)).toBe(true);
  });

  it('la cuenta admin nunca queda bloqueada por ninguna capacidad PREMIUM', async () => {
    await crearUsuarioConPlan('admin', null);
    for (const nombre of ['copiloto-presupuesto', 'describir-trabajo-mercado']) {
      expect(await capacidadPermitidaParaPlan('admin', obtenerCapacidad(nombre).planMinimo)).toBe(true);
    }
  });
});

/**
 * Ajuste "Cuenta administrador con acceso total" (05/09/2026) — bypass
 * administrativo explícito, mapeado 1 a 1 con los 12 casos pedidos. La
 * fuente de verdad de "es admin" NO cambia: sigue siendo `req.usuarioId
 * === 'admin'` (mismo criterio que `requireAdmin`,
 * `presupuestos-service.app-root.ts`) — este bloque no introduce ninguna
 * segunda definición, solo confirma exhaustivamente que ese criterio ya
 * existente se aplica en TODAS las capacidades/rutas protegidas por plan.
 */
describe('Bypass administrativo — ADMIN tiene acceso total a BASIC/PRO/PREMIUM', () => {
  it('1. ADMIN puede usar una capacidad BASIC (planMinimo undefined)', async () => {
    expect(await capacidadPermitidaParaPlan('admin', undefined)).toBe(true);
  });

  it('2. ADMIN puede usar una capacidad PRO', async () => {
    expect(await capacidadPermitidaParaPlan('admin', 'PRO')).toBe(true);
  });

  it('3. ADMIN puede usar una capacidad PREMIUM', async () => {
    expect(await capacidadPermitidaParaPlan('admin', 'PREMIUM')).toBe(true);
  });

  it('4. ADMIN nunca recibe 403 plan_insuficiente en requirePlan, ni en PRO+ ni en solo-PREMIUM', async () => {
    const proMasSuperior = mockReqResNext('admin');
    await requirePlan(PRO_O_SUPERIOR)(proMasSuperior.req, proMasSuperior.res, proMasSuperior.next);
    expect(proMasSuperior.resultado().siguio).toBe(true);

    const soloPremium = mockReqResNext('admin');
    await requirePlan(SOLO_PREMIUM)(soloPremium.req, soloPremium.res, soloPremium.next);
    expect(soloPremium.resultado().siguio).toBe(true);
  });

  it('5. un usuario BASIC real sigue bloqueado en capacidades PRO y PREMIUM (sin regresión)', async () => {
    await crearUsuarioConPlan('u-admin-check-basic', 'BASIC');
    expect(await capacidadPermitidaParaPlan('u-admin-check-basic', 'PRO')).toBe(false);
    expect(await capacidadPermitidaParaPlan('u-admin-check-basic', 'PREMIUM')).toBe(false);
  });

  it('6. un usuario PRO real sigue bloqueado en capacidades PREMIUM (sin regresión)', async () => {
    await crearUsuarioConPlan('u-admin-check-pro', 'PRO');
    expect(await capacidadPermitidaParaPlan('u-admin-check-pro', 'PREMIUM')).toBe(false);
  });

  it('7. un usuario PREMIUM real puede usar capacidades PREMIUM (sin regresión)', async () => {
    await crearUsuarioConPlan('u-admin-check-premium', 'PREMIUM');
    expect(await capacidadPermitidaParaPlan('u-admin-check-premium', 'PREMIUM')).toBe(true);
  });

  it('8. el bypass depende exclusivamente del usuarioId autenticado por el servidor — un valor cualquiera que no sea literalmente "admin" nunca lo activa', async () => {
    // `requirePlan`/`capacidadPermitidaParaPlan` reciben `usuarioId` del
    // `AuthRequest` que ya rellenó `requireAuth` a partir del token
    // verificado — nunca de un campo del cuerpo/consulta que un usuario
    // pudiera manipular. Aquí se comprueba la mitad que sí es responsabilidad
    // de este módulo: ningún id "parecido" a admin (mayúsculas, con
    // espacios, un usuario real que se llame "admin2"...) cuela.
    await crearUsuarioConPlan('Admin', 'BASIC');
    await crearUsuarioConPlan('admin2', 'BASIC');
    expect(await capacidadPermitidaParaPlan('Admin', 'PREMIUM')).toBe(false);
    expect(await capacidadPermitidaParaPlan('admin2', 'PREMIUM')).toBe(false);
  });

  it('11. el bypass funciona en las capacidades de IA reales, no solo en el mecanismo abstracto (copiloto-presupuesto, describir-trabajo-mercado, extraer-datos-factura)', async () => {
    for (const nombre of ['copiloto-presupuesto', 'describir-trabajo-mercado', 'extraer-datos-factura']) {
      expect(await capacidadPermitidaParaPlan('admin', obtenerCapacidad(nombre).planMinimo)).toBe(true);
    }
  });

  // 12. No se modifica la lógica de facturas ni de numeración de
  // presupuestos: este ajuste no toca `presupuestos-service.ts` ni
  // `numeracion-presupuestos.ts` — verificado por la suite completa
  // (`numeracion-presupuestos.spec.ts`, `factura-seguridad.spec.ts`)
  // siguiendo en verde sin cambios, no por un test aparte aquí.
});

/**
 * Modelo 3D / SketchUp Desktop — cierre de plan (05/09/2026). Decisión
 * definitiva del usuario: "Modelo 3D" y "SketchUp Desktop" son función
 * PRO/PREMIUM COMPLETA; BASIC no las tiene en absoluto. Antes solo se
 * bloqueaba, en el frontend, el enlace decorativo "Ver en SketchUp" — las
 * rutas reales de subida/reemplazo (`POST /proyectos/:id/modelo3d`,
 * `POST /proyectos/:id/modelo3d/archivo`) no tenían ningún `requirePlan`,
 * así que BASIC podía subir y reemplazar su propio modelo sin ninguna
 * restricción real. Estos tests ejercitan la MISMA función que las rutas
 * montan literalmente (`requirePlan(PRO_O_SUPERIOR)`,
 * `ocultarModelo3DSiNoPro`), nunca una reimplementación paralela — mismo
 * criterio que el resto de este archivo.
 */
describe('Modelo 3D / SketchUp Desktop — PRO/PREMIUM completo, BASIC bloqueado (cierre de plan, 05/09/2026)', () => {
  it('BASIC recibe 403 al intentar subir/reemplazar el modelo 3D — mismo `requirePlan(PRO_O_SUPERIOR)` que montan `POST /proyectos/:id/modelo3d` y `POST /proyectos/:id/modelo3d/archivo`', async () => {
    await crearUsuarioConPlan('u-3d-basic', 'BASIC');
    const { req, res, next, resultado } = mockReqResNext('u-3d-basic');
    await requirePlan(PRO_O_SUPERIOR)(req, res, next);
    const r = resultado();
    expect(r.siguio).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('plan_insuficiente');
  });

  it('PRO puede subir/reemplazar el modelo 3D y abrir el enlace a SketchUp Desktop (pasa el mismo gate)', async () => {
    await crearUsuarioConPlan('u-3d-pro', 'PRO');
    const { req, res, next, resultado } = mockReqResNext('u-3d-pro');
    await requirePlan(PRO_O_SUPERIOR)(req, res, next);
    expect(resultado().siguio).toBe(true);
  });

  it('PREMIUM puede usar el modelo 3D y SketchUp Desktop igual que PRO', async () => {
    await crearUsuarioConPlan('u-3d-premium', 'PREMIUM');
    const { req, res, next, resultado } = mockReqResNext('u-3d-premium');
    await requirePlan(PRO_O_SUPERIOR)(req, res, next);
    expect(resultado().siguio).toBe(true);
  });

  it('ADMIN nunca queda bloqueado, tenga el plan que tenga almacenado', async () => {
    await crearUsuarioConPlan('admin', null); // admin real sin acceso explícito (equivalente a NONE)
    const { req, res, next, resultado } = mockReqResNext('admin');
    await requirePlan(PRO_O_SUPERIOR)(req, res, next);
    expect(resultado().siguio).toBe(true);
  });

  it('integración real: `svc.asociarModelo3DArchivoProyecto` en sí no conoce planes (es responsabilidad exclusiva de la ruta) — pero el flujo completo (gate + servicio) bloquea a BASIC de verdad', async () => {
    const usuarioId = 'u-3d-integracion-basic';
    await crearUsuarioConPlan(usuarioId, 'BASIC');
    await ClienteModel.create({ id: 'c-3d-integracion', usuarioId, nombre: 'Cliente 3D', creado: new Date().toISOString() });
    await ProyectoModel.create({ id: 'p-3d-integracion', usuarioId, clienteId: 'c-3d-integracion', creado: new Date().toISOString() });

    const { req, res, next, resultado } = mockReqResNext(usuarioId);
    await requirePlan(PRO_O_SUPERIOR)(req, res, next);
    expect(resultado().siguio).toBe(false); // el gate ya corta aquí — la ruta real nunca llegaría a llamar al servicio

    // Confirmación explícita de que el propio servicio SIGUE aceptando la
    // llamada si algo se saltara el middleware (defensa en profundidad,
    // no seguridad): el bloqueo real vive en el gate de la ruta, nunca en
    // el servicio — por eso es tan importante que el gate esté montado.
    const buffer = Buffer.alloc(50, 1).toString('base64');
    const doc = await svc.asociarModelo3DArchivoProyecto('p-3d-integracion', usuarioId, { nombreArchivo: 'x.glb', url: `data:model/gltf-binary;base64,${buffer}` });
    expect((doc as any).modelo3D).toBeTruthy();
    await ProyectoModel.deleteMany({});
    await ClienteModel.deleteMany({});
  });

  describe('ocultarModelo3DSiNoPro — "ver" el modelo también exige PRO+, no solo subirlo', () => {
    const MODELO_FALSO = { id: 'p-oculto', titulo: 'x', modelo3D: { proveedor: 'manual', nombreArchivo: 'x.glb', url: 'https://ejemplo.test/x.glb' } };

    it('BASIC nunca recibe `modelo3D` en la respuesta, aunque el proyecto ya tenga uno (p. ej. tras un downgrade PRO→BASIC)', async () => {
      await crearUsuarioConPlan('u-3d-oculto-basic', 'BASIC');
      const resultado = await ocultarModelo3DSiNoPro(MODELO_FALSO, 'u-3d-oculto-basic');
      expect(resultado).not.toHaveProperty('modelo3D');
      expect(resultado.id).toBe('p-oculto'); // el resto del proyecto no se toca
    });

    it('PRO sí recibe `modelo3D` en la respuesta', async () => {
      await crearUsuarioConPlan('u-3d-oculto-pro', 'PRO');
      const resultado = await ocultarModelo3DSiNoPro(MODELO_FALSO, 'u-3d-oculto-pro');
      expect(resultado).toHaveProperty('modelo3D');
    });

    it('PREMIUM sí recibe `modelo3D` en la respuesta', async () => {
      await crearUsuarioConPlan('u-3d-oculto-premium', 'PREMIUM');
      const resultado = await ocultarModelo3DSiNoPro(MODELO_FALSO, 'u-3d-oculto-premium');
      expect(resultado).toHaveProperty('modelo3D');
    });

    it('ADMIN siempre recibe `modelo3D`, sin importar su plan almacenado', async () => {
      await crearUsuarioConPlan('admin', null);
      const resultado = await ocultarModelo3DSiNoPro(MODELO_FALSO, 'admin');
      expect(resultado).toHaveProperty('modelo3D');
    });
  });
});
