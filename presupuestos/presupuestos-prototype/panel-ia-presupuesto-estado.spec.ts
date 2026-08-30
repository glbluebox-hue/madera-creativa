import {
  reducirPanelIA, estadoInicialPanelIA, recortarConversacion, LIMITE_MENSAJES_CONVERSACION, LIMITE_IMAGENES_ACTIVAS,
  type EstadoPanelIA, type MensajeConversacionIA,
} from './panel-ia-presupuesto-estado.js';

/** Simula el ciclo completo enviar→respuesta que hace el componente real. */
function pedirYResponder(estado: EstadoPanelIA, peticion: string, respuesta: string, elementoId: string | null = 'el-1'): EstadoPanelIA {
  const enviando = reducirPanelIA(estado, { tipo: 'enviar', peticion, elementoId });
  return reducirPanelIA(enviando, { tipo: 'respuesta', texto: respuesta });
}

describe('reducirPanelIA — conversación multi-turno (23/08/2026)', () => {
  it('1. Primera petición: conversación vacía → propuesta con un turno usuario+ia', () => {
    const r = pedirYResponder(estadoInicialPanelIA, 'Descríbeme esta cocina.', 'Cocina en L con acabado mate.');
    expect(r).toEqual({
      fase: 'propuesta', peticion: 'Descríbeme esta cocina.', texto: 'Cocina en L con acabado mate.', editando: false,
      elementoId: 'el-1', imagenesActivas: [],
      conversacion: [
        { rol: 'usuario', texto: 'Descríbeme esta cocina.' },
        { rol: 'ia', texto: 'Cocina en L con acabado mate.' },
      ],
    });
  });

  it('2. Segunda petición ("hazla más formal") se apila sobre la primera — la conversación crece, no se sustituye', () => {
    const primera = pedirYResponder(estadoInicialPanelIA, 'Descríbeme esta cocina.', 'Cocina en L con acabado mate.');
    const segunda = pedirYResponder(primera, 'Hazla más formal.', 'Cocina en distribución en L, con acabado mate de línea profesional.');
    expect(segunda.fase).toBe('propuesta');
    expect((segunda as any).texto).toBe('Cocina en distribución en L, con acabado mate de línea profesional.');
    expect(segunda.conversacion).toEqual([
      { rol: 'usuario', texto: 'Descríbeme esta cocina.' },
      { rol: 'ia', texto: 'Cocina en L con acabado mate.' },
      { rol: 'usuario', texto: 'Hazla más formal.' },
      { rol: 'ia', texto: 'Cocina en distribución en L, con acabado mate de línea profesional.' },
    ]);
  });

  it('3. Tercera petición que añade información se apila igual, conservando los 2 turnos anteriores', () => {
    let estado = pedirYResponder(estadoInicialPanelIA, 'Descríbeme esta cocina.', 'Cocina en L.');
    estado = pedirYResponder(estado, 'Hazla más corta.', 'Cocina en L, compacta.');
    estado = pedirYResponder(estado, 'Añade que los muebles son de madera.', 'Cocina en L, compacta, con muebles de madera.');
    expect(estado.conversacion).toHaveLength(6);
    expect((estado as any).texto).toBe('Cocina en L, compacta, con muebles de madera.');
    expect(estado.conversacion[0]).toEqual({ rol: 'usuario', texto: 'Descríbeme esta cocina.' });
  });

  it('4. Regenerar: descarta el último par (intento rechazado) y repite la MISMA petición, no el texto editado', () => {
    const propuesta = pedirYResponder(estadoInicialPanelIA, 'Describe esto.', 'Primer intento, no me convence.');
    const regenerando = reducirPanelIA(propuesta, { tipo: 'regenerar' });
    expect(regenerando).toEqual({ fase: 'enviando', peticion: 'Describe esto.', imagenIncluida: false, elementoId: 'el-1', conversacion: [], imagenesActivas: [] });

    // Y si llega una respuesta nueva, sustituye limpiamente al intento descartado.
    const nuevaPropuesta = reducirPanelIA(regenerando, { tipo: 'respuesta', texto: 'Segundo intento, mejor.' });
    expect(nuevaPropuesta.conversacion).toEqual([
      { rol: 'usuario', texto: 'Describe esto.' },
      { rol: 'ia', texto: 'Segundo intento, mejor.' },
    ]);
  });

  it('4b. Regenerar tras una conversación previa solo descarta el ÚLTIMO par, conserva los turnos anteriores', () => {
    const primera = pedirYResponder(estadoInicialPanelIA, 'Descríbeme esto.', 'Propuesta 1.');
    const segundaFallida = pedirYResponder(primera, 'Más formal.', 'Intento fallido.');
    const regenerando = reducirPanelIA(segundaFallida, { tipo: 'regenerar' });
    expect(regenerando).toEqual({
      fase: 'enviando', peticion: 'Más formal.', imagenIncluida: false, elementoId: 'el-1', imagenesActivas: [],
      conversacion: [{ rol: 'usuario', texto: 'Descríbeme esto.' }, { rol: 'ia', texto: 'Propuesta 1.' }],
    });
  });

  it('4c. Regenerar desde un error (reintentar) no toca la conversación, porque el error nunca la había modificado', () => {
    const enviando = reducirPanelIA(estadoInicialPanelIA, { tipo: 'enviar', peticion: 'Redacta esto.', elementoId: 'el-1' });
    const error = reducirPanelIA(enviando, { tipo: 'error', mensaje: 'Fallo de red' });
    const reintentando = reducirPanelIA(error, { tipo: 'regenerar' });
    expect(reintentando).toEqual({ fase: 'enviando', peticion: 'Redacta esto.', imagenIncluida: false, elementoId: 'el-1', conversacion: [], imagenesActivas: [] });
  });

  it('5. Cancelación: descarta la propuesta pendiente Y su par de la conversación — "olvida esto"', () => {
    const primera = pedirYResponder(estadoInicialPanelIA, 'Descríbeme esto.', 'Propuesta 1.');
    const segunda = pedirYResponder(primera, 'Añade algo raro.', 'Propuesta descartable.');
    const cancelado = reducirPanelIA(segunda, { tipo: 'cancelar' });
    expect(cancelado).toEqual({ fase: 'inactivo', imagenesActivas: [], conversacion: [{ rol: 'usuario', texto: 'Descríbeme esto.' }, { rol: 'ia', texto: 'Propuesta 1.' }] });
  });

  it('6. Aceptación: vuelve a inactivo SIN tocar la conversación — el turno aceptado ya estaba desde "respuesta"', () => {
    const propuesta = pedirYResponder(estadoInicialPanelIA, 'Descríbeme esto.', 'Propuesta final.');
    const aceptado = reducirPanelIA(propuesta, { tipo: 'aceptado' });
    expect(aceptado).toEqual({ fase: 'inactivo', imagenesActivas: [], conversacion: [{ rol: 'usuario', texto: 'Descríbeme esto.' }, { rol: 'ia', texto: 'Propuesta final.' }] });
  });

  it('7. Conversación que alcanza el límite de contexto: recortarConversacion se queda solo con los últimos N mensajes', () => {
    const larga: MensajeConversacionIA[] = [];
    for (let i = 0; i < 20; i++) larga.push({ rol: i % 2 === 0 ? 'usuario' : 'ia', texto: `mensaje ${i}` });
    const recortada = recortarConversacion(larga);
    expect(recortada).toHaveLength(LIMITE_MENSAJES_CONVERSACION);
    // Se queda con los ÚLTIMOS, no los primeros — es lo reciente lo que importa para el contexto.
    expect(recortada[0].texto).toBe(`mensaje ${20 - LIMITE_MENSAJES_CONVERSACION}`);
    expect(recortada[recortada.length - 1].texto).toBe('mensaje 19');
    // Una conversación corta no se toca en absoluto.
    const corta = larga.slice(0, 4);
    expect(recortarConversacion(corta)).toBe(corta);
  });

  it('8. El documento no cambia hasta Aceptar: ninguna fase ni acción devuelve nada relacionado con el documento — aplicar el texto es responsabilidad exclusiva del componente, y solo tras "aceptado"', () => {
    const estados: EstadoPanelIA[] = [];
    let estado = estadoInicialPanelIA;
    for (const accion of [
      { tipo: 'enviar' as const, peticion: 'x', elementoId: 'el-1' },
      { tipo: 'respuesta' as const, texto: 'y' },
      { tipo: 'entrarEdicion' as const },
      { tipo: 'editarTexto' as const, texto: 'y editado' },
      { tipo: 'salirEdicion' as const },
      { tipo: 'aceptado' as const },
    ]) {
      estado = reducirPanelIA(estado, accion);
      estados.push(estado);
    }
    // El único conjunto de claves posible en cualquier estado es este — `elementoId` identifica
    // el elemento seleccionado al pedir (para poder comparar contra la selección actual antes de
    // aplicar), nunca el contenido del documento en sí.
    const clavesPermitidas = new Set(['fase', 'conversacion', 'peticion', 'texto', 'editando', 'mensaje', 'imagenesActivas', 'imagenIncluida', 'elementoId']);
    for (const e of estados) {
      for (const clave of Object.keys(e)) expect(clavesPermitidas.has(clave)).toBe(true);
    }
  });

  it('9. La conversación no es memoria permanente: cada sesión empieza vacía y estadoInicialPanelIA nunca se muta', () => {
    expect(estadoInicialPanelIA).toEqual({ fase: 'inactivo', conversacion: [], imagenesActivas: [] });

    // Una sesión completa de conversación...
    let sesionA = estadoInicialPanelIA;
    sesionA = pedirYResponder(sesionA, 'Petición de la sesión A.', 'Respuesta A.');
    sesionA = reducirPanelIA(sesionA, { tipo: 'aceptado' });

    // ...no debe alterar la constante de partida ni "filtrarse" a una sesión nueva.
    expect(estadoInicialPanelIA).toEqual({ fase: 'inactivo', conversacion: [], imagenesActivas: [] });
    const sesionB = estadoInicialPanelIA;
    expect(sesionB.conversacion).toHaveLength(0);
    expect(sesionB.imagenesActivas).toEqual([]);
  });
});

describe('reducirPanelIA — elemento de destino (corrección 24/08/2026, bug real: aplicar la propuesta al elemento equivocado)', () => {
  it('1. "enviar" fija elementoId a partir del elemento seleccionado en ese momento', () => {
    const enviando = reducirPanelIA(estadoInicialPanelIA, { tipo: 'enviar', peticion: 'Mejora esto.', elementoId: 'el-42' });
    expect(enviando).toMatchObject({ fase: 'enviando', elementoId: 'el-42' });
  });

  it('2. Sin ningún elemento seleccionado, elementoId es null', () => {
    const enviando = reducirPanelIA(estadoInicialPanelIA, { tipo: 'enviar', peticion: 'Redacta algo.', elementoId: null });
    expect(enviando).toMatchObject({ fase: 'enviando', elementoId: null });
  });

  it('3. elementoId viaja intacto de "enviando" a "propuesta"', () => {
    const propuesta = pedirYResponder(estadoInicialPanelIA, 'Mejora esto.', 'Texto mejorado.', 'el-7');
    expect(propuesta).toMatchObject({ fase: 'propuesta', elementoId: 'el-7' });
  });

  it('4. elementoId viaja intacto de "enviando" a "error"', () => {
    const enviando = reducirPanelIA(estadoInicialPanelIA, { tipo: 'enviar', peticion: 'x', elementoId: 'el-7' });
    const error = reducirPanelIA(enviando, { tipo: 'error', mensaje: 'Fallo' });
    expect(error).toMatchObject({ fase: 'error', elementoId: 'el-7' });
  });

  it('5. Regenerar mantiene el elementoId ORIGINAL, nunca relee la selección actual', () => {
    const propuesta = pedirYResponder(estadoInicialPanelIA, 'Mejora esto.', 'Primer intento.', 'el-7');
    // Aunque en la app real el usuario pudiera haber cambiado de selección mientras tanto,
    // 'regenerar' no recibe ningún elementoId nuevo — no tiene forma de "verlo", y no debe inventarlo.
    const regenerando = reducirPanelIA(propuesta, { tipo: 'regenerar' });
    expect(regenerando).toMatchObject({ fase: 'enviando', elementoId: 'el-7' });
  });

  it('6. Elementos distintos en peticiones sucesivas: cada una recuerda el suyo propio, no se mezclan', () => {
    const primera = pedirYResponder(estadoInicialPanelIA, 'Mejora esto.', 'Texto A.', 'el-A');
    expect(primera).toMatchObject({ elementoId: 'el-A' });
    // Si el usuario cambia de elemento y pide otra cosa (tras aceptar o cancelar la anterior),
    // la nueva petición recuerda el elemento nuevo.
    const inactivo = reducirPanelIA(primera, { tipo: 'aceptado' });
    const segunda = pedirYResponder(inactivo, 'Mejora esto también.', 'Texto B.', 'el-B');
    expect(segunda).toMatchObject({ elementoId: 'el-B' });
  });
});

describe('reducirPanelIA — imágenes activas (Fase 3, IA Visual, 23/08/2026; ampliado a varias el 30/08/2026)', () => {
  it('1. Estado inicial: sin imágenes activas', () => {
    expect(estadoInicialPanelIA.imagenesActivas).toEqual([]);
  });

  it('2. Añadir una imagen: queda como única entrada de imagenesActivas, visible en cualquier fase', () => {
    const conImagen = reducirPanelIA(estadoInicialPanelIA, { tipo: 'imagenSeleccionada', id: 'img-1', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'cocina.jpg' });
    expect(conImagen.imagenesActivas).toEqual([{ id: 'img-1', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'cocina.jpg' }]);
    // No afecta a nada más del estado.
    expect(conImagen.fase).toBe('inactivo');
    expect(conImagen.conversacion).toEqual([]);
  });

  it('3. Eliminar la única imagen (por su id): vuelve a array vacío, sin tocar el resto del estado', () => {
    const conImagen = reducirPanelIA(estadoInicialPanelIA, { tipo: 'imagenSeleccionada', id: 'img-1', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'cocina.jpg' });
    const sinImagen = reducirPanelIA(conImagen, { tipo: 'imagenEliminada', id: 'img-1' });
    expect(sinImagen.imagenesActivas).toEqual([]);
  });

  it('4. Añadir una segunda imagen SE ACUMULA junto a la primera — ya no se sustituyen (petición explícita, 30/08/2026)', () => {
    const primera = reducirPanelIA(estadoInicialPanelIA, { tipo: 'imagenSeleccionada', id: 'img-a', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'a.jpg' });
    const segunda = reducirPanelIA(primera, { tipo: 'imagenSeleccionada', id: 'img-b', dataUrl: 'data:image/jpeg;base64,BBB', nombre: 'b.jpg' });
    expect(segunda.imagenesActivas).toEqual([
      { id: 'img-a', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'a.jpg' },
      { id: 'img-b', dataUrl: 'data:image/jpeg;base64,BBB', nombre: 'b.jpg' },
    ]);
  });

  it('4b. Eliminar una imagen del medio por id deja intactas las demás, en el mismo orden', () => {
    let estado = reducirPanelIA(estadoInicialPanelIA, { tipo: 'imagenSeleccionada', id: 'img-a', dataUrl: 'a', nombre: 'a.jpg' });
    estado = reducirPanelIA(estado, { tipo: 'imagenSeleccionada', id: 'img-b', dataUrl: 'b', nombre: 'b.jpg' });
    estado = reducirPanelIA(estado, { tipo: 'imagenSeleccionada', id: 'img-c', dataUrl: 'c', nombre: 'c.jpg' });
    const sinB = reducirPanelIA(estado, { tipo: 'imagenEliminada', id: 'img-b' });
    expect(sinB.imagenesActivas.map((i) => i.id)).toEqual(['img-a', 'img-c']);
  });

  it('4c. Al llegar a LIMITE_IMAGENES_ACTIVAS, una selección de más se ignora (el reducer no supera el tope real del backend)', () => {
    let estado = estadoInicialPanelIA;
    for (let i = 0; i < LIMITE_IMAGENES_ACTIVAS; i++) {
      estado = reducirPanelIA(estado, { tipo: 'imagenSeleccionada', id: `img-${i}`, dataUrl: `d${i}`, nombre: `${i}.jpg` });
    }
    expect(estado.imagenesActivas).toHaveLength(LIMITE_IMAGENES_ACTIVAS);
    const conUnaDeMas = reducirPanelIA(estado, { tipo: 'imagenSeleccionada', id: 'img-extra', dataUrl: 'extra', nombre: 'extra.jpg' });
    expect(conUnaDeMas.imagenesActivas).toHaveLength(LIMITE_IMAGENES_ACTIVAS);
    expect(conUnaDeMas.imagenesActivas.some((i) => i.id === 'img-extra')).toBe(false);
  });

  it('5. Petición con imágenes activas: imagenIncluida se fija en true al entrar en "enviando", y el turno de conversación queda marcado con conImagen', () => {
    const conImagen = reducirPanelIA(estadoInicialPanelIA, { tipo: 'imagenSeleccionada', id: 'img-1', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'cocina.jpg' });
    const enviando = reducirPanelIA(conImagen, { tipo: 'enviar', peticion: 'Descríbeme esta cocina.', elementoId: 'el-1' });
    expect(enviando).toMatchObject({ fase: 'enviando', imagenIncluida: true });
    const propuesta = reducirPanelIA(enviando, { tipo: 'respuesta', texto: 'Cocina en L, isla central visible.' });
    expect(propuesta.conversacion[0]).toEqual({ rol: 'usuario', texto: 'Descríbeme esta cocina.', conImagen: true });
  });

  it('6. Petición sin imágenes activas: imagenIncluida es false y el turno no lleva la marca conImagen', () => {
    const enviando = reducirPanelIA(estadoInicialPanelIA, { tipo: 'enviar', peticion: 'Redacta esta partida.', elementoId: 'el-1' });
    expect(enviando).toMatchObject({ fase: 'enviando', imagenIncluida: false });
    const propuesta = reducirPanelIA(enviando, { tipo: 'respuesta', texto: 'Fabricación de mueble a medida.' });
    expect(propuesta.conversacion[0]).toEqual({ rol: 'usuario', texto: 'Redacta esta partida.' });
    expect('conImagen' in propuesta.conversacion[0]).toBe(false);
  });

  it('7. Conversación multi-turno con imagen activa: el segundo turno de refinamiento no vuelve a necesitar la imagen para tener sentido, pero la imagen sigue activa mientras no se quite', () => {
    const conImagen = reducirPanelIA(estadoInicialPanelIA, { tipo: 'imagenSeleccionada', id: 'img-1', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'cocina.jpg' });
    const primera = pedirYResponder(conImagen, 'Descríbeme esta cocina.', 'Cocina en L con isla central.');
    expect(primera.imagenesActivas).toEqual([{ id: 'img-1', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'cocina.jpg' }]);

    const segunda = pedirYResponder(primera, 'Hazla más profesional.', 'Cocina en distribución en L con isla central, de línea profesional.');
    // La imagen sigue activa para el segundo turno también.
    expect(segunda.imagenesActivas).toEqual([{ id: 'img-1', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'cocina.jpg' }]);
    // Ambos turnos de usuario quedan marcados: la imagen siguió activa en los dos envíos.
    expect(segunda.conversacion[0]).toEqual({ rol: 'usuario', texto: 'Descríbeme esta cocina.', conImagen: true });
    expect(segunda.conversacion[2]).toEqual({ rol: 'usuario', texto: 'Hazla más profesional.', conImagen: true });
  });

  it('7b. Si el usuario quita la imagen entre dos turnos, el turno siguiente ya no queda marcado con conImagen', () => {
    const conImagen = reducirPanelIA(estadoInicialPanelIA, { tipo: 'imagenSeleccionada', id: 'img-1', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'cocina.jpg' });
    const primera = pedirYResponder(conImagen, 'Descríbeme esta cocina.', 'Cocina en L.');
    const sinImagen = reducirPanelIA(primera, { tipo: 'imagenEliminada', id: 'img-1' });
    const segunda = pedirYResponder(sinImagen, 'Resume esto en una frase.', 'Cocina en L, resumen breve.');
    expect(segunda.conversacion[0]).toEqual({ rol: 'usuario', texto: 'Descríbeme esta cocina.', conImagen: true });
    expect(segunda.conversacion[2]).toEqual({ rol: 'usuario', texto: 'Resume esto en una frase.' });
    expect('conImagen' in segunda.conversacion[2]).toBe(false);
  });

  it('8. Regenerar con imagen activa: recalcula imagenIncluida a partir de las imágenes ACTUALES, no de las del intento descartado', () => {
    const conImagen = reducirPanelIA(estadoInicialPanelIA, { tipo: 'imagenSeleccionada', id: 'img-1', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'cocina.jpg' });
    const propuesta = pedirYResponder(conImagen, 'Descríbeme esto.', 'Primer intento.');
    // El usuario quita la imagen antes de regenerar.
    const sinImagen = reducirPanelIA(propuesta, { tipo: 'imagenEliminada', id: 'img-1' });
    const regenerando = reducirPanelIA(sinImagen, { tipo: 'regenerar' });
    expect(regenerando).toMatchObject({ fase: 'enviando', peticion: 'Descríbeme esto.', imagenIncluida: false });
  });

  it('9. Cancelar no afecta a las imágenes activas — solo "imagenEliminada" quita una', () => {
    const conImagen = reducirPanelIA(estadoInicialPanelIA, { tipo: 'imagenSeleccionada', id: 'img-1', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'cocina.jpg' });
    const propuesta = pedirYResponder(conImagen, 'Descríbeme esto.', 'Propuesta.');
    const cancelado = reducirPanelIA(propuesta, { tipo: 'cancelar' });
    expect(cancelado.imagenesActivas).toEqual([{ id: 'img-1', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'cocina.jpg' }]);
  });

  it('10. Aceptar no afecta a las imágenes activas — el usuario puede seguir preguntando sobre las mismas imágenes', () => {
    const conImagen = reducirPanelIA(estadoInicialPanelIA, { tipo: 'imagenSeleccionada', id: 'img-1', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'cocina.jpg' });
    const propuesta = pedirYResponder(conImagen, 'Descríbeme esto.', 'Propuesta.');
    const aceptado = reducirPanelIA(propuesta, { tipo: 'aceptado' });
    expect(aceptado.imagenesActivas).toEqual([{ id: 'img-1', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'cocina.jpg' }]);
  });

  it('11. Las imágenes NUNCA se duplican dentro de los mensajes históricos de la conversación — solo el flag conImagen, nunca la dataUrl', () => {
    const conImagen = reducirPanelIA(estadoInicialPanelIA, { tipo: 'imagenSeleccionada', id: 'img-1', dataUrl: 'data:image/jpeg;base64,'.padEnd(500, 'A'), nombre: 'cocina.jpg' });
    let estado = pedirYResponder(conImagen, 'Descríbeme esto.', 'Cocina en L.');
    estado = pedirYResponder(estado, 'Hazla más corta.', 'Cocina en L, breve.');
    for (const turno of estado.conversacion) {
      expect(JSON.stringify(turno)).not.toContain('base64');
      expect(Object.keys(turno).sort()).toEqual(expect.arrayContaining(['rol', 'texto']));
      const clavesPermitidas = new Set(['rol', 'texto', 'conImagen']);
      for (const clave of Object.keys(turno)) expect(clavesPermitidas.has(clave)).toBe(true);
    }
  });

  it('12. Las imágenes activas no se filtran entre sesiones: estadoInicialPanelIA nunca se muta al seleccionar una imagen', () => {
    expect(estadoInicialPanelIA.imagenesActivas).toEqual([]);
    const sesionA = reducirPanelIA(estadoInicialPanelIA, { tipo: 'imagenSeleccionada', id: 'img-1', dataUrl: 'data:image/jpeg;base64,AAA', nombre: 'cocina.jpg' });
    expect(sesionA.imagenesActivas).not.toEqual([]);
    // La constante de partida sigue intacta — una sesión nueva (otro presupuesto) no hereda la imagen de la anterior.
    expect(estadoInicialPanelIA.imagenesActivas).toEqual([]);
    const sesionB = estadoInicialPanelIA;
    expect(sesionB.imagenesActivas).toEqual([]);
  });
});
