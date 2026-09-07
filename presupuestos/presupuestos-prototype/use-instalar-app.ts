import { useState, useEffect } from 'react';
import { suscribirseAInstalacion, obtenerEstadoInstalacion, instalarApp } from './instalar-app-estado.js';

/**
 * Instalar la app en el propio dispositivo (08/09/2026, botón real de
 * "Instalar" en la página de presentación) — envoltorio de React sobre
 * `instalar-app-estado.ts`, que es quien de verdad escucha
 * `beforeinstallprompt` (a nivel de módulo, no aquí — ver ese archivo
 * para el motivo: un `useEffect` puede llegar tarde a escuchar el
 * evento).
 *
 * Dos motivos reales por los que el botón puede no aparecer nunca en un
 * navegador/dispositivo concreto, ninguno de los dos es un fallo:
 * - **Ya está instalada** (reporte real del cliente) — Chrome deja de
 *   ofrecer el aviso una vez instalada en ese navegador, a propósito,
 *   para no insistir. No hay forma de "reactivarlo" desde el código.
 * - **iOS Safari** — Apple no dispara nunca este evento; ahí solo cabe
 *   el gesto manual (Compartir → Añadir a pantalla de inicio), ver el
 *   resto de la sección de instalación en `pagina-presentacion.tsx`.
 */
export function useInstalarApp() {
  const [estado, setEstado] = useState(obtenerEstadoInstalacion);
  useEffect(() => suscribirseAInstalacion(() => setEstado(obtenerEstadoInstalacion())), []);
  return { disponible: estado.disponible, instalada: estado.instalada, instalar: instalarApp };
}
