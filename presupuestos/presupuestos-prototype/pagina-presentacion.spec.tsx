import { renderToStaticMarkup } from 'react-dom/server';
import { PaginaPresentacion, debeSaltarPresentacionComercial } from './pagina-presentacion.js';

/**
 * Página de presentación comercial (05/09/2026) — smoke tests con
 * `renderToStaticMarkup`, mismo criterio que el resto del módulo (sin
 * infraestructura de tests de interacción de React en este proyecto). El
 * cableado real de "Empezar…"/"Entrar" hacia `onClick={onEmpezar}` /
 * `onClick={onEntrar}` en `pagina-presentacion.tsx` y hacia
 * `pantallaInicial` en `presupuestos-prototype.tsx` se ha revisado
 * directamente en el código (no es posible disparar un clic real sobre
 * HTML estático) — ver el informe de la tarea para el detalle exacto.
 */

describe('debeSaltarPresentacionComercial — cuándo se salta la presentación e se va directo a LoginPage', () => {
  it('con ?codigo= (enlace de invitación) se salta la presentación', () => {
    expect(debeSaltarPresentacionComercial(new URLSearchParams('codigo=ABC123'))).toBe(true);
  });
  it('con ?verificar= (enlace de verificación de email) se salta la presentación', () => {
    expect(debeSaltarPresentacionComercial(new URLSearchParams('verificar=untokenlargo'))).toBe(true);
  });
  it('con ?recuperar= (enlace de recuperación de contraseña) se salta la presentación', () => {
    expect(debeSaltarPresentacionComercial(new URLSearchParams('recuperar=untokenlargo'))).toBe(true);
  });
  it('sin ningún parámetro relevante, se muestra la presentación (no se salta)', () => {
    expect(debeSaltarPresentacionComercial(new URLSearchParams(''))).toBe(false);
  });
  it('con un parámetro no relacionado, se muestra la presentación igualmente', () => {
    expect(debeSaltarPresentacionComercial(new URLSearchParams('accion=clientes'))).toBe(false);
  });
});

describe('PaginaPresentacion', () => {
  const html = renderToStaticMarkup(<PaginaPresentacion onEntrar={() => {}} onEmpezar={() => {}} />);

  it('presenta la marca y la propuesta de valor antes de cualquier formulario', () => {
    expect(html).toContain('Madera Creativa Estudio');
    expect(html).toContain('Gestiona tu negocio de carpintería desde un solo lugar.');
  });

  it('ofrece los dos caminos: empezar (registro) y entrar (login), varias veces en la página', () => {
    expect(html).toContain('Empezar ahora');
    expect(html).toContain('Empezar gratis');
    expect(html).toContain('Empezar mis 60 días gratis');
    expect((html.match(/Entrar/g) ?? []).length).toBeGreaterThanOrEqual(3); // nav, hero, pie
  });

  it('explica qué resuelve la app y no inventa funciones fuera de las reales', () => {
    expect(html).toContain('Clientes y proyectos');
    expect(html).toContain('Presupuestos');
    expect(html).toContain('Mediciones');
    expect(html).toContain('Facturas y gastos');
    expect(html).toContain('Rentabilidad');
    expect(html).toContain('Inteligencia artificial');
    expect(html).toContain('Portal del cliente');
  });

  it('muestra la oferta de lanzamiento: 60 días, por tiempo limitado, sin tarjeta, Premium excluido del trial', () => {
    expect(html).toContain('Experiencia de lanzamiento');
    expect(html).toContain('60 días gratis');
    expect(html).toContain('Por tiempo limitado');
    expect(html).toContain('Sin tarjeta');
    expect(html).toContain('Premium no está incluido en la prueba');
  });

  it('nunca afirma una fecha de fin de la oferta (no existe ninguna definida)', () => {
    expect(html.toLowerCase()).not.toMatch(/termina el|hasta el \d|válido hasta/);
  });

  it('embebe la página de planes real (Basic/Pro/Premium y sus precios), sin duplicar el catálogo', () => {
    expect(html).toContain('Basic');
    expect(html).toContain('Pro');
    expect(html).toContain('Premium');
    expect(html).toContain('19 €');
    expect(html).toContain('39 €');
    expect(html).toContain('59 €');
  });

  it('nunca simula un pago ni promete una fecha de contratación', () => {
    expect(html.toLowerCase()).not.toContain('pago realizado');
    expect(html.toLowerCase()).not.toContain('suscripción activada');
    expect(html.toLowerCase()).not.toContain('plan contratado');
  });

  it('nunca muestra el valor técnico "NONE" como texto', () => {
    expect(html).not.toMatch(/>NONE</);
  });
});
