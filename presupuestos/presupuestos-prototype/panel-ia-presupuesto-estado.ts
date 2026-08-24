/**
 * Máquina de estados pura de la IA del Presupuesto (23/08/2026, ampliada el
 * mismo día con conversación multi-turno, y de nuevo el mismo día con
 * imagen activa — Fase 3, IA Visual) — separada del componente React a
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
 * IMAGEN ACTIVA (Fase 3, IA Visual) — `imagenActiva` es una selección
 * persistente del panel, NO un campo de cada turno: vive junto a
 * `conversacion` en `EstadoBase` y sobrevive a enviar/responder/regenerar/
 * cancelar/aceptar sin cambiar, hasta que el usuario la quita o la sustituye
 * explícitamente (acciones `imagenSeleccionada`/`imagenEliminada`). Esto
 * evita reenviar la misma data URL (potencialmente cientos de KB) dentro de
 * cada mensaje histórico de `conversacion` — el historial solo recuerda
 * texto; `panel-ia-presupuesto.tsx` añade `imagenActiva.dataUrl` únicamente
 * al mensaje saliente de la petición en curso, mientras siga activa.
 *
 * Para que la conversación pueda seguir teniendo sentido tras aceptar o
 * regenerar, cada turno "enviando"/"error" recuerda con `imagenIncluida` si
 * la petición en curso llevaba imagen — se calcula SIEMPRE a partir de
 * `estado.imagenActiva` en el instante de entrar en 'enviando' (tanto por un
 * 'enviar' como por un 'regenerar'), nunca se recibe desde fuera: si el
 * usuario quita o sustituye la imagen entre un turno y el siguiente, cada
 * envío reflejará la imagen activa en ESE momento, no la de un turno
 * anterior. El campo `conImagen` que queda grabado en `conversacion` es solo
 * una marca informativa (para que la interfaz pueda mostrar un icono en ese
 * turno) — nunca contiene la imagen en sí.
 *
 * Regla de oro del flujo (pedida explícitamente): el documento NUNCA se
 * modifica en los estados `enviando`/`propuesta` — solo la fase `aceptado`
 * es la señal de que el componente debe aplicar el texto al elemento
 * seleccionado. La conversación (y la imagen activa) ayudan a la IA a
 * entender mejor la petición; nunca son una vía para que algo se aplique sin
 * el paso explícito de Aceptar.
 *
 * ELEMENTO DE DESTINO (corrección 24/08/2026, bug real reportado por el
 * usuario): `elementoId` recuerda QUÉ elemento estaba seleccionado cuando se
 * hizo la petición — se fija al entrar en 'enviando' y viaja intacto por
 * 'propuesta'/'error'/'regenerar' hasta 'aceptado'. Antes no se guardaba en
 * ningún sitio: el componente aplicaba la propuesta al elemento que
 * estuviera seleccionado EN EL MOMENTO de pulsar "Aceptar", no al que
 * estaba seleccionado cuando se pidió — si el usuario cambiaba de elemento
 * mientras la propuesta seguía abierta (p. ej. para mirar otra parte del
 * documento) y luego pulsaba "Aceptar", el texto se aplicaba al elemento
 * EQUIVOCADO, sin ningún aviso. `panel-ia-presupuesto.tsx` compara este
 * campo contra el elemento realmente seleccionado ahora mismo antes de
 * permitir "Aceptar".
 */

export type MensajeConversacionIA = { rol: 'usuario' | 'ia'; texto: string; conImagen?: boolean };

/** Imagen seleccionada por el usuario, pendiente de usar en la próxima petición (o ya usada, mientras el usuario no la quite/sustituya). Efímera: solo vive en este estado de React, nunca se persiste. */
export type ImagenActivaIA = { dataUrl: string; nombre: string };

/** Tope de mensajes (usuario+ia contados juntos) que se conservan — evita que la conversación crezca sin control. Par a par: 12 = últimos 6 turnos completos. */
export const LIMITE_MENSAJES_CONVERSACION = 12;

/** Recorta la conversación a los últimos N mensajes antes de mandarla a la IA — solo afecta a lo que se envía, no borra nada de lo que ve el usuario en el panel. */
export function recortarConversacion(conversacion: MensajeConversacionIA[], limite: number = LIMITE_MENSAJES_CONVERSACION): MensajeConversacionIA[] {
  return conversacion.length > limite ? conversacion.slice(-limite) : conversacion;
}

type EstadoBase = { conversacion: MensajeConversacionIA[]; imagenActiva: ImagenActivaIA | null };

export type EstadoPanelIA =
  | ({ fase: 'inactivo' } & EstadoBase)
  | ({ fase: 'enviando'; peticion: string; imagenIncluida: boolean; elementoId: string | null } & EstadoBase)
  | ({ fase: 'propuesta'; peticion: string; texto: string; editando: boolean; elementoId: string | null } & EstadoBase)
  | ({ fase: 'error'; peticion: string; mensaje: string; imagenIncluida: boolean; elementoId: string | null } & EstadoBase);

export type AccionPanelIA =
  | { tipo: 'enviar'; peticion: string; elementoId: string | null }
  | { tipo: 'respuesta'; texto: string }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'entrarEdicion' }
  | { tipo: 'editarTexto'; texto: string }
  | { tipo: 'salirEdicion' }
  | { tipo: 'regenerar' }
  | { tipo: 'cancelar' }
  | { tipo: 'aceptado' }
  | { tipo: 'imagenSeleccionada'; dataUrl: string; nombre: string }
  | { tipo: 'imagenEliminada' };

export const estadoInicialPanelIA: EstadoPanelIA = { fase: 'inactivo', conversacion: [], imagenActiva: null };

/** Quita el último par usuario/ia de la conversación, si existe — usado al regenerar/cancelar un intento que no debe quedar recordado. */
function sinUltimoPar(conversacion: MensajeConversacionIA[]): MensajeConversacionIA[] {
  return conversacion.length >= 2 ? conversacion.slice(0, -2) : conversacion;
}

export function reducirPanelIA(estado: EstadoPanelIA, accion: AccionPanelIA): EstadoPanelIA {
  switch (accion.tipo) {
    case 'enviar':
      // La conversación no cambia todavía — el par usuario/ia de esta
      // petición se añade solo si llega una respuesta real (ver 'respuesta').
      // `imagenIncluida` se fija AHORA, a partir de la imagen activa en este
      // instante — si se quita/sustituye después, no afecta a esta petición
      // ya en curso. `elementoId` igual: el elemento seleccionado AHORA, para
      // poder comprobar más tarde si sigue siendo el mismo al aceptar.
      return { fase: 'enviando', peticion: accion.peticion, imagenIncluida: !!estado.imagenActiva, elementoId: accion.elementoId, conversacion: estado.conversacion, imagenActiva: estado.imagenActiva };

    case 'respuesta': {
      if (estado.fase !== 'enviando') return estado;
      const conversacion: MensajeConversacionIA[] = [
        ...estado.conversacion,
        { rol: 'usuario', texto: estado.peticion, ...(estado.imagenIncluida ? { conImagen: true } : {}) },
        { rol: 'ia', texto: accion.texto },
      ];
      return { fase: 'propuesta', peticion: estado.peticion, texto: accion.texto, editando: false, elementoId: estado.elementoId, conversacion, imagenActiva: estado.imagenActiva };
    }

    case 'error':
      if (estado.fase !== 'enviando') return estado;
      // Un fallo no genera respuesta real — la conversación se queda tal como estaba.
      return { fase: 'error', peticion: estado.peticion, mensaje: accion.mensaje, imagenIncluida: estado.imagenIncluida, elementoId: estado.elementoId, conversacion: estado.conversacion, imagenActiva: estado.imagenActiva };

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
      // nueva petición. `imagenIncluida` se recalcula igual que en 'enviar':
      // usa la imagen activa AHORA, no la que hubiera en el intento descartado.
      // `elementoId` se mantiene del intento original (nunca se relee la
      // selección actual) — regenerar sigue apuntando al mismo elemento que
      // la petición inicial, tal como la propia petición no cambia.
      if (estado.fase === 'propuesta') {
        return { fase: 'enviando', peticion: estado.peticion, imagenIncluida: !!estado.imagenActiva, elementoId: estado.elementoId, conversacion: sinUltimoPar(estado.conversacion), imagenActiva: estado.imagenActiva };
      }
      if (estado.fase === 'error') {
        return { fase: 'enviando', peticion: estado.peticion, imagenIncluida: !!estado.imagenActiva, elementoId: estado.elementoId, conversacion: estado.conversacion, imagenActiva: estado.imagenActiva };
      }
      return estado;

    case 'cancelar':
      // "Olvida esto": si había una propuesta pendiente, también se quita de
      // la conversación — cancelar no debe seguir influyendo en turnos
      // futuros. La imagen activa NO se toca: cancelar una propuesta de
      // texto no significa que el usuario quiera quitar la imagen que
      // seleccionó (para eso está 'imagenEliminada').
      if (estado.fase === 'propuesta') return { fase: 'inactivo', conversacion: sinUltimoPar(estado.conversacion), imagenActiva: estado.imagenActiva };
      return { fase: 'inactivo', conversacion: estado.conversacion, imagenActiva: estado.imagenActiva };

    // Se dispara justo después de que el componente ya haya aplicado
    // `estado.texto` al documento — este reducer nunca aplica nada por sí
    // mismo. La conversación NO se toca aquí: ya incluía este turno desde
    // 'respuesta', aceptar solo decide qué pasa con el documento. La imagen
    // activa tampoco se toca — aceptar el texto no implica que el usuario
    // haya terminado con la imagen, puede seguir pidiendo más sobre ella.
    case 'aceptado':
      return { fase: 'inactivo', conversacion: estado.conversacion, imagenActiva: estado.imagenActiva };

    // Añadir/sustituir/quitar la imagen activa es válido en cualquier fase —
    // si hay una petición en curso ('enviando'), ya capturó su propia
    // `imagenIncluida` al entrar en esa fase, así que cambiar la imagen aquí
    // no afecta a la petición ya en vuelo, solo a la siguiente.
    case 'imagenSeleccionada':
      return { ...estado, imagenActiva: { dataUrl: accion.dataUrl, nombre: accion.nombre } };

    case 'imagenEliminada':
      return { ...estado, imagenActiva: null };

    default:
      return estado;
  }
}
