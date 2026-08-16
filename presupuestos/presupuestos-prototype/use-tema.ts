import { useCallback, useEffect, useState } from 'react';

/**
 * Preferencia de tema explícita del usuario (claro/oscuro) — `null` si
 * nunca ha tocado el interruptor. Con `null`, `styles.module.css` sigue
 * el tema del propio dispositivo vía `prefers-color-scheme`, sin ninguna
 * intervención de JS: `dataTheme` se queda `undefined` y no se fija ningún
 * atributo, así que decide el sistema. En cuanto el usuario alterna una
 * vez, la elección se guarda y gana siempre sobre el sistema, en cualquier
 * dirección — igual que el resto de preferencias de la app (ver
 * `use-auth.ts`, mismo patrón de `localStorage`).
 */

export type Tema = 'claro' | 'oscuro';
const KEY_TEMA = 'mc_tema';

function cargarTema(): Tema | null {
  try {
    const guardado = localStorage.getItem(KEY_TEMA);
    return guardado === 'claro' || guardado === 'oscuro' ? guardado : null;
  } catch {
    return null;
  }
}

function sistemaPrefiereOscuro(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function useTema() {
  const [tema, setTema] = useState<Tema | null>(cargarTema);

  /** Alterna respecto a lo que se esté mostrando ahora mismo (preferencia guardada, o el sistema si aún no hay ninguna). */
  const alternar = useCallback(() => {
    setTema((actual) => {
      const oscuroActual = actual !== null ? actual === 'oscuro' : sistemaPrefiereOscuro();
      const nuevo: Tema = oscuroActual ? 'claro' : 'oscuro';
      try { localStorage.setItem(KEY_TEMA, nuevo); } catch { /* noop */ }
      return nuevo;
    });
  }, []);

  /** Valor para el atributo `data-theme` del `.app` raíz — `undefined` deja que decida `prefers-color-scheme`. */
  const dataTheme = tema === 'oscuro' ? 'dark' : tema === 'claro' ? 'light' : undefined;

  // Reflejo del mismo atributo en <html>: los tokens de color viven en
  // `.app` (así los usa el resto de la app), pero `html`/`body` no pueden
  // leer esas variables — son ancestros de `.app`, y las custom properties
  // solo heredan hacia abajo. Sin este espejo en `<html>`, el fondo fijo de
  // `html`/`body` (necesario para el rebote elástico de iOS y para cuando
  // el contenido no llena la pantalla) se quedaba siempre en el tono claro,
  // aunque el resto de la app ya estuviera en oscuro.
  useEffect(() => {
    try {
      if (dataTheme) document.documentElement.setAttribute('data-theme', dataTheme);
      else document.documentElement.removeAttribute('data-theme');
    } catch { /* noop */ }
  }, [dataTheme]);

  return { tema, dataTheme, alternar };
}
