/**
 * Máquina de estados pura de la IA del Presupuesto (23/08/2026, ampliada el
 * mismo día con conversación multi-turno) — separada del componente React a
 * propósito, para poder testear el flujo "pedir → propuesta →
 * Aceptar/Editar/Regenerar/Cancelar" sin red, sin OpenAI y sin renderizar
 * nada. `panel-ia-presupuesto.tsx` es la única pieza que llama a
 * `api.generarRespuestaIA()`; este archivo no hace ninguna llamada externa.
 *
 * CONVERSACIÓN — solo de esta sesión del panel, nunca persistida:
 * `conversacion` vive en memoria de React mientras el panel está montado.
 * No es el sistema de "Memoria IA" (retirado el 23/08/2026) ni ninguna otra
 * colección de MongoDB — se pierde al cerrar el presupuesto o recargar la
 * página, a propósito. Sirve solo para que una petición como "hazla más
 * formal" pueda referirse a la propuesta anterior sin que el usuario tenga
 * que repetir el contexto.
 *
 * Reglas de qué entra en `conversacion`:
 * - Una respuesta generada con éxito SÍ entra de inmediato (para que el
 *   siguiente turno pueda refinarla), aunque el usuario todavía no haya
 *   pulsado "Aceptar" — aceptar decide si se aplica al DOCUMENTO, no si la
 *   conversación la recuerda.
 * - "Regenerar" quita el último par (usuario+ia) antes de reintentar — el
 *   intento descartado no debe seguir influyendo en los próximos turnos.
 * - "Cancelar" también quita el último par — cancelar significa "olvida
 *   esto", tanto para el documento como para la conversación.
 * - Un error nunca añade nada (no hubo respuesta real que recordar).
 *
 * Regla de oro del flujo (pedida explícitamente): el documento NUNCA se
 * modifica en los estados `enviando`/`propuesta` — solo la fase `aceptado`
 * es la señal de que el componente debe aplicar el texto al elemento
 * seleccionado. La conversación ayuda a la IA a entender mejor la petición;
 * nunca es una vía para que algo se aplique sin el paso explícito de Aceptar.
 */

export type MensajeConversacionIA = { rol: 'usuario' | 'ia'; texto: string };

/** Tope de mensajes (usuario+ia contados juntos) que se conservan — evita que la conversación crezca sin control. Par a par: 12 = últimos 6 turnos completos. */
export const LIMITE_MENSAJES_CONVERSACION = 12;

/** Recorta la conversación a los últimos N mensajes antes de mandarla a la IA — solo afecta a lo que se envía, no borra nada de lo que ve el usuario en el panel. */
export function recortarConversacion(conversacion: MensajeConversacionIA[], limite: number = LIMITE_MENSAJES_CONVERSACION): MensajeConversacionIA[] {
  return conversacion.length > limite ? conversacion.slice(-limite) : conversacion;
}

type EstadoBase = { conversacion: MensajeConversacionIA[] };

export type EstadoPanelIA =
  | ({ fase: 'inactivo' } & EstadoBase)
  | ({ fase: 'enviando'; peticion: string } & EstadoBase)
  | ({ fase: 'propuesta'; peticion: string; texto: string; editando: boolean } & EstadoBase)
  | ({ fase: 'error'; peticion: string; mensaje: string } & EstadoBase);

export type AccionPanelIA =
  | { tipo: 'enviar'; peticion: string }
  | { tipo: 'respuesta'; texto: string }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'entrarEdicion' }
  | { tipo: 'editarTexto'; texto: string }
  | { tipo: 'salirEdicion' }
  | { tipo: 'regenerar' }
  | { tipo: 'cancelar' }
  | { tipo: 'aceptado' };

export const estadoInicialPanelIA: EstadoPanelIA = { fase: 'inactivo', conversacion: [] };

/** Quita el último par usuario/ia de la conversación, si existe — usado al regenerar/cancelar un intento que no debe quedar recordado. */
function sinUltimoPar(conversacion: MensajeConversacionIA[]): MensajeConversacionIA[] {
  return conversacion.length >= 2 ? conversacion.slice(0, -2) : conversacion;
}

export function reducirPanelIA(estado: EstadoPanelIA, accion: AccionPanelIA): EstadoPanelIA {
  switch (accion.tipo) {
    case 'enviar':
      // La conversación no cambia todavía — el par usuario/ia de esta
      // petición se añade solo si llega una respuesta real (ver 'respuesta').
      return { fase: 'enviando', peticion: accion.peticion, conversacion: estado.conversacion };

    case 'respuesta': {
      if (estado.fase !== 'enviando') return estado;
      const conversacion: MensajeConversacionIA[] = [
        ...estado.conversacion,
        { rol: 'usuario', texto: estado.peticion },
        { rol: 'ia', texto: accion.texto },
      ];
      return { fase: 'propuesta', peticion: estado.peticion, texto: accion.texto, editando: false, conversacion };
    }

    case 'error':
      if (estado.fase !== 'enviando') return estado;
      // Un fallo no genera respuesta real — la conversación se queda tal como estaba.
      return { fase: 'error', peticion: estado.peticion, mensaje: accion.mensaje, conversacion: estado.conversacion };

    case 'entrarEdicion':
      return estado.fase === 'propuesta' ? { ...estado, editando: true } : estado;

    case 'editarTexto': {
      if (estado.fase !== 'propuesta') return estado;
      // Mantiene sincronizado el último turno "ia" de la conversación con lo
      // que el usuario está editando a mano — si sigue conversando después,
      // la IA debe ver la versión editada, no el borrador original.
      const conversacion = [...estado.conversacion];
      const ultimo = conversacion[conversacion.length - 1];
      if (ultimo?.rol === 'ia') conversacion[conversacion.length - 1] = { rol: 'ia', texto: accion.texto };
      return { ...estado, texto: accion.texto, conversacion };
    }

    case 'salirEdicion':
      return estado.fase === 'propuesta' ? { ...estado, editando: false } : estado;

    case 'regenerar':
      // Descarta el intento rechazado (si lo hubo) y repite la MISMA
      // petición original — nunca la reformula ni usa el texto editado como
      // nueva petición.
      if (estado.fase === 'propuesta') return { fase: 'enviando', peticion: estado.peticion, conversacion: sinUltimoPar(estado.conversacion) };
      if (estado.fase === 'error') return { fase: 'enviando', peticion: estado.peticion, conversacion: estado.conversacion };
      return estado;

    case 'cancelar':
      // "Olvida esto": si había una propuesta pendiente, también se quita de
      // la conversación — cancelar no debe seguir influyendo en turnos futuros.
      if (estado.fase === 'propuesta') return { fase: 'inactivo', conversacion: sinUltimoPar(estado.conversacion) };
      return { fase: 'inactivo', conversacion: estado.conversacion };

    // Se dispara justo después de que el componente ya haya aplicado
    // `estado.texto` al documento — este reducer nunca aplica nada por sí
    // mismo. La conversación NO se toca aquí: ya incluía este turno desde
    // 'respuesta', aceptar solo decide qué pasa con el documento.
    case 'aceptado':
      return { fase: 'inactivo', conversacion: estado.conversacion };

    default:
      return estado;
  }
}
