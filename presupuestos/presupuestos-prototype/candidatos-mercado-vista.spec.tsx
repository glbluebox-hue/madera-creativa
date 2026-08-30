import { renderToStaticMarkup } from 'react-dom/server';
import { CandidatosMercadoVista } from './candidatos-mercado-vista.js';

/**
 * Smoke test de render estático (mismo patrón que
 * `metricas-por-tipo-vista.spec.tsx` — el repo no tiene infraestructura de
 * tests de interacción de React todavía). Cubre el estado inicial
 * ("eligiendo"), antes de cualquier llamada de red — la lógica de
 * guardado/comparabilidad, que sí necesita casos con estado, está probada
 * por separado y sin red en `candidatos-mercado.spec.ts` (mapeo) y
 * `mercado-local.spec.ts` (filtro de comparabilidad, ya agnóstico del
 * origen de la referencia).
 */
describe('CandidatosMercadoVista — estado inicial', () => {
  it('muestra el botón "Buscar con IA" y los chips de alcance/calidad ya preseleccionados', () => {
    const html = renderToStaticMarkup(
      <CandidatosMercadoVista
        tipoTrabajo="Cocina"
        alcanceInicial="mobiliario_encimera"
        nivelCalidadInicial="estandar"
        onGuardado={() => {}}
        onCerrar={() => {}}
      />
    );
    expect(html).toContain('Buscar con IA');
    expect(html).toContain('Cocina');
    expect(html).toContain('Mobiliario + encimera');
    expect(html).toContain('Estándar');
  });

  it('nunca muestra un candidato ni un precio antes de buscar', () => {
    const html = renderToStaticMarkup(
      <CandidatosMercadoVista tipoTrabajo="Cocina" alcanceInicial="solo_mobiliario" nivelCalidadInicial={null} onGuardado={() => {}} onCerrar={() => {}} />
    );
    expect(html).not.toContain('Confianza');
    expect(html).not.toMatch(/\d+[.,]\d+\s*€/);
  });
});
