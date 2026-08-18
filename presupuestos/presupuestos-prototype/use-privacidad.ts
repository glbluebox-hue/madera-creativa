import { useState, useCallback } from 'react';

// Nombre de la clave sin cambiar (viene de cuando solo cubría el
// Dashboard) — cambiarlo resetearía la preferencia ya guardada de los
// usuarios que la tuvieran activada.
const CLAVE = 'mc_privacidad_dashboard';

/**
 * Modo privacidad de las cifras económicas — pedido explícito del
 * usuario, 18/08/2026: un único ojo (en Inicio) que oculta los importes en
 * toda la app — Inicio, Facturas, Proveedores y la ficha de cada
 * cliente —, por ejemplo para no enseñarlos si alguien más mira la
 * pantalla. Un solo interruptor global, no uno por pantalla (petición
 * explícita: "no quiero otro ojo... quiero que el mismo ojo de inicio").
 * Guardado en `localStorage` (no en el servidor): es una preferencia del
 * propio dispositivo, no un dato de la cuenta — cada dispositivo decide
 * el suyo, y no hace falta ninguna llamada a la API para algo tan local.
 */
export function usePrivacidad(): { privado: boolean; alternar: () => void } {
  const [privado, setPrivado] = useState(() => {
    try {
      return localStorage.getItem(CLAVE) === '1';
    } catch {
      return false;
    }
  });

  const alternar = useCallback(() => {
    setPrivado((actual) => {
      const siguiente = !actual;
      try {
        localStorage.setItem(CLAVE, siguiente ? '1' : '0');
      } catch {
        // Almacenamiento no disponible (modo privado del propio navegador,
        // cuota llena...) — el toggle sigue funcionando en memoria durante
        // esta sesión, solo no sobrevive a un recargado.
      }
      return siguiente;
    });
  }, []);

  return { privado, alternar };
}
