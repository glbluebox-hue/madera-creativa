import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { ClienteModel, ProyectoModel, PresupuestoModel, FacturaModel, conectar } from './cliente.model.js';
import { ContadorPresupuestoModel } from './contador-presupuesto.model.js';
import { PresupuestosService } from './presupuestos-service.js';
import {
  anioMadrid, formatearNumeroPresupuesto, parsearNumeroPresupuesto,
  reclamarNumeroPresupuesto, liberarNumeroPresupuesto, calcularNumerosHistoricos,
} from './numeracion-presupuestos.js';

/**
 * Numeración oficial de presupuestos (05/09/2026) — cada comprobación aquí
 * ejercita la MISMA función que usa `guardarPresupuesto`/`borrarPresupuesto`
 * (`presupuestos-service.ts`), nunca una reimplementación paralela para el
 * test (mismo criterio que `planes.spec.ts`).
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
    ClienteModel.deleteMany({}), ProyectoModel.deleteMany({}),
    PresupuestoModel.deleteMany({}), FacturaModel.deleteMany({}),
    ContadorPresupuestoModel.deleteMany({}),
  ]);
});

function presupuestoBase(id: string, clienteId: string, usuarioId: string, creado: string) {
  return {
    id, usuarioId, clienteId, titulo: 'Presupuesto de prueba', formato: 'simple' as const,
    precioTotal: 1000, items: [], alcance: [], creado, actualizado: creado,
  };
}

// ── Formato (tests 20-21 del encargo) ───────────────────────────────────
describe('formatearNumeroPresupuesto / parsearNumeroPresupuesto', () => {
  it('el formato exacto es PRV-0001/26', () => {
    expect(formatearNumeroPresupuesto(1, 2026)).toBe('PRV-0001/26');
  });

  it('nunca incluye ningún usuarioId ni código de cuenta', () => {
    const numero = formatearNumeroPresupuesto(23, 2026);
    expect(numero).toMatch(/^PRV-\d{4}\/\d{2}$/);
    expect(numero).not.toContain('usuario');
    expect(numero).not.toContain('1000'); // el prefijo de negocio de la propuesta anterior, explícitamente descartado
  });

  it('parsearNumeroPresupuesto invierte formatearNumeroPresupuesto', () => {
    expect(parsearNumeroPresupuesto('PRV-0047/26')).toEqual({ numero: 47, anio: 2026 });
  });

  it('parsearNumeroPresupuesto devuelve null ante un formato ajeno (defensivo, nunca revienta)', () => {
    expect(parsearNumeroPresupuesto('cualquier-cosa')).toBeNull();
    expect(parsearNumeroPresupuesto('')).toBeNull();
  });
});

// ── Año en Europe/Madrid, nunca UTC ──────────────────────────────────────
describe('anioMadrid', () => {
  it('un instante de madrugada del 1 de enero en Madrid (CET, UTC+1) es 2027 aunque en UTC siga siendo 2026', () => {
    // 2026-12-31T23:30:00Z en UTC == 2027-01-01T00:30:00+01:00 en Madrid (invierno, CET).
    expect(anioMadrid('2026-12-31T23:30:00.000Z')).toBe(2027);
  });

  it('un instante claramente dentro del año da el mismo resultado que el año naive', () => {
    expect(anioMadrid('2026-06-15T10:00:00.000Z')).toBe(2026);
  });
});

// ── Asignación básica (tests 1-3 del encargo) ────────────────────────────
describe('reclamarNumeroPresupuesto — asignación básica', () => {
  it('primer presupuesto nuevo de un usuario: número 1', async () => {
    expect(await reclamarNumeroPresupuesto('u-num-1', 2026)).toBe(1);
  });

  it('segundo presupuesto del mismo usuario/año: número 2', async () => {
    await reclamarNumeroPresupuesto('u-num-2', 2026);
    expect(await reclamarNumeroPresupuesto('u-num-2', 2026)).toBe(2);
  });

  it('dos usuarios distintos pueden tener ambos el número 1 — aislamiento por usuarioId', async () => {
    expect(await reclamarNumeroPresupuesto('u-num-a', 2026)).toBe(1);
    expect(await reclamarNumeroPresupuesto('u-num-b', 2026)).toBe(1);
  });

  it('años distintos del mismo usuario reinician en 1 — el contador no continúa de un año a otro', async () => {
    await reclamarNumeroPresupuesto('u-num-anios', 2026);
    await reclamarNumeroPresupuesto('u-num-anios', 2026);
    expect(await reclamarNumeroPresupuesto('u-num-anios', 2027)).toBe(1);
  });
});

// ── Borrado y reutilización de huecos (tests 9-12 del encargo) ───────────
describe('liberarNumeroPresupuesto — reutilización de números eliminados', () => {
  it('eliminar 0002 (de 0001-0004) y crear uno nuevo: el nuevo es 0002', async () => {
    for (let i = 0; i < 4; i++) await reclamarNumeroPresupuesto('u-hueco-1', 2026); // 1,2,3,4
    await liberarNumeroPresupuesto('u-hueco-1', 2026, 2);
    expect(await reclamarNumeroPresupuesto('u-hueco-1', 2026)).toBe(2);
  });

  it('eliminar 0001 y crear uno nuevo: el nuevo es 0001', async () => {
    await reclamarNumeroPresupuesto('u-hueco-2', 2026); // 1
    await reclamarNumeroPresupuesto('u-hueco-2', 2026); // 2
    await liberarNumeroPresupuesto('u-hueco-2', 2026, 1);
    expect(await reclamarNumeroPresupuesto('u-hueco-2', 2026)).toBe(1);
  });

  it('eliminar 0003 cuando existen 0001 y 0002: el nuevo vuelve a ser 0003', async () => {
    await reclamarNumeroPresupuesto('u-hueco-3', 2026); // 1
    await reclamarNumeroPresupuesto('u-hueco-3', 2026); // 2
    await reclamarNumeroPresupuesto('u-hueco-3', 2026); // 3
    await liberarNumeroPresupuesto('u-hueco-3', 2026, 3);
    expect(await reclamarNumeroPresupuesto('u-hueco-3', 2026)).toBe(3);
  });

  it('hueco intermedio: existentes 0001,0003,0004 (se liberó 0002) — el nuevo es 0002', async () => {
    for (let i = 0; i < 4; i++) await reclamarNumeroPresupuesto('u-hueco-4', 2026); // 1,2,3,4
    await liberarNumeroPresupuesto('u-hueco-4', 2026, 2);
    expect(await reclamarNumeroPresupuesto('u-hueco-4', 2026)).toBe(2);
  });

  it('borrar un número de un usuario nunca afecta a otro usuario', async () => {
    await reclamarNumeroPresupuesto('u-hueco-aislado-a', 2026); // 1
    await reclamarNumeroPresupuesto('u-hueco-aislado-b', 2026); // 1
    await liberarNumeroPresupuesto('u-hueco-aislado-a', 2026, 1);
    // B nunca tuvo un hueco liberado — su siguiente número sigue el contador normal (2), no reutiliza el 1 de A.
    expect(await reclamarNumeroPresupuesto('u-hueco-aislado-b', 2026)).toBe(2);
  });
});

// ── Concurrencia (test 13 del encargo) ───────────────────────────────────
describe('reclamarNumeroPresupuesto — concurrencia', () => {
  it('20 reclamaciones simultáneas del mismo usuario/año nunca duplican un número', async () => {
    const numeros = await Promise.all(Array.from({ length: 20 }, () => reclamarNumeroPresupuesto('u-concurrencia', 2026)));
    expect(new Set(numeros).size).toBe(20); // todos distintos
    expect([...numeros].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('reclamar y liberar simultáneamente en el mismo usuario/año no genera duplicados', async () => {
    for (let i = 0; i < 5; i++) await reclamarNumeroPresupuesto('u-concurrencia-2', 2026); // 1..5
    await liberarNumeroPresupuesto('u-concurrencia-2', 2026, 2);
    await liberarNumeroPresupuesto('u-concurrencia-2', 2026, 4);
    // Dos huecos libres (2 y 4) + una petición extra que debe caer en el contador (6).
    const numeros = await Promise.all([
      reclamarNumeroPresupuesto('u-concurrencia-2', 2026),
      reclamarNumeroPresupuesto('u-concurrencia-2', 2026),
      reclamarNumeroPresupuesto('u-concurrencia-2', 2026),
    ]);
    expect(new Set(numeros).size).toBe(3);
    expect([...numeros].sort((a, b) => a - b)).toEqual([2, 4, 6]);
  });
});

// ── Migración histórica (tests 4-5, 16-17 del encargo) ───────────────────
describe('calcularNumerosHistoricos — migración de presupuestos existentes', () => {
  it('tres presupuestos históricos: el más antiguo es 0001, el segundo 0002, el tercero 0003', () => {
    const resultado = calcularNumerosHistoricos([
      { id: 'p-medio', creado: '2026-02-22T10:00:00.000Z' },
      { id: 'p-antiguo', creado: '2026-01-03T10:00:00.000Z' },
      { id: 'p-reciente', creado: '2026-03-10T10:00:00.000Z' },
    ]);
    expect(resultado.get('p-antiguo')).toBe('PRV-0001/26');
    expect(resultado.get('p-medio')).toBe('PRV-0002/26');
    expect(resultado.get('p-reciente')).toBe('PRV-0003/26');
  });

  it('presupuestos de años distintos reinician en 0001 cada año', () => {
    const resultado = calcularNumerosHistoricos([
      { id: 'p-2025-a', creado: '2025-05-01T10:00:00.000Z' },
      { id: 'p-2026-a', creado: '2026-05-01T10:00:00.000Z' },
      { id: 'p-2026-b', creado: '2026-06-01T10:00:00.000Z' },
    ]);
    expect(resultado.get('p-2025-a')).toBe('PRV-0001/25');
    expect(resultado.get('p-2026-a')).toBe('PRV-0001/26');
    expect(resultado.get('p-2026-b')).toBe('PRV-0002/26');
  });

  it('un empate exacto de fecha se resuelve por id ascendente, nunca al azar — determinista entre ejecuciones', () => {
    const entrada = [
      { id: 'z-ultimo', creado: '2026-01-01T10:00:00.000Z' },
      { id: 'a-primero', creado: '2026-01-01T10:00:00.000Z' },
    ];
    const r1 = calcularNumerosHistoricos(entrada);
    const r2 = calcularNumerosHistoricos([...entrada].reverse());
    expect(r1.get('a-primero')).toBe('PRV-0001/26');
    expect(r1.get('z-ultimo')).toBe('PRV-0002/26');
    expect(r2).toEqual(r1); // el orden de entrada no cambia el resultado
  });

  it('no ordena por id ni alfabéticamente cuando las fechas ya distinguen el orden', () => {
    const resultado = calcularNumerosHistoricos([
      { id: 'z-pero-mas-antiguo', creado: '2026-01-01T10:00:00.000Z' },
      { id: 'a-pero-mas-reciente', creado: '2026-06-01T10:00:00.000Z' },
    ]);
    expect(resultado.get('z-pero-mas-antiguo')).toBe('PRV-0001/26');
    expect(resultado.get('a-pero-mas-reciente')).toBe('PRV-0002/26');
  });

  it('nunca sobrescribe un numeroPresupuesto ya asignado, y no reutiliza ese número para otro', () => {
    const resultado = calcularNumerosHistoricos([
      { id: 'p-ya-numerado', creado: '2026-01-01T10:00:00.000Z', numeroPresupuesto: 'PRV-0001/26' },
      { id: 'p-sin-numerar', creado: '2026-02-01T10:00:00.000Z' },
    ]);
    expect(resultado.has('p-ya-numerado')).toBe(false); // no se toca — el llamante nunca actualiza este id
    expect(resultado.get('p-sin-numerar')).toBe('PRV-0002/26'); // salta el 0001 ya ocupado
  });

  it('es una función pura: no muta los objetos de entrada', () => {
    const entrada = [{ id: 'p1', creado: '2026-01-01T10:00:00.000Z' }];
    const copia = JSON.parse(JSON.stringify(entrada));
    calcularNumerosHistoricos(entrada);
    expect(entrada).toEqual(copia);
  });
});

// ── Integración real: guardarPresupuesto/borrarPresupuesto ──────────────
describe('guardarPresupuesto — numeración en el flujo real', () => {
  const USUARIO = 'usuario-numeracion-flujo';

  beforeEach(async () => {
    await ClienteModel.create({ id: 'c-num', usuarioId: USUARIO, nombre: 'Cliente de prueba', creado: new Date().toISOString() });
  });

  it('la creación inicial (equivalente a abrir una plantilla) NO consume ningún número', async () => {
    const creado = await svc.guardarPresupuesto(presupuestoBase('pr-plantilla', 'c-num', USUARIO, '2026-05-01T10:00:00.000Z'), USUARIO);
    expect((creado as any).numeroPresupuesto).toBe('');
  });

  it('el primer guardado real (una edición posterior) sí asigna número', async () => {
    await svc.guardarPresupuesto(presupuestoBase('pr-real', 'c-num', USUARIO, '2026-05-01T10:00:00.000Z'), USUARIO);
    const editado = await svc.guardarPresupuesto({ ...presupuestoBase('pr-real', 'c-num', USUARIO, '2026-05-01T10:00:00.000Z'), titulo: 'Título editado' }, USUARIO);
    expect((editado as any).numeroPresupuesto).toBe('PRV-0001/26');
  });

  it('editar de nuevo no cambia el número ya asignado', async () => {
    await svc.guardarPresupuesto(presupuestoBase('pr-estable', 'c-num', USUARIO, '2026-05-01T10:00:00.000Z'), USUARIO);
    const primeraVez = await svc.guardarPresupuesto({ ...presupuestoBase('pr-estable', 'c-num', USUARIO, '2026-05-01T10:00:00.000Z'), titulo: 'v2' }, USUARIO);
    const segundaVez = await svc.guardarPresupuesto({ ...presupuestoBase('pr-estable', 'c-num', USUARIO, '2026-05-01T10:00:00.000Z'), titulo: 'v3' }, USUARIO);
    expect((primeraVez as any).numeroPresupuesto).toBe((segundaVez as any).numeroPresupuesto);
  });

  it('guardar varias veces más no vuelve a cambiar el número (idempotente tras la primera asignación)', async () => {
    await svc.guardarPresupuesto(presupuestoBase('pr-repetido', 'c-num', USUARIO, '2026-05-01T10:00:00.000Z'), USUARIO);
    const numeros: string[] = [];
    for (let i = 0; i < 4; i++) {
      const doc = await svc.guardarPresupuesto({ ...presupuestoBase('pr-repetido', 'c-num', USUARIO, '2026-05-01T10:00:00.000Z'), titulo: `v${i}` }, USUARIO);
      numeros.push((doc as any).numeroPresupuesto);
    }
    expect(new Set(numeros).size).toBe(1);
  });

  it('borrar un presupuesto numerado y crear/editar otro reutiliza su número', async () => {
    await svc.guardarPresupuesto(presupuestoBase('pr-a-borrar', 'c-num', USUARIO, '2026-05-01T10:00:00.000Z'), USUARIO);
    await svc.guardarPresupuesto({ ...presupuestoBase('pr-a-borrar', 'c-num', USUARIO, '2026-05-01T10:00:00.000Z'), titulo: 'v2' }, USUARIO); // asigna PRV-0001/26
    await svc.borrarPresupuesto('pr-a-borrar', USUARIO);

    await svc.guardarPresupuesto(presupuestoBase('pr-nuevo', 'c-num', USUARIO, '2026-05-02T10:00:00.000Z'), USUARIO);
    const numerado = await svc.guardarPresupuesto({ ...presupuestoBase('pr-nuevo', 'c-num', USUARIO, '2026-05-02T10:00:00.000Z'), titulo: 'v2' }, USUARIO);
    expect((numerado as any).numeroPresupuesto).toBe('PRV-0001/26');
  });
});

// ── Migración: no toca otros campos (tests 16-17 del encargo) ────────────
describe('Migración — solo toca numeroPresupuesto, nunca otros campos', () => {
  it('asignar el número (simulando la migración) no cambia creado/actualizado ni ningún otro dato', async () => {
    await conectar();
    const antes = {
      id: 'p-migracion', usuarioId: 'u-migracion', clienteId: 'c-migracion',
      titulo: 'Cocina original', formato: 'simple' as const, precioTotal: 4321,
      items: [], alcance: ['Bullet 1'], creado: '2026-01-15T09:00:00.000Z', actualizado: '2026-01-15T09:00:00.000Z',
    };
    await PresupuestoModel.create(antes);

    const numeros = calcularNumerosHistoricos([{ id: antes.id, creado: antes.creado }]);
    await PresupuestoModel.updateOne({ id: antes.id }, { $set: { numeroPresupuesto: numeros.get(antes.id) } });

    const despues = await PresupuestoModel.findOne({ id: antes.id }).lean().exec() as any;
    expect(despues.numeroPresupuesto).toBe('PRV-0001/26');
    expect(despues.creado).toBe(antes.creado);
    expect(despues.actualizado).toBe(antes.actualizado);
    expect(despues.titulo).toBe(antes.titulo);
    expect(despues.precioTotal).toBe(antes.precioTotal);
    expect(despues.alcance).toEqual(antes.alcance);
    expect(despues.clienteId).toBe(antes.clienteId);
  });
});

// ── Facturas: confirmar que NO se ha tocado nada (tests 18-19 del encargo) ──
describe('Factura.numeroFactura — sin cambios (regla explícita: no tocar facturas en este encargo)', () => {
  const USUARIO = 'usuario-numeracion-facturas';

  it('numeroFactura sigue siendo texto libre externo, tal cual se guarda — nunca autogenerado', async () => {
    const guardada = await svc.guardarFactura({
      id: 'f-numeracion-1', tipo: 'ingreso', fecha: '2026-05-01', importe: 500,
      concepto: 'Trabajo', proveedor: '', clienteId: '', imagen: '', imagenes: [],
      numeroFactura: '2026/154', creado: new Date().toISOString(),
    } as any, USUARIO);
    expect((guardada as any).numeroFactura).toBe('2026/154'); // el número externo, intacto
  });

  it('una factura de ingreso SIN numeroFactura no recibe ningún número FAC generado', async () => {
    const guardada = await svc.guardarFactura({
      id: 'f-numeracion-2', tipo: 'ingreso', fecha: '2026-05-01', importe: 300,
      concepto: 'Trabajo sin número', proveedor: '', clienteId: '', imagen: '', imagenes: [],
      creado: new Date().toISOString(),
    } as any, USUARIO);
    expect((guardada as any).numeroFactura).toBe(''); // nunca se inventa un FAC-2026-0001
    // Ninguno de los campos que la especificación anterior proponía (y esta corrección prohíbe explícitamente) existe en el documento guardado.
    expect(guardada).not.toHaveProperty('numeroFacturaPropio');
    expect(guardada).not.toHaveProperty('contadorFactura');
    expect(guardada).not.toHaveProperty('serieFactura');
  });
});
