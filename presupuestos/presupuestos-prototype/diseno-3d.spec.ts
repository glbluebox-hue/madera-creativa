import { esArchivoSeleccionado, esProyectoSeleccionado, archivoAModelo3D } from './diseno-3d.js';

/**
 * Diseño 3D / SketchUp (30/08/2026) — reconoce si un evento `embed.onAction`
 * del Workspace API de Trimble trae un archivo o un proyecto seleccionado,
 * y mapea un archivo a los datos que necesita `api.asociarModelo3D`. Sin
 * red, sin iframe — mismo criterio que `candidatos-mercado.spec.ts`.
 */

describe('esArchivoSeleccionado', () => {
  it('un objeto con type:"FILE" y id es un archivo', () => {
    expect(esArchivoSeleccionado({ id: 'f1', name: 'Cocina.skp', type: 'FILE' })).toBe(true);
  });

  it('un objeto con type:"FOLDER" no es un archivo', () => {
    expect(esArchivoSeleccionado({ id: 'c1', name: 'Carpeta', type: 'FOLDER' })).toBe(false);
  });

  it('sin type, no se confunde con un archivo (sería un proyecto)', () => {
    expect(esArchivoSeleccionado({ id: 'p1', name: 'Mi proyecto' })).toBe(false);
  });

  it('datos vacíos/no objeto no son un archivo', () => {
    expect(esArchivoSeleccionado(undefined)).toBe(false);
    expect(esArchivoSeleccionado(null)).toBe(false);
    expect(esArchivoSeleccionado('texto')).toBe(false);
  });
});

describe('esProyectoSeleccionado', () => {
  it('un objeto con id y SIN type es un proyecto', () => {
    expect(esProyectoSeleccionado({ id: 'p1', name: 'Mi proyecto' })).toBe(true);
  });

  it('un objeto con type (archivo/carpeta) nunca se confunde con un proyecto', () => {
    expect(esProyectoSeleccionado({ id: 'f1', name: 'x.skp', type: 'FILE' })).toBe(false);
    expect(esProyectoSeleccionado({ id: 'c1', name: 'Carpeta', type: 'FOLDER' })).toBe(false);
  });

  it('sin id, no es un proyecto', () => {
    expect(esProyectoSeleccionado({ name: 'sin id' })).toBe(false);
  });
});

describe('archivoAModelo3D — nunca inventa un dato que Trimble no dio', () => {
  it('mapea id/nombre/versión/miniatura tal cual', () => {
    const r = archivoAModelo3D({ id: 'f1', name: 'Cocina_Garcia_v01.skp', revision: 3, thumbnailUrl: ['https://x/thumb.png'] }, 'proyecto-trimble-1');
    expect(r).toEqual({
      trimbleProjectId: 'proyecto-trimble-1',
      trimbleFileId: 'f1',
      nombreArchivo: 'Cocina_Garcia_v01.skp',
      version: 3,
      thumbnailUrl: 'https://x/thumb.png',
    });
  });

  it('sin revisión ni miniatura conocidas, usa versión 1 y miniatura vacía — nunca null/undefined silencioso', () => {
    const r = archivoAModelo3D({ id: 'f2', name: 'Armario.skp' }, 'proyecto-trimble-1');
    expect(r.version).toBe(1);
    expect(r.thumbnailUrl).toBe('');
  });
});
