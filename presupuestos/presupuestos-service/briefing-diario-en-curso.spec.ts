import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { PresupuestosService } from './presupuestos-service.js';
import { ClienteModel, ProyectoModel, PresupuestoModel } from './cliente.model.js';

/**
 * Hallazgo real del usuario, 02/09/2026: la notificación diaria "Buenos
 * días" le dijo "0 proyectos activos" teniendo 3 presupuestos aceptados
 * (y sus 3 proyectos mostrando "En curso" en la propia app, confirmado
 * también por el KPI "Presupuestos · N en curso" de Inicio — calculado
 * client-side con el mismo criterio `estado === 'en_curso'`, ver
 * `dashboard-calculos.ts`).
 *
 * `ejecutarBriefingDiario` (notificaciones-programadas.service.ts) cuenta
 * `ProyectoModel.countDocuments({ usuarioId, estado: 'en_curso' })` — el
 * mismo campo que `ejecutarConsecuenciasAceptacion` (presupuestos-service.ts)
 * pone a 'en_curso' al aceptar un presupuesto. Este test reproduce el
 * camino real completo (aceptar → releer el proyecto) para confirmar si
 * el problema está en esa escritura o en otro sitio (el proceso en
 * producción sin reiniciar tras el último despliegue, ver commits
 * recientes sobre Cache-Control, es la sospecha principal si este test
 * pasa en verde).
 */

let mongod: MongoMemoryServer;
const svc = PresupuestosService.from();
const USUARIO = 'usuario-briefing-en-curso-test';

function clienteBase(id: string, usuarioId: string) {
  return { id, usuarioId, nombre: 'Cliente de prueba', creado: new Date().toISOString() };
}

function proyectoBase(id: string, clienteId: string, usuarioId: string) {
  return { id, usuarioId, clienteId, tarifaHora: 20, creado: new Date().toISOString() };
}

function presupuestoBase(id: string, clienteId: string, proyectoId: string, usuarioId: string, precioTotal: number) {
  const ahora = new Date().toISOString();
  return {
    id, usuarioId, clienteId, proyectoId, titulo: 'Presupuesto de prueba', formato: 'simple' as const,
    precioTotal, items: [], alcance: [], creado: ahora, actualizado: ahora,
  };
}

/**
 * Sondea hasta que el proyecto pase a `en_curso`, en vez de confiar en un
 * `setTimeout` fijo — Fase 3.1 (05/09/2026). Mismo hallazgo que en
 * `presupuestos-precio.spec.ts`: `ejecutarConsecuenciasAceptacion` (que
 * también pone `Proyecto.estado = 'en_curso'`) es fire-and-forget, sin
 * `await`, a propósito (ver `presupuestos-service.ts`) — con la suite
 * completa ejecutando muchos archivos, un `setTimeout` fijo a veces perdía
 * la carrera bajo esa carga (fallo intermitente real, confirmado: el
 * proyecto seguía en `'presupuestado'`). Sondear la condición real,
 * acotada con un tiempo máximo generoso, elimina la carrera.
 */
async function esperarProyectoEnCurso(proyectoId: string, timeoutMs = 3000): Promise<any> {
  const inicio = Date.now();
  for (;;) {
    const doc = await ProyectoModel.findOne({ id: proyectoId }).lean().exec() as any;
    if (doc?.estado === 'en_curso') return doc;
    if (Date.now() - inicio >= timeoutMs) {
      throw new Error(`Tiempo agotado (${timeoutMs}ms) esperando a que el proyecto ${proyectoId} pasara a en_curso.`);
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
  await Promise.all([ClienteModel.deleteMany({}), ProyectoModel.deleteMany({}), PresupuestoModel.deleteMany({})]);
});

describe('aceptar un presupuesto deja el proyecto en_curso, tal como lo cuenta el briefing diario', () => {
  it('countDocuments({estado:"en_curso"}) — la misma consulta de ejecutarBriefingDiario — encuentra el proyecto justo después de aceptar', async () => {
    await ClienteModel.create(clienteBase('c1', USUARIO));
    await ProyectoModel.create(proyectoBase('p1', 'c1', USUARIO));
    await PresupuestoModel.create(presupuestoBase('pr1', 'c1', 'p1', USUARIO, 1000));

    await svc.aceptarPresupuesto('pr1', USUARIO);
    const proyecto = await esperarProyectoEnCurso('p1');
    expect(proyecto.estado).toBe('en_curso');

    const numActivos = await ProyectoModel.countDocuments({ usuarioId: USUARIO, estado: 'en_curso' }).exec();
    expect(numActivos).toBe(1);
  });

  it('con 3 presupuestos de 3 proyectos distintos aceptados, cuenta los 3 — igual que reportó el usuario que debería decir', async () => {
    for (const n of [1, 2, 3]) {
      await ClienteModel.create(clienteBase(`c${n}`, USUARIO));
      await ProyectoModel.create(proyectoBase(`p${n}`, `c${n}`, USUARIO));
      await PresupuestoModel.create(presupuestoBase(`pr${n}`, `c${n}`, `p${n}`, USUARIO, 1000 * n));
      await svc.aceptarPresupuesto(`pr${n}`, USUARIO);
    }
    await Promise.all([1, 2, 3].map((n) => esperarProyectoEnCurso(`p${n}`)));

    const numActivos = await ProyectoModel.countDocuments({ usuarioId: USUARIO, estado: 'en_curso' }).exec();
    expect(numActivos).toBe(3);
  });
});
