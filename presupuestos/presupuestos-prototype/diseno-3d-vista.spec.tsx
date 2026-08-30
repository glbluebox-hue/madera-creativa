import { renderToStaticMarkup } from 'react-dom/server';
import { Diseno3DVista } from './diseno-3d-vista.js';
import type { Modelo3D } from './types.js';

/**
 * Diseño 3D — subida manual + enlace externo (30/08/2026, independiente
 * de Trimble). Smoke test con `renderToStaticMarkup` (mismo patrón que
 * `metricas-por-tipo-vista.spec.tsx` — sin infraestructura de tests de
 * interacción de React); la validación real del archivo está en
 * `modelo-3d-archivo.spec.ts`, sin red ni renderizado.
 */
const MODELO: Modelo3D = {
  proveedor: 'manual', nombreArchivo: 'Cocina_Garcia.glb', formato: 'glb',
  actualizado: '2026-08-30T10:00:00.000Z', asociadoPor: 'usuario-1',
  url: '/api/presupuestos-service/almacenamiento/modelos3d/abc.glb',
  claveAlmacenamiento: 'modelos3d/abc.glb', tamano: 2_500_000,
};

describe('Diseno3DVista — sin modelo asociado', () => {
  it('ofrece subir un modelo 3D y siempre muestra el enlace externo a SketchUp', () => {
    const html = renderToStaticMarkup(<Diseno3DVista proyectoId="p1" modelo3D={null} onActualizarProyecto={() => {}} />);
    expect(html).toContain('Subir modelo 3D');
    expect(html).toContain('Visualizar en SketchUp');
    expect(html).toContain('https://app.sketchup.com');
  });

  it('nunca menciona conectar cuentas ni iniciar sesión propia — es un enlace externo simple', () => {
    const html = renderToStaticMarkup(<Diseno3DVista proyectoId="p1" modelo3D={null} onActualizarProyecto={() => {}} />);
    expect(html).not.toContain('Conectar con SketchUp');
    expect(html).not.toContain('Conectar con Trimble');
  });
});

describe('Diseno3DVista — con modelo asociado', () => {
  it('muestra nombre, formato y fecha, con los botones de visualizar/descargar/reemplazar/eliminar', () => {
    const html = renderToStaticMarkup(<Diseno3DVista proyectoId="p1" modelo3D={MODELO} onActualizarProyecto={() => {}} />);
    expect(html).toContain('Cocina_Garcia.glb');
    expect(html).toContain('Visualizar en 3D');
    expect(html).toContain('Descargar modelo');
    expect(html).toContain('Reemplazar');
    expect(html).toContain('Eliminar');
  });

  it('el enlace a SketchUp sigue presente aunque ya haya un modelo propio', () => {
    const html = renderToStaticMarkup(<Diseno3DVista proyectoId="p1" modelo3D={MODELO} onActualizarProyecto={() => {}} />);
    expect(html).toContain('https://app.sketchup.com');
  });

  it('el enlace de descarga apunta a la URL real del archivo', () => {
    const html = renderToStaticMarkup(<Diseno3DVista proyectoId="p1" modelo3D={MODELO} onActualizarProyecto={() => {}} />);
    expect(html).toContain(MODELO.url!);
  });
});
