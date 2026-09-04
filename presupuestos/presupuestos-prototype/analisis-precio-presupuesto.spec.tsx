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

/**
 * Fase 4 (05/09/2026): "Comparables Inteligentes" (¿cómo estoy respecto a
 * mis propios trabajos?) y "Buscar con IA" (Investigación de Mercado)
 * exigen PREMIUM en el backend — este bloque confirma que el frontend
 * ahora lo refleja (antes ninguno de los dos lo hacía: el primero llamaba
 * siempre a `api.obtenerComparables` y confundía el 403 con "sin
 * histórico"; el segundo abría "Buscar con IA" sin más).
 */
describe('AnalisisPrecioCompleto — gate PREMIUM (Fase 4)', () => {
  it('sin plan PREMIUM, "¿Cómo estoy respecto a mis propios trabajos?" muestra el candado, no el buscador en vivo', () => {
    const html = renderToStaticMarkup(<AnalisisPrecioCompleto analisis={CON_ANALISIS} tipoTrabajo="Cocina" proyectoId="p1" onCerrar={() => {}} plan="PRO" />);
    expect(html).toContain('🔒 PREMIUM');
    expect(html).toContain('disponible en el plan PREMIUM');
    expect(html).not.toContain('Buscando trabajos parecidos');
  });

  it('con plan PREMIUM, "¿Cómo estoy respecto a mis propios trabajos?" sí busca (sin candado en esa sección)', () => {
    const html = renderToStaticMarkup(<AnalisisPrecioCompleto analisis={CON_ANALISIS} tipoTrabajo="Cocina" proyectoId="p1" onCerrar={() => {}} plan="PREMIUM" />);
    expect(html).toContain('Buscando trabajos parecidos');
  });

  it('sin plan PREMIUM, "Buscar con IA" (mercado) aparece deshabilitado con su candado', () => {
    const html = renderToStaticMarkup(
      <AnalisisPrecioCompleto
        analisis={SIN_ANALISIS} tipoTrabajo="Cocina" proyectoId="p1" onCerrar={() => {}}
        ubicacionEmpresa={{ comunidadAutonoma: 'Canarias', provincia: 'Santa Cruz de Tenerife', isla: 'Tenerife' }}
        plan="PRO"
      />
    );
    expect(html).toContain('Buscar con IA');
    expect(html).toContain('disabled');
    expect(html).toContain('🔒 PREMIUM');
  });

  it('con plan PREMIUM, "Buscar con IA" aparece habilitado', () => {
    const html = renderToStaticMarkup(
      <AnalisisPrecioCompleto
        analisis={SIN_ANALISIS} tipoTrabajo="Cocina" proyectoId="p1" onCerrar={() => {}}
        ubicacionEmpresa={{ comunidadAutonoma: 'Canarias', provincia: 'Santa Cruz de Tenerife', isla: 'Tenerife' }}
        plan="PREMIUM"
      />
    );
    expect(html).not.toContain('disabled');
  });
});
