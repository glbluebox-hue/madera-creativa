import { renderToStaticMarkup } from 'react-dom/server';
import { AnalisisPrecioPresupuesto } from './analisis-precio-presupuesto.js';
import type { AnalisisPrecio } from './inteligencia-precios.js';

/**
 * Corrección 30/08/2026: sin coste/margen todavía (presupuesto recién
 * creado, sin gastos/ingresos), "¿Cómo estoy respecto al mercado?" y
 * "Buscar con IA" quedaban inalcanzables — el componente se paraba en un
 * simple mensaje de "datos insuficientes" sin ningún botón. Ninguna de las
 * dos secciones necesita coste/margen (`mercadoLocal` se calcula solo a
 * partir de `tipoTrabajo`/ubicación). Smoke test con `renderToStaticMarkup`
 * (mismo patrón que `metricas-por-tipo-vista.spec.tsx` — sin infraestructura
 * de tests de interacción, solo confirma que el botón para llegar a esa
 * sección SIGUE existiendo).
 */
const SIN_ANALISIS: AnalisisPrecio = { disponible: false, motivo: 'sin_costes' };
const CON_ANALISIS: AnalisisPrecio = {
  disponible: true, precio: 5000, costeEstimado: 3000, margenPorcentaje: 40, margenObjetivoPorcentaje: 35,
  diferenciaPuntos: 5, estado: 'por_encima',
};

describe('AnalisisPrecioPresupuesto — sin datos de coste/margen todavía', () => {
  it('con tipoTrabajo, sigue ofreciendo un botón para llegar a Mercado Local / Buscar con IA (no es un callejón sin salida)', () => {
    const html = renderToStaticMarkup(<AnalisisPrecioPresupuesto analisis={SIN_ANALISIS} tipoTrabajo="Cocina" />);
    expect(html).toContain('Ver mercado');
    expect(html).toContain('Buscar con IA');
  });

  it('sin tipoTrabajo (sin proyecto vinculado), no ofrece el botón — no hay mercado que consultar sin saber el tipo de trabajo', () => {
    const html = renderToStaticMarkup(<AnalisisPrecioPresupuesto analisis={SIN_ANALISIS} tipoTrabajo={null} />);
    expect(html).not.toContain('Ver mercado');
  });
});

describe('AnalisisPrecioPresupuesto — con datos de coste/margen (sin regresión)', () => {
  it('sigue mostrando el resumen de precio/coste/margen de siempre', () => {
    const html = renderToStaticMarkup(<AnalisisPrecioPresupuesto analisis={CON_ANALISIS} tipoTrabajo="Cocina" />);
    expect(html).toContain('Ver análisis completo');
    expect(html).toContain('40.0%');
  });
});
