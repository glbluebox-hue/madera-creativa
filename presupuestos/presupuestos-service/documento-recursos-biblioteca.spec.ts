import { subirORecuperarRecurso, calcularHashContenido, type RepositorioRecursos } from './documento-recursos-biblioteca.js';
import type { RecursoMC } from './documento-modelo.js';

/**
 * Pruebas de la biblioteca de recursos (Incremento 5) contra el
 * almacenamiento real de desarrollo (`AlmacenamientoMemoria`, mismo
 * criterio que `documento-procesar-recursos.spec.ts`) — el repositorio de
 * hashes se dobla con un `Map` en memoria en vez de Mongo real, ya que es
 * la única pieza externa a esta función; el hash y la subida son reales.
 */

function repositorioEnMemoria(): RepositorioRecursos & { guardados: Map<string, RecursoMC> } {
  const guardados = new Map<string, RecursoMC>();
  return {
    guardados,
    buscarPorHash: async (usuarioId, hash) => {
      for (const r of guardados.values()) {
        if (r.hashContenido === hash) return r;
      }
      return null;
    },
  };
}

const BUFFER_A = Buffer.from('contenido de prueba A');
const BUFFER_B = Buffer.from('contenido de prueba B');

describe('calcularHashContenido', () => {
  it('el mismo contenido produce siempre el mismo hash', () => {
    expect(calcularHashContenido(BUFFER_A)).toBe(calcularHashContenido(Buffer.from('contenido de prueba A')));
  });

  it('contenidos distintos producen hashes distintos', () => {
    expect(calcularHashContenido(BUFFER_A)).not.toBe(calcularHashContenido(BUFFER_B));
  });
});

describe('subirORecuperarRecurso', () => {
  it('sube un recurso nuevo cuando no hay ninguno con el mismo hash', async () => {
    const repo = repositorioEnMemoria();
    const { recurso, nuevo } = await subirORecuperarRecurso(
      BUFFER_A, { nombre: 'Sello', tipo: 'sello', mimeType: 'image/png', ambito: 'usuario', etiquetas: ['2026'] }, 'user-1', repo
    );
    expect(nuevo).toBe(true);
    expect(recurso.url).not.toBe('');
    expect(recurso.hashContenido).toBe(calcularHashContenido(BUFFER_A));
    expect(recurso.tamano).toBe(BUFFER_A.length);
  });

  it('reutiliza el recurso existente si ya hay uno con el mismo contenido — no sube dos veces', async () => {
    const repo = repositorioEnMemoria();
    const primera = await subirORecuperarRecurso(BUFFER_A, { nombre: 'Sello', tipo: 'sello', mimeType: 'image/png', ambito: 'usuario', etiquetas: [] }, 'user-1', repo);
    repo.guardados.set(primera.recurso.id, primera.recurso); // simula la persistencia que haría el servicio tras `nuevo:true`

    const segunda = await subirORecuperarRecurso(BUFFER_A, { nombre: 'Sello (copia)', tipo: 'sello', mimeType: 'image/png', ambito: 'usuario', etiquetas: [] }, 'user-1', repo);
    expect(segunda.nuevo).toBe(false);
    expect(segunda.recurso.id).toBe(primera.recurso.id);
    expect(segunda.recurso.url).toBe(primera.recurso.url); // misma URL, no se subió una copia
  });

  it('un contenido distinto siempre sube un recurso nuevo, aunque exista otro catalogado', async () => {
    const repo = repositorioEnMemoria();
    const primera = await subirORecuperarRecurso(BUFFER_A, { nombre: 'A', tipo: 'imagen', mimeType: 'image/png', ambito: 'usuario', etiquetas: [] }, 'user-1', repo);
    repo.guardados.set(primera.recurso.id, primera.recurso);

    const segunda = await subirORecuperarRecurso(BUFFER_B, { nombre: 'B', tipo: 'imagen', mimeType: 'image/png', ambito: 'usuario', etiquetas: [] }, 'user-1', repo);
    expect(segunda.nuevo).toBe(true);
    expect(segunda.recurso.id).not.toBe(primera.recurso.id);
    expect(segunda.recurso.url).not.toBe(primera.recurso.url);
  });
});
