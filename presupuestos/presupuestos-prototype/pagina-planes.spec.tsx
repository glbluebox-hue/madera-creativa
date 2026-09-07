import { renderToStaticMarkup } from 'react-dom/server';
import { SelectorPeriodo } from './selector-periodo.js';
import { TarjetaPlan } from './tarjeta-plan.js';
import { PaginaPlanes } from './pagina-planes.js';
import { CATALOGO_PLANES } from './planes.js';

/**
 * Página de planes (05/09/2026, etiqueta/estilo de la tarjeta Pro
 * revisados el 08/09/2026) — smoke tests con `renderToStaticMarkup`,
 * mismo criterio que el resto del módulo. Cubren las reglas explícitas
 * del encargo: precios exactos, etiqueta "EL MÁS ELEGIDO" con fondo
 * oscuro propio en PRO, acordeón con `aria-expanded` (nunca modal/página
 * nueva), CTA que nunca simula un pago real ya realizado, y el aviso de
 * marca de SketchUp/Trimble junto a la mención de "SketchUp Desktop" en PRO.
 */

describe('SelectorPeriodo', () => {
  it('un único selector, con mensual y anual, marcando cuál está activo', () => {
    const html = renderToStaticMarkup(<SelectorPeriodo periodo="mensual" onCambiar={() => {}} />);
    expect(html).toContain('Mensual');
    expect(html).toContain('Anual');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });
  it('muestra el 10% de descuento junto a la opción anual', () => {
    const html = renderToStaticMarkup(<SelectorPeriodo periodo="anual" onCambiar={() => {}} />);
    expect(html).toContain('10%');
  });
});

describe('TarjetaPlan', () => {
  const basic = CATALOGO_PLANES.find((p) => p.plan === 'BASIC')!;
  const pro = CATALOGO_PLANES.find((p) => p.plan === 'PRO')!;

  it('BASIC mensual: nombre, lema y precio mensual exactos', () => {
    const html = renderToStaticMarkup(<TarjetaPlan info={basic} periodo="mensual" />);
    expect(html).toContain('Basic');
    expect(html).toContain('Yo gestiono.');
    expect(html).toContain('19 €');
    expect(html).toContain('/mes');
  });

  it('BASIC anual: precio anual exacto y ahorro mostrado', () => {
    const html = renderToStaticMarkup(<TarjetaPlan info={basic} periodo="anual" />);
    expect(html).toContain('205,20 €');
    expect(html).toContain('/año');
    expect(html).toContain('Ahorras');
  });

  it('PRO destacado usa la etiqueta "EL MÁS ELEGIDO" (decisión revisada 08/09/2026, sustituye "RECOMENDADO") y fondo oscuro propio', () => {
    const html = renderToStaticMarkup(<TarjetaPlan info={pro} periodo="mensual" destacado />);
    expect(html.toUpperCase()).toContain('EL MÁS ELEGIDO');
    expect(html).not.toContain('RECOMENDADO');
    expect(html).toContain('var(--marca-oscura)');
  });

  it('BASIC (no destacado) no lleva la etiqueta ni el fondo oscuro', () => {
    const html = renderToStaticMarkup(<TarjetaPlan info={basic} periodo="mensual" />);
    expect(html.toUpperCase()).not.toContain('EL MÁS ELEGIDO');
    expect(html).not.toContain('var(--marca-oscura)');
  });

  it('el acordeón de detalle usa aria-expanded (nunca modal/página nueva) y empieza cerrado', () => {
    const html = renderToStaticMarkup(<TarjetaPlan info={pro} periodo="mensual" />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Ver todas las funciones');
  });

  it('el botón "Elegir…" nunca aparece deshabilitado ni simula un pago ya hecho', () => {
    const html = renderToStaticMarkup(<TarjetaPlan info={basic} periodo="mensual" />);
    expect(html).toContain('Elegir Basic');
    expect(html).not.toContain('disabled');
    expect(html.toLowerCase()).not.toContain('pago realizado');
    expect(html.toLowerCase()).not.toContain('compra completada');
  });

  it('PRO muestra siempre el aviso de marca de SketchUp/Trimble, incluso con el acordeón cerrado (nunca detrás de un tooltip)', () => {
    const html = renderToStaticMarkup(<TarjetaPlan info={pro} periodo="mensual" />);
    expect(html).toContain('SketchUp');
    expect(html).toContain('Trimble');
  });

  it('BASIC y PREMIUM no llevan el aviso de marca de SketchUp (no mencionan la función)', () => {
    const premium = CATALOGO_PLANES.find((p) => p.plan === 'PREMIUM')!;
    expect(renderToStaticMarkup(<TarjetaPlan info={basic} periodo="mensual" />)).not.toContain('Trimble');
    expect(renderToStaticMarkup(<TarjetaPlan info={premium} periodo="mensual" />)).not.toContain('Trimble');
  });
});

describe('PaginaPlanes', () => {
  const html = renderToStaticMarkup(<PaginaPlanes />);

  it('muestra las tres tarjetas de plan a la vez', () => {
    expect(html).toContain('Basic');
    expect(html).toContain('Pro');
    expect(html).toContain('Premium');
  });

  it('un único selector de periodo (no tres independientes)', () => {
    expect(html.match(/Mensual/g)?.length).toBe(1);
  });

  it('nunca muestra el valor técnico "NONE" como texto (los atributos SVG fill="none" no cuentan)', () => {
    expect(html).not.toMatch(/>NONE</);
  });
});
