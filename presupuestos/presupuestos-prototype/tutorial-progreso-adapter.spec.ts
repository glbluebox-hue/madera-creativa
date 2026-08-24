import { crearAlmacenLocalStorage, type ProgresoTutorial } from './tutorial-progreso-adapter.js';

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
