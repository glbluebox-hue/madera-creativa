import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { ClienteModel, ProyectoModel, PresupuestoModel, EmpresaModel } from './cliente.model.js';

/**
 * Regresión de Inteligencia de Precios (Fase 1) contra una MongoDB en
 * memoria (nunca Atlas real) — cubre el snapshot `analisisPrecio` que se
 * congela al aceptar un presupuesto (`ejecutarConsecuenciasAceptacion`,
 * `presupuestos-service.ts`), incluyendo el aislamiento por `usuarioId`
 * pedido explícitamente en el plan de pruebas (caso 9) y la compatibilidad
 * con presupuestos/proyectos antiguos sin estos campos (caso 5).
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

const USUARIO_A = 'usuario-a-precio-test';
const USUARIO_B = 'usuario-b-precio-test';

function clienteBase(id: string, usuarioId: string) {
  return { id, usuarioId, nombre: 'Cliente de prueba', creado: new Date().toISOString() };
}

function proyectoBase(id: string, clienteId: string, usuarioId: string, extra: Record<string, unknown> = {}) {
  return {
    id, usuarioId, clienteId, tarifaHora: 20,
    movimientos: [{ id: 'm1', fecha: '2026-08-01', concepto: 'Material', tipo: 'gasto', importe: 500 }],
    horas: [{ id: 'h1', fecha: '2026-08-01', tarea: 'Montaje', horas: 10 }],
    creado: new Date().toISOString(),
    ...extra,
  };
}

function presupuestoBase(id: string, clienteId: string, proyectoId: string, usuarioId: string, precioTotal: number) {
  const ahora = new Date().toISOString();
  return {
    id, usuarioId, clienteId, proyectoId, titulo: 'Presupuesto de prueba', formato: 'simple' as const,
    precioTotal, items: [], alcance: [], creado: ahora, actualizado: ahora,
  };
}

/**
 * `aceptarPresupuesto` dispara `ejecutarConsecuenciasAceptacion` como
 * "mejor esfuerzo" SIN esperarla (`.catch()` sin `await`, a propósito —
 * ver el comentario junto a esa llamada en `presupuestos-service.ts`: la
 * respuesta al usuario no debe depender de estos pasos secundarios). Contra
 * MongoMemoryServer, sin latencia de red real, esa tarea de fondo termina
 * en milisegundos — esta espera fija es deliberada, no una comprobación
 * frágil por sondeo.
 */
const esperarConsecuencias = () => new Promise((resolve) => setTimeout(resolve, 150));

/**
 * Sondea hasta que `analisisPrecio` aparezca, en vez de esperar un
 * `setTimeout` fijo y luego leer una sola vez — Fase 3.1 (05/09/2026).
 * `ejecutarConsecuenciasAceptacion` se dispara sin esperarla
 * (fire-and-forget, a propósito, ver el comentario junto a esa llamada en
 * `presupuestos-service.ts`: "mejor esfuerzo"), y cuánto tarda en terminar
 * de verdad no es una constante: con la suite completa ejecutando muchos
 * archivos de test a la vez, `esperarConsecuencias()` (150ms fijos) a
 * veces perdía la carrera bajo esa carga — fallo intermitente real,
 * confirmado con la suite completa: `analisisPrecio` seguía `null` en la
 * lectura. Sondear la condición real, acotada con un tiempo máximo
 * generoso, elimina la carrera sin inventar un número mayor que
 * "probablemente" alcance — y termina en cuanto la condición se cumple,
 * sin ralentizar el caso normal.
 *
 * Los tests que esperan analisisPrecio AUSENTE (Empresa sin margen
 * objetivo configurado) no sufren esta carrera — su resultado es el mismo
 * si se comprueba antes o después de que termine la tarea de fondo, así
 * que esos siguen usando `esperarConsecuencias()` tal cual.
 */
async function esperarAnalisisPrecio(leer: () => Promise<any>, timeoutMs = 3000): Promise<any> {
  const inicio = Date.now();
  for (;;) {
    const doc = await leer();
    if (doc?.analisisPrecio) return doc;
    if (Date.now() - inicio >= timeoutMs) {
      throw new Error(`Tiempo agotado (${timeoutMs}ms) esperando a que analisisPrecio se congelara.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
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
    ClienteModel.deleteMany({}), ProyectoModel.deleteMany({}),
    PresupuestoModel.deleteMany({}), EmpresaModel.deleteMany({}),
  ]);
});

describe('aceptarPresupuesto — snapshot de análisis de precio (Fase 1)', () => {
  it('congela analisisPrecio al aceptar cuando hay coste y objetivo configurados', async () => {
    await ClienteModel.create(clienteBase('c1', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p1', 'c1', USUARIO_A));
    await PresupuestoModel.create(presupuestoBase('pr1', 'c1', 'p1', USUARIO_A, 1000));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });

    await svc.aceptarPresupuesto('pr1', USUARIO_A);
    const doc = await esperarAnalisisPrecio(() => PresupuestoModel.findOne({ id: 'pr1' }).lean().exec());
    expect(doc.analisisPrecio).toBeTruthy();
    expect(doc.analisisPrecio.costeEstimado).toBe(700); // 500 gasto + 10h*20€/h
    expect(doc.analisisPrecio.margenPorcentaje).toBeCloseTo(30, 5);
    expect(doc.analisisPrecio.estado).toBe('cerca'); // 30% vs objetivo 35% -> -5 puntos, dentro del umbral
  });

  it('no escribe analisisPrecio si no hay margen objetivo configurado (Empresa sin configurar)', async () => {
    await ClienteModel.create(clienteBase('c2', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p2', 'c2', USUARIO_A));
    await PresupuestoModel.create(presupuestoBase('pr2', 'c2', 'p2', USUARIO_A, 1000));
    // Sin EmpresaModel.create — simula un usuario que nunca configuró Ajustes de empresa.

    await svc.aceptarPresupuesto('pr2', USUARIO_A);
    await esperarConsecuencias();
    const doc = await PresupuestoModel.findOne({ id: 'pr2' }).lean().exec() as any;
    expect(doc.analisisPrecio).toBeFalsy();
  });

  it('un guardado normal (PUT) nunca puede pisar analisisPrecio ya congelado', async () => {
    await ClienteModel.create(clienteBase('c3', USUARIO_A));
    await ProyectoModel.create(proyectoBase('p3', 'c3', USUARIO_A));
    await PresupuestoModel.create(presupuestoBase('pr3', 'c3', 'p3', USUARIO_A, 1000));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });
    await svc.aceptarPresupuesto('pr3', USUARIO_A);
    const aceptado = await esperarAnalisisPrecio(() => svc.obtenerPresupuesto('pr3', USUARIO_A)) as any;
    expect(aceptado.analisisPrecio).toBeTruthy();
    // guardarPresupuesto pasa por esquemaPresupuestoMC (Zod), que no incluye
    // analisisPrecio — igual que ya ocurre con `estado`/`firmaClienteUrl`.
    // Aquí se simula ese filtrado (el propio objeto no lo lleva) y se
    // confirma que guardarPresupuesto no lo borra por su ausencia.
    const { analisisPrecio, ...sinAnalisis } = aceptado;
    await svc.guardarPresupuesto({ ...sinAnalisis, titulo: 'Título editado' }, USUARIO_A);
    const releido = await svc.obtenerPresupuesto('pr3', USUARIO_A) as any;
    expect(releido.titulo).toBe('Título editado');
    expect(releido.analisisPrecio).toBeTruthy();
  });

  // Caso 9 del plan de pruebas: aislamiento entre empresas/usuarios.
  // Nota: `Cliente.id`/`Proyecto.id`/`Presupuesto.id` tienen un índice
  // ÚNICO GLOBAL (no compuesto con usuarioId, confirmado al ejecutar este
  // test por primera vez: `E11000 duplicate key` al intentar reutilizar el
  // mismo id para dos usuarios) — un id nunca puede colisionar entre
  // cuentas, así que el escenario real de riesgo no es "mismo id, dos
  // dueños" sino que el análisis de A use, por un fallo de scoping en la
  // consulta, el margen objetivo o el proyecto de B. Se verifica creando
  // datos MUY distintos para cada usuario y comprobando que el snapshot de
  // A solo refleja los suyos.
  it('aislamiento: el análisis de un usuario nunca usa el proyecto/objetivo de otro', async () => {
    await ClienteModel.create(clienteBase('cliente-a', USUARIO_A));
    await ClienteModel.create(clienteBase('cliente-b', USUARIO_B));
    await ProyectoModel.create(proyectoBase('proyecto-a', 'cliente-a', USUARIO_A));
    // Proyecto de B con costes disparatados — si hubiera fuga de scoping, contaminaría el resultado de A.
    await ProyectoModel.create(proyectoBase('proyecto-b', 'cliente-b', USUARIO_B, {
      movimientos: [{ id: 'm-fuga', fecha: '2026-08-01', concepto: 'Fuga', tipo: 'gasto', importe: 999999 }], horas: [],
    }));
    await PresupuestoModel.create(presupuestoBase('pr-a', 'cliente-a', 'proyecto-a', USUARIO_A, 1000));
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });
    await EmpresaModel.create({ usuarioId: USUARIO_B, margenObjetivoPorcentaje: 99 }); // objetivo disparatado de B, no debe filtrarse a A

    await svc.aceptarPresupuesto('pr-a', USUARIO_A);
    const doc = await esperarAnalisisPrecio(() => PresupuestoModel.findOne({ id: 'pr-a' }).lean().exec());
    expect(doc.analisisPrecio.costeEstimado).toBe(700); // nunca los 999999 del proyecto de B
    expect(doc.analisisPrecio.margenObjetivoPorcentaje).toBe(35); // nunca el 99 de la empresa de B
  });

  // Caso 5 del plan de pruebas: presupuesto/proyecto antiguo sin los campos nuevos.
  it('presupuesto antiguo sin proyectoId ni analisisPrecio se acepta sin romperse', async () => {
    await ClienteModel.create(clienteBase('c5', USUARIO_A));
    const legado = presupuestoBase('pr5', 'c5', '', USUARIO_A, 500);
    await PresupuestoModel.create(legado);
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });

    await expect(svc.aceptarPresupuesto('pr5', USUARIO_A)).resolves.toBeTruthy();
    await esperarConsecuencias();
    const doc = await PresupuestoModel.findOne({ id: 'pr5' }).lean().exec() as any;
    expect(doc.estado).toBe('aceptado');
    expect(doc.analisisPrecio).toBeFalsy(); // sin proyecto vinculado -> sin datos, nunca inventado
  });
});

/**
 * `analizarPresupuestosAceptados` — detección automática (ajuste
 * 28/08/2026) de presupuestos ya aceptados ANTES de que existiera el
 * snapshot al aceptar, o aceptados sin margen objetivo configurado
 * todavía. Los presupuestos se crean aquí ya con `estado:'aceptado'`
 * directamente en el Model (nunca vía `svc.aceptarPresupuesto`), a
 * propósito: así se simula exactamente el caso real reportado — un
 * presupuesto que YA estaba aceptado y nunca pasó por la transición que
 * dispara el cálculo.
 */
describe('analizarPresupuestosAceptados — detección automática (ajuste 28/08/2026)', () => {
  // Caso A: aceptado + proyecto + gastos + horas -> aparece automáticamente.
  it('A. calcula y persiste el análisis de un presupuesto ya aceptado con gastos y horas', async () => {
    await ClienteModel.create(clienteBase('cA', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pA', 'cA', USUARIO_A));
    await PresupuestoModel.create({ ...presupuestoBase('prA', 'cA', 'pA', USUARIO_A, 1000), estado: 'aceptado' });
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });

    const resultado = await svc.analizarPresupuestosAceptados(USUARIO_A);
    const prA = resultado.find((p: any) => p.id === 'prA') as any;
    expect(prA.analisisPrecio).toBeTruthy();
    expect(prA.analisisPrecio.costeEstimado).toBe(700);

    // Debe quedar persistido, no solo en la respuesta en memoria.
    const doc = await PresupuestoModel.findOne({ id: 'prA' }).lean().exec() as any;
    expect(doc.analisisPrecio).toBeTruthy();
  });

  // Caso B: aceptado + proyecto + solo gastos (sin horas) -> calcula igual.
  it('B. calcula con solo gastos registrados (sin horas)', async () => {
    await ClienteModel.create(clienteBase('cB', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pB', 'cB', USUARIO_A, { horas: [] }));
    await PresupuestoModel.create({ ...presupuestoBase('prB', 'cB', 'pB', USUARIO_A, 1000), estado: 'aceptado' });
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });

    const resultado = await svc.analizarPresupuestosAceptados(USUARIO_A);
    const prB = resultado.find((p: any) => p.id === 'prB') as any;
    expect(prB.analisisPrecio.costeEstimado).toBe(500); // solo el gasto, sin mano de obra
  });

  // Caso C: aceptado + proyecto + solo horas (sin gastos) -> calcula igual.
  it('C. calcula con solo horas registradas (sin gastos)', async () => {
    await ClienteModel.create(clienteBase('cC', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pC', 'cC', USUARIO_A, { movimientos: [] }));
    await PresupuestoModel.create({ ...presupuestoBase('prC', 'cC', 'pC', USUARIO_A, 1000), estado: 'aceptado' });
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });

    const resultado = await svc.analizarPresupuestosAceptados(USUARIO_A);
    const prC = resultado.find((p: any) => p.id === 'prC') as any;
    expect(prC.analisisPrecio.costeEstimado).toBe(200); // 10h * 20€/h, sin gastos
  });

  // Caso D: aceptado sin proyecto -> nunca inventa un coste.
  it('D. no calcula (y no persiste) un presupuesto aceptado sin proyecto vinculado', async () => {
    await ClienteModel.create(clienteBase('cD', USUARIO_A));
    await PresupuestoModel.create({ ...presupuestoBase('prD', 'cD', '', USUARIO_A, 1000), estado: 'aceptado' });
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });

    const resultado = await svc.analizarPresupuestosAceptados(USUARIO_A);
    const prD = resultado.find((p: any) => p.id === 'prD') as any;
    expect(prD.analisisPrecio).toBeFalsy();
  });

  // Caso E: proyecto sin datos suficientes -> queda "pendiente de datos".
  it('E. deja pendiente (sin analisisPrecio) un proyecto sin gastos ni horas', async () => {
    await ClienteModel.create(clienteBase('cE', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pE', 'cE', USUARIO_A, { movimientos: [], horas: [] }));
    await PresupuestoModel.create({ ...presupuestoBase('prE', 'cE', 'pE', USUARIO_A, 1000), estado: 'aceptado' });
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });

    const resultado = await svc.analizarPresupuestosAceptados(USUARIO_A);
    const prE = resultado.find((p: any) => p.id === 'prE') as any;
    expect(prE.analisisPrecio).toBeFalsy();
  });

  // Caso F: varios presupuestos -> se agregan todos correctamente en una sola llamada.
  it('F. procesa varios presupuestos a la vez, cada uno con su propio resultado', async () => {
    await ClienteModel.create(clienteBase('cF', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pF1', 'cF', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pF2', 'cF', USUARIO_A, { movimientos: [], horas: [] }));
    await PresupuestoModel.create({ ...presupuestoBase('prF1', 'cF', 'pF1', USUARIO_A, 1000), estado: 'aceptado' });
    await PresupuestoModel.create({ ...presupuestoBase('prF2', 'cF', 'pF2', USUARIO_A, 2000), estado: 'aceptado' });
    await PresupuestoModel.create({ ...presupuestoBase('prF3', 'cF', '', USUARIO_A, 3000), estado: 'aceptado' });
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });

    const resultado = await svc.analizarPresupuestosAceptados(USUARIO_A);
    expect(resultado.length).toBe(3);
    const porId = new Map(resultado.map((p: any) => [p.id, p]));
    expect((porId.get('prF1') as any).analisisPrecio).toBeTruthy();
    expect((porId.get('prF2') as any).analisisPrecio).toBeFalsy();
    expect((porId.get('prF3') as any).analisisPrecio).toBeFalsy();
  });

  // Caso G: aislamiento — nunca mezclar datos de otra empresa/usuario.
  it('G. nunca calcula con el proyecto o el objetivo de otro usuario', async () => {
    await ClienteModel.create(clienteBase('cG-a', USUARIO_A));
    await ClienteModel.create(clienteBase('cG-b', USUARIO_B));
    await ProyectoModel.create(proyectoBase('pG-a', 'cG-a', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pG-b', 'cG-b', USUARIO_B, {
      movimientos: [{ id: 'm-fuga', fecha: '2026-08-01', concepto: 'Fuga', tipo: 'gasto', importe: 999999 }], horas: [],
    }));
    await PresupuestoModel.create({ ...presupuestoBase('prG-a', 'cG-a', 'pG-a', USUARIO_A, 1000), estado: 'aceptado' });
    await PresupuestoModel.create({ ...presupuestoBase('prG-b', 'cG-b', 'pG-b', USUARIO_B, 1000), estado: 'aceptado' });
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });
    await EmpresaModel.create({ usuarioId: USUARIO_B, margenObjetivoPorcentaje: 99 });

    const resultadoA = await svc.analizarPresupuestosAceptados(USUARIO_A);
    expect(resultadoA.length).toBe(1); // nunca ve el presupuesto de B
    const prGa = resultadoA[0] as any;
    expect(prGa.analisisPrecio.costeEstimado).toBe(700); // nunca los 999999 del proyecto de B
    expect(prGa.analisisPrecio.margenObjetivoPorcentaje).toBe(35); // nunca el 99 de B
  });

  // Caso H: presupuesto antiguo (campos mínimos, sin los que se añadieron en fases posteriores).
  it('H. no rompe con un presupuesto antiguo con solo los campos mínimos', async () => {
    await ClienteModel.create(clienteBase('cH', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pH', 'cH', USUARIO_A));
    const ahora = new Date().toISOString();
    await PresupuestoModel.create({
      id: 'prH', usuarioId: USUARIO_A, clienteId: 'cH', proyectoId: 'pH',
      titulo: 'Presupuesto antiguo', precioTotal: 1000, estado: 'aceptado',
      creado: ahora, actualizado: ahora,
    });
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });

    await expect(svc.analizarPresupuestosAceptados(USUARIO_A)).resolves.toBeTruthy();
    const resultado = await svc.analizarPresupuestosAceptados(USUARIO_A);
    const prH = resultado.find((p: any) => p.id === 'prH') as any;
    expect(prH.analisisPrecio).toBeTruthy();
  });

  // Caso I: un presupuesto que YA tiene snapshot nunca se sobrescribe.
  it('I. no sobrescribe un analisisPrecio ya existente, aunque el coste actual del proyecto haya cambiado', async () => {
    await ClienteModel.create(clienteBase('cI', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pI', 'cI', USUARIO_A));
    const snapshotOriginal = {
      precio: 1000, costeEstimado: 111, margenPorcentaje: 88.9, margenObjetivoPorcentaje: 35,
      diferenciaPuntos: 53.9, estado: 'por_encima', fecha: '2020-01-01T00:00:00.000Z',
    };
    await PresupuestoModel.create({ ...presupuestoBase('prI', 'cI', 'pI', USUARIO_A, 1000), estado: 'aceptado', analisisPrecio: snapshotOriginal });
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });

    const resultado = await svc.analizarPresupuestosAceptados(USUARIO_A);
    const prI = resultado.find((p: any) => p.id === 'prI') as any;
    expect(prI.analisisPrecio.costeEstimado).toBe(111); // el valor original, no el 700 recalculable ahora
    expect(prI.analisisPrecio.fecha).toBe('2020-01-01T00:00:00.000Z');
  });

  // Caso J: nunca lanza, ni con datos numéricos atípicos (Mongoose ya
  // rechaza NaN/no-numéricos al guardar — lo atípico-pero-válido que sí
  // puede llegar a persistirse es, por ejemplo, un importe negativo).
  it('J. nunca lanza con datos numéricos atípicos pero válidos (importe negativo)', async () => {
    await ClienteModel.create(clienteBase('cJ', USUARIO_A));
    await ProyectoModel.create(proyectoBase('pJ', 'cJ', USUARIO_A, {
      movimientos: [{ id: 'm1', fecha: '2026-08-01', concepto: 'raro', tipo: 'gasto', importe: -500 }],
    }));
    await PresupuestoModel.create({ ...presupuestoBase('prJ', 'cJ', 'pJ', USUARIO_A, 1000), estado: 'aceptado' });
    await EmpresaModel.create({ usuarioId: USUARIO_A, margenObjetivoPorcentaje: 35 });

    await expect(svc.analizarPresupuestosAceptados(USUARIO_A)).resolves.toBeTruthy();
  });
});
