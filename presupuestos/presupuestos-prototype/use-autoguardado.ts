import { useCallback, useEffect, useRef, useState } from 'react';
import { MotorAutoguardado, type EstadoAutoguardado } from './autoguardado-motor.js';

export type { EstadoAutoguardado } from './autoguardado-motor.js';

export type ResultadoAutoguardado = {
  estado: EstadoAutoguardado;
  errorMensaje: string | null;
  /** Fuerza un guardado inmediato — ver `MotorAutoguardado.guardarAhora`. */
  guardarAhora: () => Promise<boolean>;
};

/**
 * Conecta `MotorAutoguardado` (lógica pura, ver `autoguardado-motor.ts`) a
 * un componente React. Deliberadamente delgado: toda la lógica de
 * debounce/concurrencia/dirty-check vive en el motor y ya está cubierta por
 * sus propios tests sin necesidad de renderizar nada — aquí solo se crea
 * UNA instancia por montaje del componente, se le reenvía `datos` en cada
 * render y se refleja su estado en `useState` para que el componente
 * vuelva a pintar cuando cambie.
 */
export function useAutoguardado<T>(datos: T, guardarFn: (datos: T) => Promise<void>, debounceMs = 2500): ResultadoAutoguardado {
  const [estado, setEstado] = useState<EstadoAutoguardado>('guardado');
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);

  // La función de guardado puede cambiar de identidad en cada render (cierra
  // sobre `contenedor`/`titulo` del componente) sin que eso deba recrear el
  // motor ni reprogramar nada — se lee siempre la versión más reciente vía ref.
  const guardarFnRef = useRef(guardarFn);
  guardarFnRef.current = guardarFn;

  const motorRef = useRef<MotorAutoguardado<T> | null>(null);
  if (!motorRef.current) {
    motorRef.current = new MotorAutoguardado<T>(datos, {
      debounceMs,
      guardar: (d) => guardarFnRef.current(d),
      onCambioEstado: (nuevoEstado, nuevoError) => { setEstado(nuevoEstado); setErrorMensaje(nuevoError); },
    });
  }

  useEffect(() => {
    motorRef.current!.actualizarDatos(datos);
  }, [datos]);

  // Al desmontar (cerrar el editor, cambiar de presupuesto): cancela
  // cualquier debounce pendiente y retira el aviso de cierre — la siguiente
  // vez que se monte el editor (mismo u otro presupuesto) es una instancia
  // de componente nueva con su propio `motorRef`, sin nada heredado.
  useEffect(() => () => motorRef.current?.destruir(), []);

  const guardarAhora = useCallback((): Promise<boolean> => motorRef.current!.guardarAhora(), []);

  return { estado, errorMensaje, guardarAhora };
}
