import { renderToStaticMarkup } from 'react-dom/server';
import { TarjetaModelo3D } from './tarjeta-modelo-3d.js';
import { BotonSubirModelo3D } from './boton-subir-modelo-3d.js';
import type { Modelo3D } from './types.js';

/**
 * Diseño 3D — piezas integradas en "Archivos del proyecto" (30/08/2026).
 * Smoke test con `renderToStaticMarkup` (mismo patrón que el resto de
 * componentes de este módulo — sin infraestructura de tests de
 * interacción de React).
 */
const MODELO: Modelo3D = {
  proveedor: 'manual', nombreArchivo: 'Cocina_Garcia.glb', formato: 'glb',
  actualizado: '2026-08-30T10:00:00.000Z', asociadoPor: 'usuario-1',
  url: '/api/presupuestos-service/almacenamiento/modelos3d/abc.glb',
  claveAlmacenamiento: 'modelos3d/abc.glb', tamano: 2_500_000,
};

describe('BotonSubirModelo3D', () => {
  it('dice "Subir dibujo 3D" cuando no hay modelo todavía', () => {
    const html = renderToStaticMarkup(<BotonSubirModelo3D subiendo={false} onArchivo={() => {}} />);
    expect(html).toContain('Subir dibujo 3D');
  });

  it('dice "Reemplazar dibujo 3D" cuando ya hay uno', () => {
    const html = renderToStaticMarkup(<BotonSubirModelo3D subiendo={false} onArchivo={() => {}} reemplazar />);
    expect(html).toContain('Reemplazar dibujo 3D');
  });
});

describe('TarjetaModelo3D — solo existe cuando HAY un modelo', () => {
  it('muestra el nombre del archivo y "Ver en SketchUp" siempre que se renderiza (nunca sin modelo, porque el componente exige uno)', () => {
    const html = renderToStaticMarkup(
      <TarjetaModelo3D modelo3D={MODELO} subiendo={false} desasociando={false} onReemplazar={() => {}} onEliminar={() => {}} />
    );
    expect(html).toContain('Cocina_Garcia.glb');
    expect(html).toContain('Ver en SketchUp');
    expect(html).toContain('https://app.sketchup.com');
  });

  it('muestra Visualizar/Descargar/Reemplazar/Eliminar', () => {
    const html = renderToStaticMarkup(
      <TarjetaModelo3D modelo3D={MODELO} subiendo={false} desasociando={false} onReemplazar={() => {}} onEliminar={() => {}} />
    );
    expect(html).toContain('Visualizar en 3D');
    expect(html).toContain('Descargar modelo');
    expect(html).toContain('Reemplazar dibujo 3D');
    expect(html).toContain('Eliminar');
  });
});
