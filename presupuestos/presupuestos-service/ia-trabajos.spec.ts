import { crearTrabajo, completarTrabajo, fallarTrabajo, obtenerTrabajo } from './ia-trabajos.js';

/**
 * Regresión de aislamiento (auditoría "Facturas privadas", 27/08/2026):
 * confirma que `obtenerTrabajo` ya comprueba el propietario — no es un
 * fix, es un test que deja constatado un comportamiento correcto ya
 * existente, para que una futura refactorización no lo rompa sin que
 * salte una prueba.
 */
describe('ia-trabajos — aislamiento por usuario', () => {
  it('un usuario no puede leer el trabajo creado por otro', () => {
    const id = crearTrabajo('usuario-a');
    completarTrabajo(id, { respuesta: 'dato sensible de usuario-a' });

    expect(obtenerTrabajo(id, 'usuario-a')).toBeDefined();
    expect(obtenerTrabajo(id, 'usuario-b')).toBeUndefined();
  });

  it('un trabajo con error tampoco es legible por otro usuario', () => {
    const id = crearTrabajo('usuario-a');
    fallarTrabajo(id, 'algo salió mal');

    expect(obtenerTrabajo(id, 'usuario-a')?.error).toBe('algo salió mal');
    expect(obtenerTrabajo(id, 'usuario-b')).toBeUndefined();
  });

  it('un id inexistente no revela nada, para nadie', () => {
    expect(obtenerTrabajo('id-que-no-existe', 'usuario-a')).toBeUndefined();
  });
});
