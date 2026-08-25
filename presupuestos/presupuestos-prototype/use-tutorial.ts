import { useReducer, useCallback, useEffect, useRef } from 'react';
import { reducirTutorial, estadoInicialTutorial, pasoActualDe, type EstadoMotorTutorial, type DefinicionTutorial, type PasoTutorial } from './tutorial-motor.js';
import { crearAlmacenLocalStorage, progresoAlSaltar, progresoAlAvanzar, pasoIndiceAlAbrir, type AlmacenProgresoTutorial, type ProgresoTutorial } from './tutorial-progreso-adapter.js';

export type UseTutorialResult = {
  estado: EstadoMotorTutorial;
  pasoActual: PasoTutorial | null;
  /** Abre un tutorial — por defecto reanuda desde el progreso guardado, si existe (`reanudar: false` fuerza a empezar desde el principio, ej. "Repetir tutorial" desde el futuro Centro de ayuda). */
  abrir: (definicion: DefinicionTutorial, reanudar?: boolean) => void;
  avanzar: () => void;
  retroceder: () => void;
  cerrar: () => void;
  objetivoLocalizado: () => void;
  accionDetectada: () => void;
  /**
   * Progreso guardado de un tutorial SIN abrirlo ni provocar ningún efecto
   * secundario — `null` si nunca se ha tocado (Fase A, 25/08/2026: es la
   * señal que usa el inicio automático para decidir "usuario nunca visto").
   */
  progresoDe: (tutorialId: string) => ProgresoTutorial | null;
};

/**
 * Envoltorio React del motor puro (`tutorial-motor.ts`) — añade
 * persistencia (guarda tras cada cambio de paso, reanuda al abrir) sin que
 * el motor sepa nada de almacenamiento; ver `tutorial-progreso-adapter.ts`
 * para por qué es localStorage y no Mongo todavía. `storagePrefix`
 * reutiliza el mismo namespacing por usuario que ya usa `use-auth.ts` —
 * ningún mecanismo de aislamiento nuevo.
 */
export function useTutorial(storagePrefix: string): UseTutorialResult {
  const [estado, dispatch] = useReducer(reducirTutorial, estadoInicialTutorial);
  const almacenRef = useRef<AlmacenProgresoTutorial | null>(null);
  if (almacenRef.current === null) almacenRef.current = crearAlmacenLocalStorage(storagePrefix);

  const abrir = useCallback((definicion: DefinicionTutorial, reanudar = true) => {
    const guardado = reanudar ? almacenRef.current!.obtener(definicion.id) : null;
    const pasoIndice = pasoIndiceAlAbrir(definicion.pasos.map((p) => p.id), guardado);
    dispatch({ tipo: 'abrir', definicion, pasoIndice });
  }, []);

  const avanzar = useCallback(() => dispatch({ tipo: 'avanzar' }), []);
  const retroceder = useCallback(() => dispatch({ tipo: 'retroceder' }), []);
  /**
   * `cerrar` es el único punto por el que pasan TANTO "Omitir tutorial" a
   * mitad de un paso COMO "Cerrar" en la pantalla de completado — el
   * motor (`tutorial-motor.ts`) no distingue el motivo, las dos acaban en
   * `{ fase: 'inactivo' }`. Si ya estaba `completado`, ese estado se
   * guardó solo en el efecto de abajo en el render anterior y este cierre
   * no debe pisarlo; si estaba a medias (`localizando`/`mostrandoPaso`),
   * hay que guardar `saltado` explícitamente AQUÍ, antes de despachar —
   * sin esto, cerrar a medias dejaba el último `en_progreso` ya guardado
   * tal cual, indistinguible de "lo tiene a medias y va a continuar"
   * (Fase A, 25/08/2026).
   */
  const cerrar = useCallback(() => {
    if (estado.fase !== 'inactivo') {
      const aGuardar = progresoAlSaltar(estado.fase, estado.definicion.id, pasoActualDe(estado)?.id ?? null, new Date().toISOString());
      if (aGuardar) almacenRef.current!.guardar(aGuardar);
    }
    dispatch({ tipo: 'cerrar' });
  }, [estado]);
  const objetivoLocalizado = useCallback(() => dispatch({ tipo: 'objetivoLocalizado' }), []);
  const accionDetectada = useCallback(() => dispatch({ tipo: 'accionDetectada' }), []);
  const progresoDe = useCallback((tutorialId: string) => almacenRef.current!.obtener(tutorialId), []);

  // Guarda el progreso cada vez que cambia de paso o se completa — nunca en
  // 'inactivo': cerrar un tutorial a medias no borra el progreso ya
  // guardado, simplemente deja de escribir hasta la próxima vez que se abra.
  useEffect(() => {
    if (estado.fase === 'inactivo') return;
    const paso = pasoActualDe(estado);
    const aGuardar = progresoAlAvanzar(estado.fase, estado.definicion.id, paso?.id ?? null, new Date().toISOString());
    if (aGuardar) almacenRef.current!.guardar(aGuardar);
  }, [estado]);

  return { estado, pasoActual: pasoActualDe(estado), abrir, avanzar, retroceder, cerrar, objetivoLocalizado, accionDetectada, progresoDe };
}
