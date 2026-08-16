/**
 * Punto de entrada exclusivo del despliegue combinado fuera de Bit (Render).
 * `presupuestos-service.app-root.ts` solo EXPORTA `run()` — normalmente la
 * invoca el propio runner de Bit (`@bitdev/node.node-server`) por
 * convención, nunca el propio archivo. Fuera de Bit no existe ese runner,
 * así que hace falta este archivo mínimo para arrancar el servicio de
 * verdad.
 */
import { run } from './presupuestos-service.app-root.js';

run();
