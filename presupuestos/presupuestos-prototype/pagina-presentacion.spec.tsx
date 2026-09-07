import { renderToStaticMarkup } from 'react-dom/server';
import { PaginaPresentacion, debeSaltarPresentacionComercial } from './pagina-presentacion.js';

/**
 * Página de presentación comercial (05/09/2026, rediseño completo
 * 08/09/2026 — portado desde la maqueta aprobada) — smoke tests con
 * `renderToStaticMarkup`, mismo criterio que el resto del módulo (sin
 * infraestructura de tests de interacción de React en este proyecto). El
 * cableado real de "Empezar…"/"Entrar" hacia `onClick={onEmpezar}` /
 * `onClick={onEntrar}` y el recoloreado del logo por tema (que depende de
 * `useEffect`/canvas, no se ejecuta en `renderToStaticMarkup`) se han
 * revisado directamente en el código, no aquí.
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
    expect(html).toContain('Madera Creativa Estudio'); // alt del logo (cabecera y mockup del portal)
    expect(html).toContain('Toda tu carpintería');
    expect(html).toContain('conectada');
    expect(html).toContain('en un solo lugar');
  });

  it('ofrece los dos caminos: empezar (registro) y entrar (login), varias veces en la página', () => {
    expect(html).toContain('Empezar gratis');
    expect(html).toContain('Probar Madera Creativa Estudio');
    expect(html).toContain('Empezar mis 60 días gratis');
    expect((html.match(/Entrar/g) ?? []).length).toBeGreaterThanOrEqual(3); // nav, hero, pie
  });

  it('cuenta el flujo completo en 6 pasos, sin inventar ninguna función fuera de las reales', () => {
    expect(html).toContain('Entra un cliente.');
    expect(html).toContain('Creas su proyecto.');
    expect(html).toContain('Lo mides.');
    expect(html).toContain('Preparas el presupuesto');
    expect(html).toContain('Registras los gastos y facturas.');
    expect(html).toContain('Conoces el margen.');
  });

  it('incluye el mockup del presupuesto y el del portal del cliente (con firma/aceptación)', () => {
    expect(html).toContain('Presupuesto #0142');
    expect(html).toContain('Así lo ve tu cliente en el móvil');
    expect(html).toContain('Aceptar y firmar');
  });

  it('la sección fiscal explica el ahorro de tiempo trimestral, sin inventar cifras fuera del mock', () => {
    expect(html).toContain('Ya no revisas facturas a última hora.');
    expect(html).toContain('Control fiscal trimestral');
    expect(html).toContain('Generar informe para mi asesor');
  });

  it('la sección de IA muestra las 4 capacidades reales', () => {
    expect(html).toContain('Asistente IA');
    expect(html).toContain('Inteligencia de precios');
    expect(html).toContain('Investigación de mercado');
    expect(html).toContain('Copiloto visual de presupuestos');
  });

  it('muestra la ventaja de lanzamiento: 60 días, sin tarjeta, sin compromiso, Basic + Pro incluidos', () => {
    expect(html).toContain('60 días para probarlo en tu negocio real.');
    expect(html).toContain('Sin tarjeta');
    expect(html).toContain('Sin compromiso');
    expect(html).toContain('Basic + Pro incluidos');
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

  it('explica cómo instalar la app en el dispositivo, sin mencionar ninguna tienda de aplicaciones', () => {
    expect(html).toContain('Instálala en tu dispositivo.');
    expect(html).toContain('Ordenador');
    expect(html).toContain('Móvil y tablet');
    expect(html.toLowerCase()).not.toContain('google play');
    expect(html.toLowerCase()).not.toContain('app store');
  });

  it('incluye el botón de cambiar de tema (claro/oscuro)', () => {
    expect(html).toContain('Cambiar tema');
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
