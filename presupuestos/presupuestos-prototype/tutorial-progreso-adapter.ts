/**
 * Persistencia del progreso de tutoriales (Fase 1, 24/08/2026).
 *
 * Decisión explícita: NO se introduce ninguna colección Mongo nueva
 * todavía. Fase 1 solo necesita demostrar que el ciclo completo
 * (abrir → guardar el paso → cerrar → reabrir → reanudar donde se dejó)
 * funciona — un adaptador con esta misma forma, respaldado por
 * `localStorage`, basta para validarlo sin tocar el backend ni arriesgar
 * nada ahí. Cuando llegue la fase que lo necesite (progreso visible entre
 * dispositivos, Centro de ayuda, onboarding definitivo), se implementa
 * `AlmacenProgresoTutorial` contra `POST/GET /tutoriales/progreso`
 * (mismo molde que `usePerfil`/`useEmpresa`, ver auditoría de arquitectura)
 * y se sustituye `crearAlmacenLocalStorage` por esa implementación en el
 * único sitio que lo instancia — el resto del motor y del overlay no se
 * enteran del cambio, porque solo conocen esta interfaz.
 *
 * Namespacing por usuario: reutiliza `storagePrefix` de `use-auth.ts`
 * (ya pensado exactamente para esto — separar los datos de cada usuario en
 * localStorage), no se inventa un mecanismo de aislamiento nuevo.
 *
 * `esNuncaVisto`/`progresoAlSaltar` (Fase A, 25/08/2026) son funciones
 * PURAS a propósito — mismo patrón que `tutorial-motor.ts` (reducer sin
 * React ni DOM): la decisión "¿hay que auto-abrir?"/"¿qué hay que guardar
 * al saltar?" se puede testear con literales, sin montar ningún componente
 * ni depender de ninguna librería de testing de React nueva.
 */
import type { EstadoMotorTutorial } from './tutorial-motor.js';

/**
 * `nunca_visto` NO es un valor de este tipo a propósito: se representa
 * como `obtener()` devolviendo `null` (nada guardado todavía), no como un
 * cuarto string — evita el estado imposible "hay un registro guardado que
 * dice que no hay ningún registro". `saltado` (Fase A, 25/08/2026): antes
 * "Omitir tutorial" a mitad de un paso no guardaba nada distinto de
 * `en_progreso` — indistinguible de "lo tiene a medias y va a
 * continuar". Ver `use-tutorial.ts` (`cerrar`) para dónde se decide.
 */
export type EstadoProgresoTutorial = 'en_progreso' | 'completado' | 'saltado';

export type ProgresoTutorial = {
  tutorialId: string;
  estado: EstadoProgresoTutorial;
  /** `id` del paso en el que se quedó — `null` si nunca se empezó o si ya se completó. */
  pasoActualId: string | null;
  /** ISO — última vez que se tocó este progreso. */
  actualizadoEn: string;
};

/**
 * Forma mínima que necesita el motor para guardar/reanudar — misma forma
 * que tendrá el futuro adaptador contra Mongo (`tutorialId`, `estado`,
 * `pasoActualId`, `actualizadoEn`, tal como se especificó en la
 * arquitectura).
 */
export interface AlmacenProgresoTutorial {
  obtener(tutorialId: string): ProgresoTutorial | null;
  guardar(progreso: ProgresoTutorial): void;
}

/** `true` si nunca se ha guardado ningún progreso para este tutorial — señal de "usuario nunca visto" para el inicio automático. */
export function esNuncaVisto(progreso: ProgresoTutorial | null): boolean {
  return progreso === null;
}

/**
 * Qué guardar al pulsar "Omitir tutorial"/cerrar a mitad de un paso —
 * `null` si esta vez no hay que guardar nada (p. ej. si ya estaba
 * `completado`: ese estado ya se guardó por su cuenta al llegar al
 * último paso, y este cierre posterior no debe pisarlo con `saltado`).
 * Pura: decide QUÉ se guardaría, nunca toca `localStorage` — quien llama
 * (`use-tutorial.ts`) es quien de verdad escribe.
 */
export function progresoAlSaltar(
  fase: EstadoMotorTutorial['fase'],
  tutorialId: string,
  pasoActualId: string | null,
  ahora: string
): ProgresoTutorial | null {
  if (fase !== 'localizando' && fase !== 'mostrandoPaso') return null;
  return { tutorialId, estado: 'saltado', pasoActualId, actualizadoEn: ahora };
}

/**
 * Qué guardar cada vez que el motor abre, avanza o completa un paso —
 * "Empezar" (fase pasa a `localizando`/`mostrandoPaso` por primera vez) y
 * "avanzar" comparten el mismo resultado (`en_progreso`); `null` solo
 * cuando `fase` es `inactivo` (nada que guardar todavía).
 */
export function progresoAlAvanzar(
  fase: EstadoMotorTutorial['fase'],
  tutorialId: string,
  pasoActualId: string | null,
  ahora: string
): ProgresoTutorial | null {
  if (fase === 'inactivo') return null;
  return {
    tutorialId,
    estado: fase === 'completado' ? 'completado' : 'en_progreso',
    pasoActualId: fase === 'completado' ? null : pasoActualId,
    actualizadoEn: ahora,
  };
}

/**
 * En qué índice de pasos hay que reanudar al abrir con `reanudar: true` —
 * `0` si nunca se guardó nada, si ya estaba completado (`pasoActualId`
 * vacío) o si el paso guardado ya no existe (p. ej. el tutorial se acortó
 * en una versión nueva — nunca revienta con un índice fuera de rango).
 */
export function pasoIndiceAlAbrir(pasosIds: string[], guardado: ProgresoTutorial | null): number {
  if (!guardado?.pasoActualId) return 0;
  return Math.max(0, pasosIds.indexOf(guardado.pasoActualId));
}

/** Implementación de Fase 1 — localStorage, con el mismo prefijo por usuario que ya usa el resto de la app. */
export function crearAlmacenLocalStorage(storagePrefix: string): AlmacenProgresoTutorial {
  const clave = (tutorialId: string) => `${storagePrefix}tutorial_${tutorialId}`;
  return {
    obtener(tutorialId) {
      try {
        const raw = localStorage.getItem(clave(tutorialId));
        return raw ? (JSON.parse(raw) as ProgresoTutorial) : null;
      } catch {
        return null;
      }
    },
    guardar(progreso) {
      try {
        localStorage.setItem(clave(progreso.tutorialId), JSON.stringify(progreso));
      } catch {
        /* localStorage no disponible (modo privado, cuota llena...) — no persiste, pero no rompe el tutorial en curso */
      }
    },
  };
}
