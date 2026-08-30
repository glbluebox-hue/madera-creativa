import { renderToStaticMarkup } from 'react-dom/server';
import { Diseno3DVista } from './diseno-3d-vista.js';
import type { Modelo3D } from './types.js';

/**
 * Smoke test de render estático (mismo patrón que
 * `metricas-por-tipo-vista.spec.tsx`/`candidatos-mercado-vista.spec.tsx`
 * — sin infraestructura de tests de interacción de React, y este
 * componente además depende de un iframe real y una llamada de red en
 * `useEffect`, que no se ejecutan en SSR). Solo cubre el estado inicial;
 * la lógica real de selección de archivo está en `diseno-3d.spec.ts`,
 * sin red ni renderizado.
 */
const MODELO: Modelo3D = {
  proveedor: 'trimble_connect', trimbleProjectId: 'p1', trimbleFolderId: '', trimbleFileId: 'f1',
  nombreArchivo: 'Cocina_Garcia_v01.skp', version: 2, actualizado: '2026-08-30T10:00:00.000Z',
  thumbnailUrl: '', asociadoPor: 'usuario-1',
};

describe('Diseno3DVista — estado inicial (antes de que useEffect resuelva la conexión)', () => {
  it('renderiza el título y el estado "comprobando" sin lanzar, con o sin modelo asociado', () => {
    const html1 = renderToStaticMarkup(<Diseno3DVista proyectoId="p1" modelo3D={null} onActualizarProyecto={() => {}} />);
    expect(html1).toContain('Diseño 3D');
    expect(html1).toContain('Comprobando tu conexión con SketchUp');

    const html2 = renderToStaticMarkup(<Diseno3DVista proyectoId="p1" modelo3D={MODELO} onActualizarProyecto={() => {}} />);
    expect(html2).toContain('Diseño 3D');
  });

  it('nunca muestra el nombre del modelo ni botones de acción antes de saber si hay conexión', () => {
    const html = renderToStaticMarkup(<Diseno3DVista proyectoId="p1" modelo3D={MODELO} onActualizarProyecto={() => {}} />);
    expect(html).not.toContain('Cocina_Garcia_v01.skp');
    expect(html).not.toContain('Visualizar en SketchUp');
  });
});
