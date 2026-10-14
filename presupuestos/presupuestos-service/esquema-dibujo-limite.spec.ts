import { esquemaDibujo, LIMITE_CONTENIDO_DIBUJO_BYTES, LIMITE_MINIATURA_DIBUJO_BYTES } from './esquemas-validacion.js';

const base = { id: 'd1', nombre: 'Medición cliente', creadoEn: '2026-01-01T00:00:00.000Z', actualizadoEn: '2026-01-01T00:00:00.000Z' };

/** Cadena de texto de exactamente `bytes` bytes (ASCII, 1 byte/carácter). */
function cadenaDeBytes(bytes: number): string {
  return 'a'.repeat(bytes);
}

describe('esquemaDibujo — límite de tamaño del contenido (14/10/2026, subido 4 MB → 8 MB)', () => {
  it('el límite vigente es 8 MB, no el antiguo de 4 MB', () => {
    expect(LIMITE_CONTENIDO_DIBUJO_BYTES).toBe(8 * 1024 * 1024);
  });

  it('un contenido justo por debajo de 8 MB se acepta — caso real: foto del lugar con cotas anotadas encima', () => {
    const contenido = { files: { foto1: cadenaDeBytes(7 * 1024 * 1024) } };
    expect(esquemaDibujo.safeParse({ ...base, contenido }).success).toBe(true);
  });

  it('un contenido por encima de 8 MB se rechaza, con el motivo exacto en el mensaje', () => {
    const contenido = { files: { foto1: cadenaDeBytes(9 * 1024 * 1024) } };
    const r = esquemaDibujo.safeParse({ ...base, contenido });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.message.includes('8 MB'))).toBe(true);
  });

  it('un dibujo con contenido ligero (sin fotos) sigue aceptándose sin cambios', () => {
    expect(esquemaDibujo.safeParse({ ...base, contenido: { elements: [], files: {} } }).success).toBe(true);
  });

  it('el límite de la miniatura no ha cambiado (1 MB) — no forma parte de este ajuste', () => {
    expect(LIMITE_MINIATURA_DIBUJO_BYTES).toBe(1 * 1024 * 1024);
  });
});
