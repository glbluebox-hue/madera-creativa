import { renderToStaticMarkup } from 'react-dom/server';
import { puedeUsar, planesDesde, PRO_O_SUPERIOR, SOLO_PREMIUM } from './planes.js';
import { CandadoPlan, MensajeFuncionBloqueada } from './candado-plan.js';
import { SolicitudResena } from './solicitud-resena.js';

/**
 * Fase 2.5 (04/09/2026) — UX de planes en el frontend. Mismo patrón de
 * smoke test que el resto del módulo (`renderToStaticMarkup`, sin
 * infraestructura de tests de interacción de React): no hace falta simular
 * un clic para comprobar que un botón bloqueado no ofrece el enlace/acción
 * real — basta con que su HTML no lo contenga.
 *
 * El backend (`requirePlan`, `planes.spec.ts` en presupuestos-service)
 * sigue siendo la autoridad real — esto solo comprueba la señal visual.
 */

describe('planes.ts (frontend) — mismo criterio central en toda la UI', () => {
  it('puedeUsar: BASIC no cumple un requisito PRO+', () => {
    expect(puedeUsar('BASIC', PRO_O_SUPERIOR)).toBe(false);
  });
  it('puedeUsar: PRO cumple PRO+ pero no un requisito solo-PREMIUM', () => {
    expect(puedeUsar('PRO', PRO_O_SUPERIOR)).toBe(true);
    expect(puedeUsar('PRO', SOLO_PREMIUM)).toBe(false);
  });
  it('puedeUsar: PREMIUM cumple cualquiera de los dos', () => {
    expect(puedeUsar('PREMIUM', PRO_O_SUPERIOR)).toBe(true);
    expect(puedeUsar('PREMIUM', SOLO_PREMIUM)).toBe(true);
  });
  it('puedeUsar: sin plan (sesión sin cargar todavía) nunca se trata como permitido', () => {
    expect(puedeUsar(undefined, PRO_O_SUPERIOR)).toBe(false);
  });
  it('planesDesde: mismo orden que el backend', () => {
    expect(planesDesde('PRO')).toEqual(['PRO', 'PREMIUM']);
  });
});

/**
 * Bypass administrativo (05/09/2026) — mismo criterio exacto que el
 * backend (`req.usuarioId === 'admin'` en `requirePlan`/
 * `capacidadPermitidaParaPlan`, `presupuestos-service/planes.ts`): la
 * cuenta admin nunca queda bloqueada, sin importar su `Usuario.acceso.plan`
 * almacenado. `esAdmin` viene siempre de `sesion.esAdmin` (`Usuario.esAdmin`
 * en el backend, fijado al iniciar sesión) — nunca algo que el frontend
 * pueda fabricar por su cuenta.
 */
describe('puedeUsar — bypass administrativo', () => {
  it('esAdmin:true permite una capacidad BASIC, PRO o PREMIUM sin importar el plan almacenado', () => {
    expect(puedeUsar('NONE', PRO_O_SUPERIOR, true)).toBe(true);
    expect(puedeUsar('NONE', SOLO_PREMIUM, true)).toBe(true);
    expect(puedeUsar(undefined, SOLO_PREMIUM, true)).toBe(true); // incluso sin ningún plan cargado todavía
  });
  it('esAdmin:false (o ausente) no cambia el comportamiento de siempre', () => {
    expect(puedeUsar('BASIC', PRO_O_SUPERIOR, false)).toBe(false);
    expect(puedeUsar('BASIC', PRO_O_SUPERIOR)).toBe(false);
  });
  it('un plan normal (PRO/PREMIUM) sigue funcionando exactamente igual cuando esAdmin es false', () => {
    expect(puedeUsar('PRO', PRO_O_SUPERIOR, false)).toBe(true);
    expect(puedeUsar('PRO', SOLO_PREMIUM, false)).toBe(false);
    expect(puedeUsar('PREMIUM', SOLO_PREMIUM, false)).toBe(true);
  });
});

describe('CandadoPlan / MensajeFuncionBloqueada — componente reutilizable', () => {
  it('muestra el plan mínimo exacto que se le pasa, nunca un texto suelto', () => {
    expect(renderToStaticMarkup(<CandadoPlan planMinimo="PRO" />)).toContain('PRO');
    expect(renderToStaticMarkup(<CandadoPlan planMinimo="PREMIUM" />)).toContain('PREMIUM');
  });
  it('MensajeFuncionBloqueada incluye el candado y el título', () => {
    const html = renderToStaticMarkup(<MensajeFuncionBloqueada planMinimo="PREMIUM" titulo="Investigación de mercado" />);
    expect(html).toContain('Investigación de mercado');
    expect(html).toContain('PREMIUM');
    expect(html).toContain('🔒');
  });
});

describe('SolicitudResena ("Pedir reseña") — PRO+', () => {
  it('BASIC: el botón aparece deshabilitado, con el candado, sin abrir el modal', () => {
    const html = renderToStaticMarkup(<SolicitudResena clienteId="c1" plan="BASIC" />);
    expect(html).toContain('Pedir reseña');
    expect(html).toContain('disabled');
    expect(html).toContain('🔒');
  });
  it('PRO: el botón funciona exactamente como antes, sin candado ni disabled', () => {
    const html = renderToStaticMarkup(<SolicitudResena clienteId="c1" plan="PRO" />);
    expect(html).toContain('Pedir reseña');
    expect(html).not.toContain('disabled');
    expect(html).not.toContain('🔒');
  });
  it('PREMIUM: igual que PRO, funciona con normalidad', () => {
    const html = renderToStaticMarkup(<SolicitudResena clienteId="c1" plan="PREMIUM" />);
    expect(html).not.toContain('disabled');
  });
  it('sin plan (sesión sin cargar) se trata como bloqueado, nunca como permitido por omisión', () => {
    const html = renderToStaticMarkup(<SolicitudResena clienteId="c1" />);
    expect(html).toContain('disabled');
  });
  it('ADMIN: el botón funciona con normalidad, sin candado ni disabled, aunque su plan almacenado sea NONE', () => {
    const html = renderToStaticMarkup(<SolicitudResena clienteId="c1" plan="NONE" esAdmin />);
    expect(html).not.toContain('disabled');
    expect(html).not.toContain('🔒');
  });
});
