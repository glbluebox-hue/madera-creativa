import { coincideCondicion } from './automatizaciones-listener.js';

describe('coincideCondicion (Motor Documental, Incremento 11 — automatización por eventos)', () => {
  it('una condición vacía coincide con cualquier evento', () => {
    expect(coincideCondicion({}, { clienteId: 'c1', precioTotal: 500 })).toBe(true);
    expect(coincideCondicion({}, {})).toBe(true);
  });

  it('coincide solo si todas las claves de la condición igualan exactamente a los datos', () => {
    expect(coincideCondicion({ clienteId: 'c1' }, { clienteId: 'c1', precioTotal: 500 })).toBe(true);
    expect(coincideCondicion({ clienteId: 'c1', precioTotal: 500 }, { clienteId: 'c1', precioTotal: 500 })).toBe(true);
  });

  it('no coincide si una clave de la condición tiene un valor distinto en los datos', () => {
    expect(coincideCondicion({ clienteId: 'c1' }, { clienteId: 'c2' })).toBe(false);
  });

  it('no coincide si una clave de la condición no existe en los datos del evento', () => {
    expect(coincideCondicion({ clienteId: 'c1' }, { precioTotal: 500 })).toBe(false);
  });
});
