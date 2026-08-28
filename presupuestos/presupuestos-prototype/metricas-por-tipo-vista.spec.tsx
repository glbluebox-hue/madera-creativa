import { renderToStaticMarkup } from 'react-dom/server';
import { MetricasPorTipoVista } from './metricas-por-tipo-vista.js';
import type { MetricasGrupo } from './metricas-por-tipo.js';

/**
 * Corrección real, 28/08/2026: "Por tipo de trabajo" desaparecía por
 * completo (`return null`) cuando `calcularMetricasPorTipo()` no
 * encontraba ningún grupo — un usuario sin `tipoTrabajo` guardado en
 * ningún proyecto no veía absolutamente nada, ni el título. Este es el
 * primer `.spec.tsx` del paquete (el patrón de vitest ya lo admite,
 * `**\/*.{test,spec}.?(c|m)[jt]s?(x)`) — usa `react-dom/server`
 * (dependencia ya instalada, ninguna librería nueva) para renderizar de
 * verdad el componente a HTML y comprobar qué texto contiene, en vez de
 * solo probar la lógica de datos.
 */

function metricaBase(extra: Partial<MetricasGrupo> = {}): MetricasGrupo {
  return {
    tipoTrabajo: 'Cocina', numTrabajos: 5, margenMedio: 40, margenMediana: 41,
    precioMinimo: 5000, precioMaximo: 15000, numConMargenReal: 3, numSoloConMargenPrevisto: 2,
    historicoSuficiente: true, nivelConfianza: 'alta', senales: [],
    ...extra,
  };
}

describe('MetricasPorTipoVista — estado vacío (corrección 28/08/2026)', () => {
  it('con métricas vacías, la sección SIGUE visible: título + mensaje de estado vacío, nunca desaparece', () => {
    const html = renderToStaticMarkup(<MetricasPorTipoVista metricas={[]} />);
    expect(html).toContain('Por tipo de trabajo');
    expect(html).toContain('Todavía no tienes suficientes trabajos con tipo de trabajo registrado');
    expect(html).toContain('Cuando finalices tus próximos trabajos');
  });

  it('el estado vacío nunca muestra ninguna cifra inventada (sin %, sin €, sin nivel de confianza)', () => {
    const html = renderToStaticMarkup(<MetricasPorTipoVista metricas={[]} />);
    expect(html).not.toMatch(/\d+%/);
    expect(html).not.toContain('Confianza');
  });

  it('con métricas presentes, se muestran las tarjetas reales en vez del estado vacío', () => {
    const html = renderToStaticMarkup(<MetricasPorTipoVista metricas={[metricaBase()]} />);
    expect(html).toContain('Cocina');
    expect(html).not.toContain('Todavía no tienes suficientes trabajos');
  });

  it('un grupo con histórico insuficiente (1-2 trabajos) se sigue mostrando dentro de la sección, marcado como tal — comportamiento ya diseñado, sin cambios', () => {
    const html = renderToStaticMarkup(<MetricasPorTipoVista metricas={[metricaBase({ numTrabajos: 1, historicoSuficiente: false })]} />);
    expect(html).toContain('Histórico insuficiente');
  });
});
