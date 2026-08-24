/**
 * Motor de tutoriales interactivos (Fase 1, 24/08/2026) — máquina de
 * estados PURA: sin React, sin DOM, sin `document`. Mismo patrón ya
 * probado en esta sesión con `panel-ia-presupuesto-estado.ts` (reducer +
 * acciones, testeable sin montar nada).
 *
 * Responsabilidad de este archivo: decidir EN QUÉ PASO está el tutorial
 * activo y en qué fase (localizando su objetivo / mostrado / completado).
 * Nunca decide CÓMO se ve nada, ni busca elementos en el DOM — eso es
 * responsabilidad exclusiva de `TutorialOverlay` (el único componente con
 * permiso para tocar el DOM, ver ese archivo).
 *
 * "Objetivo que todavía no existe" / "reintento cuando aparece" (pedido
 * explícito) NO es una acción propia — es la fase `localizando` en sí
 * misma: el motor se queda ahí sin hacer nada hasta que algo externo
 * (el overlay, sondeando el DOM) dispara `objetivoLocalizado`. No hace
 * falta una acción "objetivoNoLocalizado" — "seguir sin encontrarlo" es
 * simplemente "no llega ninguna acción todavía", el estado no cambia solo.
 */

/** Tipo de paso: informativo se avanza a mano ("Siguiente"); interactivo espera una acción real del usuario sobre el elemento objetivo. */
export type TipoPasoTutorial = 'informativo' | 'interactivo';

export type PasoTutorial = {
  id: string;
  titulo: string;
  texto: string;
  /** Valor del atributo `data-tutorial-id` del elemento real que este paso señala — nunca una posición ni una clase CSS (ver ARQUITECTURA-MOTOR-DOCUMENTAL.md, aviso del usuario sobre fragilidad ante cambios de diseño). */
  targetId: string;
  /** Lado preferido del globo respecto al objetivo — el overlay puede invertirlo si no cabe en pantalla. */
  posicion?: 'arriba' | 'abajo' | 'izquierda' | 'derecha';
  tipo: TipoPasoTutorial;
  /**
   * Si el objetivo de este paso vive en otra sección de la app, el nombre
   * de esa sección (mismo valor que usa `Seccion` en `presupuestos-prototype.tsx`)
   * — el motor no conoce ese tipo (se mantiene agnóstico de la app
   * concreta), solo expone el dato; quien monte el tutorial es quien
   * decide navegar de verdad, reutilizando `cambiarSeccion` ya existente.
   */
  seccionRequerida?: string;
  /** true si el objetivo vive dentro del menú lateral que en móvil está oculto por defecto — quien monte el tutorial debe abrirlo antes de que el overlay intente localizar el elemento. */
  requiereMenuMovil?: boolean;
};

export type DefinicionTutorial = {
  id: string;
  titulo: string;
  pasos: PasoTutorial[];
};

type EstadoConTutorial = { definicion: DefinicionTutorial; pasoIndice: number };

export type EstadoMotorTutorial =
  | { fase: 'inactivo' }
  | ({ fase: 'localizando' } & EstadoConTutorial)
  | ({ fase: 'mostrandoPaso' } & EstadoConTutorial)
  | ({ fase: 'completado' } & EstadoConTutorial);

export type AccionTutorial =
  | { tipo: 'abrir'; definicion: DefinicionTutorial; pasoIndice?: number }
  | { tipo: 'objetivoLocalizado' }
  | { tipo: 'avanzar' }
  | { tipo: 'accionDetectada' }
  | { tipo: 'retroceder' }
  | { tipo: 'cerrar' };

export const estadoInicialTutorial: EstadoMotorTutorial = { fase: 'inactivo' };

/** Paso actualmente activo, o `null` si no hay ningún tutorial abierto — evita repetir el estrechamiento de tipos (`fase !== 'inactivo'`) en cada sitio que lo necesita. */
export function pasoActualDe(estado: EstadoMotorTutorial): PasoTutorial | null {
  if (estado.fase === 'inactivo') return null;
  return estado.definicion.pasos[estado.pasoIndice] ?? null;
}

export function reducirTutorial(estado: EstadoMotorTutorial, accion: AccionTutorial): EstadoMotorTutorial {
  switch (accion.tipo) {
    case 'abrir': {
      const pasoIndice = accion.pasoIndice ?? 0;
      // Reanudar con un índice guardado que ya no existe (ej. el tutorial se acortó en una versión nueva) — se trata como completado, nunca como un índice inválido que reviente el resto del motor.
      if (pasoIndice < 0 || pasoIndice >= accion.definicion.pasos.length) {
        return { fase: 'completado', definicion: accion.definicion, pasoIndice: Math.max(0, accion.definicion.pasos.length - 1) };
      }
      return { fase: 'localizando', definicion: accion.definicion, pasoIndice };
    }

    case 'objetivoLocalizado':
      if (estado.fase !== 'localizando') return estado;
      return { fase: 'mostrandoPaso', definicion: estado.definicion, pasoIndice: estado.pasoIndice };

    case 'avanzar':
    case 'accionDetectada': {
      if (estado.fase !== 'mostrandoPaso') return estado;
      // 'accionDetectada' solo es válida en un paso interactivo — en uno
      // informativo se ignora (evita que un clic suelto en el elemento
      // señalado salte un paso pensado para leerse con calma).
      if (accion.tipo === 'accionDetectada' && estado.definicion.pasos[estado.pasoIndice].tipo !== 'interactivo') return estado;
      const siguiente = estado.pasoIndice + 1;
      if (siguiente >= estado.definicion.pasos.length) return { fase: 'completado', definicion: estado.definicion, pasoIndice: estado.pasoIndice };
      return { fase: 'localizando', definicion: estado.definicion, pasoIndice: siguiente };
    }

    case 'retroceder': {
      if (estado.fase !== 'mostrandoPaso' && estado.fase !== 'localizando') return estado;
      if (estado.pasoIndice === 0) return estado;
      return { fase: 'localizando', definicion: estado.definicion, pasoIndice: estado.pasoIndice - 1 };
    }

    case 'cerrar':
      return { fase: 'inactivo' };

    default:
      return estado;
  }
}
