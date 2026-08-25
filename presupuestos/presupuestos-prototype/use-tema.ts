import { useCallback, useEffect, useState } from 'react';

/**
 * Preferencia de tema explícita del usuario (claro/oscuro). Antes, sin
 * nada guardado se seguía el tema del propio dispositivo vía
 * `prefers-color-scheme` — pero un usuario nuevo con el sistema en modo
 * oscuro entraba directamente en oscuro sin haberlo elegido nunca
 * (petición real, 25/08/2026: la primera vez debe ser siempre claro). En
 * cuanto el usuario alterna una vez, su elección se guarda y gana siempre,
 * en cualquier dirección — igual que el resto de preferencias de la app
 * (ver `use-auth.ts`, mismo patrón de `localStorage`).
 */

export type Tema = 'claro' | 'oscuro';
const KEY_TEMA = 'mc_tema';

function cargarTema(): Tema {
  try {
    const guardado = localStorage.getItem(KEY_TEMA);
    return guardado === 'oscuro' ? 'oscuro' : 'claro';
  } catch {
    return 'claro';
  }
}

export function useTema() {
  const [tema, setTema] = useState<Tema>(cargarTema);

  /** Alterna respecto a la preferencia guardada. */
  const alternar = useCallback(() => {
    setTema((actual) => {
      const nuevo: Tema = actual === 'oscuro' ? 'claro' : 'oscuro';
      try { localStorage.setItem(KEY_TEMA, nuevo); } catch { /* noop */ }
      return nuevo;
    });
  }, []);

  /** Valor para el atributo `data-theme` del `.app` raíz. */
  const dataTheme = tema === 'oscuro' ? 'dark' : 'light';

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
