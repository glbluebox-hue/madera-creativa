/**
 * Estado GLOBAL de instalación de la PWA (08/09/2026, corrección real:
 * "no veo el botón de instalar") — el listener de `beforeinstallprompt`
 * se registra aquí, a nivel de MÓDULO (se ejecuta en cuanto este archivo
 * se importa, no cuando un componente de React se monta), importado
 * desde `presupuestos-prototype.app-root.tsx` antes de
 * `createRoot().render()`.
 *
 * Causa real del fallo anterior: el hook `useInstalarApp` escuchaba el
 * evento dentro de un `useEffect`, que solo se ejecuta DESPUÉS del
 * primer render de React. Chrome puede disparar `beforeinstallprompt`
 * en cuanto decide que la página es instalable — que en muchos casos es
 * ANTES de que ese `useEffect` llegara a ejecutarse. Ese evento no se
 * puede "recuperar" ni volver a pedir: si nadie lo escuchaba en el
 * instante exacto en que se disparó, se pierde para siempre en esa
 * carga de página, y el botón nunca aparece aunque el resto de la
 * lógica sea correcta.
 *
 * Registrando el listener aquí, al importarse este módulo (lo antes
 * posible en el ciclo de vida de la página), se captura siempre, llegue
 * cuando llegue.
 */
type EventoInstalacionPWA = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let eventoCapturado: EventoInstalacionPWA | null = null;
let yaInstalada = typeof window !== 'undefined' && !!window.matchMedia?.('(display-mode: standalone)').matches;
const suscriptores = new Set<() => void>();

function avisarSuscriptores(): void {
  suscriptores.forEach((cb) => cb());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    eventoCapturado = e as EventoInstalacionPWA;
    avisarSuscriptores();
  });
  window.addEventListener('appinstalled', () => {
    yaInstalada = true;
    eventoCapturado = null;
    avisarSuscriptores();
  });
}

/** Se suscribe a cambios de estado (evento capturado / instalada) — devuelve la función para darse de baja. */
export function suscribirseAInstalacion(cb: () => void): () => void {
  suscriptores.add(cb);
  return () => { suscriptores.delete(cb); };
}

export function obtenerEstadoInstalacion(): { disponible: boolean; instalada: boolean } {
  return { disponible: !!eventoCapturado && !yaInstalada, instalada: yaInstalada };
}

/** Muestra el diálogo nativo de instalación — solo funciona si `disponible` es `true`. El evento solo se puede usar una vez. */
export async function instalarApp(): Promise<void> {
  if (!eventoCapturado) return;
  const evento = eventoCapturado;
  eventoCapturado = null;
  avisarSuscriptores();
  await evento.prompt();
}
