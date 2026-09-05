import { renderToStaticMarkup } from 'react-dom/server';
import { BannerTrial, PantallaTrialTerminado } from './estado-trial.js';
import type { EstadoAcceso } from './api.js';

/**
 * Prueba gratuita de 60 días (05/09/2026) — smoke tests con
 * `renderToStaticMarkup`, mismo criterio que el resto del módulo
 * (`candado-plan.spec.tsx`, `almacenamiento-uso.spec.tsx`). Cubren la
 * letra S del encargo: el frontend nunca debe mostrar "NONE"/"plan
 * NONE"/"sin plan" a un usuario en prueba gratuita, y la pantalla de fin
 * de trial nunca debe simular un pago real.
 */

function estadoAcceso(overrides: Partial<EstadoAcceso>): EstadoAcceso {
  return { ok: true, usuarioId: 'u1', plan: 'PRO', tipoAcceso: 'trial', expiraEn: new Date(Date.now() + 30 * 86_400_000).toISOString(), ...overrides };
}

describe('BannerTrial', () => {
  it('no renderiza nada si no hay estado de acceso todavía (primer render, antes de la primera comprobación)', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={null} />);
    expect(html).toBe('');
  });

  it('no renderiza nada para una cuenta de pago (tipoAcceso "paid"), aunque el plan sea PRO', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={estadoAcceso({ tipoAcceso: 'paid' })} />);
    expect(html).toBe('');
  });

  it('no renderiza nada si el trial ya terminó (lo cubre la pantalla de bloqueo, no el banner)', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={estadoAcceso({ plan: 'NONE' })} />);
    expect(html).toBe('');
  });

  it('con trial activo y más de 5 días, muestra el mensaje normal con los días restantes — nunca "NONE"/"PRO" en crudo', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={estadoAcceso({ expiraEn: new Date(Date.now() + 20 * 86_400_000).toISOString() })} />);
    expect(html).toContain('Prueba gratuita');
    expect(html).toContain('Basic + Pro');
    expect(html.toUpperCase()).not.toContain('NONE');
    expect(html).not.toContain('>PRO<');
  });

  it('con 5 días o menos, muestra el aviso "termina en X días" en vez del mensaje normal', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={estadoAcceso({ expiraEn: new Date(Date.now() + 4 * 86_400_000 + 1000).toISOString() })} />);
    expect(html).toContain('termina en');
    expect(html).toContain('días');
  });

  it('con 1 día exacto, usa el singular ("día", no "1 días")', () => {
    const html = renderToStaticMarkup(<BannerTrial estadoAcceso={estadoAcceso({ expiraEn: new Date(Date.now() + 1000).toISOString() })} />);
    expect(html).toContain('1 día');
    expect(html).not.toContain('1 días');
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

  it('muestra los tres planes comerciales con sus precios reales', () => {
    expect(html).toContain('BASIC');
    expect(html).toContain('19 €/mes');
    expect(html).toContain('PRO');
    expect(html).toContain('39 €/mes');
    expect(html).toContain('PREMIUM');
    expect(html).toContain('59 €/mes');
  });

  it('el botón de cada plan está deshabilitado y nunca simula un pago real', () => {
    expect(html).toContain('disabled');
    expect(html).toContain('Próximamente');
    expect(html.toLowerCase()).not.toContain('pago realizado');
    expect(html.toLowerCase()).not.toContain('suscripción activada');
    expect(html.toLowerCase()).not.toContain('compra completada');
  });

  it('ofrece canjear un código de acceso para recuperar el acceso', () => {
    expect(html).toContain('código de acceso');
    expect(html).toContain('Aplicar código');
  });

  it('nunca muestra el valor técnico "NONE"', () => {
    expect(html.toUpperCase()).not.toContain('NONE');
  });

  it('ofrece salir a "Mi perfil" y cerrar sesión, incluso con el trial terminado', () => {
    expect(html).toContain('Mi perfil');
    expect(html).toContain('Cerrar sesión');
  });
});
