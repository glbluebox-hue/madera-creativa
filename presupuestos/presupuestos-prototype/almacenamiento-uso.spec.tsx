import { renderToStaticMarkup } from 'react-dom/server';
import { AlmacenamientoUso, formatoGB, etiquetaPlan } from './almacenamiento-uso.js';
import type { UsoAlmacenamiento } from './api.js';

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

/** `UsoAlmacenamiento` de mentira, con solo los campos que le interesan a `etiquetaPlan`. */
function usoDe(plan: UsoAlmacenamiento['plan'], tipoAcceso: UsoAlmacenamiento['tipoAcceso']): UsoAlmacenamiento {
  return { bytesUsados: 0, limiteBytes: 0, plan, tipoAcceso, ilimitado: false, porcentaje: 0, estado: 'normal' };
}

describe('etiquetaPlan — regla explícita, prueba gratuita de 60 días (05/09/2026): nunca "NONE" ni "plan NONE" visible', () => {
  it('trial activo (plan efectivo PRO) muestra "prueba gratuita", nunca "plan PRO"', () => {
    expect(etiquetaPlan(usoDe('PRO', 'trial'))).toBe('prueba gratuita');
  });
  it('trial terminado (plan efectivo NONE) muestra "prueba gratuita terminada", NUNCA "plan NONE" ni "sin plan"', () => {
    const texto = etiquetaPlan(usoDe('NONE', 'trial'));
    expect(texto).toBe('prueba gratuita terminada');
    expect(texto.toUpperCase()).not.toContain('NONE');
  });
  it('un plan de pago real (no trial) sí muestra el nombre técnico del plan', () => {
    expect(etiquetaPlan(usoDe('PRO', 'paid'))).toBe('plan PRO');
    expect(etiquetaPlan(usoDe('BASIC', 'free'))).toBe('plan BASIC');
  });
  it('una cuenta sin plan que NO es un trial nunca muestra "NONE" tal cual', () => {
    const texto = etiquetaPlan(usoDe('NONE', 'free'));
    expect(texto.toUpperCase()).not.toContain('NONE');
  });
});

describe('AlmacenamientoUso', () => {
  it('muestra un mensaje de carga en el primer render, nunca queda en blanco', () => {
    const html = renderToStaticMarkup(<AlmacenamientoUso />);
    expect(html).toContain('Cargando uso de almacenamiento');
  });
});
