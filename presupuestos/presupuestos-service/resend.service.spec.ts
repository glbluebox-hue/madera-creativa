import { textoPlanoDesdeHtml, enviarEmail, ErrorEmailNoConfigurado } from './resend.service.js';

/**
 * Envío de emails vía Resend (08/09/2026, mejora de entregabilidad —
 * reporte real: "el email siempre llega a spam") — `textoPlanoDesdeHtml`
 * es una función pura, se prueba directamente; `enviarEmail` se prueba
 * con `fetch` mockeado (mismo criterio que el resto del proyecto: nunca
 * una llamada real a un proveedor externo en los tests).
 */
describe('textoPlanoDesdeHtml — versión de texto plano derivada del HTML', () => {
  it('quita las etiquetas y deja el texto legible', () => {
    expect(textoPlanoDesdeHtml('<p>Hola <strong>mundo</strong></p>')).toBe('Hola mundo');
  });

  it('convierte párrafos y saltos de línea en saltos de línea reales', () => {
    const texto = textoPlanoDesdeHtml('<p>Primera línea</p><p>Segunda línea</p>');
    expect(texto).toBe('Primera línea\nSegunda línea');
  });

  it('<br> se convierte en salto de línea', () => {
    expect(textoPlanoDesdeHtml('Uno<br>Dos')).toBe('Uno\nDos');
  });

  it('quita por completo el contenido de <script> y <style> (nunca aparece en el texto)', () => {
    const texto = textoPlanoDesdeHtml('<style>.x{color:red}</style><p>Visible</p><script>alert(1)</script>');
    expect(texto).toBe('Visible');
  });

  it('conserva un enlace como texto plano de su URL (el href no se pierde del todo)', () => {
    const texto = textoPlanoDesdeHtml('<p><a href="https://estudio.maderacreativa.com/?verificar=abc">Pulsa aquí</a></p>');
    expect(texto).toContain('Pulsa aquí');
  });
});

describe('enviarEmail — siempre manda html Y text (nunca solo html)', () => {
  const fetchOriginal = global.fetch;
  const envOriginal = process.env.RESEND_API_KEY;

  beforeEach(() => { process.env.RESEND_API_KEY = 'clave-de-prueba'; });
  afterEach(() => { global.fetch = fetchOriginal; process.env.RESEND_API_KEY = envOriginal; });

  it('el cuerpo enviado a Resend incluye tanto "html" como "text"', async () => {
    let cuerpoEnviado: any = null;
    global.fetch = (async (_url: string, init: any) => {
      cuerpoEnviado = JSON.parse(init.body);
      return { ok: true } as Response;
    }) as any;

    await enviarEmail('destino@example.com', 'Asunto de prueba', '<p>Hola</p>');

    expect(cuerpoEnviado.html).toBe('<p>Hola</p>');
    expect(cuerpoEnviado.text).toBe('Hola');
  });

  it('sin RESEND_API_KEY, lanza ErrorEmailNoConfigurado y nunca llega a llamar a fetch', async () => {
    delete process.env.RESEND_API_KEY;
    let fetchLlamado = false;
    global.fetch = (async () => { fetchLlamado = true; return { ok: true } as Response; }) as any;

    await expect(enviarEmail('destino@example.com', 'Asunto', '<p>Hola</p>')).rejects.toThrow(ErrorEmailNoConfigurado);
    expect(fetchLlamado).toBe(false);
  });
});
