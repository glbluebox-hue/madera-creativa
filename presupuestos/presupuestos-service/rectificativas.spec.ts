import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService, ErrorDeNegocio } from './presupuestos-service.js';
import { FacturaModel } from './cliente.model.js';

/**
 * Bloque A/B (25/09/2026) — pruebas de integración de facturas
 * rectificativas: validación en `guardarFactura` (autorreferencia, original
 * inexistente, original de OTRA cuenta — aislamiento multi-tenant real, no
 * simulado) y consistencia entre `resumenFacturas()`/`resumenEconomico()`
 * (las dos agregaciones Mongo del Dashboard) y la regla de signo que aplica
 * el motor fiscal — ver `motor-fiscal.spec.ts` para las pruebas puras
 * (unitarias, sin red) de `signoPorNaturaleza`/`validarRectificativa`.
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();
const USUARIO = 'usuario-rectificativas-test';
const OTRO_USUARIO = 'usuario-rectificativas-test-otro';

function facturaBase(id: string, usuarioId: string, extra: Record<string, unknown> = {}) {
  return {
    id, usuarioId, tipo: 'gasto' as const, fecha: '2026-09-01',
    importe: 100, creado: new Date().toISOString(),
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
  await FacturaModel.deleteMany({});
});

describe('guardarFactura — validación de rectificativas', () => {
  it('rechaza una rectificativa que se referencia a sí misma como original', async () => {
    await expect(
      svc.guardarFactura({ id: 'r1', tipo: 'gasto', fecha: '2026-09-10', importe: 300, naturaleza: 'rectificativa', facturaOriginalId: 'r1', creado: new Date().toISOString() }, USUARIO)
    ).rejects.toThrow(ErrorDeNegocio);
  });

  it('rechaza una rectificativa cuya factura original no existe', async () => {
    await expect(
      svc.guardarFactura({ id: 'r1', tipo: 'gasto', fecha: '2026-09-10', importe: 300, naturaleza: 'rectificativa', facturaOriginalId: 'no-existe', creado: new Date().toISOString() }, USUARIO)
    ).rejects.toThrow(ErrorDeNegocio);
  });

  it('rechaza una rectificativa cuya factura original pertenece a OTRO usuario — aislamiento multi-tenant real', async () => {
    await FacturaModel.create(facturaBase('f-otro', OTRO_USUARIO, { importe: 1000 }));

    await expect(
      svc.guardarFactura({ id: 'r1', tipo: 'gasto', fecha: '2026-09-10', importe: 300, naturaleza: 'rectificativa', facturaOriginalId: 'f-otro', creado: new Date().toISOString() }, USUARIO)
    ).rejects.toThrow(ErrorDeNegocio);

    // La factura del otro usuario existe de verdad (no es un problema de datos) — confirma que
    // el rechazo es por aislamiento, no porque el id estuviera mal escrito.
    const existe = await FacturaModel.findOne({ id: 'f-otro', usuarioId: OTRO_USUARIO }).lean().exec();
    expect(existe).not.toBe(null);
  });

  it('acepta una rectificativa válida cuyo importe acumulado SUPERA el de la original (solo advertencia interna, no bloquea)', async () => {
    await FacturaModel.create(facturaBase('f1', USUARIO, { importe: 500 }));

    const guardada = await svc.guardarFactura(
      { id: 'r1', tipo: 'gasto', fecha: '2026-09-10', importe: 800, naturaleza: 'rectificativa', facturaOriginalId: 'f1', creado: new Date().toISOString() },
      USUARIO
    );
    expect((guardada as any).id).toBe('r1');
    expect((guardada as any).naturaleza).toBe('rectificativa');
  });

  it('acepta una rectificativa válida dentro del importe de la original, sin advertencias', async () => {
    await FacturaModel.create(facturaBase('f1', USUARIO, { importe: 1000 }));

    const guardada = await svc.guardarFactura(
      { id: 'r1', tipo: 'gasto', fecha: '2026-09-10', importe: 300, naturaleza: 'rectificativa', facturaOriginalId: 'f1', motivoRectificacion: 'devolucion_mercancia', creado: new Date().toISOString() },
      USUARIO
    );
    expect((guardada as any).importe).toBe(300);
    expect((guardada as any).motivoRectificacion).toBe('devolucion_mercancia');
  });

  it('una factura normal (naturaleza ausente o "normal") no pasa por ninguna validación de rectificativa', async () => {
    const guardada = await svc.guardarFactura(
      { id: 'g1', tipo: 'gasto', fecha: '2026-09-10', importe: 100, creado: new Date().toISOString() },
      USUARIO
    );
    expect((guardada as any).id).toBe('g1');
  });
});

describe('Consistencia entre resumenFacturas()/resumenEconomico() y la regla de signo del motor fiscal (test 26)', () => {
  it('resumenFacturas() aplica el mismo signo que signoPorNaturaleza — una rectificativa resta, nunca se cuenta aparte', async () => {
    await FacturaModel.create(facturaBase('g1', USUARIO, { tipo: 'gasto', importe: 1000, naturaleza: 'normal' }));
    await FacturaModel.create(facturaBase('r1', USUARIO, { tipo: 'gasto', importe: 300, naturaleza: 'rectificativa', facturaOriginalId: 'g1' }));
    await FacturaModel.create(facturaBase('i1', USUARIO, { tipo: 'ingreso', importe: 2000, naturaleza: 'normal' }));

    const resumen = await svc.resumenFacturas(USUARIO);

    // Cálculo manual con la MISMA regla (signoPorNaturaleza): 1000 - 300 = 700.
    expect(resumen.totalGastos).toBe(700);
    expect(resumen.totalIngresos).toBe(2000);
    expect(resumen.balance).toBe(2000 - 700);
    // El conteo de documentos NO lleva signo — la rectificativa sigue siendo un documento de gasto.
    expect(resumen.numGastos).toBe(2);
  });

  it('resumenEconomico() aplica el mismo signo que resumenFacturas() para el mismo conjunto de facturas — ambas fuentes del Dashboard coinciden', async () => {
    await FacturaModel.create(facturaBase('g1', USUARIO, { tipo: 'gasto', importe: 1000, fecha: '2026-09-05', naturaleza: 'normal' }));
    await FacturaModel.create(facturaBase('r1', USUARIO, { tipo: 'gasto', importe: 300, fecha: '2026-09-10', naturaleza: 'rectificativa', facturaOriginalId: 'g1' }));

    const [resumenTotal, resumenPeriodo] = await Promise.all([
      svc.resumenFacturas(USUARIO),
      svc.resumenEconomico(USUARIO, { desde: '2026-09-01', hasta: '2026-09-30' }),
    ]);

    // Sin desglose fiscal (baseImponible/importeImpuesto ausentes) → `base` cae en `importeSinDesglose`,
    // que también debe llevar el mismo signo — las dos fuentes deben coincidir en el resultado.
    expect(resumenPeriodo.gastos.base).toBe(resumenTotal.totalGastos);
    expect(resumenPeriodo.gastos.base).toBe(700);
  });

  it('una rectificativa de INGRESO resta de ingresos en ambas fuentes por igual, nunca se mueve a gastos', async () => {
    await FacturaModel.create(facturaBase('i1', USUARIO, { tipo: 'ingreso', importe: 5000, fecha: '2026-09-05' }));
    await FacturaModel.create(facturaBase('r1', USUARIO, { tipo: 'ingreso', importe: 500, fecha: '2026-09-12', naturaleza: 'rectificativa', facturaOriginalId: 'i1' }));

    const [resumenTotal, resumenPeriodo] = await Promise.all([
      svc.resumenFacturas(USUARIO),
      svc.resumenEconomico(USUARIO, { desde: '2026-09-01', hasta: '2026-09-30' }),
    ]);

    expect(resumenTotal.totalIngresos).toBe(4500);
    expect(resumenTotal.totalGastos).toBe(0);
    expect(resumenPeriodo.ingresos.base).toBe(4500);
  });

  /**
   * Test end-to-end de consistencia REAL frontend↔backend (cierre del riesgo
   * #4 de la revisión de diff, 25/09/2026 — el único de los 26 casos
   * pedidos por el usuario que NO tenía todavía ningún test real cruzando
   * los dos lados, solo `resumenFacturas()`/`resumenEconomico()` entre sí).
   *
   * QUÉ GARANTIZA: que la fórmula documentada de `calcularTrimestres()`
   * (frontend, `presupuestos-prototype/motor-fiscal.ts`, líneas ~330-331:
   * `ingresos = Σ importe·signoPorNaturaleza(f)` para tipo='ingreso',
   * `gastos` igual para tipo='gasto') produce EXACTAMENTE el mismo número
   * que `resumenFacturas()`/`resumenEconomico()` (backend, agregación Mongo
   * real vía `SIGNO_NATURALEZA_MONGO`) para el MISMO conjunto de facturas:
   * normal de ingreso, normal de gasto, rectificativa de ingreso,
   * rectificativa de gasto, factura con IVA, factura con IGIC.
   *
   * QUÉ NO GARANTIZA: no importa literalmente `calcularTrimestres` del
   * frontend (no es viable — `presupuestos-prototype` y `presupuestos-service`
   * son apps Bit independientes sin ningún paquete compartido entre ellas,
   * confirmado sin ningún import cruzado en todo el proyecto; ver también el
   * test "espejo" de `signoPorNaturaleza` en `motor-fiscal.spec.ts` de ambos
   * lados). La mitad frontend de esta comparación es una reimplementación
   * literal, escrita a mano en este mismo test, de la fórmula que el
   * comentario de `calcularTrimestres` documenta — si el frontend cambiara
   * esa fórmula sin que alguien actualice también esta copia, este test NO
   * lo detectaría solo con volver a leer el código real del frontend (sí
   * detectaría una regresión del lado backend, porque ese sí se ejecuta de
   * verdad contra MongoDB real).
   */
  it('calcularTrimestres() (fórmula del frontend, reimplementada aquí) coincide con resumenFacturas()/resumenEconomico() (backend, Mongo real) para el mismo conjunto de facturas', async () => {
    const facturas = [
      facturaBase('ing-normal', USUARIO, { tipo: 'ingreso', importe: 5000, fecha: '2026-09-05' }),
      facturaBase('gas-normal', USUARIO, { tipo: 'gasto', importe: 1000, fecha: '2026-09-06' }),
      facturaBase('ing-rect', USUARIO, { tipo: 'ingreso', importe: 400, fecha: '2026-09-10', naturaleza: 'rectificativa', facturaOriginalId: 'ing-normal' }),
      facturaBase('gas-rect', USUARIO, { tipo: 'gasto', importe: 150, fecha: '2026-09-11', naturaleza: 'rectificativa', facturaOriginalId: 'gas-normal' }),
      facturaBase('gas-iva', USUARIO, { tipo: 'gasto', importe: 605, fecha: '2026-09-12', tipoImpuesto: 'iva', baseImponible: 500, importeImpuesto: 105 }),
      facturaBase('gas-igic', USUARIO, { tipo: 'gasto', importe: 321, fecha: '2026-09-13', tipoImpuesto: 'igic', baseImponible: 300, importeImpuesto: 21 }),
    ];
    await FacturaModel.insertMany(facturas);

    // Reimplementación literal, a mano, de la fórmula de `calcularTrimestres`
    // (frontend) — mismo signo (+1 normal / -1 rectificativa) que
    // `signoPorNaturaleza`, aplicado sobre el MISMO array de entrada.
    const signo = (f: { naturaleza?: string }) => (f.naturaleza === 'rectificativa' ? -1 : 1);
    const ingresosSegunFormulaFrontend = facturas
      .filter((f) => f.tipo === 'ingreso')
      .reduce((s, f) => s + f.importe * signo(f), 0);
    const gastosSegunFormulaFrontend = facturas
      .filter((f) => f.tipo === 'gasto')
      .reduce((s, f) => s + f.importe * signo(f), 0);

    expect(ingresosSegunFormulaFrontend).toBe(5000 - 400); // 4600
    expect(gastosSegunFormulaFrontend).toBe(1000 - 150 + 605 + 321); // 1776

    const [resumenTotal, resumenPeriodo] = await Promise.all([
      svc.resumenFacturas(USUARIO),
      svc.resumenEconomico(USUARIO, { desde: '2026-09-01', hasta: '2026-09-30' }),
    ]);

    // resumenFacturas() — agregación Mongo real, sin filtro de fechas (todo el histórico del usuario).
    expect(resumenTotal.totalIngresos).toBe(ingresosSegunFormulaFrontend);
    expect(resumenTotal.totalGastos).toBe(gastosSegunFormulaFrontend);

    // resumenEconomico() — agregación Mongo real, con el mismo rango que cubre todas las facturas de este test.
    // OJO: se compara contra `.total` (importe completo, con impuesto incluido — misma
    // `$multiply: ['$importe', SIGNO_NATURALEZA_MONGO]` que `resumenFacturas`), NUNCA contra
    // `.base`. `.base` es una magnitud DISTINTA a propósito (`linea()` en `resumenEconomico`,
    // presupuestos-service.ts): para una factura con desglose fiscal fiable usa `baseImponible`
    // (importe SIN el impuesto), no el importe completo — por diseño, no es un error. Con
    // gas-iva/gas-igic de este test (que sí llevan baseImponible/importeImpuesto), `.base` daría
    // 1650€ (1000 - 150 + 500 + 300), no 1776€ — un número igual de correcto, pero que responde a
    // una pregunta distinta ("¿cuál es la base económica sin impuestos?" en vez de "¿cuál es el
    // importe total de las facturas?"). Comparar aquí contra `.base` sería un error de este test,
    // no una inconsistencia real del sistema.
    expect(resumenPeriodo.ingresos.total).toBe(ingresosSegunFormulaFrontend);
    expect(resumenPeriodo.gastos.total).toBe(gastosSegunFormulaFrontend);
  });
});

describe('detectarRectificativaTrimestreDistinto conectada a guardarFactura (cierre del riesgo #1 de la revisión de diff, 25/09/2026)', () => {
  it('rectificativa en el MISMO trimestre que su original → sin advertencia en la respuesta del guardado', async () => {
    await FacturaModel.create(facturaBase('f1', USUARIO, { fecha: '2026-09-01', importe: 1000 }));

    const guardada = await svc.guardarFactura(
      { id: 'r1', tipo: 'gasto', fecha: '2026-09-20', importe: 300, naturaleza: 'rectificativa', facturaOriginalId: 'f1', creado: new Date().toISOString() },
      USUARIO
    );

    expect((guardada as any).advertenciasRectificativa).toBeUndefined();
  });

  it('rectificativa en un trimestre DISTINTO (mismo año) → advertencia clara en la respuesta, sin bloquear el guardado', async () => {
    await FacturaModel.create(facturaBase('f1', USUARIO, { fecha: '2026-01-15', importe: 1000 })); // Q1

    const guardada = await svc.guardarFactura(
      { id: 'r1', tipo: 'gasto', fecha: '2026-09-20', importe: 300, naturaleza: 'rectificativa', facturaOriginalId: 'f1', creado: new Date().toISOString() }, // Q3
      USUARIO
    );

    expect((guardada as any).id).toBe('r1'); // se guarda igualmente, no se bloquea
    expect(Array.isArray((guardada as any).advertenciasRectificativa)).toBe(true);
    expect((guardada as any).advertenciasRectificativa[0]).toMatch(/trimestre.*ya se declaró|complementaria/i);
  });

  it('rectificativa en un año DISTINTO → también se detecta (no solo trimestre dentro del mismo año)', async () => {
    await FacturaModel.create(facturaBase('f1', USUARIO, { fecha: '2025-11-10', importe: 1000 }));

    const guardada = await svc.guardarFactura(
      { id: 'r1', tipo: 'gasto', fecha: '2026-02-05', importe: 300, naturaleza: 'rectificativa', facturaOriginalId: 'f1', creado: new Date().toISOString() },
      USUARIO
    );

    expect((guardada as any).advertenciasRectificativa?.length).toBeGreaterThan(0);
  });

  it('NO modifica la fecha de la factura original ni de la rectificativa, y NO crea ninguna otra factura (ninguna complementaria automática)', async () => {
    await FacturaModel.create(facturaBase('f1', USUARIO, { fecha: '2026-01-15', importe: 1000 }));

    await svc.guardarFactura(
      { id: 'r1', tipo: 'gasto', fecha: '2026-09-20', importe: 300, naturaleza: 'rectificativa', facturaOriginalId: 'f1', creado: new Date().toISOString() },
      USUARIO
    );

    const original = await FacturaModel.findOne({ id: 'f1', usuarioId: USUARIO }).lean().exec();
    expect(original!.fecha).toBe('2026-01-15'); // sin cambios

    const todas = await FacturaModel.find({ usuarioId: USUARIO }).lean().exec();
    expect(todas.length).toBe(2); // solo la original y la rectificativa — ninguna complementaria generada
  });
});

describe('buscarFacturasOriginalCandidatas — buscador de factura original en TODO el histórico (25/09/2026, cierre de limitación conocida)', () => {
  it('caso A: localiza una factura que NO estaría en una "página" típica (creada mucho antes que otras 59 facturas)', async () => {
    // La candidata a buscar es la MÁS ANTIGUA de 60 — con el antiguo buscador
    // (limitado a `obtenerFacturas(1, 200, 'todas')`, ordenado por `creado`
    // descendente en el cliente) habría quedado fuera de una página normal
    // de la app (limite=30) mucho antes de llegar a las 60. Con la búsqueda
    // real en servidor no importa el orden ni el volumen: se localiza por
    // su número de factura exacto sin más.
    await FacturaModel.create(facturaBase('vieja', USUARIO, { numeroFactura: 'FAC-0001-ANTIGUA', creado: new Date('2020-01-01').toISOString() }));
    for (let i = 0; i < 59; i++) {
      await FacturaModel.create(facturaBase(`reciente-${i}`, USUARIO, { numeroFactura: `FAC-${i}`, creado: new Date().toISOString() }));
    }

    const resultados = await svc.buscarFacturasOriginalCandidatas(USUARIO, 'FAC-0001-ANTIGUA');
    expect(resultados.map((f: any) => f.id)).toEqual(['vieja']);
  });

  it('busca también por proveedor, por importe exacto y por fecha (dd/mm/yyyy e ISO)', async () => {
    await FacturaModel.create(facturaBase('f1', USUARIO, { proveedor: 'Maderas del Sur SL', importe: 452.30, fecha: '2026-03-15' }));

    expect((await svc.buscarFacturasOriginalCandidatas(USUARIO, 'maderas del sur')).map((f: any) => f.id)).toEqual(['f1']);
    expect((await svc.buscarFacturasOriginalCandidatas(USUARIO, '452.30')).map((f: any) => f.id)).toEqual(['f1']);
    expect((await svc.buscarFacturasOriginalCandidatas(USUARIO, '15/03/2026')).map((f: any) => f.id)).toEqual(['f1']);
    expect((await svc.buscarFacturasOriginalCandidatas(USUARIO, '2026-03-15')).map((f: any) => f.id)).toEqual(['f1']);
  });

  it('caso D: nunca devuelve facturas de OTRO usuario, aunque el término de búsqueda coincida exactamente', async () => {
    await FacturaModel.create(facturaBase('f-otro', OTRO_USUARIO, { numeroFactura: 'FAC-SECRETA' }));
    await FacturaModel.create(facturaBase('f-mio', USUARIO, { numeroFactura: 'FAC-SECRETA' }));

    const resultados = await svc.buscarFacturasOriginalCandidatas(USUARIO, 'FAC-SECRETA');
    expect(resultados.map((f: any) => f.id)).toEqual(['f-mio']);
  });

  it('caso E: excluye la propia factura en edición (excluirId) — nunca puede ofrecerse a sí misma como original', async () => {
    await FacturaModel.create(facturaBase('f1', USUARIO, { numeroFactura: 'FAC-1' }));
    await FacturaModel.create(facturaBase('f2', USUARIO, { numeroFactura: 'FAC-1-B' }));

    const sinExcluir = await svc.buscarFacturasOriginalCandidatas(USUARIO, 'FAC-1');
    expect(sinExcluir.map((f: any) => f.id).sort()).toEqual(['f1', 'f2']);

    const excluyendoF1 = await svc.buscarFacturasOriginalCandidatas(USUARIO, 'FAC-1', 'f1');
    expect(excluyendoF1.map((f: any) => f.id)).toEqual(['f2']);
  });

  it('no permite encadenar una rectificativa como original de otra rectificativa una restricción nueva — el buscador no filtra por naturaleza, coherente con validarRectificativa (permite con advertencia, no bloquea)', async () => {
    await FacturaModel.create(facturaBase('f1', USUARIO, { numeroFactura: 'FAC-ORIG' }));
    await FacturaModel.create(facturaBase('r1', USUARIO, { numeroFactura: 'FAC-RECT', naturaleza: 'rectificativa', facturaOriginalId: 'f1' }));

    // Una rectificativa YA guardada debe poder aparecer como candidata en el buscador,
    // igual que una factura normal — el modelo no lo prohíbe, así que la búsqueda tampoco.
    const resultados = await svc.buscarFacturasOriginalCandidatas(USUARIO, 'FAC-RECT');
    expect(resultados.map((f: any) => f.id)).toEqual(['r1']);
  });
});

describe('listarFacturasRectificativas — conteo/listado REAL de rectificativas (25/09/2026, cierre de limitación conocida)', () => {
  it('caso B: el resultado no depende de cuántas ni cuáles facturas estén "visibles" — cuenta TODAS las rectificativas reales de la original', async () => {
    await FacturaModel.create(facturaBase('original', USUARIO, { importe: 1000 }));
    // Tres rectificativas de la misma original, con fechas/creación dispersas en el tiempo —
    // ninguna estaría necesariamente en la misma "página"/trimestre que las otras.
    await FacturaModel.create(facturaBase('r1', USUARIO, { importe: 100, naturaleza: 'rectificativa', facturaOriginalId: 'original', fecha: '2026-01-10', creado: new Date('2026-01-10').toISOString() }));
    await FacturaModel.create(facturaBase('r2', USUARIO, { importe: 200, naturaleza: 'rectificativa', facturaOriginalId: 'original', fecha: '2026-05-10', creado: new Date('2026-05-10').toISOString() }));
    await FacturaModel.create(facturaBase('r3', USUARIO, { importe: 50, naturaleza: 'rectificativa', facturaOriginalId: 'original', fecha: '2026-09-10', creado: new Date('2026-09-10').toISOString() }));
    // Una factura de gasto normal, no relacionada, que NO debe contar.
    await FacturaModel.create(facturaBase('no-relacionada', USUARIO, { importe: 999 }));

    const rectificativas = await svc.listarFacturasRectificativas(USUARIO, 'original');
    expect(rectificativas.length).toBe(3);
    expect(rectificativas.map((f: any) => f.id).sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('devuelve una lista vacía (no un error) cuando la original no tiene ninguna rectificativa', async () => {
    await FacturaModel.create(facturaBase('sola', USUARIO, { importe: 500 }));
    const rectificativas = await svc.listarFacturasRectificativas(USUARIO, 'sola');
    expect(rectificativas).toEqual([]);
  });

  it('nunca cuenta rectificativas de OTRO usuario aunque compartan el mismo facturaOriginalId por casualidad', async () => {
    await FacturaModel.create(facturaBase('original', USUARIO, { importe: 1000 }));
    await FacturaModel.create(facturaBase('r-mia', USUARIO, { importe: 100, naturaleza: 'rectificativa', facturaOriginalId: 'original' }));
    await FacturaModel.create(facturaBase('r-ajena', OTRO_USUARIO, { importe: 100, naturaleza: 'rectificativa', facturaOriginalId: 'original' }));

    const rectificativas = await svc.listarFacturasRectificativas(USUARIO, 'original');
    expect(rectificativas.map((f: any) => f.id)).toEqual(['r-mia']);
  });
});
