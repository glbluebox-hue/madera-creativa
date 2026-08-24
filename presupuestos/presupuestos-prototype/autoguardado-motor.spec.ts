import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MotorAutoguardado } from './autoguardado-motor.js';

/** Promesa controlable manualmente desde el test — para simular un guardado que tarda y así probar la concurrencia. */
function diferido<T = void>() {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => { resolver = res; rechazar = rej; });
  return { promesa, resolver, rechazar };
}

describe('MotorAutoguardado (Fase A — autoguardado y protección contra pérdida, 23/08/2026)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('1. dirty-check sin cambios: empieza y se mantiene en "guardado" si no cambia nada', () => {
    const guardarFn = vi.fn().mockResolvedValue(undefined);
    const motor = new MotorAutoguardado('a', { guardar: guardarFn });
    expect(motor.obtenerEstado()).toBe('guardado');
    motor.actualizarDatos('a');
    expect(motor.obtenerEstado()).toBe('guardado');
    expect(guardarFn).not.toHaveBeenCalled();
  });

  it('2. dirty-check después de editar: pasa a "pendiente" en cuanto cambian los datos', () => {
    const guardarFn = vi.fn().mockResolvedValue(undefined);
    const motor = new MotorAutoguardado({ v: 1 }, { guardar: guardarFn });
    motor.actualizarDatos({ v: 2 });
    expect(motor.obtenerEstado()).toBe('pendiente');
  });

  it('3. cambio → debounce → guardar: se dispara solo tras el tiempo de inactividad configurado, nunca antes', async () => {
    const guardarFn = vi.fn().mockResolvedValue(undefined);
    const motor = new MotorAutoguardado('a', { guardar: guardarFn, debounceMs: 2500 });
    motor.actualizarDatos('b');
    await vi.advanceTimersByTimeAsync(2400);
    expect(guardarFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(guardarFn).toHaveBeenCalledTimes(1);
    expect(guardarFn).toHaveBeenCalledWith('b');
    expect(motor.obtenerEstado()).toBe('guardado');
  });

  it('4. varios cambios rápidos → un único guardado, con el último valor (nunca uno por pulsación)', async () => {
    const guardarFn = vi.fn().mockResolvedValue(undefined);
    const motor = new MotorAutoguardado('a', { guardar: guardarFn, debounceMs: 2500 });
    motor.actualizarDatos('b');
    await vi.advanceTimersByTimeAsync(1000);
    motor.actualizarDatos('c');
    await vi.advanceTimersByTimeAsync(1000);
    motor.actualizarDatos('d');
    await vi.advanceTimersByTimeAsync(2500);
    expect(guardarFn).toHaveBeenCalledTimes(1);
    expect(guardarFn).toHaveBeenCalledWith('d');
  });

  it('5. cambio durante un guardado en curso → no se lanza un guardado en paralelo, se repite al terminar con los datos más recientes', async () => {
    const primero = diferido<void>();
    const guardarFn = vi.fn()
      .mockReturnValueOnce(primero.promesa)
      .mockResolvedValueOnce(undefined);
    const motor = new MotorAutoguardado('a', { guardar: guardarFn, debounceMs: 1000 });

    motor.actualizarDatos('b');
    await vi.advanceTimersByTimeAsync(1000); // dispara el primer guardado, que se queda "colgado"
    expect(guardarFn).toHaveBeenCalledTimes(1);
    expect(motor.obtenerEstado()).toBe('guardando');

    motor.actualizarDatos('c'); // llega un cambio mientras se guarda
    await vi.advanceTimersByTimeAsync(1000); // su propio debounce intenta disparar otro guardado
    expect(guardarFn).toHaveBeenCalledTimes(1); // sigue en 1 — no se lanzó nada en paralelo

    primero.resolver(); // termina el primer guardado
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(guardarFn).toHaveBeenCalledTimes(2); // se repitió automáticamente al terminar
    expect(guardarFn).toHaveBeenLastCalledWith('c'); // con los datos más recientes, no los del primer intento
    expect(motor.obtenerEstado()).toBe('guardado');
  });

  it('6. guardado correcto → el estado queda en "guardado" (dirty=false) y sin mensaje de error', async () => {
    const guardarFn = vi.fn().mockResolvedValue(undefined);
    const motor = new MotorAutoguardado('a', { guardar: guardarFn, debounceMs: 500 });
    motor.actualizarDatos('b');
    await vi.advanceTimersByTimeAsync(500);
    expect(motor.obtenerEstado()).toBe('guardado');
    expect(motor.obtenerError()).toBeNull();
  });

  it('7. error de guardado → el estado queda en "error", NUNCA en "guardado" (dirty permanece true)', async () => {
    const guardarFn = vi.fn().mockRejectedValue(new Error('fallo de red'));
    const motor = new MotorAutoguardado('a', { guardar: guardarFn, debounceMs: 500 });
    motor.actualizarDatos('b');
    await vi.advanceTimersByTimeAsync(500);
    expect(motor.obtenerEstado()).toBe('error');
    expect(motor.obtenerError()).toBe('fallo de red');
  });

  it('8. "Volver" sin cambios: guardarAhora resuelve true de inmediato, sin llamar a la función de guardado', async () => {
    const guardarFn = vi.fn().mockResolvedValue(undefined);
    const motor = new MotorAutoguardado('a', { guardar: guardarFn });
    const ok = await motor.guardarAhora();
    expect(ok).toBe(true);
    expect(guardarFn).not.toHaveBeenCalled();
  });

  it('9. "Volver" con cambios pendientes: guarda antes de salir, sin esperar al debounce', async () => {
    const guardarFn = vi.fn().mockResolvedValue(undefined);
    const motor = new MotorAutoguardado('a', { guardar: guardarFn, debounceMs: 5000 });
    motor.actualizarDatos('b'); // todavía no ha pasado el debounce
    const ok = await motor.guardarAhora();
    expect(ok).toBe(true);
    expect(guardarFn).toHaveBeenCalledWith('b');
    expect(motor.obtenerEstado()).toBe('guardado');
  });

  it('10. "Volver" cuando el guardado falla: no debe navegar silenciosamente — guardarAhora resuelve false', async () => {
    const guardarFn = vi.fn().mockRejectedValue(new Error('servidor caído'));
    const motor = new MotorAutoguardado('a', { guardar: guardarFn, debounceMs: 5000 });
    motor.actualizarDatos('b');
    const ok = await motor.guardarAhora();
    expect(ok).toBe(false);
    expect(motor.obtenerEstado()).toBe('error');
    expect(motor.obtenerError()).toBe('servidor caído');
  });

  it('11. beforeunload: se activa el aviso del navegador en cuanto hay cambios sin guardar', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const guardarFn = vi.fn().mockResolvedValue(undefined);
    const motor = new MotorAutoguardado('a', { guardar: guardarFn, debounceMs: 5000 });
    expect(addSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));
    motor.actualizarDatos('b');
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    addSpy.mockRestore();
  });

  it('12. beforeunload: sin cambios no se activa nada, y se retira en cuanto el guardado termina con éxito', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const guardarFn = vi.fn().mockResolvedValue(undefined);
    const motor = new MotorAutoguardado('a', { guardar: guardarFn, debounceMs: 500 });

    motor.actualizarDatos('b');
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    await vi.advanceTimersByTimeAsync(500); // se guarda con éxito
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('13. el motor nunca muta el objeto de datos que recibe — no tiene ninguna vía de escritura sobre el documento, solo de lectura, por lo que no puede alterar deshacer/rehacer', async () => {
    const documentoEditado = Object.freeze({ paginas: ['a', 'b'], version: 2 });
    const guardarFn = vi.fn().mockResolvedValue(undefined);
    // `Object.freeze` hace que cualquier intento de escritura del motor sobre
    // el objeto lance en modo estricto — si eso ocurriera, este test fallaría
    // por excepción, no por una aserción incorrecta.
    const motor = new MotorAutoguardado(Object.freeze({ paginas: ['a'], version: 1 }), { guardar: guardarFn, debounceMs: 500 });
    motor.actualizarDatos(documentoEditado);
    await vi.advanceTimersByTimeAsync(500);
    expect(guardarFn).toHaveBeenCalledWith(documentoEditado);
    expect(documentoEditado).toEqual({ paginas: ['a', 'b'], version: 2 });
  });

  it('14. imagen de fondo (o cualquier otro campo): el documento completo se guarda tal cual, sin perder propiedades — su persistencia depende solo de que el guardado general funcione, no de lógica específica de este motor', async () => {
    const guardarFn = vi.fn().mockResolvedValue(undefined);
    const conFondo = { paginas: [{ id: 'p1', fondo: { tipo: 'imagen', imagenUrl: 'https://ejemplo.test/fondo.jpg' } }] };
    const motor = new MotorAutoguardado({ paginas: [{ id: 'p1', fondo: null }] }, { guardar: guardarFn, debounceMs: 500 });
    motor.actualizarDatos(conFondo);
    await vi.advanceTimersByTimeAsync(500);
    expect(guardarFn).toHaveBeenCalledWith(conFondo);
    expect(motor.obtenerEstado()).toBe('guardado');
  });

  it('15. ciclo de vida: destruir() cancela el debounce pendiente y retira el aviso de cierre, sin dejar timers ni listeners vivos', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const guardarFn = vi.fn().mockResolvedValue(undefined);
    const motor = new MotorAutoguardado('a', { guardar: guardarFn, debounceMs: 1000 });
    motor.actualizarDatos('b'); // programa un debounce y activa beforeunload
    motor.destruir();
    await vi.advanceTimersByTimeAsync(2000); // si el timer no se hubiera cancelado, aquí se dispararía
    expect(guardarFn).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    removeSpy.mockRestore();
  });
});
