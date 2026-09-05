import { renderToStaticMarkup } from 'react-dom/server';
import { AlmacenamientoUso, formatoGB } from './almacenamiento-uso.js';

/**
 * Panel "Almacenamiento" (cuota por plan, 05/09/2026) — mismo criterio de
 * smoke test que `candado-plan.spec.tsx`: sin infraestructura de tests de
 * interacción de React, un `renderToStaticMarkup` basta para comprobar el
 * estado inicial (el componente hace su propia petición en `useEffect`,
 * que nunca se ejecuta en un render estático — exactamente lo que se
 * quiere comprobar aquí: nunca "en blanco", siempre un mensaje de carga).
 */

describe('formatoGB', () => {
  it('usa coma decimal, nunca punto (convención española del proyecto)', () => {
    expect(formatoGB(1.8 * 1024 ** 3)).toBe('1,8 GB');
  });
  it('un número entero de GB no lleva decimales', () => {
    expect(formatoGB(5 * 1024 ** 3)).toBe('5 GB');
  });
  it('a partir de 10 GB no muestra decimales (evita "24,97 GB" ilegible)', () => {
    expect(formatoGB(24.97 * 1024 ** 3)).toBe('25 GB');
  });
  it('0 bytes se muestra como "0 GB", nunca vacío ni NaN', () => {
    expect(formatoGB(0)).toBe('0 GB');
  });
});

describe('AlmacenamientoUso', () => {
  it('muestra un mensaje de carga en el primer render, nunca queda en blanco', () => {
    const html = renderToStaticMarkup(<AlmacenamientoUso />);
    expect(html).toContain('Cargando uso de almacenamiento');
  });
});
