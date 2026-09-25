import { renderToStaticMarkup } from 'react-dom/server';
import { Trimestres } from './trimestres.js';

/**
 * Smoke test de la Posición Fiscal Trimestral (Fase interfaz, 25/09/2026) —
 * mismo patrón que `escaner-factura.spec.tsx`: `renderToStaticMarkup`, sin
 * ejecutar `useEffect` (las peticiones a `api.*` no llegan a dispararse), así
 * que solo se comprueba el render inicial (estado vacío, año en curso, sin
 * facturas todavía cargadas). La separación IRPF/IVA/IGIC y el cálculo en sí
 * ya están cubiertos por `motor-fiscal.spec.ts` (incluida
 * `calcularPosicionFiscal`) — esto solo verifica que la pantalla ofrece las
 * dos secciones pedidas y nunca mezcla IVA con IGIC en un total.
 */
describe('Trimestres — Resultado económico / Posición fiscal', () => {
  it('cada tarjeta de trimestre separa "Resultado económico" de "Posición fiscal"', () => {
    const html = renderToStaticMarkup(<Trimestres />);
    expect(html).toContain('Resultado económico');
    expect(html).toContain('Posición fiscal');
    expect(html).toContain('Modelo 130');
    expect(html).toContain('IVA · Modelo 303');
    expect(html).toContain('IGIC · Modelo 420');
  });

  it('nunca aparece un total que mezcle IVA + IGIC', () => {
    const html = renderToStaticMarkup(<Trimestres />);
    expect(html).not.toContain('Total a pagar');
    expect(html).not.toContain('Total a ingresar');
    expect(html).not.toContain('totalAIngresar');
  });

  it('sin facturas, IVA/IGIC en 0 se etiquetan "A ingresar" (0 >= 0), nunca "A compensar" sin datos reales', () => {
    const html = renderToStaticMarkup(<Trimestres />);
    expect(html).not.toContain('A compensar');
    expect((html.match(/A ingresar/g) ?? []).length).toBeGreaterThanOrEqual(2); // IVA + IGIC de al menos un trimestre
  });
});
