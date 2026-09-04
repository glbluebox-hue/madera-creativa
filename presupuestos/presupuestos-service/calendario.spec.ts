import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { ClienteModel, ProyectoModel, NotaModel, FacturaModel } from './cliente.model.js';
import { EventoCalendarioModel } from './evento-calendario.model.js';

/**
 * Calendario (Fase "Calendario", 30/08/2026) — capa temporal transversal.
 * Cubre: agregación desde cada tipo de origen (proyecto, tarea, nota,
 * factura, cliente, evento/recordatorio), que nunca aparezca nada fuera
 * del rango pedido ni de otro usuario, el filtro por tipos, y el CRUD de
 * evento/recordatorio (el único tipo con colección propia).
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();

const USUARIO_A = 'usuario-a-calendario-test';
const USUARIO_B = 'usuario-b-calendario-test';

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
  await ProyectoModel.deleteMany({});
  await ClienteModel.deleteMany({});
  await NotaModel.deleteMany({});
  await FacturaModel.deleteMany({});
  await EventoCalendarioModel.deleteMany({});
});

// `creado` fijo y deliberadamente fuera de cualquier rango que este archivo
// consulte (todos son de 2026) — Fase 3.1 (05/09/2026): con `new Date()`
// (la fecha real del sistema) este helper creaba el Cliente "hoy", y el
// propio `obtenerCalendario` agrega un elemento tipo 'cliente' cuando
// `creado` cae dentro del rango pedido (ver el test de arriba "incluye un
// cliente añadido dentro del rango" — comportamiento correcto e
// intencional). Mientras la fecha real del sistema estuvo fuera de
// septiembre de 2026 este helper no interfería con los rangos '2026-09-*'
// de los demás tests; al entrar septiembre, "hoy" empezó a colarse como un
// elemento de calendario extra e hizo fallar 4 tests que no tenían nada que
// ver con clientes. No es un fallo de `obtenerCalendario` — es este helper
// usando una fecha real donde hacía falta una fecha de dato fija.
const CREADO_FUERA_DE_RANGO = '2020-01-01T00:00:00.000Z';

async function crearClienteYProyecto(id: string, usuarioId: string, extra: Record<string, unknown> = {}) {
  await ClienteModel.create({ id: `cliente-${id}`, usuarioId, nombre: 'Cliente test', creado: CREADO_FUERA_DE_RANGO });
  await ProyectoModel.create({ id, usuarioId, clienteId: `cliente-${id}`, creado: CREADO_FUERA_DE_RANGO, ...extra });
  return `cliente-${id}`;
}

describe('obtenerCalendario — agregación por tipo', () => {
  it('incluye la fecha de medición y de montaje de un proyecto dentro del rango', async () => {
    await crearClienteYProyecto('p1', USUARIO_A, { proyecto: 'Cocina', fechaMedicion: '2026-09-10', fechaMontaje: '2026-09-20' });
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30');
    const medicion = elementos.find((e) => e.subtitulo === 'Medición');
    const montaje = elementos.find((e) => e.subtitulo === 'Montaje');
    expect(medicion).toMatchObject({ tipo: 'proyecto', titulo: 'Cocina', fecha: '2026-09-10', proyectoId: 'p1' });
    expect(montaje).toMatchObject({ tipo: 'proyecto', titulo: 'Cocina', fecha: '2026-09-20', proyectoId: 'p1' });
  });

  it('no incluye una fecha de proyecto fuera del rango pedido', async () => {
    await crearClienteYProyecto('p1', USUARIO_A, { fechaMedicion: '2026-01-01' });
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30');
    expect(elementos).toHaveLength(0);
  });

  it('incluye una tarea con fecha, con su proyectoId y clienteId de origen', async () => {
    await crearClienteYProyecto('p1', USUARIO_A, {
      proyecto: 'Armario', tareas: [{ id: 't1', texto: 'Confirmar medidas', hecha: false, fecha: '2026-09-15' }],
    });
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30');
    expect(elementos).toEqual([
      expect.objectContaining({ tipo: 'tarea', titulo: 'Confirmar medidas', subtitulo: 'Armario', fecha: '2026-09-15', proyectoId: 'p1', clienteId: 'cliente-p1', hecha: false }),
    ]);
  });

  it('una tarea SIN fecha nunca aparece en el calendario', async () => {
    // `crearClienteYProyecto` también crea un Cliente (con `creado` fijo,
    // fuera de rango — ver constante de arriba) — se filtra a solo 'tarea'
    // de todos modos, para que este test compruebe solo lo suyo.
    await crearClienteYProyecto('p1', USUARIO_A, { tareas: [{ id: 't1', texto: 'Sin fecha', hecha: false }] });
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-01-01', '2026-12-31', ['tarea']);
    expect(elementos).toHaveLength(0);
  });

  it('incluye una nota con fecha', async () => {
    await NotaModel.create({ id: 'n1', usuarioId: USUARIO_A, titulo: 'Llamar a Juan', contenido: 'x', fecha: '2026-09-15', creado: new Date().toISOString(), actualizado: new Date().toISOString() });
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30');
    expect(elementos).toEqual([expect.objectContaining({ tipo: 'nota', titulo: 'Llamar a Juan', fecha: '2026-09-15', origenId: 'n1' })]);
  });

  it('la nota lleva su prioridad — el punto de color en el Calendario la usa (30/08/2026)', async () => {
    await NotaModel.create({ id: 'n1', usuarioId: USUARIO_A, contenido: 'x', fecha: '2026-09-15', prioridad: 'alta', creado: new Date().toISOString(), actualizado: new Date().toISOString() });
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30');
    expect(elementos[0].prioridad).toBe('alta');
  });

  it('una nota sin fecha (la inmensa mayoría) nunca aparece', async () => {
    await NotaModel.create({ id: 'n1', usuarioId: USUARIO_A, contenido: 'x', creado: new Date().toISOString(), actualizado: new Date().toISOString() });
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-01-01', '2026-12-31');
    expect(elementos).toHaveLength(0);
  });

  it('incluye una factura por su fecha Y por su vencimiento cuando son distintos', async () => {
    await FacturaModel.create({ id: 'f1', usuarioId: USUARIO_A, tipo: 'ingreso', fecha: '2026-09-05', fechaVencimiento: '2026-09-25', numeroFactura: '1042', importe: 100, creado: new Date().toISOString() });
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30');
    expect(elementos).toHaveLength(2);
    expect(elementos.find((e) => e.fecha === '2026-09-05')).toMatchObject({ tipo: 'factura', titulo: 'Factura 1042', subtitulo: 'Ingreso' });
    expect(elementos.find((e) => e.fecha === '2026-09-25')).toMatchObject({ tipo: 'factura', titulo: 'Factura 1042', subtitulo: 'Vencimiento' });
  });

  it('una factura con vencimiento IGUAL a su fecha no se duplica', async () => {
    await FacturaModel.create({ id: 'f1', usuarioId: USUARIO_A, tipo: 'gasto', fecha: '2026-09-05', fechaVencimiento: '2026-09-05', importe: 50, creado: new Date().toISOString() });
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30');
    expect(elementos).toHaveLength(1);
  });

  it('incluye un cliente añadido dentro del rango', async () => {
    await ClienteModel.create({ id: 'c1', usuarioId: USUARIO_A, nombre: 'Belkis Ventura', creado: '2026-09-12T10:00:00.000Z' });
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30');
    expect(elementos).toEqual([expect.objectContaining({ tipo: 'cliente', titulo: 'Belkis Ventura', subtitulo: 'Cliente añadido', fecha: '2026-09-12' })]);
  });

  it('ordena los elementos por fecha ascendente', async () => {
    await crearClienteYProyecto('p1', USUARIO_A, { fechaMedicion: '2026-09-20' });
    await NotaModel.create({ id: 'n1', usuarioId: USUARIO_A, contenido: 'x', fecha: '2026-09-05', creado: new Date().toISOString(), actualizado: new Date().toISOString() });
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30');
    expect(elementos.map((e) => e.fecha)).toEqual(['2026-09-05', '2026-09-20']);
  });
});

describe('obtenerCalendario — aislamiento por usuario', () => {
  it('nunca devuelve elementos de otro usuario', async () => {
    await crearClienteYProyecto('p1', USUARIO_A, { fechaMedicion: '2026-09-10' });
    await crearClienteYProyecto('p2', USUARIO_B, { fechaMedicion: '2026-09-10' });
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30');
    expect(elementos).toHaveLength(1);
    expect(elementos[0].proyectoId).toBe('p1');
  });
});

describe('obtenerCalendario — filtro por tipos', () => {
  it('con tipos:["factura"], solo devuelve facturas aunque haya otros elementos en el mismo rango', async () => {
    await crearClienteYProyecto('p1', USUARIO_A, { fechaMedicion: '2026-09-10' });
    await FacturaModel.create({ id: 'f1', usuarioId: USUARIO_A, tipo: 'gasto', fecha: '2026-09-10', importe: 10, creado: new Date().toISOString() });
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30', ['factura']);
    expect(elementos).toEqual([expect.objectContaining({ tipo: 'factura' })]);
  });
});

describe('Evento/recordatorio del Calendario — CRUD', () => {
  const EVENTO_BASE = {
    tipo: 'evento' as const, titulo: 'Visita a obra', descripcion: '', fecha: '2026-09-15', hora: '10:00',
    todoElDia: false, duracionMin: 60, clienteId: '', proyectoId: '',
    creado: new Date().toISOString(), actualizado: new Date().toISOString(),
  };

  it('crea un evento y aparece en el calendario del rango correspondiente', async () => {
    await svc.guardarEventoCalendario({ ...EVENTO_BASE, id: 'e1' }, USUARIO_A);
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30');
    expect(elementos).toEqual([expect.objectContaining({ tipo: 'evento', titulo: 'Visita a obra', fecha: '2026-09-15', hora: '10:00', origenId: 'e1' })]);
  });

  it('un recordatorio no aparece si se filtra solo por evento, y viceversa', async () => {
    await svc.guardarEventoCalendario({ ...EVENTO_BASE, id: 'r1', tipo: 'recordatorio', titulo: 'Llamar a Pedro' }, USUARIO_A);
    const soloEventos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30', ['evento']);
    const soloRecordatorios = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30', ['recordatorio']);
    expect(soloEventos).toHaveLength(0);
    expect(soloRecordatorios).toEqual([expect.objectContaining({ tipo: 'recordatorio', titulo: 'Llamar a Pedro' })]);
  });

  it('editar un evento ya existente lo actualiza en vez de duplicarlo (mismo id)', async () => {
    await svc.guardarEventoCalendario({ ...EVENTO_BASE, id: 'e1' }, USUARIO_A);
    await svc.guardarEventoCalendario({ ...EVENTO_BASE, id: 'e1', titulo: 'Visita reprogramada', fecha: '2026-09-16' }, USUARIO_A);
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30');
    expect(elementos).toHaveLength(1);
    expect(elementos[0]).toMatchObject({ titulo: 'Visita reprogramada', fecha: '2026-09-16' });
  });

  it('borrar un evento hace que deje de aparecer', async () => {
    await svc.guardarEventoCalendario({ ...EVENTO_BASE, id: 'e1' }, USUARIO_A);
    await svc.borrarEventoCalendario('e1', USUARIO_A);
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30');
    expect(elementos).toHaveLength(0);
  });

  it('un usuario no puede borrar el evento de otro usuario', async () => {
    await svc.guardarEventoCalendario({ ...EVENTO_BASE, id: 'e1' }, USUARIO_A);
    await svc.borrarEventoCalendario('e1', USUARIO_B);
    const elementos = await svc.obtenerCalendario(USUARIO_A, '2026-09-01', '2026-09-30');
    expect(elementos).toHaveLength(1);
  });
});
