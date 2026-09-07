import { renderToStaticMarkup } from 'react-dom/server';
import { puedeUsar, planesDesde, PRO_O_SUPERIOR, SOLO_PREMIUM, CATALOGO_PLANES, DESCUENTO_ANUAL_PORCENTAJE, calcularAhorroAnual, formatoPrecio } from './planes.js';
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

/**
 * Catálogo comercial (05/09/2026, experiencia de registro/trial/planes) —
 * único punto de verdad de precios/nombres/funciones para toda la UI
 * comercial. Precios oficiales EXACTOS del encargo: nunca deben derivar
 * de un cálculo en coma flotante que pudiera redondear mal lo que se
 * muestra, así que se comprueban aquí como literales.
 */
describe('CATALOGO_PLANES — precios y descuento anual oficiales', () => {
  it('tiene exactamente BASIC, PRO y PREMIUM en ese orden', () => {
    expect(CATALOGO_PLANES.map((p) => p.plan)).toEqual(['BASIC', 'PRO', 'PREMIUM']);
  });
  it('precios mensuales oficiales', () => {
    expect(CATALOGO_PLANES.find((p) => p.plan === 'BASIC')?.precioMensual).toBe(19);
    expect(CATALOGO_PLANES.find((p) => p.plan === 'PRO')?.precioMensual).toBe(39);
    expect(CATALOGO_PLANES.find((p) => p.plan === 'PREMIUM')?.precioMensual).toBe(59);
  });
  it('precios anuales oficiales (ya con el 10% aplicado)', () => {
    expect(CATALOGO_PLANES.find((p) => p.plan === 'BASIC')?.precioAnual).toBe(205.20);
    expect(CATALOGO_PLANES.find((p) => p.plan === 'PRO')?.precioAnual).toBe(421.20);
    expect(CATALOGO_PLANES.find((p) => p.plan === 'PREMIUM')?.precioAnual).toBe(637.20);
  });
  it('almacenamiento anunciado por plan (solo de presentación — el límite real vive en el backend)', () => {
    expect(CATALOGO_PLANES.find((p) => p.plan === 'BASIC')?.almacenamientoGB).toBe(5);
    expect(CATALOGO_PLANES.find((p) => p.plan === 'PRO')?.almacenamientoGB).toBe(25);
    expect(CATALOGO_PLANES.find((p) => p.plan === 'PREMIUM')?.almacenamientoGB).toBe(100);
  });
  it('el descuento anual es siempre del 10% frente al mensual, para los tres planes', () => {
    expect(DESCUENTO_ANUAL_PORCENTAJE).toBe(10);
    for (const info of CATALOGO_PLANES) {
      const anualSinDescuento = info.precioMensual * 12;
      const descuentoReal = (anualSinDescuento - info.precioAnual) / anualSinDescuento;
      expect(Math.round(descuentoReal * 100)).toBe(10);
    }
  });
  it('calcularAhorroAnual: cuánto se ahorra al año pagando anual', () => {
    expect(calcularAhorroAnual(CATALOGO_PLANES[0])).toBeCloseTo(19 * 12 - 205.20, 2);
  });
  it('formatoPrecio: coma decimal, sin decimales si es un número redondo', () => {
    expect(formatoPrecio(19)).toBe('19 €');
    expect(formatoPrecio(205.20)).toBe('205,20 €');
  });
  it('cada plan tiene lema y al menos una función propia, nunca listas vacías', () => {
    for (const info of CATALOGO_PLANES) {
      expect(info.lema.length).toBeGreaterThan(0);
      expect(info.caracteristicasPropias.length).toBeGreaterThan(0);
    }
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
