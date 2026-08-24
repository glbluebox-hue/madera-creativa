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
 */

export type EstadoProgresoTutorial = 'no_iniciado' | 'en_progreso' | 'completado';

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
