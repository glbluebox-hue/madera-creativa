import { renderToStaticMarkup } from 'react-dom/server';
import { BannerTrial, PantallaTrialTerminado } from './estado-trial.js';
import type { EstadoAcceso } from './api.js';

/**
 * Prueba gratuita de 60 días (05/09/2026, refinado el mismo día al
 * embeber `<PaginaPlanes>` en la pantalla de bloqueo y añadir "Ver
 * planes" al banner) — smoke tests con `renderToStaticMarkup`, mismo
 * criterio que el resto del módulo (`candado-plan.spec.tsx`,
 * `almacenamiento-uso.spec.tsx`). Cubren la letra S del encargo: el
 * frontend nunca debe mostrar "NONE"/"plan NONE"/"sin plan" a un usuario
 * en prueba gratuita, y la pantalla de fin de trial nunca debe simular un
 * pago real ya realizado (los botones "Elegir…" quedan cubiertos por sus
 * propios tests en `tarjeta-plan.spec.tsx`).
 */

function estadoAcceso(overrides: Partial<EstadoAcceso>): EstadoAcceso {
  return { ok: true, usuarioId: 'u1', plan: 'PRO', tipoAcceso: 'trial', expiraEn: new Date(Date.now() + 30 * 86_400_000).toISOString(), planElegido: true, ...overrides };
}

describe('BannerTrial', () => {
  it('no renderiza nada si no hay estado de acceso todavía (primer render, antes de la primera comprobación)', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={null} onVerPlanes={() => {}} />);
    expect(html).toBe('');
  });

  it('no renderiza nada para una cuenta de pago (tipoAcceso "paid"), aunque el plan sea PRO', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={estadoAcceso({ tipoAcceso: 'paid' })} onVerPlanes={() => {}} />);
    expect(html).toBe('');
  });

  it('no renderiza nada si el trial ya terminó (lo cubre la pantalla de bloqueo, no el banner)', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={estadoAcceso({ plan: 'NONE' })} onVerPlanes={() => {}} />);
    expect(html).toBe('');
  });

  it('con trial activo y más de 5 días, muestra los días restantes y que Basic+Pro están incluidos — nunca "NONE"/"PRO" en crudo como texto', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={estadoAcceso({ expiraEn: new Date(Date.now() + 20 * 86_400_000).toISOString() })} onVerPlanes={() => {}} />);
    expect(html).toContain('Madera Creativa Estudio');
    expect(html).toContain('Basic + Pro');
    // Comprueba el texto visible, no atributos SVG como fill="none" (que no tienen nada que ver con el plan).
    expect(html).not.toMatch(/>NONE</);
    expect(html).not.toContain('>PRO<');
  });

  it('siempre ofrece un enlace/botón "Ver planes", en cualquier nivel de aviso', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={estadoAcceso({})} onVerPlanes={() => {}} />);
    expect(html).toContain('Ver planes');
  });

  /**
   * Estados progresivos del banner (corrección tras la auditoría final,
   * 05/09/2026) — el encargo original (§6) pedía explícitamente un único
   * componente con estados que cambien según los días restantes, en los
   * 5 puntos de control: más de 10 / 10 / 5 / 3 / 1 día. Se comprueba
   * matemáticamente con `expiraEn` calculado, sin depender de esperar al
   * paso real del tiempo.
   */
  const diasDesdeAhora = (n: number) => new Date(Date.now() + n * 86_400_000 - 1000).toISOString();

  it('más de 10 días: nivel calmo (verde), incluye el recordatorio de Basic + Pro', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={estadoAcceso({ expiraEn: diasDesdeAhora(20) })} onVerPlanes={() => {}} />);
    expect(html).toContain('var(--verde-bg)');
    expect(html).toContain('20 días');
    expect(html).toContain('Basic + Pro incluidos');
  });

  it('10 días: primer aviso (ocre, borde fino) — ya no es el estado calmo', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={estadoAcceso({ expiraEn: diasDesdeAhora(10) })} onVerPlanes={() => {}} />);
    expect(html).toContain('var(--ocre-bg)');
    expect(html).toContain('10 días');
    expect(html).not.toContain('var(--verde-bg)');
  });

  it('5 días: aviso más visible (ocre, borde reforzado) — distinto del de 10 días', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={estadoAcceso({ expiraEn: diasDesdeAhora(5) })} onVerPlanes={() => {}} />);
    expect(html).toContain('var(--ocre-bg)');
    expect(html).toContain('5 días');
    expect(html).toContain('2px solid var(--ocre)');
  });

  it('3 días: aviso importante (rojo) — ya no es ocre', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={estadoAcceso({ expiraEn: diasDesdeAhora(3) })} onVerPlanes={() => {}} />);
    expect(html).toContain('var(--rojo-bg)');
    expect(html).toContain('3 días');
    expect(html).not.toContain('var(--ocre-bg)');
  });

  it('1 día: aviso final (rojo, borde más grueso) — dice "mañana", nunca "1 días"', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={estadoAcceso({ expiraEn: diasDesdeAhora(1) })} onVerPlanes={() => {}} />);
    expect(html).toContain('var(--rojo-bg)');
    expect(html).toContain('mañana');
    expect(html).toContain('3px solid var(--rojo)');
    expect(html).not.toContain('1 días');
  });

  it('los 5 niveles nunca simulan una alarma agresiva: nunca texto en mayúsculas de urgencia ni signos de exclamación', () => {
    for (const dias of [20, 10, 5, 3, 1]) {
      const html = renderToStaticMarkup(<BannerTrial estadoAcceso={estadoAcceso({ expiraEn: diasDesdeAhora(dias) })} onVerPlanes={() => {}} />);
      expect(html).not.toContain('!');
      expect(html.toUpperCase()).not.toContain('URGENTE');
    }
  });
});

describe('PantallaTrialTerminado', () => {
  const html = renderToStaticMarkup(<PantallaTrialTerminado onCerrarSesion={() => {}} onIrAPerfil={() => {}} />);

  it('explica que el trial ha terminado y qué hacer', () => {
    expect(html).toContain('Tu prueba gratuita ha terminado');
    expect(html).toContain('Elige un plan');
  });

  it('tranquiliza sobre los datos: nunca se han borrado', () => {
    expect(html.toLowerCase()).toContain('no se ha borrado nada');
  });

  it('embebe la página de planes con los tres planes comerciales y sus precios reales', () => {
    expect(html).toContain('Basic');
    expect(html).toContain('19 €');
    expect(html).toContain('Pro');
    expect(html).toContain('39 €');
    expect(html).toContain('Premium');
    expect(html).toContain('59 €');
  });

  it('nunca simula un pago real ya realizado', () => {
    expect(html.toLowerCase()).not.toContain('pago realizado');
    expect(html.toLowerCase()).not.toContain('suscripción activada');
    expect(html.toLowerCase()).not.toContain('compra completada');
  });

  it('ofrece canjear un código de acceso para recuperar el acceso', () => {
    expect(html).toContain('código de acceso');
    expect(html).toContain('Aplicar código');
  });

  it('nunca muestra el valor técnico "NONE" como texto (los atributos SVG fill="none" no cuentan)', () => {
    expect(html).not.toMatch(/>NONE</);
  });

  it('ofrece salir a "Mi perfil" y cerrar sesión, incluso con el trial terminado', () => {
    expect(html).toContain('Mi perfil');
    expect(html).toContain('Cerrar sesión');
  });
});
