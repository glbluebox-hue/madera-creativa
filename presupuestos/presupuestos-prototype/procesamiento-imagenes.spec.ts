import { validarImagenParaIA, MIME_IMAGEN_PERMITIDOS, TAMANO_MAXIMO_IMAGEN_IA_BYTES } from './procesamiento-imagenes.js';

describe('validarImagenParaIA (IA Visual del Presupuesto, 23/08/2026)', () => {
  it('acepta cada MIME de la lista permitida, dentro del tamaño', () => {
    for (const type of MIME_IMAGEN_PERMITIDOS) {
      expect(validarImagenParaIA({ type, size: 1024 })).toEqual({ valido: true });
    }
  });

  it('rechaza un MIME no soportado (p. ej. HEIC o un PDF) sin mirar el tamaño', () => {
    expect(validarImagenParaIA({ type: 'image/heic', size: 100 })).toEqual({ valido: false, motivo: expect.any(String) });
    expect(validarImagenParaIA({ type: 'application/pdf', size: 100 })).toEqual({ valido: false, motivo: expect.any(String) });
  });

  it('rechaza un archivo que no es imagen en absoluto', () => {
    const r = validarImagenParaIA({ type: 'text/plain', size: 10 });
    expect(r.valido).toBe(false);
  });

  it('rechaza una imagen por encima del tamaño máximo, aunque el MIME sea válido', () => {
    const r = validarImagenParaIA({ type: 'image/jpeg', size: TAMANO_MAXIMO_IMAGEN_IA_BYTES + 1 });
    expect(r).toEqual({ valido: false, motivo: expect.any(String) });
  });

  it('acepta justo en el límite de tamaño', () => {
    expect(validarImagenParaIA({ type: 'image/jpeg', size: TAMANO_MAXIMO_IMAGEN_IA_BYTES })).toEqual({ valido: true });
  });
});
