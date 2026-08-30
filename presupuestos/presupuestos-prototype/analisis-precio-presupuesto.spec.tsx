import { renderToStaticMarkup } from 'react-dom/server';
import { AnalisisPrecioPresupuesto, AnalisisPrecioCompleto } from './analisis-precio-presupuesto.js';
import type { AnalisisPrecio } from './inteligencia-precios.js';

/**
 * Corrección 30/08/2026 (dos capas):
 * 1. Sin coste/margen todavía (presupuesto recién creado, sin gastos/
 *    ingresos), "¿Cómo estoy respecto al mercado?"/"Buscar con IA"
 *    quedaban inalcanzables — el componente se paraba en un simple
 *    mensaje de "datos insuficientes" sin ningún botón.
 * 2. Un proyecto EN CURSO (el caso normal mientras se presupuesta) nunca
 *    tiene `tipoTrabajo` todavía — solo se pregunta al marcar "Finalizado"
 *    (`pregunta-tipo-trabajo.tsx`) — así que el botón tampoco podía
 *    depender de tenerlo ya puesto: el modal completo ahora ofrece
 *    definirlo ahí mismo (`PreguntaTipoTrabajo` reutilizado).
 * Smoke test con `renderToStaticMarkup` (mismo patrón que
 * `metricas-por-tipo-vista.spec.tsx` — sin infraestructura de tests de
 * interacción, solo confirma que el botón para llegar a esa sección
 * SIEMPRE existe, nunca un callejón sin salida).
 */
const SIN_ANALISIS: AnalisisPrecio = { disponible: false, motivo: 'sin_costes' };
const CON_ANALISIS: AnalisisPrecio = {
  disponible: true, precio: 5000, costeEstimado: 3000, margenPorcentaje: 40, margenObjetivoPorcentaje: 35,
  diferenciaPuntos: 5, estado: 'por_encima',
};

describe('AnalisisPrecioPresupuesto — sin datos de coste/margen todavía', () => {
  it('con tipoTrabajo, ofrece un botón para llegar a Mercado Local / Buscar con IA', () => {
    const html = renderToStaticMarkup(<AnalisisPrecioPresupuesto analisis={SIN_ANALISIS} tipoTrabajo="Cocina" />);
    expect(html).toContain('Ver mercado');
    expect(html).toContain('Buscar con IA');
  });

  it('sin tipoTrabajo (proyecto todavía en curso, lo normal mientras se presupuesta), el botón SIGUE existiendo — nunca un callejón sin salida', () => {
    const html = renderToStaticMarkup(<AnalisisPrecioPresupuesto analisis={SIN_ANALISIS} tipoTrabajo={null} proyectoId="p1" />);
    expect(html).toContain('Ver mercado');
  });
});

describe('AnalisisPrecioPresupuesto — con datos de coste/margen (sin regresión)', () => {
  it('sigue mostrando el resumen de precio/coste/margen de siempre', () => {
    const html = renderToStaticMarkup(<AnalisisPrecioPresupuesto analisis={CON_ANALISIS} tipoTrabajo="Cocina" />);
    expect(html).toContain('Ver análisis completo');
    expect(html).toContain('40.0%');
  });
});

describe('AnalisisPrecioCompleto — sin tipoTrabajo todavía (proyecto en curso)', () => {
  it('con proyecto vinculado, ofrece definir el tipo de trabajo ahí mismo en vez de ocultar la sección', () => {
    const html = renderToStaticMarkup(
      <AnalisisPrecioCompleto analisis={SIN_ANALISIS} tipoTrabajo={null} proyectoId="p1" onCerrar={() => {}} />
    );
    expect(html).toContain('Indicar tipo de trabajo');
    expect(html).not.toContain('Sin proyecto vinculado');
  });

  it('sin proyecto vinculado en absoluto, explica por qué en vez de ofrecer un botón que no puede funcionar', () => {
    const html = renderToStaticMarkup(
      <AnalisisPrecioCompleto analisis={SIN_ANALISIS} tipoTrabajo={null} proyectoId={null} onCerrar={() => {}} />
    );
    expect(html).toContain('Sin proyecto vinculado');
    expect(html).not.toContain('Indicar tipo de trabajo');
  });

  it('con tipoTrabajo ya conocido, la sección de mercado se muestra con normalidad (sin regresión)', () => {
    const html = renderToStaticMarkup(
      <AnalisisPrecioCompleto
        analisis={SIN_ANALISIS} tipoTrabajo="Cocina" proyectoId="p1" onCerrar={() => {}}
        ubicacionEmpresa={{ comunidadAutonoma: 'Canarias', provincia: 'Santa Cruz de Tenerife', isla: 'Tenerife' }}
      />
    );
    expect(html).not.toContain('Indicar tipo de trabajo');
    expect(html).toContain('Todavía no tienes ninguna referencia de mercado guardada');
  });
});
