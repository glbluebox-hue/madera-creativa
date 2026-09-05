import { renderToStaticMarkup } from 'react-dom/server';
import { TarjetaModelo3D } from './tarjeta-modelo-3d.js';
import { BotonSubirModelo3D } from './boton-subir-modelo-3d.js';
import type { Modelo3D } from './types.js';

/**
 * Diseño 3D / SketchUp Desktop — piezas integradas en "Archivos del
 * proyecto" (30/08/2026, cierre de plan 05/09/2026). Smoke test con
 * `renderToStaticMarkup` (mismo patrón que el resto de componentes de
 * este módulo — sin infraestructura de tests de interacción de React).
 *
 * Decisión definitiva (05/09/2026): "Modelo 3D" y "SketchUp Desktop" son
 * función PRO/PREMIUM COMPLETA — BASIC no las tiene en absoluto (antes
 * solo se bloqueaba el enlace "Ver en SketchUp"; subir/ver/reemplazar/
 * eliminar el modelo propio quedaban libres para cualquier plan). El
 * texto de marca de Trimble debe aparecer siempre que se mencione
 * "SketchUp Desktop", visible sin depender de un tooltip/hover, y nunca
 * hay logotipos externos.
 */
const MODELO: Modelo3D = {
  proveedor: 'manual', nombreArchivo: 'Cocina_Garcia.glb', formato: 'glb',
  actualizado: '2026-08-30T10:00:00.000Z', asociadoPor: 'usuario-1',
  url: '/api/presupuestos-service/almacenamiento/modelos3d/abc.glb',
  claveAlmacenamiento: 'modelos3d/abc.glb', tamano: 2_500_000,
};

const AVISO_MARCA = 'SketchUp es una marca de Trimble Inc. Madera Creativa Estudio no está afiliada ni patrocinada por Trimble.';

/** El aviso debe estar en el contenido visible de un elemento (p. ej. dentro de un `<p>...</p>`), nunca solo dentro de un atributo `title="..."` — eso equivaldría a esconderlo detrás de un hover. */
function avisoVisibleComoContenido(html: string): boolean {
  return new RegExp(`<p[^>]*>[^<]*${AVISO_MARCA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(html);
}

/** Ninguna imagen/logo externo de SketchUp o Trimble — solo se permite el nombre textual. */
function sinLogotiposExternos(html: string): boolean {
  return !/<img[^>]*(sketchup|trimble)/i.test(html) && !/logo.*sketchup|logo.*trimble/i.test(html);
}

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

describe('TarjetaModelo3D — BASIC: función completamente bloqueada (decisión definitiva 05/09/2026)', () => {
  it('BASIC con un modelo YA subido (p. ej. tras un downgrade PRO→BASIC) ve la tarjeta bloqueada, nunca el modelo real', () => {
    const html = renderToStaticMarkup(
      <TarjetaModelo3D modelo3D={MODELO} subiendo={false} desasociando={false} onReemplazar={() => {}} onEliminar={() => {}} plan="BASIC" />
    );
    expect(html).toContain('Modelo 3D y SketchUp Desktop');
    expect(html).toContain('Disponible en PRO');
    expect(html).toContain('🔒');
    // Nada funcional real: ni el nombre del archivo, ni los botones de acción, ni el enlace de SketchUp.
    expect(html).not.toContain('Cocina_Garcia.glb');
    expect(html).not.toContain('Visualizar en 3D');
    expect(html).not.toContain('Descargar modelo');
    expect(html).not.toContain('Reemplazar dibujo 3D');
    expect(html).not.toContain('Subir dibujo 3D');
    expect(html).not.toContain('https://app.sketchup.com');
  });

  it('BASIC sin ningún modelo tampoco ve el botón de subida — solo la tarjeta bloqueada', () => {
    const html = renderToStaticMarkup(
      <TarjetaModelo3D modelo3D={null} subiendo={false} desasociando={false} onReemplazar={() => {}} onEliminar={() => {}} plan="BASIC" />
    );
    expect(html).toContain('Disponible en PRO');
    expect(html).not.toContain('Subir dibujo 3D');
  });

  it('el aviso de marca de Trimble aparece igualmente en la tarjeta bloqueada de BASIC, visible como contenido (no en un tooltip)', () => {
    const html = renderToStaticMarkup(
      <TarjetaModelo3D modelo3D={null} subiendo={false} desasociando={false} onReemplazar={() => {}} onEliminar={() => {}} plan="BASIC" />
    );
    expect(avisoVisibleComoContenido(html)).toBe(true);
  });

  it('un plan NONE/undefined (sesión sin cargar o sin plan asignado) se trata igual que BASIC — nunca como permitido por omisión', () => {
    const html = renderToStaticMarkup(
      <TarjetaModelo3D modelo3D={MODELO} subiendo={false} desasociando={false} onReemplazar={() => {}} onEliminar={() => {}} />
    );
    expect(html).toContain('Disponible en PRO');
    expect(html).not.toContain('Cocina_Garcia.glb');
  });
});

describe.each(['PRO', 'PREMIUM'] as const)('TarjetaModelo3D — %s: función completa desbloqueada', (plan) => {
  it('sin modelo todavía, solo ofrece el botón de subida (sin enlace de SketchUp, que no tiene sentido sin un modelo)', () => {
    const html = renderToStaticMarkup(
      <TarjetaModelo3D modelo3D={null} subiendo={false} desasociando={false} onReemplazar={() => {}} onEliminar={() => {}} plan={plan} />
    );
    expect(html).toContain('Subir dibujo 3D');
    expect(html).not.toContain('Disponible en PRO');
  });

  it('con un modelo ya subido, muestra "Modelo 3D", el archivo real y todas las acciones', () => {
    const html = renderToStaticMarkup(
      <TarjetaModelo3D modelo3D={MODELO} subiendo={false} desasociando={false} onReemplazar={() => {}} onEliminar={() => {}} plan={plan} />
    );
    expect(html).toContain('Modelo 3D');
    expect(html).toContain('Cocina_Garcia.glb');
    expect(html).toContain('Visualizar en 3D');
    expect(html).toContain('Descargar modelo');
    expect(html).toContain('Reemplazar dibujo 3D');
    expect(html).toContain('Eliminar');
  });

  it('muestra "SketchUp Desktop" como nombre textual y el enlace real "Abrir en SketchUp Desktop ↗"', () => {
    const html = renderToStaticMarkup(
      <TarjetaModelo3D modelo3D={MODELO} subiendo={false} desasociando={false} onReemplazar={() => {}} onEliminar={() => {}} plan={plan} />
    );
    expect(html).toContain('SketchUp Desktop');
    expect(html).toContain('Abrir en SketchUp Desktop ↗');
    expect(html).toContain('https://app.sketchup.com');
    expect(html).not.toContain('🔒');
  });

  it('nunca usa expresiones de afiliación/patrocinio oficial ni logotipos externos', () => {
    const html = renderToStaticMarkup(
      <TarjetaModelo3D modelo3D={MODELO} subiendo={false} desasociando={false} onReemplazar={() => {}} onEliminar={() => {}} plan={plan} />
    );
    expect(html.toLowerCase()).not.toContain('integración oficial');
    expect(html.toLowerCase()).not.toContain('partner de sketchup');
    expect(html.toLowerCase()).not.toContain('certificado por sketchup');
    expect(html.toLowerCase()).not.toContain('powered by sketchup');
    expect(sinLogotiposExternos(html)).toBe(true);
  });

  it('el aviso de marca de Trimble aparece justo junto a "SketchUp Desktop", visible como contenido (nunca solo en un tooltip)', () => {
    const html = renderToStaticMarkup(
      <TarjetaModelo3D modelo3D={MODELO} subiendo={false} desasociando={false} onReemplazar={() => {}} onEliminar={() => {}} plan={plan} />
    );
    expect(html).toContain(AVISO_MARCA);
    expect(avisoVisibleComoContenido(html)).toBe(true);
    // Está después de "SketchUp Desktop" en el propio HTML, no en otra sección desconectada.
    expect(html.indexOf('SketchUp Desktop')).toBeLessThan(html.indexOf(AVISO_MARCA));
  });
});

describe('TarjetaModelo3D — admin: acceso total, igual que PRO/PREMIUM', () => {
  it('esAdmin:true desbloquea la función aunque el plan almacenado sea BASIC o esté vacío', () => {
    const html = renderToStaticMarkup(
      <TarjetaModelo3D modelo3D={MODELO} subiendo={false} desasociando={false} onReemplazar={() => {}} onEliminar={() => {}} plan="BASIC" esAdmin />
    );
    expect(html).not.toContain('Disponible en PRO');
    expect(html).toContain('Cocina_Garcia.glb');
    expect(html).toContain('Abrir en SketchUp Desktop ↗');
    expect(html).toContain(AVISO_MARCA);
  });

  it('esAdmin:true con sesión sin plan cargado (undefined) también desbloquea', () => {
    const html = renderToStaticMarkup(
      <TarjetaModelo3D modelo3D={MODELO} subiendo={false} desasociando={false} onReemplazar={() => {}} onEliminar={() => {}} esAdmin />
    );
    expect(html).not.toContain('Disponible en PRO');
    expect(html).toContain('Abrir en SketchUp Desktop ↗');
  });
});
