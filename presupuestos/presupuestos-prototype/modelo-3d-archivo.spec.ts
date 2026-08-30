import { validarModelo3D, formatoTamano, nombreParaAlmacenar, TAMANO_MAXIMO_MODELO_3D_BYTES } from './modelo-3d-archivo.js';

/**
 * Validación de la subida manual de un modelo 3D (30/08/2026) — sin red,
 * sin renderizado. Admite `.glb` y `.stl` en la entrada (SketchUp Free
 * solo exporta SKP/PNG/STL) — el STL se convierte a GLB antes de subir,
 * ver `stl-a-glb.ts`.
 */

describe('validarModelo3D', () => {
  it('un .glb dentro del límite de tamaño es válido', () => {
    expect(validarModelo3D({ name: 'Cocina.glb', size: 1024 })).toEqual({ valido: true });
  });

  it('un .stl dentro del límite de tamaño también es válido (se convierte antes de subir)', () => {
    expect(validarModelo3D({ name: 'Cocina.stl', size: 1024 })).toEqual({ valido: true });
  });

  it('mayúsculas en la extensión también son válidas', () => {
    expect(validarModelo3D({ name: 'Cocina.GLB', size: 1024 })).toEqual({ valido: true });
    expect(validarModelo3D({ name: 'Cocina.STL', size: 1024 })).toEqual({ valido: true });
  });

  it('rechaza un formato que no sea .glb ni .stl, con un motivo claro', () => {
    const r = validarModelo3D({ name: 'Cocina.skp', size: 1024 });
    expect(r.valido).toBe(false);
    if (r.valido === false) expect(r.motivo).toMatch(/solo se admiten archivos \.glb o \.stl/);
  });

  it('rechaza un archivo sin extensión', () => {
    expect(validarModelo3D({ name: 'Cocina', size: 1024 }).valido).toBe(false);
  });

  it('rechaza un archivo más grande que el límite, con un motivo claro', () => {
    const r = validarModelo3D({ name: 'Cocina.glb', size: TAMANO_MAXIMO_MODELO_3D_BYTES + 1 });
    expect(r.valido).toBe(false);
    if (r.valido === false) expect(r.motivo).toMatch(/demasiado grande/);
  });

  it('acepta un archivo justo en el límite', () => {
    expect(validarModelo3D({ name: 'Cocina.glb', size: TAMANO_MAXIMO_MODELO_3D_BYTES }).valido).toBe(true);
  });
});

describe('nombreParaAlmacenar — un .stl de entrada siempre se guarda como .glb', () => {
  it('cambia la extensión .stl por .glb, conservando el nombre base', () => {
    expect(nombreParaAlmacenar('Cocina_Garcia.stl')).toBe('Cocina_Garcia.glb');
  });

  it('un .glb de entrada se queda tal cual', () => {
    expect(nombreParaAlmacenar('Cocina_Garcia.glb')).toBe('Cocina_Garcia.glb');
  });

  it('conserva puntos adicionales en el nombre base', () => {
    expect(nombreParaAlmacenar('Cocina.v2.final.stl')).toBe('Cocina.v2.final.glb');
  });
});

describe('formatoTamano', () => {
  it('bytes pequeños se muestran en B', () => {
    expect(formatoTamano(500)).toBe('500 B');
  });

  it('tamaños medios se muestran en KB', () => {
    expect(formatoTamano(2048)).toBe('2.0 KB');
  });

  it('tamaños grandes se muestran en MB', () => {
    expect(formatoTamano(2_500_000)).toBe('2.4 MB');
  });
});
