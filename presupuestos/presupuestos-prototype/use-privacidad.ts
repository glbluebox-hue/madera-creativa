import { useState, useCallback } from 'react';

const CLAVE = 'mc_privacidad_dashboard';

/**
 * Modo privacidad de las cifras del Dashboard (Inicio) — pedido explícito
 * del usuario, 18/08/2026: un ojo que oculte los importes de las tarjetas
 * de Ingresos/Gastos/Balance/Presupuestos, por ejemplo para no enseñarlos
 * si alguien más mira la pantalla. Guardado en `localStorage` (no en el
 * servidor): es una preferencia del propio dispositivo, no un dato de la
 * cuenta — cada dispositivo decide el suyo, y no hace falta ninguna
 * llamada a la API para algo tan local.
 */
export function usePrivacidadDashboard(): { privado: boolean; alternar: () => void } {
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
