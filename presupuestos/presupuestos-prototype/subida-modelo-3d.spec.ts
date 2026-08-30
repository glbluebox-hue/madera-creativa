/**
 * Orquestación de la subida de un modelo 3D (30/08/2026) — `stl-a-glb.js`
 * (three.js real) se simula por completo: ningún test de este archivo
 * convierte de verdad un STL, solo comprueba QUÉ pasa con cada extensión.
 */
const convertirSTLaGLBMock = vi.fn();
vi.mock('./stl-a-glb.js', () => ({
  convertirSTLaGLB: (...args: unknown[]) => convertirSTLaGLBMock(...args),
}));

const { prepararSubidaModelo3D } = await import('./subida-modelo-3d.js');

afterEach(() => { convertirSTLaGLBMock.mockReset(); });

describe('prepararSubidaModelo3D', () => {
  it('un .glb se sube tal cual, sin convertir nada', async () => {
    const file = new File(['contenido'], 'Cocina.glb', { type: 'model/gltf-binary' });
    const r = await prepararSubidaModelo3D(file);
    expect(r.nombreArchivo).toBe('Cocina.glb');
    expect(r.blob).toBe(file);
    expect(convertirSTLaGLBMock).not.toHaveBeenCalled();
  });

  it('un .stl se convierte a .glb, y el nombre cambia de extensión', async () => {
    const file = new File(['contenido'], 'Cocina.stl', { type: 'model/stl' });
    const glbFalso = new Blob(['glb-falso'], { type: 'model/gltf-binary' });
    convertirSTLaGLBMock.mockResolvedValue(glbFalso);

    const r = await prepararSubidaModelo3D(file);
    expect(convertirSTLaGLBMock).toHaveBeenCalledWith(file);
    expect(r.nombreArchivo).toBe('Cocina.glb');
    expect(r.blob).toBe(glbFalso);
  });

  it('mayúsculas en la extensión .STL también se reconocen y convierten', async () => {
    const file = new File(['contenido'], 'Cocina.STL', { type: 'model/stl' });
    convertirSTLaGLBMock.mockResolvedValue(new Blob());
    await prepararSubidaModelo3D(file);
    expect(convertirSTLaGLBMock).toHaveBeenCalledTimes(1);
  });
});
