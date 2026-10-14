import { firmaDeElementos } from './firma-dibujo.js';

// `firmaDeElementos` es el criterio único para decidir si "← Volver" puede
// salir directamente o tiene que forzar un guardado primero (14/10/2026,
// caso real: un dibujo con una clienta se perdió al cerrar el editor justo
// después de un guardado que falló en silencio). Estos tests cubren solo la
// función pura — el cableado de `alPulsarVolver`/`beforeunload` en
// editor-dibujo.tsx no tiene aquí infraestructura de test de componente
// (no existía ningún `.spec.tsx` previo para este archivo) y debe
// verificarse a mano: abrir un dibujo, modificarlo, intentar "← Volver" con
// la red desconectada y confirmar que el editor no se cierra y muestra el
// aviso de error.

type ElementoFalso = { id: string; version: number; isDeleted?: boolean };

describe('firmaDeElementos — detecta cambios reales de contenido, no ruido', () => {
  it('mismos elementos → misma firma', () => {
    const a: ElementoFalso[] = [{ id: 'e1', version: 1 }, { id: 'e2', version: 3 }];
    expect(firmaDeElementos(a as any)).toBe(firmaDeElementos(a as any));
  });

  it('el orden de los elementos no importa (estable ante reordenaciones internas de Excalidraw)', () => {
    const a: ElementoFalso[] = [{ id: 'e1', version: 1 }, { id: 'e2', version: 3 }];
    const b: ElementoFalso[] = [{ id: 'e2', version: 3 }, { id: 'e1', version: 1 }];
    expect(firmaDeElementos(a as any)).toBe(firmaDeElementos(b as any));
  });

  it('subir la version de un elemento (una edición real) cambia la firma', () => {
    const antes: ElementoFalso[] = [{ id: 'e1', version: 1 }];
    const despues: ElementoFalso[] = [{ id: 'e1', version: 2 }];
    expect(firmaDeElementos(antes as any)).not.toBe(firmaDeElementos(despues as any));
  });

  it('un elemento marcado isDeleted se excluye de la firma, como si no existiera', () => {
    const soloE1: ElementoFalso[] = [{ id: 'e1', version: 1 }];
    const e1YUnBorrado: ElementoFalso[] = [{ id: 'e1', version: 1 }, { id: 'e2', version: 1, isDeleted: true }];
    expect(firmaDeElementos(e1YUnBorrado as any)).toBe(firmaDeElementos(soloE1 as any));
  });

  it('añadir un elemento nuevo cambia la firma', () => {
    const antes: ElementoFalso[] = [{ id: 'e1', version: 1 }];
    const despues: ElementoFalso[] = [{ id: 'e1', version: 1 }, { id: 'e2', version: 1 }];
    expect(firmaDeElementos(antes as any)).not.toBe(firmaDeElementos(despues as any));
  });

  it('lienzo vacío da una firma estable (dibujo nuevo sin tocar nada aún)', () => {
    expect(firmaDeElementos([] as any)).toBe(firmaDeElementos([] as any));
    expect(firmaDeElementos([] as any)).toBe('');
  });
});
