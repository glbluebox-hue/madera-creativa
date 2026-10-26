import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { ClienteModel, EmpresaModel, conectar } from './cliente.model.js';
import { FacturaEmitidaModel } from './factura-emitida.model.js';
import { EventoFacturaEmitidaModel } from './evento-factura-emitida.model.js';
import { ContadorFacturaEmitidaModel } from './contador-factura-emitida.model.js';
import { SecuenciaCadenaFacturaEmitidaModel, calcularHashFacturaEmitida } from './cadena-facturas-emitidas.js';
import { reclamarNumeroFacturaEmitida, formatearNumeroFacturaEmitida } from './numeracion-facturas-emitidas.js';
import { PresupuestosService } from './presupuestos-service.js';

/**
 * Facturas emitidas (SIF, Fase 1-5, 26/10/2026) — mismo criterio que
 * `numeracion-presupuestos.spec.ts`: cada comprobación ejercita las
 * funciones/métodos reales del flujo, nunca una reimplementación paralela
 * para el test. Solo SIF, sin VERI*FACTU — nada aquí dispara ninguna
 * llamada de red.
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

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
    ClienteModel.deleteMany({}), EmpresaModel.deleteMany({}),
    FacturaEmitidaModel.deleteMany({}), EventoFacturaEmitidaModel.deleteMany({}),
    ContadorFacturaEmitidaModel.deleteMany({}), SecuenciaCadenaFacturaEmitidaModel.deleteMany({}),
  ]);
});

async function prepararCliente(usuarioId: string, clienteId = 'c-fe') {
  await ClienteModel.create({ id: clienteId, usuarioId, nombre: 'Cliente de prueba', creado: new Date().toISOString() });
  return clienteId;
}

// ── Numeración legal: sin huecos, nunca se reutiliza ────────────────────
describe('reclamarNumeroFacturaEmitida — numeración legal (sin reutilización de huecos)', () => {
  it('formato exacto FAC-0001/26', () => {
    expect(formatearNumeroFacturaEmitida(1, 2026)).toBe('FAC-0001/26');
  });

  it('primera, segunda, tercera: 1, 2, 3 — estrictamente creciente', async () => {
    expect(await reclamarNumeroFacturaEmitida('u-fac-1', 2026)).toBe(1);
    expect(await reclamarNumeroFacturaEmitida('u-fac-1', 2026)).toBe(2);
    expect(await reclamarNumeroFacturaEmitida('u-fac-1', 2026)).toBe(3);
  });

  it('dos usuarios distintos pueden tener ambos el número 1 — aislamiento por usuarioId', async () => {
    expect(await reclamarNumeroFacturaEmitida('u-fac-a', 2026)).toBe(1);
    expect(await reclamarNumeroFacturaEmitida('u-fac-b', 2026)).toBe(1);
  });

  it('años distintos reinician en 1', async () => {
    await reclamarNumeroFacturaEmitida('u-fac-anios', 2026);
    await reclamarNumeroFacturaEmitida('u-fac-anios', 2026);
    expect(await reclamarNumeroFacturaEmitida('u-fac-anios', 2027)).toBe(1);
  });

  it('20 reclamaciones simultáneas del mismo usuario/año nunca duplican un número', async () => {
    const numeros = await Promise.all(Array.from({ length: 20 }, () => reclamarNumeroFacturaEmitida('u-fac-concurrencia', 2026)));
    expect(new Set(numeros).size).toBe(20);
    expect([...numeros].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('el contador NO tiene campo huecos — no existe ningún mecanismo de reutilización', () => {
    const paths = Object.keys((ContadorFacturaEmitidaModel.schema as any).paths);
    expect(paths).not.toContain('huecos');
  });
});

// ── Ciclo de vida: borrador → emitida → anulada / rectificada ───────────
describe('Ciclo de vida de una factura emitida', () => {
  const USUARIO = 'u-ciclo';

  it('crea un borrador sin número ni hash', async () => {
    const clienteId = await prepararCliente(USUARIO, 'c-ciclo-1');
    const borrador = await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId, titulo: 'Trabajo', importeTotal: 500 });
    expect((borrador as any).estado).toBe('borrador');
    expect((borrador as any).numero).toBeNull();
    expect((borrador as any).numeroFormateado).toBe('');
    expect((borrador as any).hash).toBe('');
  });

  it('rechaza crear un borrador para un cliente que no existe (o no es de este usuario)', async () => {
    await expect(svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId: 'no-existe', importeTotal: 100 })).rejects.toThrow();
  });

  it('un borrador se puede editar libremente', async () => {
    const clienteId = await prepararCliente(USUARIO, 'c-ciclo-2');
    const borrador = await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId, titulo: 'v1', importeTotal: 100 });
    const editado = await svc.actualizarFacturaEmitidaBorrador((borrador as any).id, USUARIO, { titulo: 'v2', importeTotal: 200 });
    expect((editado as any).titulo).toBe('v2');
    expect((editado as any).importeTotal).toBe(200);
  });

  it('emitir asigna número, serie, fecha y hash; a partir de ahí es de solo lectura', async () => {
    const clienteId = await prepararCliente(USUARIO, 'c-ciclo-3');
    await EmpresaModel.create({ usuarioId: USUARIO, nifCif: '12345678Z' });
    const borrador = await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId, titulo: 'Trabajo', importeTotal: 1000 });
    const emitida = await svc.emitirFacturaEmitida((borrador as any).id, USUARIO);
    expect((emitida as any).estado).toBe('emitida');
    expect((emitida as any).numeroFormateado).toBe('FAC-0001/26');
    expect((emitida as any).hash).toHaveLength(64); // sha256 hex
    expect((emitida as any).fechaEmision).toBeTruthy();

    await expect(svc.actualizarFacturaEmitidaBorrador((emitida as any).id, USUARIO, { titulo: 'intento de edición' })).rejects.toThrow();
    await expect(svc.borrarFacturaEmitidaBorrador((emitida as any).id, USUARIO)).rejects.toThrow();
  });

  it('no se puede emitir dos veces la misma factura', async () => {
    const clienteId = await prepararCliente(USUARIO, 'c-ciclo-4');
    await EmpresaModel.create({ usuarioId: USUARIO, nifCif: '12345678Z' });
    const borrador = await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId, importeTotal: 50 });
    await svc.emitirFacturaEmitida((borrador as any).id, USUARIO);
    await expect(svc.emitirFacturaEmitida((borrador as any).id, USUARIO)).rejects.toThrow();
  });

  it('no se puede emitir con importe total 0 o ausente', async () => {
    const clienteId = await prepararCliente(USUARIO, 'c-ciclo-5');
    const borrador = await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId });
    await expect(svc.emitirFacturaEmitida((borrador as any).id, USUARIO)).rejects.toThrow();
  });

  it('20 intentos de emisión concurrentes de la MISMA factura: solo uno gana, y solo se consume un número', async () => {
    const clienteId = await prepararCliente(USUARIO, 'c-ciclo-concurrencia');
    await EmpresaModel.create({ usuarioId: USUARIO, nifCif: '12345678Z' });
    const borrador = await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId, importeTotal: 300 });
    const resultados = await Promise.allSettled(Array.from({ length: 20 }, () => svc.emitirFacturaEmitida((borrador as any).id, USUARIO)));
    const exitos = resultados.filter((r) => r.status === 'fulfilled');
    expect(exitos.length).toBe(1); // solo una emisión real
    // El contador de numeración solo avanzó una posición — ninguna emisión perdedora desperdició un número.
    const contador = await ContadorFacturaEmitidaModel.findOne({ usuarioId: USUARIO, anio: new Date().getFullYear() }).lean().exec() as any;
    expect(contador?.ultimoNumero).toBe(1);
  });

  it('anular solo funciona desde emitida, nunca borra el documento', async () => {
    const clienteId = await prepararCliente(USUARIO, 'c-ciclo-6');
    await EmpresaModel.create({ usuarioId: USUARIO, nifCif: '12345678Z' });
    const borrador = await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId, importeTotal: 80 });
    await expect(svc.anularFacturaEmitida((borrador as any).id, USUARIO, 'motivo')).rejects.toThrow(); // todavía borrador
    const emitida = await svc.emitirFacturaEmitida((borrador as any).id, USUARIO);
    const anulada = await svc.anularFacturaEmitida((emitida as any).id, USUARIO, 'Error de importe');
    expect((anulada as any).estado).toBe('anulada');
    expect((anulada as any).motivoAnulacion).toBe('Error de importe');
    const sigueExistiendo = await FacturaEmitidaModel.findOne({ id: (emitida as any).id }).lean().exec();
    expect(sigueExistiendo).not.toBeNull(); // nunca se borra físicamente
    expect((sigueExistiendo as any).numeroFormateado).toBe('FAC-0001/26'); // el número se conserva, no se libera
  });

  it('rectificar crea una factura NUEVA vinculada, nunca edita la original', async () => {
    const clienteId = await prepararCliente(USUARIO, 'c-ciclo-7');
    await EmpresaModel.create({ usuarioId: USUARIO, nifCif: '12345678Z' });
    const borrador = await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId, importeTotal: 1000 });
    const original = await svc.emitirFacturaEmitida((borrador as any).id, USUARIO);

    const rectificativa = await svc.rectificarFacturaEmitida((original as any).id, USUARIO, {
      motivoRectificacion: 'devolucion_mercancia', importeTotal: -200,
    });
    expect((rectificativa as any).naturaleza).toBe('rectificativa');
    expect((rectificativa as any).facturaOriginalId).toBe((original as any).id);
    expect((rectificativa as any).numeroFacturaOriginal).toBe((original as any).numeroFormateado);
    expect((rectificativa as any).estado).toBe('borrador'); // nace sin numerar, hay que emitirla igual que cualquier otra

    const originalTrasRectificar = await svc.obtenerFacturaEmitida((original as any).id, USUARIO);
    expect((originalTrasRectificar as any).importeTotal).toBe(1000); // intacta
    expect((originalTrasRectificar as any).estado).toBe('emitida'); // intacta

    const rectificativaEmitida = await svc.emitirFacturaEmitida((rectificativa as any).id, USUARIO);
    expect((rectificativaEmitida as any).numeroFormateado).toBe('FAC-0002/26'); // comparte la misma secuencia legal que cualquier otra factura
  });

  it('rectificar solo funciona desde emitida', async () => {
    const clienteId = await prepararCliente(USUARIO, 'c-ciclo-8');
    const borrador = await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId, importeTotal: 100 });
    await expect(svc.rectificarFacturaEmitida((borrador as any).id, USUARIO, { motivoRectificacion: 'otro', importeTotal: -10 })).rejects.toThrow();
  });
});

// ── Cadena de integridad: enlace y detección de manipulación ────────────
describe('Cadena de hash — enlace entre facturas y detección de manipulación', () => {
  const USUARIO = 'u-cadena';

  it('la segunda factura incluye el hash de la primera como hashAnterior; la tercera, el de la segunda', async () => {
    const clienteId = await prepararCliente(USUARIO, 'c-cadena-1');
    await EmpresaModel.create({ usuarioId: USUARIO, nifCif: '12345678Z' });

    const f1 = await svc.emitirFacturaEmitida((await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId, importeTotal: 100 }) as any).id, USUARIO) as any;
    const f2 = await svc.emitirFacturaEmitida((await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId, importeTotal: 200 }) as any).id, USUARIO) as any;
    const f3 = await svc.emitirFacturaEmitida((await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId, importeTotal: 300 }) as any).id, USUARIO) as any;

    expect(f1.hashAnterior).toBe(''); // raíz de la cadena
    expect(f2.hashAnterior).toBe(f1.hash);
    expect(f3.hashAnterior).toBe(f2.hash);
    // Cada hash es distinto — nunca se repite entre facturas de importes/números distintos.
    expect(new Set([f1.hash, f2.hash, f3.hash]).size).toBe(3);
  });

  /**
   * La prueba real de que el "precinto" funciona: si alguien edita el
   * CONTENIDO de la factura Nº2 directamente en la base de datos después
   * de emitida (saltándose la aplicación, que ya lo prohíbe a nivel de
   * servicio — ver el test de solo-lectura de arriba), el hash recalculado
   * de esa factura con sus datos manipulados ya NO coincide con el
   * `hashAnterior` que guarda la factura Nº3 — la cadena queda rota de
   * forma detectable.
   */
  it('detecta la manipulación: recalcular el hash de una factura editada a mano ya no coincide con lo que la siguiente factura registró como hashAnterior', async () => {
    const clienteId = await prepararCliente(USUARIO, 'c-cadena-2');
    await EmpresaModel.create({ usuarioId: USUARIO, nifCif: '12345678Z' });

    const f1 = await svc.emitirFacturaEmitida((await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId, importeTotal: 100 }) as any).id, USUARIO) as any;
    const f2 = await svc.emitirFacturaEmitida((await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId, importeTotal: 200 }) as any).id, USUARIO) as any;
    const f3 = await svc.emitirFacturaEmitida((await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId, importeTotal: 300 }) as any).id, USUARIO) as any;

    // Manipulación directa en Mongo (saltándose la aplicación) — cambia el importe de la Nº2 ya emitida.
    await FacturaEmitidaModel.updateOne({ id: f2.id }, { $set: { importeTotal: 999999 } });
    const f2Manipulada = await FacturaEmitidaModel.findOne({ id: f2.id }).lean().exec() as any;

    const hashRecalculadoConDatoManipulado = calcularHashFacturaEmitida({
      nifEmisor: '12345678Z', numeroFormateado: f2Manipulada.numeroFormateado, fechaEmision: f2Manipulada.fechaEmision,
      naturaleza: 'normal', importeTotal: f2Manipulada.importeTotal, hashAnterior: f1.hash,
    });

    // La huella que la factura Nº3 registró como "la que precede" ya no coincide con el hash recalculado de la Nº2 manipulada.
    expect(f3.hashAnterior).not.toBe(hashRecalculadoConDatoManipulado);
    // Y tampoco coincide con el hash ORIGINAL guardado en la Nº2 (que no cambió, porque `hash` no se recalcula solo — hay que compararlo a mano para detectar el desajuste con el importe real).
    expect(hashRecalculadoConDatoManipulado).not.toBe(f2Manipulada.hash);
  });

  it('calcularHashFacturaEmitida es determinista: mismos datos, mismo hash', () => {
    const datos = { nifEmisor: 'X', numeroFormateado: 'FAC-0001/26', fechaEmision: '2026-10-26T10:00:00.000Z', naturaleza: 'normal' as const, importeTotal: 123.45, hashAnterior: '' };
    expect(calcularHashFacturaEmitida(datos)).toBe(calcularHashFacturaEmitida(datos));
  });

  it('calcularHashFacturaEmitida es sensible a cualquier cambio en el importe (no es un hash "aproximado")', () => {
    const base = { nifEmisor: 'X', numeroFormateado: 'FAC-0001/26', fechaEmision: '2026-10-26T10:00:00.000Z', naturaleza: 'normal' as const, hashAnterior: '' };
    const h1 = calcularHashFacturaEmitida({ ...base, importeTotal: 100 });
    const h2 = calcularHashFacturaEmitida({ ...base, importeTotal: 100.01 });
    expect(h1).not.toBe(h2);
  });

  it('el hash es SHA-256 real, reproducible fuera del módulo con node:crypto', () => {
    const datos = { nifEmisor: '12345678Z', numeroFormateado: 'FAC-0001/26', fechaEmision: '2026-01-01T00:00:00.000Z', naturaleza: 'normal' as const, importeTotal: 50, hashAnterior: '' };
    const esperado = createHash('sha256').update(['12345678Z', 'FAC-0001/26', '2026-01-01T00:00:00.000Z', 'normal', '50.00', ''].join('|')).digest('hex');
    expect(calcularHashFacturaEmitida(datos)).toBe(esperado);
  });
});

// ── Eventos de auditoría (append-only) ───────────────────────────────────
describe('Registro de eventos — append-only', () => {
  it('cada hito del ciclo de vida genera un evento propio, nunca se sobrescribe uno existente', async () => {
    const USUARIO = 'u-eventos';
    const clienteId = await prepararCliente(USUARIO, 'c-eventos');
    await EmpresaModel.create({ usuarioId: USUARIO, nifCif: '12345678Z' });
    const borrador = await svc.crearFacturaEmitidaBorrador(USUARIO, { clienteId, importeTotal: 100 }) as any;
    const emitida = await svc.emitirFacturaEmitida(borrador.id, USUARIO) as any;
    await svc.anularFacturaEmitida(emitida.id, USUARIO, 'motivo');

    const eventos = await EventoFacturaEmitidaModel.find({ usuarioId: USUARIO, facturaEmitidaId: emitida.id }).sort({ creado: 1 }).lean().exec();
    expect(eventos.map((e: any) => e.tipo)).toEqual(['creada', 'emitida', 'anulada']);
  });
});

// ── Aislamiento entre cuentas (la app se vende a otros carpinteros) ─────
describe('Aislamiento por usuarioId — Madera Creativa Estudio es multiempresa', () => {
  it('un usuario nunca puede ver, editar, emitir ni anular la factura de otro', async () => {
    const clienteA = await prepararCliente('u-aislado-a', 'c-aislado-a');
    await prepararCliente('u-aislado-b', 'c-aislado-b');
    const borradorA = await svc.crearFacturaEmitidaBorrador('u-aislado-a', { clienteId: clienteA, importeTotal: 100 }) as any;

    expect(await svc.obtenerFacturaEmitida(borradorA.id, 'u-aislado-b')).toBeNull();
    await expect(svc.actualizarFacturaEmitidaBorrador(borradorA.id, 'u-aislado-b', { titulo: 'intento ajeno' })).rejects.toThrow();
    await expect(svc.emitirFacturaEmitida(borradorA.id, 'u-aislado-b')).rejects.toThrow();
  });

  it('cada usuario numera su propia secuencia, nunca se mezclan', async () => {
    await prepararCliente('u-num-a', 'c-num-a');
    await prepararCliente('u-num-b', 'c-num-b');
    await EmpresaModel.create({ usuarioId: 'u-num-a', nifCif: 'A' });
    await EmpresaModel.create({ usuarioId: 'u-num-b', nifCif: 'B' });
    const a1 = await svc.emitirFacturaEmitida((await svc.crearFacturaEmitidaBorrador('u-num-a', { clienteId: 'c-num-a', importeTotal: 10 }) as any).id, 'u-num-a') as any;
    const b1 = await svc.emitirFacturaEmitida((await svc.crearFacturaEmitidaBorrador('u-num-b', { clienteId: 'c-num-b', importeTotal: 10 }) as any).id, 'u-num-b') as any;
    expect(a1.numeroFormateado).toBe('FAC-0001/26');
    expect(b1.numeroFormateado).toBe('FAC-0001/26'); // mismo número, cuentas distintas — correcto
    expect(a1.hashAnterior).toBe(''); // cada cadena es propia de su usuario, no se mezclan entre sí
    expect(b1.hashAnterior).toBe('');
  });
});
