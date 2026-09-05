import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { FacturaModel } from './cliente.model.js';
import { UsuarioModel, conectarUsuarios } from './usuario.model.js';
import { PRO_O_SUPERIOR, requirePlan } from './planes.js';

/**
 * Exportación de informes y PDF de facturas — solo PRO (encargo del
 * usuario, 05/09/2026). Consultar/ver facturas y cálculos económicos
 * sigue siendo BASIC; descargar/exportar (PDF individual, ZIP,
 * documentación para el asesor, PDF combinado por trimestre) exige PRO+.
 *
 * Las 4 rutas reales (`/facturas/:id/pdf`, `/facturas/descargar-zip`,
 * `/facturas/documentacion-asesor`, `/facturas/pdf-trimestre`,
 * `presupuestos-service.app-root.ts`) montan literalmente
 * `requirePlan(PRO_O_SUPERIOR)` — se ejercita esa misma función, mismo
 * criterio que el resto de este código (nunca una reimplementación
 * paralela para el test; no hay tests de nivel HTTP en este proyecto).
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();
const USUARIO_A = 'usuario-a-exportacion-test';

function facturaBase(id: string, extra: Record<string, unknown> = {}) {
  return {
    id, tipo: 'gasto' as const, fecha: '2026-08-27', importe: 42.5,
    concepto: 'Material de prueba', proveedor: 'Proveedor de prueba',
    clienteId: '', imagen: '', imagenes: [], numeroFactura: '2026/154',
    creado: new Date().toISOString(), ...extra,
  };
}

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

/** Mismo patrón que `planes.spec.ts` — simula req/res/next sin levantar Express. */
function mockReqResNext(usuarioId: string) {
  const req: any = { usuarioId };
  let status = 200;
  let body: any = null;
  let siguio = false;
  const res: any = {
    status(codigo: number) { status = codigo; return this; },
    json(payload: any) { body = payload; },
  };
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
  await Promise.all([FacturaModel.deleteMany({}), UsuarioModel.deleteMany({})]);
});

describe('Exportación de informes y PDF de facturas — solo PRO (05/09/2026)', () => {
  it('1-2. BASIC puede consultar facturas y sus cálculos económicos (sin cambios) — obtenerFactura/obtenerZipFacturas no dependen del plan', async () => {
    await svc.guardarFactura(facturaBase('f-basic-consulta'), USUARIO_A);
    const leida = await svc.obtenerFactura('f-basic-consulta', USUARIO_A);
    expect(leida).not.toBeNull();
    expect(leida?.importe).toBe(42.5);
    // La función de negocio en sí (no la ruta) nunca ha comprobado el plan — el gate vive en requirePlan, a nivel de ruta.
  });

  it('3-4. BASIC NO puede descargar/exportar (requirePlan bloquea antes de llegar a la función de negocio)', async () => {
    await crearUsuarioConPlan('u-export-basic', 'BASIC');
    const { req, res, next, resultado } = mockReqResNext('u-export-basic');
    await requirePlan(PRO_O_SUPERIOR)(req, res, next);
    const r = resultado();
    expect(r.siguio).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('plan_insuficiente');
  });

  it('5-6. PRO puede descargar/exportar (requirePlan permite)', async () => {
    await crearUsuarioConPlan('u-export-pro', 'PRO');
    const { req, res, next, resultado } = mockReqResNext('u-export-pro');
    await requirePlan(PRO_O_SUPERIOR)(req, res, next);
    expect(resultado().siguio).toBe(true);
  });

  it('7. PREMIUM puede descargar/exportar (hereda PRO)', async () => {
    await crearUsuarioConPlan('u-export-premium', 'PREMIUM');
    const { req, res, next, resultado } = mockReqResNext('u-export-premium');
    await requirePlan(PRO_O_SUPERIOR)(req, res, next);
    expect(resultado().siguio).toBe(true);
  });

  it('8. ADMIN puede descargar/exportar sin importar su plan almacenado', async () => {
    await crearUsuarioConPlan('admin', null);
    const { req, res, next, resultado } = mockReqResNext('admin');
    await requirePlan(PRO_O_SUPERIOR)(req, res, next);
    expect(resultado().siguio).toBe(true);
  });

  it('9. un usuario BASIC no puede saltarse la restricción llamando "directamente" — requirePlan corta ANTES de que se ejecute cualquier lógica de negocio', async () => {
    await crearUsuarioConPlan('u-export-basic2', 'BASIC');
    const { req, res, next, resultado } = mockReqResNext('u-export-basic2');
    await requirePlan(PRO_O_SUPERIOR)(req, res, next);
    // `next` nunca se llamó — el handler real de la ruta (que llamaría a
    // svc.obtenerPdfFactura/obtenerZipFacturas/etc.) nunca se ejecuta.
    expect(resultado().siguio).toBe(false);
  });

  it('10. la generación real de documentos sigue funcionando (regresión, no se ha tocado la lógica de negocio, solo la ruta)', async () => {
    await svc.guardarFactura(facturaBase('f-zip-regresion'), USUARIO_A);
    const zip = await svc.obtenerZipFacturas(USUARIO_A, { ids: ['f-zip-regresion'] });
    expect(zip).toBeInstanceOf(Uint8Array);
    expect(zip.length).toBeGreaterThan(0);
  });

  it('11. numeroFactura continúa exactamente igual — el número externo del documento, nunca tocado por este ajuste', async () => {
    const guardada = await svc.guardarFactura(facturaBase('f-numero-externo'), USUARIO_A);
    expect((guardada as any).numeroFactura).toBe('2026/154');
    expect(guardada).not.toHaveProperty('numeroFacturaPropio');
  });

  // 12. No se modifica la numeración de presupuestos: este archivo no
  // importa `numeracion-presupuestos.ts` ni toca `PresupuestoModel` — se
  // verifica que su propia suite (`numeracion-presupuestos.spec.ts`) sigue
  // en verde con la suite completa, no con un test aparte aquí.
});
