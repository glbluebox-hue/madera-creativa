import {
  crearAlmacenLocalStorage, esNuncaVisto, progresoAlSaltar, progresoAlAvanzar, pasoIndiceAlAbrir,
  type ProgresoTutorial,
} from './tutorial-progreso-adapter.js';
import { reducirTutorial, estadoInicialTutorial, pasoActualDe, type DefinicionTutorial } from './tutorial-motor.js';

describe('crearAlmacenLocalStorage', () => {
  beforeEach(() => localStorage.clear());

  it('1. Sin nada guardado, obtener() devuelve null', () => {
    const almacen = crearAlmacenLocalStorage('mc_u1_');
    expect(almacen.obtener('demo')).toBeNull();
  });

  it('2. Guardar y luego obtener devuelve exactamente lo guardado', () => {
    const almacen = crearAlmacenLocalStorage('mc_u1_');
    const progreso: ProgresoTutorial = { tutorialId: 'demo', estado: 'en_progreso', pasoActualId: 'p2', actualizadoEn: '2026-08-24T00:00:00.000Z' };
    almacen.guardar(progreso);
    expect(almacen.obtener('demo')).toEqual(progreso);
  });

  it('3. Dos tutoriales distintos no se pisan entre sí', () => {
    const almacen = crearAlmacenLocalStorage('mc_u1_');
    almacen.guardar({ tutorialId: 'demo', estado: 'en_progreso', pasoActualId: 'p1', actualizadoEn: 't1' });
    almacen.guardar({ tutorialId: 'otro', estado: 'completado', pasoActualId: null, actualizadoEn: 't2' });
    expect(almacen.obtener('demo')?.pasoActualId).toBe('p1');
    expect(almacen.obtener('otro')?.estado).toBe('completado');
  });

  it('4. Guardar de nuevo el mismo tutorialId sustituye el progreso anterior', () => {
    const almacen = crearAlmacenLocalStorage('mc_u1_');
    almacen.guardar({ tutorialId: 'demo', estado: 'en_progreso', pasoActualId: 'p1', actualizadoEn: 't1' });
    almacen.guardar({ tutorialId: 'demo', estado: 'en_progreso', pasoActualId: 'p2', actualizadoEn: 't2' });
    expect(almacen.obtener('demo')?.pasoActualId).toBe('p2');
  });

  it('5. Prefijos distintos (usuarios distintos) aíslan completamente el progreso — mismo tutorialId, sin mezclarse', () => {
    const almacenU1 = crearAlmacenLocalStorage('mc_u1_');
    const almacenU2 = crearAlmacenLocalStorage('mc_u2_');
    almacenU1.guardar({ tutorialId: 'demo', estado: 'completado', pasoActualId: null, actualizadoEn: 't1' });
    expect(almacenU2.obtener('demo')).toBeNull();
  });
});

describe('esNuncaVisto (Fase A, señal de inicio automático)', () => {
  it('null (nada guardado) → nunca visto', () => {
    expect(esNuncaVisto(null)).toBe(true);
  });
  it('en_progreso → no es nunca visto', () => {
    expect(esNuncaVisto({ tutorialId: 'app', estado: 'en_progreso', pasoActualId: 'p1', actualizadoEn: 't' })).toBe(false);
  });
  it('completado → no es nunca visto (no debe volver a auto-abrirse)', () => {
    expect(esNuncaVisto({ tutorialId: 'app', estado: 'completado', pasoActualId: null, actualizadoEn: 't' })).toBe(false);
  });
  it('saltado → no es nunca visto (no debe volver a auto-abrirse)', () => {
    expect(esNuncaVisto({ tutorialId: 'app', estado: 'saltado', pasoActualId: 'p1', actualizadoEn: 't' })).toBe(false);
  });
});

describe('progresoAlSaltar (Fase A, "Omitir tutorial"/cerrar a medias)', () => {
  it('cerrando en "mostrandoPaso" → guarda saltado con el paso donde estaba', () => {
    expect(progresoAlSaltar('mostrandoPaso', 'app', 'p2', 't1')).toEqual({ tutorialId: 'app', estado: 'saltado', pasoActualId: 'p2', actualizadoEn: 't1' });
  });
  it('cerrando en "localizando" → también guarda saltado', () => {
    expect(progresoAlSaltar('localizando', 'app', 'p1', 't1')).toEqual({ tutorialId: 'app', estado: 'saltado', pasoActualId: 'p1', actualizadoEn: 't1' });
  });
  it('cerrando ya "completado" → null, no pisa el completado ya guardado', () => {
    expect(progresoAlSaltar('completado', 'app', null, 't1')).toBeNull();
  });
  it('cerrando estando "inactivo" → null, nada que guardar', () => {
    expect(progresoAlSaltar('inactivo', 'app', null, 't1')).toBeNull();
  });
});

describe('progresoAlAvanzar (Fase A, "Empezar"/avanzar/completar)', () => {
  it('"localizando" (justo al abrir/Empezar) → en_progreso', () => {
    expect(progresoAlAvanzar('localizando', 'app', 'p1', 't1')).toEqual({ tutorialId: 'app', estado: 'en_progreso', pasoActualId: 'p1', actualizadoEn: 't1' });
  });
  it('"mostrandoPaso" tras avanzar → sigue en_progreso, con el nuevo paso', () => {
    expect(progresoAlAvanzar('mostrandoPaso', 'app', 'p2', 't2')).toEqual({ tutorialId: 'app', estado: 'en_progreso', pasoActualId: 'p2', actualizadoEn: 't2' });
  });
  it('"completado" → completado, sin paso (ya no hay "donde se quedó")', () => {
    expect(progresoAlAvanzar('completado', 'app', 'p3', 't3')).toEqual({ tutorialId: 'app', estado: 'completado', pasoActualId: null, actualizadoEn: 't3' });
  });
  it('"inactivo" → null, nada que guardar', () => {
    expect(progresoAlAvanzar('inactivo', 'app', null, 't1')).toBeNull();
  });
});

describe('pasoIndiceAlAbrir (Fase A, reapertura manual desde el paso guardado)', () => {
  const pasos = ['p1', 'p2', 'p3'];
  it('sin progreso guardado → empieza en 0', () => {
    expect(pasoIndiceAlAbrir(pasos, null)).toBe(0);
  });
  it('completado (pasoActualId null) → empieza en 0, no en el último', () => {
    expect(pasoIndiceAlAbrir(pasos, { tutorialId: 'app', estado: 'completado', pasoActualId: null, actualizadoEn: 't' })).toBe(0);
  });
  it('en_progreso en p2 → reanuda en el índice de p2 (1)', () => {
    expect(pasoIndiceAlAbrir(pasos, { tutorialId: 'app', estado: 'en_progreso', pasoActualId: 'p2', actualizadoEn: 't' })).toBe(1);
  });
  it('saltado en p3 → reanuda en el índice de p3 (2), no se pierde el sitio', () => {
    expect(pasoIndiceAlAbrir(pasos, { tutorialId: 'app', estado: 'saltado', pasoActualId: 'p3', actualizadoEn: 't' })).toBe(2);
  });
  it('paso guardado que ya no existe (tutorial acortado en una versión nueva) → 0, nunca un índice inválido', () => {
    expect(pasoIndiceAlAbrir(pasos, { tutorialId: 'app', estado: 'en_progreso', pasoActualId: 'p9-ya-no-existe', actualizadoEn: 't' })).toBe(0);
  });
});

describe('Flujo completo Fase A (motor + adapter combinados, sin React)', () => {
  const DEF: DefinicionTutorial = {
    id: 'app',
    titulo: 'Tutorial de prueba',
    pasos: [
      { id: 'p1', titulo: 'Uno', texto: '', targetId: 't1', tipo: 'informativo' },
      { id: 'p2', titulo: 'Dos', texto: '', targetId: 't2', tipo: 'informativo' },
      { id: 'p3', titulo: 'Tres', texto: '', targetId: 't3', tipo: 'informativo' },
    ],
  };

  /** Reproduce exactamente lo que hace `useTutorial` (motor + persistencia), sin React — mismas funciones puras que usa el hook real. */
  function abrirYPersistir(almacen: ReturnType<typeof crearAlmacenLocalStorage>, reanudar = true) {
    const guardado = reanudar ? almacen.obtener(DEF.id) : null;
    const pasoIndice = pasoIndiceAlAbrir(DEF.pasos.map((p) => p.id), guardado);
    let estado = reducirTutorial(estadoInicialTutorial, { tipo: 'abrir', definicion: DEF, pasoIndice });
    const aGuardar = progresoAlAvanzar(estado.fase, DEF.id, pasoActualDe(estado)?.id ?? null, 't-abrir');
    if (aGuardar) almacen.guardar(aGuardar);
    return estado;
  }
  function avanzarYPersistir(almacen: ReturnType<typeof crearAlmacenLocalStorage>, estado: ReturnType<typeof reducirTutorial>, ts: string) {
    let siguiente = reducirTutorial(estado, { tipo: 'objetivoLocalizado' });
    siguiente = reducirTutorial(siguiente, { tipo: 'avanzar' });
    const aGuardar = progresoAlAvanzar(siguiente.fase, DEF.id, pasoActualDe(siguiente)?.id ?? null, ts);
    if (aGuardar) almacen.guardar(aGuardar);
    return siguiente;
  }
  function cerrarYPersistir(almacen: ReturnType<typeof crearAlmacenLocalStorage>, estado: ReturnType<typeof reducirTutorial>, ts: string) {
    const aGuardar = progresoAlSaltar(estado.fase, DEF.id, pasoActualDe(estado)?.id ?? null, ts);
    if (aGuardar) almacen.guardar(aGuardar);
    return reducirTutorial(estado, { tipo: 'cerrar' });
  }

  beforeEach(() => localStorage.clear());

  it('nunca visto: sin progreso guardado, esNuncaVisto es true (dispara el auto-inicio)', () => {
    const almacen = crearAlmacenLocalStorage('mc_u1_');
    expect(esNuncaVisto(almacen.obtener(DEF.id))).toBe(true);
  });

  it('empezar: abrir dispara en_progreso guardado desde el primer paso', () => {
    const almacen = crearAlmacenLocalStorage('mc_u1_');
    abrirYPersistir(almacen);
    expect(almacen.obtener(DEF.id)).toMatchObject({ estado: 'en_progreso', pasoActualId: 'p1' });
    expect(esNuncaVisto(almacen.obtener(DEF.id))).toBe(false);
  });

  it('continuar: avanzar de paso actualiza pasoActualId, sigue en_progreso', () => {
    const almacen = crearAlmacenLocalStorage('mc_u1_');
    let estado = abrirYPersistir(almacen);
    estado = avanzarYPersistir(almacen, estado, 't2');
    expect(almacen.obtener(DEF.id)).toMatchObject({ estado: 'en_progreso', pasoActualId: 'p2' });
  });

  it('saltar: cerrar a mitad de un paso guarda saltado, no en_progreso', () => {
    const almacen = crearAlmacenLocalStorage('mc_u1_');
    const estado = abrirYPersistir(almacen);
    cerrarYPersistir(almacen, estado, 't-saltar');
    expect(almacen.obtener(DEF.id)).toMatchObject({ estado: 'saltado', pasoActualId: 'p1' });
  });

  it('completar: avanzar hasta pasar el último paso guarda completado, sin pasoActualId', () => {
    const almacen = crearAlmacenLocalStorage('mc_u1_');
    let estado = abrirYPersistir(almacen);
    estado = avanzarYPersistir(almacen, estado, 't2'); // p1 → p2
    estado = avanzarYPersistir(almacen, estado, 't3'); // p2 → p3
    estado = avanzarYPersistir(almacen, estado, 't4'); // p3 → completado
    expect(estado.fase).toBe('completado');
    expect(almacen.obtener(DEF.id)).toEqual({ tutorialId: 'app', estado: 'completado', pasoActualId: null, actualizadoEn: 't4' });
  });

  it('no auto-iniciar tras completar: una vez completado, esNuncaVisto ya es false', () => {
    const almacen = crearAlmacenLocalStorage('mc_u1_');
    let estado = abrirYPersistir(almacen);
    estado = avanzarYPersistir(almacen, estado, 't2');
    estado = avanzarYPersistir(almacen, estado, 't3');
    avanzarYPersistir(almacen, estado, 't4');
    expect(esNuncaVisto(almacen.obtener(DEF.id))).toBe(false);
  });

  it('no auto-iniciar tras saltar: una vez saltado, esNuncaVisto ya es false', () => {
    const almacen = crearAlmacenLocalStorage('mc_u1_');
    const estado = abrirYPersistir(almacen);
    cerrarYPersistir(almacen, estado, 't-saltar');
    expect(esNuncaVisto(almacen.obtener(DEF.id))).toBe(false);
  });

  it('reapertura manual: tras abandonar en progreso, reabrir continúa desde el paso guardado (p2), no desde el principio', () => {
    const almacen = crearAlmacenLocalStorage('mc_u1_');
    let estado = abrirYPersistir(almacen);
    estado = avanzarYPersistir(almacen, estado, 't2'); // se queda en p2
    cerrarYPersistir(almacen, estado, 't-cierre'); // el usuario sale sin terminar (guarda "saltado" en p2)
    const reabierto = abrirYPersistir(almacen); // vuelve a pulsar el botón "Tutorial"
    expect(pasoActualDe(reabierto)?.id).toBe('p2');
  });

  it('no fuga de estado entre sesiones: dos usuarios distintos en el mismo navegador no comparten "nunca visto"', () => {
    const almacenU1 = crearAlmacenLocalStorage('mc_u1_');
    const almacenU2 = crearAlmacenLocalStorage('mc_u2_');
    abrirYPersistir(almacenU1); // u1 ya lo ha visto
    expect(esNuncaVisto(almacenU1.obtener(DEF.id))).toBe(false);
    expect(esNuncaVisto(almacenU2.obtener(DEF.id))).toBe(true); // u2 sigue siendo "nunca visto"
  });
});
