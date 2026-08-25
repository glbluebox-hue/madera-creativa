import { useEffect, useRef } from 'react';

/**
 * Cierra la sesión sola tras `minutos` sin ninguna interacción real del
 * usuario (ratón, teclado, toque, scroll) — ver "Cerrar sesión sola por
 * inactividad" en Ajustes de empresa (petición real, 25/08/2026).
 * `minutos: null` desactiva el temporizador por completo (ni siquiera se
 * registran los listeners) — es el valor por defecto, nadie empieza con
 * esto activado sin haberlo configurado a propósito.
 *
 * `onExpirar` se guarda en un ref para poder usar la versión más reciente
 * sin tener que incluirla en las dependencias del efecto — de lo
 * contrario, una nueva referencia de función en cada render (habitual con
 * closures inline) reiniciaría el listener constantemente.
 */
export function useInactividad(minutos: number | null, activo: boolean, onExpirar: () => void): void {
  const onExpirarRef = useRef(onExpirar);
  onExpirarRef.current = onExpirar;

  useEffect(() => {
    if (!activo || minutos === null || minutos <= 0) return;
    let temporizador: ReturnType<typeof setTimeout>;
    const reiniciar = () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => onExpirarRef.current(), minutos * 60 * 1000);
    };
    const eventos = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    eventos.forEach((ev) => window.addEventListener(ev, reiniciar, { passive: true }));
    reiniciar();
    return () => {
      clearTimeout(temporizador);
      eventos.forEach((ev) => window.removeEventListener(ev, reiniciar));
    };
  }, [minutos, activo]);
}
