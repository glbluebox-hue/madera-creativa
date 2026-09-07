import { useState, useEffect, useCallback } from 'react';

/**
 * `beforeinstallprompt` todavía no está en los tipos del DOM de
 * TypeScript (evento no estándar, solo Chrome/Edge/Android) — se tipa a
 * mano lo mínimo que se usa aquí.
 */
type EventoInstalacionPWA = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * Instalar la app en el propio dispositivo (08/09/2026, botón real de
 * "Instalar" en la página de presentación) — el navegador (Chrome/Edge,
 * en Android y en ordenador) dispara `beforeinstallprompt` cuando decide
 * que la página cumple los requisitos para instalarse (manifest +
 * Service Worker, ya configurados de antes — ver `manifest.webmanifest`
 * y el registro del Service Worker en `presupuestos-prototype.app-
 * root.tsx`). Se guarda ese evento para poder mostrar el diálogo nativo
 * de instalación en respuesta a un clic real del usuario — nunca antes:
 * el navegador ignora `prompt()` si no viene de un gesto del usuario.
 *
 * iOS Safari NUNCA dispara este evento — es una limitación real de
 * Apple, no de esta app: no existe ninguna forma de disparar "Añadir a
 * pantalla de inicio" desde la propia página en iPhone/iPad. Ahí
 * `disponible` se queda siempre en `false`, y solo cabe explicar el
 * gesto manual (Compartir → Añadir a pantalla de inicio) — ver el resto
 * de la sección de instalación en `pagina-presentacion.tsx`.
 */
export function useInstalarApp() {
  const [evento, setEvento] = useState<EventoInstalacionPWA | null>(null);
  const [instalada, setInstalada] = useState(false);

  useEffect(() => {
    const alEstarDisponible = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalacionPWA);
    };
    const alInstalar = () => { setInstalada(true); setEvento(null); };
    window.addEventListener('beforeinstallprompt', alEstarDisponible);
    window.addEventListener('appinstalled', alInstalar);
    // Si ya se abrió como app instalada (modo standalone), no tiene sentido ofrecer instalarla otra vez.
    if (window.matchMedia('(display-mode: standalone)').matches) setInstalada(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', alEstarDisponible);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, []);

  /** Muestra el diálogo nativo de instalación — solo funciona si `disponible` es `true`. El evento solo se puede usar una vez, se descarta después. */
  const instalar = useCallback(async () => {
    if (!evento) return;
    await evento.prompt();
    setEvento(null);
  }, [evento]);

  return { disponible: !!evento && !instalada, instalada, instalar };
}
