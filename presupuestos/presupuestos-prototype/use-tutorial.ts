import { useReducer, useCallback, useEffect, useRef } from 'react';
import { reducirTutorial, estadoInicialTutorial, pasoActualDe, type EstadoMotorTutorial, type DefinicionTutorial, type PasoTutorial } from './tutorial-motor.js';
import { crearAlmacenLocalStorage, type AlmacenProgresoTutorial } from './tutorial-progreso-adapter.js';

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
    const pasoIndice = guardado?.pasoActualId
      ? Math.max(0, definicion.pasos.findIndex((p) => p.id === guardado.pasoActualId))
      : 0;
    dispatch({ tipo: 'abrir', definicion, pasoIndice });
  }, []);

  const avanzar = useCallback(() => dispatch({ tipo: 'avanzar' }), []);
  const retroceder = useCallback(() => dispatch({ tipo: 'retroceder' }), []);
  const cerrar = useCallback(() => dispatch({ tipo: 'cerrar' }), []);
  const objetivoLocalizado = useCallback(() => dispatch({ tipo: 'objetivoLocalizado' }), []);
  const accionDetectada = useCallback(() => dispatch({ tipo: 'accionDetectada' }), []);

  // Guarda el progreso cada vez que cambia de paso o se completa — nunca en
  // 'inactivo': cerrar un tutorial a medias no borra el progreso ya
  // guardado, simplemente deja de escribir hasta la próxima vez que se abra.
  useEffect(() => {
    if (estado.fase === 'inactivo') return;
    const paso = pasoActualDe(estado);
    almacenRef.current!.guardar({
      tutorialId: estado.definicion.id,
      estado: estado.fase === 'completado' ? 'completado' : 'en_progreso',
      pasoActualId: estado.fase === 'completado' ? null : (paso?.id ?? null),
      actualizadoEn: new Date().toISOString(),
    });
  }, [estado]);

  return { estado, pasoActual: pasoActualDe(estado), abrir, avanzar, retroceder, cerrar, objetivoLocalizado, accionDetectada };
}
