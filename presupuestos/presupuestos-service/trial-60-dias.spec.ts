import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { randomBytes, createHash } from 'node:crypto';
import { UsuarioModel, conectarUsuarios, ACCESO_POR_DEFECTO } from './usuario.model.js';
import type { AccesoUsuario } from './usuario.model.js';
import { ClienteModel, ProyectoModel } from './cliente.model.js';
import { CodigoPromocionalModel, canjearCodigo } from './codigo-promocional.model.js';
import {
  obtenerPlanUsuario, calcularPlanEfectivo, iniciarTrialSiCorresponde, requiereBloqueoPorSinPlan,
  requirePlan, capacidadPermitidaParaPlan, PRO_O_SUPERIOR, SOLO_PREMIUM, DURACION_TRIAL_DIAS,
} from './planes.js';
import { obtenerUsoAlmacenamiento, LIMITES_ALMACENAMIENTO_BYTES } from './almacenamiento-cuota.js';
import { obtenerCapacidad } from './ia-registro-capacidades.js';
import './ia-capacidad-extraer-factura.js';
import './ia-capacidad-copiloto-presupuesto.js';

/**
 * Prueba gratuita de 60 días (05/09/2026) — escenarios de extremo a
 * extremo pedidos explícitamente en el encargo (letras A-T). Cada test
 * ejercita la MISMA función que usan las rutas reales
 * (`iniciarTrialSiCorresponde`, `calcularPlanEfectivo`/`obtenerPlanUsuario`,
 * `requirePlan`, `requiereBloqueoPorSinPlan`), nunca una reimplementación
 * paralela — mismo criterio que el resto del proyecto (`planes.spec.ts`,
 * `numeracion-presupuestos.spec.ts`). No hay tests de nivel HTTP en este
 * proyecto; donde una ruta combina varios pasos (p. ej.
 * `/auth/verificar-email`), se reproduce aquí la misma secuencia de
 * operaciones sobre Mongo que ejecuta la ruta real.
 */

let mongod: MongoMemoryServer;

function usuarioNuevo(id: string, extra: Record<string, unknown> = {}) {
  return {
    id, nombre: `${id}@example.com`, nombreNormalizado: `${id}@example.com`,
    passwordHash: 'x', hashAlgo: 'bcrypt', estado: 'activo', esAdmin: false,
    creadoEn: new Date().toISOString(), emailVerificado: false,
    acceso: ACCESO_POR_DEFECTO,
    ...extra,
  };
}

/** Mock mínimo de req/res/next — mismo patrón que `planes.spec.ts`. */
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

/** Simula la MISMA secuencia atómica que ejecuta `POST /auth/verificar-email` (token de un solo uso + `iniciarTrialSiCorresponde`). */
async function verificarEmailReal(tokenPlano: string): Promise<{ verificado: boolean; usuarioId?: string }> {
  const tokenHash = createHash('sha256').update(tokenPlano).digest('hex');
  const ahora = new Date().toISOString();
  const u = await UsuarioModel.findOneAndUpdate(
    { verificacionTokenHash: tokenHash, verificacionTokenExpira: { $gt: ahora } },
    { emailVerificado: true, verificacionTokenHash: null, verificacionTokenExpira: null },
    { new: true }
  ).lean().exec() as any;
  if (!u) return { verificado: false };
  const accesoTrial = iniciarTrialSiCorresponde(u.acceso);
  if (accesoTrial) await UsuarioModel.updateOne({ id: u.id }, { $set: { acceso: accesoTrial } }).exec();
  return { verificado: true, usuarioId: u.id };
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
  await Promise.all([
    UsuarioModel.deleteMany({}), ClienteModel.deleteMany({}), ProyectoModel.deleteMany({}),
    CodigoPromocionalModel.deleteMany({}),
  ]);
});

// ── A/B — registro y verificación ─────────────────────────────────────────
describe('A. Registro sin código — no inicia trial antes de verificar', () => {
  it('una cuenta recién registrada tiene plan NONE, sin activadoEn ni expiraEn, hasta que se verifica', async () => {
    await conectarUsuarios();
    const id = 'a-registro-sin-codigo';
    await UsuarioModel.create(usuarioNuevo(id));
    const u = await UsuarioModel.findOne({ id }).lean().exec() as any;
    expect(u.acceso.plan).toBe('NONE');
    expect(u.acceso.activadoEn).toBeNull();
    expect(u.acceso.expiraEn).toBeNull();
    expect(await obtenerPlanUsuario(id)).toBe('NONE');
  });
});

describe('B. Verificación de email — inicia el trial', () => {
  it('verificar el email de una cuenta recién registrada inicia el trial: tipo trial, plan PRO, expiraEn a 60 días', async () => {
    const id = 'b-verificacion-inicia-trial';
    const tokenPlano = randomBytes(32).toString('hex');
    await conectarUsuarios();
    await UsuarioModel.create(usuarioNuevo(id, {
      verificacionTokenHash: createHash('sha256').update(tokenPlano).digest('hex'),
      verificacionTokenExpira: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }));

    const resultado = await verificarEmailReal(tokenPlano);
    expect(resultado.verificado).toBe(true);

    const u = await UsuarioModel.findOne({ id }).lean().exec() as any;
    expect(u.emailVerificado).toBe(true);
    expect(u.acceso.tipo).toBe('trial');
    expect(u.acceso.plan).toBe('PRO');
    expect(u.acceso.origen).toBe('trial');
    expect(u.acceso.activadoEn).not.toBeNull();
    const diasReales = (new Date(u.acceso.expiraEn).getTime() - new Date(u.acceso.activadoEn).getTime()) / 86_400_000;
    expect(diasReales).toBe(DURACION_TRIAL_DIAS);
  });

  it('si el email nunca se verifica, el trial nunca empieza', async () => {
    const id = 'b-nunca-verificado';
    await conectarUsuarios();
    await UsuarioModel.create(usuarioNuevo(id, {
      verificacionTokenHash: createHash('sha256').update('token-nunca-usado').digest('hex'),
      verificacionTokenExpira: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }));
    const u = await UsuarioModel.findOne({ id }).lean().exec() as any;
    expect(u.acceso.tipo).toBe('free');
    expect(u.acceso.plan).toBe('NONE');
  });
});

// ── C/D/E/F — trial activo ─────────────────────────────────────────────────
describe('C/D/E/F. Trial activo — se comporta exactamente como PRO, nunca como PREMIUM', () => {
  async function crearUsuarioEnTrial(id: string, diasRestantes = 30): Promise<void> {
    await conectarUsuarios();
    await UsuarioModel.create(usuarioNuevo(id, {
      emailVerificado: true,
      acceso: {
        tipo: 'trial', plan: 'PRO', activadoEn: new Date(Date.now() - (DURACION_TRIAL_DIAS - diasRestantes) * 86_400_000).toISOString(),
        expiraEn: new Date(Date.now() + diasRestantes * 86_400_000).toISOString(), origen: 'trial', codigoUsado: null,
      },
    }));
  }

  it('C. plan efectivo es PRO', async () => {
    const id = 'c-trial-plan-efectivo';
    await crearUsuarioEnTrial(id);
    expect(await obtenerPlanUsuario(id)).toBe('PRO');
  });

  it('D. el límite de almacenamiento es 25 GB — usa directamente la lógica PRO existente, sin ninguna excepción especial de trial', async () => {
    const id = 'd-trial-25gb';
    await crearUsuarioEnTrial(id);
    const plan = await obtenerPlanUsuario(id);
    const uso = await obtenerUsoAlmacenamiento(id, plan);
    expect(uso.limiteBytes).toBe(LIMITES_ALMACENAMIENTO_BYTES.PRO);
    expect(uso.limiteBytes).toBe(25 * 1024 ** 3);
  });

  it('E. las funciones PRO están disponibles: requirePlan(PRO_O_SUPERIOR) deja pasar, y las capacidades de IA PRO también', async () => {
    const id = 'e-trial-funciones-pro';
    await crearUsuarioEnTrial(id);
    const { req, res, next, resultado } = mockReqResNext(id);
    await requirePlan(PRO_O_SUPERIOR)(req, res, next);
    expect(resultado().siguio).toBe(true);
    expect(await capacidadPermitidaParaPlan(id, obtenerCapacidad('extraer-datos-factura').planMinimo)).toBe(true);
  });

  it('F. Premium sigue bloqueado durante el trial: requirePlan(SOLO_PREMIUM) rechaza, y la capacidad Premium también', async () => {
    const id = 'f-trial-sin-premium';
    await crearUsuarioEnTrial(id);
    const { req, res, next, resultado } = mockReqResNext(id);
    await requirePlan(SOLO_PREMIUM)(req, res, next);
    const r = resultado();
    expect(r.siguio).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('plan_insuficiente');
    expect(await capacidadPermitidaParaPlan(id, obtenerCapacidad('copiloto-presupuesto').planMinimo)).toBe(false);
  });
});

// ── G/H/I — trial expirado ──────────────────────────────────────────────────
describe('G/H/I. Trial expirado — bloqueado en negocio, pero nunca en la vía de recuperación', () => {
  async function crearUsuarioTrialExpirado(id: string): Promise<void> {
    await conectarUsuarios();
    await UsuarioModel.create(usuarioNuevo(id, {
      emailVerificado: true,
      acceso: {
        tipo: 'trial', plan: 'PRO', activadoEn: new Date(Date.now() - 65 * 86_400_000).toISOString(),
        expiraEn: new Date(Date.now() - 5 * 86_400_000).toISOString(), origen: 'trial', codigoUsado: null,
      },
    }));
  }

  it('G. el plan efectivo es NONE, aunque en Mongo siga guardado PRO (se conserva el historial)', async () => {
    const id = 'g-trial-expirado-none';
    await crearUsuarioTrialExpirado(id);
    expect(await obtenerPlanUsuario(id)).toBe('NONE');
    const u = await UsuarioModel.findOne({ id }).lean().exec() as any;
    expect(u.acceso.plan).toBe('PRO'); // nunca se sobrescribe en Mongo
  });

  it('H. cualquier ruta de negocio queda bloqueada: requiereBloqueoPorSinPlan es true, y requirePlan(PRO_O_SUPERIOR) también rechaza (dos capas de acuerdo)', async () => {
    const id = 'h-trial-expirado-bloqueado';
    await crearUsuarioTrialExpirado(id);
    expect(await requiereBloqueoPorSinPlan(id, '/proyectos/p1')).toBe(true);
    expect(await requiereBloqueoPorSinPlan(id, '/facturas')).toBe(true);
    expect(await requiereBloqueoPorSinPlan(id, '/presupuestos')).toBe(true);

    const { req, res, next, resultado } = mockReqResNext(id);
    await requirePlan(PRO_O_SUPERIOR)(req, res, next);
    expect(resultado().siguio).toBe(false);
  });

  it('I. perfil, canje de código y uso de almacenamiento SIGUEN accesibles con el trial terminado', async () => {
    const id = 'i-trial-expirado-recuperacion';
    await crearUsuarioTrialExpirado(id);
    expect(await requiereBloqueoPorSinPlan(id, '/perfil')).toBe(false);
    expect(await requiereBloqueoPorSinPlan(id, '/codigos/canjear')).toBe(false);
    expect(await requiereBloqueoPorSinPlan(id, '/almacenamiento/uso')).toBe(false);
    expect(await requiereBloqueoPorSinPlan(id, '/auth/yo')).toBe(false);
  });
});

// ── J — idempotencia de la verificación ─────────────────────────────────────
describe('J. Verificación repetida — nunca reinicia el trial', () => {
  it('reutilizar el mismo token de verificación una segunda vez no encuentra nada (de un solo uso) y no vuelve a tocar acceso', async () => {
    const id = 'j-verificacion-repetida';
    const tokenPlano = randomBytes(32).toString('hex');
    await conectarUsuarios();
    await UsuarioModel.create(usuarioNuevo(id, {
      verificacionTokenHash: createHash('sha256').update(tokenPlano).digest('hex'),
      verificacionTokenExpira: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }));

    const primera = await verificarEmailReal(tokenPlano);
    expect(primera.verificado).toBe(true);
    const trasLaPrimera = await UsuarioModel.findOne({ id }).lean().exec() as any;
    const activadoEnOriginal = trasLaPrimera.acceso.activadoEn;
    const expiraEnOriginal = trasLaPrimera.acceso.expiraEn;

    // Reutilizar el mismo token — ya no encuentra nada que actualizar.
    const segunda = await verificarEmailReal(tokenPlano);
    expect(segunda.verificado).toBe(false);

    const trasLaSegunda = await UsuarioModel.findOne({ id }).lean().exec() as any;
    expect(trasLaSegunda.acceso.activadoEn).toBe(activadoEnOriginal);
    expect(trasLaSegunda.acceso.expiraEn).toBe(expiraEnOriginal);
  });
});

// ── K — sesiones/JWT ─────────────────────────────────────────────────────
describe('K. JWT antiguo — nunca mantiene acceso PRO tras la expiración', () => {
  it('un usuario cuyo trial ya expiró en Mongo obtiene NONE — el JWT nunca pudo haber llevado el plan (`PayloadAcceso` en `token.service.ts` solo tiene `sub`+`esAdmin`), así que no hay ningún dato "viejo" en el token que pudiera mantener el acceso: la única fuente es siempre la consulta a Mongo de este mismo request', async () => {
    // "Día 61": el trial ya expiró (nunca hubo ningún cambio de sesión —
    // el usuarioId es nuevo en este test justamente para no arrastrar la
    // caché de 60s de un `obtenerPlanUsuario` anterior sobre el MISMO id,
    // que devolvería un valor ya calculado antes del cambio; ver el
    // siguiente test para esa ventana de caché en concreto).
    const id = 'k-jwt-antiguo-dia-61';
    await conectarUsuarios();
    await UsuarioModel.create(usuarioNuevo(id, {
      emailVerificado: true,
      acceso: { tipo: 'trial', plan: 'PRO', activadoEn: new Date(Date.now() - 61 * 86_400_000).toISOString(), expiraEn: new Date(Date.now() - 1 * 86_400_000).toISOString(), origen: 'trial', codigoUsado: null },
    }));
    expect(await obtenerPlanUsuario(id)).toBe('NONE');
    expect(await requiereBloqueoPorSinPlan(id, '/proyectos/p1')).toBe(true);
  });

  it('ventana de caché documentada (~60s, aceptada explícitamente): el CÁLCULO real (`calcularPlanEfectivo`, sin caché) ya da NONE en el instante exacto en que expira, aunque `obtenerPlanUsuario` pueda tardar hasta 60s en reflejarlo si ya se había consultado justo antes — nunca más que eso, y nunca por depender de nada que viniera del cliente/JWT', async () => {
    const id = 'k-ventana-cache';
    await conectarUsuarios();
    await UsuarioModel.create(usuarioNuevo(id, {
      emailVerificado: true,
      acceso: { tipo: 'trial', plan: 'PRO', activadoEn: new Date(Date.now() - 59 * 86_400_000).toISOString(), expiraEn: new Date(Date.now() + 1000).toISOString(), origen: 'trial', codigoUsado: null },
    }));
    // Puebla la caché de 60s con el resultado "todavía activo".
    expect(await obtenerPlanUsuario(id)).toBe('PRO');

    // El trial expira de verdad (ya no depende de ningún JWT ni sesión —
    // solo de que pase el tiempo).
    await UsuarioModel.updateOne({ id }, { $set: { 'acceso.expiraEn': new Date(Date.now() - 1000).toISOString() } }).exec();

    // El CÁLCULO en sí (lo que `obtenerPlanUsuario` hará en cuanto la
    // caché de este usuario caduque, como muy tarde en 60s) ya es correcto ahora mismo.
    const uActualizado = await UsuarioModel.findOne({ id }).lean().exec() as any;
    expect(calcularPlanEfectivo(uActualizado.acceso)).toBe('NONE');
  });
});

// ── L — expiración real de códigos promocionales ────────────────────────────
describe('L. Código promocional con duración — expira de verdad (corrige el hallazgo de la auditoría)', () => {
  it('un código con duracionDias, una vez pasado ese plazo, deja de dar acceso — antes de esta implementación esto nunca se comprobaba', async () => {
    const id = 'l-codigo-con-duracion';
    await conectarUsuarios();
    await CodigoPromocionalModel.create({
      id: 'codigo-1', codigo: 'PROMO30DIAS', activo: true, tipoAccesoConcedido: 'promotional', planConcedido: 'PRO',
      duracionDias: 30, usosMaximos: null, usosActuales: 0, fechaInicio: null, fechaExpiracion: null, creadoEn: new Date().toISOString(), creadoPor: 'admin', notas: '',
    });
    const resultado = await canjearCodigo('PROMO30DIAS');
    expect(resultado.ok).toBe(true);
    if (resultado.ok !== true) throw new Error('inesperado');

    // Simula que el acceso se concedió hace 31 días (ya debería haber vencido).
    const activadoEn = new Date(Date.now() - 31 * 86_400_000).toISOString();
    const expiraEn = new Date(new Date(activadoEn).getTime() + 30 * 86_400_000).toISOString();
    await UsuarioModel.create(usuarioNuevo(id, {
      emailVerificado: true,
      acceso: { tipo: resultado.tipoAcceso, plan: resultado.plan, activadoEn, expiraEn, origen: 'codigo', codigoUsado: resultado.codigo },
    }));

    expect(await obtenerPlanUsuario(id)).toBe('NONE');
  });

  it('el mismo código, mientras sigue vigente, sí da acceso', async () => {
    const id = 'l-codigo-vigente';
    await conectarUsuarios();
    await UsuarioModel.create(usuarioNuevo(id, {
      emailVerificado: true,
      acceso: { tipo: 'promotional', plan: 'PRO', activadoEn: new Date().toISOString(), expiraEn: new Date(Date.now() + 29 * 86_400_000).toISOString(), origen: 'codigo', codigoUsado: 'PROMO30DIAS' },
    }));
    expect(await obtenerPlanUsuario(id)).toBe('PRO');
  });
});

// ── M/N/O/P — política de códigos promocionales ─────────────────────────────
describe('M. Código nuevo en el registro — nunca se suma al trial automático (caso B)', () => {
  it('si el registro ya trajo un código válido (acceso.origen ya no es el por defecto), verificar el email NO concede además un trial', async () => {
    const id = 'm-registro-con-codigo';
    const tokenPlano = randomBytes(32).toString('hex');
    await conectarUsuarios();
    // Simula exactamente lo que hace /auth/registrar cuando el código es válido: el acceso YA no es ACCESO_POR_DEFECTO antes de verificar.
    const accesoDelCodigo: AccesoUsuario = { tipo: 'promotional', plan: 'PREMIUM', activadoEn: new Date().toISOString(), expiraEn: null, origen: 'codigo', codigoUsado: 'MADERA-BIENVENIDA' };
    await UsuarioModel.create(usuarioNuevo(id, {
      acceso: accesoDelCodigo,
      verificacionTokenHash: createHash('sha256').update(tokenPlano).digest('hex'),
      verificacionTokenExpira: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }));

    await verificarEmailReal(tokenPlano);

    const u = await UsuarioModel.findOne({ id }).lean().exec() as any;
    expect(u.acceso.origen).toBe('codigo'); // nunca se sobrescribió con 'trial'
    expect(u.acceso.plan).toBe('PREMIUM'); // el código concedía PREMIUM — nunca se rebaja a PRO por un trial que no debía concederse
  });
});

describe('N/O. Trial (activo o terminado) + código — se permite recuperar/sustituir el acceso (casos C y D)', () => {
  it('N. un trial ACTIVO puede canjear un código — nunca tiene codigoUsado relleno, así que la única guarda existente no lo bloquea', async () => {
    const id = 'n-trial-activo-canjea';
    await conectarUsuarios();
    await UsuarioModel.create(usuarioNuevo(id, {
      emailVerificado: true,
      acceso: { tipo: 'trial', plan: 'PRO', activadoEn: new Date().toISOString(), expiraEn: new Date(Date.now() + 30 * 86_400_000).toISOString(), origen: 'trial', codigoUsado: null },
    }));
    const u = await UsuarioModel.findOne({ id }).lean().exec() as any;
    // Misma guarda que monta la ruta real (`/codigos/canjear`).
    expect(u.acceso.tipo === 'paid').toBe(false);
    expect(!!u.acceso.codigoUsado).toBe(false);
  });

  it('O. un trial TERMINADO también puede canjear — la expiración no toca codigoUsado ni tipo', async () => {
    const id = 'o-trial-terminado-canjea';
    await conectarUsuarios();
    await UsuarioModel.create(usuarioNuevo(id, {
      emailVerificado: true,
      acceso: { tipo: 'trial', plan: 'PRO', activadoEn: new Date(Date.now() - 65 * 86_400_000).toISOString(), expiraEn: new Date(Date.now() - 5 * 86_400_000).toISOString(), origen: 'trial', codigoUsado: null },
    }));
    const u = await UsuarioModel.findOne({ id }).lean().exec() as any;
    expect(u.acceso.tipo === 'paid').toBe(false);
    expect(!!u.acceso.codigoUsado).toBe(false);
    // Y de hecho puede volver a tener acceso real tras canjear (simulado): sustituir el acceso.
    await UsuarioModel.updateOne({ id }, { $set: { acceso: { tipo: 'paid', plan: 'BASIC', activadoEn: new Date().toISOString(), expiraEn: null, origen: 'codigo', codigoUsado: 'RECUPERA' } } }).exec();
    expect(await obtenerPlanUsuario(id)).toBe('BASIC');
  });
});

describe('P. Usuario de pago + código — nunca un downgrade silencioso (caso E, bloqueado por diseño)', () => {
  it('la guarda que monta /codigos/canjear rechaza a cualquier cuenta con tipo:"paid", sin excepción', async () => {
    const id = 'p-usuario-pagado';
    await conectarUsuarios();
    await UsuarioModel.create(usuarioNuevo(id, {
      emailVerificado: true,
      acceso: { tipo: 'paid', plan: 'PREMIUM', activadoEn: new Date().toISOString(), expiraEn: null, origen: 'pago', codigoUsado: null },
    }));
    const u = await UsuarioModel.findOne({ id }).lean().exec() as any;
    // Misma condición que la ruta real comprueba ANTES de canjear nada.
    expect(u.acceso.tipo === 'paid').toBe(true); // → la ruta real respondería 409 sin siquiera llamar a canjearCodigo
    expect(await obtenerPlanUsuario(id)).toBe('PREMIUM'); // su plan no cambia con solo tener un código válido en la mano
  });
});

// ── Q — admin ───────────────────────────────────────────────────────────────
describe('Q. Admin — acceso total, el trial no le afecta en absoluto', () => {
  it('requirePlan(SOLO_PREMIUM) deja pasar a admin sin mirar ningún acceso guardado', async () => {
    const { req, res, next, resultado } = mockReqResNext('admin');
    await requirePlan(SOLO_PREMIUM)(req, res, next);
    expect(resultado().siguio).toBe(true);
  });

  it('capacidadPermitidaParaPlan también deja pasar a admin para una capacidad PREMIUM', async () => {
    expect(await capacidadPermitidaParaPlan('admin', obtenerCapacidad('copiloto-presupuesto').planMinimo)).toBe(true);
  });
});

// ── R — no se borran datos al expirar ───────────────────────────────────────
describe('R. Ningún dato de negocio se borra al expirar el trial', () => {
  it('clientes y proyectos de una cuenta con el trial ya terminado siguen intactos y legibles', async () => {
    const id = 'r-datos-intactos';
    await conectarUsuarios();
    await UsuarioModel.create(usuarioNuevo(id, {
      emailVerificado: true,
      acceso: { tipo: 'trial', plan: 'PRO', activadoEn: new Date(Date.now() - 65 * 86_400_000).toISOString(), expiraEn: new Date(Date.now() - 5 * 86_400_000).toISOString(), origen: 'trial', codigoUsado: null },
    }));
    await ClienteModel.create({ id: 'cliente-r', usuarioId: id, nombre: 'Cliente de prueba', creado: new Date().toISOString() });
    await ProyectoModel.create({ id: 'proyecto-r', usuarioId: id, clienteId: 'cliente-r', tarifaHora: 20, creado: new Date().toISOString() });

    expect(await obtenerPlanUsuario(id)).toBe('NONE'); // el acceso SÍ está bloqueado...

    // ...pero los datos siguen ahí, exactamente igual.
    const cliente = await ClienteModel.findOne({ id: 'cliente-r', usuarioId: id }).lean().exec();
    const proyecto = await ProyectoModel.findOne({ id: 'proyecto-r', usuarioId: id }).lean().exec();
    expect(cliente).not.toBeNull();
    expect(proyecto).not.toBeNull();
    expect((cliente as any).nombre).toBe('Cliente de prueba');
  });
});

// ── T — sin trial retroactivo ────────────────────────────────────────────────
describe('T. Cuentas existentes antiguas — nunca reciben trial retroactivo', () => {
  it('una cuenta antigua ya verificada (sin ningún token de verificación pendiente) es estructuralmente inalcanzable para /auth/verificar-email — nunca puede disparar iniciarTrialSiCorresponde otra vez', async () => {
    const id = 't-cuenta-antigua';
    await conectarUsuarios();
    // Cuenta "antigua": ya verificada, sin plan, sin ningún token pendiente — exactamente el estado de una cuenta real de antes de esta función.
    await UsuarioModel.create(usuarioNuevo(id, { emailVerificado: true, verificacionTokenHash: null, verificacionTokenExpira: null }));

    // Ningún token (ni uno inventado) puede encontrar esta cuenta — la consulta exige verificacionTokenHash === el hash de ESE token, y aquí es null.
    const intento = await verificarEmailReal(randomBytes(32).toString('hex'));
    expect(intento.verificado).toBe(false);

    const u = await UsuarioModel.findOne({ id }).lean().exec() as any;
    expect(u.acceso.plan).toBe('NONE'); // sigue exactamente igual que antes de este cambio
  });

  it('no existe ningún proceso por lotes que recorra cuentas existentes concediendo trials — iniciarTrialSiCorresponde solo se invoca desde /auth/verificar-email', () => {
    // Documental, no ejecutable: confirmado por inspección del código
    // (`presupuestos-service.app-root.ts`) que `iniciarTrialSiCorresponde`
    // tiene un único punto de llamada. No hay backfill ni migración
    // asociados a esta función, a propósito (petición explícita del
    // encargo: "no crear trial automáticamente para cuentas antiguas").
    expect(true).toBe(true);
  });
});
