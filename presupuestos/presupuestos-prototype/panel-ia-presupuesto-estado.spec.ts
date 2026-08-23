import {
  reducirPanelIA, estadoInicialPanelIA, recortarConversacion, LIMITE_MENSAJES_CONVERSACION,
  type EstadoPanelIA, type MensajeConversacionIA,
} from './panel-ia-presupuesto-estado.js';

/** Simula el ciclo completo enviar→respuesta que hace el componente real. */
function pedirYResponder(estado: EstadoPanelIA, peticion: string, respuesta: string): EstadoPanelIA {
  const enviando = reducirPanelIA(estado, { tipo: 'enviar', peticion });
  return reducirPanelIA(enviando, { tipo: 'respuesta', texto: respuesta });
}

describe('reducirPanelIA — conversación multi-turno (23/08/2026)', () => {
  it('1. Primera petición: conversación vacía → propuesta con un turno usuario+ia', () => {
    const r = pedirYResponder(estadoInicialPanelIA, 'Descríbeme esta cocina.', 'Cocina en L con acabado mate.');
    expect(r).toEqual({
      fase: 'propuesta', peticion: 'Descríbeme esta cocina.', texto: 'Cocina en L con acabado mate.', editando: false,
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
    expect(regenerando).toEqual({ fase: 'enviando', peticion: 'Describe esto.', conversacion: [] });

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
    expect(regenerando).toEqual({ fase: 'enviando', peticion: 'Más formal.', conversacion: [{ rol: 'usuario', texto: 'Descríbeme esto.' }, { rol: 'ia', texto: 'Propuesta 1.' }] });
  });

  it('4c. Regenerar desde un error (reintentar) no toca la conversación, porque el error nunca la había modificado', () => {
    const enviando = reducirPanelIA(estadoInicialPanelIA, { tipo: 'enviar', peticion: 'Redacta esto.' });
    const error = reducirPanelIA(enviando, { tipo: 'error', mensaje: 'Fallo de red' });
    const reintentando = reducirPanelIA(error, { tipo: 'regenerar' });
    expect(reintentando).toEqual({ fase: 'enviando', peticion: 'Redacta esto.', conversacion: [] });
  });

  it('5. Cancelación: descarta la propuesta pendiente Y su par de la conversación — "olvida esto"', () => {
    const primera = pedirYResponder(estadoInicialPanelIA, 'Descríbeme esto.', 'Propuesta 1.');
    const segunda = pedirYResponder(primera, 'Añade algo raro.', 'Propuesta descartable.');
    const cancelado = reducirPanelIA(segunda, { tipo: 'cancelar' });
    expect(cancelado).toEqual({ fase: 'inactivo', conversacion: [{ rol: 'usuario', texto: 'Descríbeme esto.' }, { rol: 'ia', texto: 'Propuesta 1.' }] });
  });

  it('6. Aceptación: vuelve a inactivo SIN tocar la conversación — el turno aceptado ya estaba desde "respuesta"', () => {
    const propuesta = pedirYResponder(estadoInicialPanelIA, 'Descríbeme esto.', 'Propuesta final.');
    const aceptado = reducirPanelIA(propuesta, { tipo: 'aceptado' });
    expect(aceptado).toEqual({ fase: 'inactivo', conversacion: [{ rol: 'usuario', texto: 'Descríbeme esto.' }, { rol: 'ia', texto: 'Propuesta final.' }] });
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
      { tipo: 'enviar' as const, peticion: 'x' },
      { tipo: 'respuesta' as const, texto: 'y' },
      { tipo: 'entrarEdicion' as const },
      { tipo: 'editarTexto' as const, texto: 'y editado' },
      { tipo: 'salirEdicion' as const },
      { tipo: 'aceptado' as const },
    ]) {
      estado = reducirPanelIA(estado, accion);
      estados.push(estado);
    }
    // El único conjunto de claves posible en cualquier estado es este — nunca aparece un campo de documento/elemento.
    const clavesPermitidas = new Set(['fase', 'conversacion', 'peticion', 'texto', 'editando', 'mensaje']);
    for (const e of estados) {
      for (const clave of Object.keys(e)) expect(clavesPermitidas.has(clave)).toBe(true);
    }
  });

  it('9. La conversación no es memoria permanente: cada sesión empieza vacía y estadoInicialPanelIA nunca se muta', () => {
    expect(estadoInicialPanelIA).toEqual({ fase: 'inactivo', conversacion: [] });

    // Una sesión completa de conversación...
    let sesionA = estadoInicialPanelIA;
    sesionA = pedirYResponder(sesionA, 'Petición de la sesión A.', 'Respuesta A.');
    sesionA = reducirPanelIA(sesionA, { tipo: 'aceptado' });

    // ...no debe alterar la constante de partida ni "filtrarse" a una sesión nueva.
    expect(estadoInicialPanelIA).toEqual({ fase: 'inactivo', conversacion: [] });
    const sesionB = estadoInicialPanelIA;
    expect(sesionB.conversacion).toHaveLength(0);
  });
});
