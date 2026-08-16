import type { DocumentoMC } from './documento-modelo.js';
import { recorrerElementosMC } from './documento-registro-tipos.js';

/**
 * Puerto mínimo, en el backend, del canal de comandos del Motor
 * Documental (`documento-comandos.ts` en `presupuestos-prototype` es la
 * versión completa que usan el editor humano y el "Generar con IA" del
 * frontend — Regla de Oro 3). Las automatizaciones (Incremento 11) corren
 * en el servidor, sin DOM ni React, así que necesitan su propia copia de
 * la única función que de verdad usan: `actualizarContenido`. Mismo
 * patrón de duplicación frontend/backend ya aceptado en este proyecto
 * para el resto del modelo del Motor Documental.
 *
 * Respeta `restricciones.soloLectura` exactamente igual que la versión
 * del frontend — una automatización no puede escribir contenido que un
 * humano tampoco podría escribir a mano.
 */
export function actualizarContenidoMC(documento: DocumentoMC, id: string, contenido: Record<string, unknown>): DocumentoMC {
  const copia = structuredClone(documento);
  for (const { elemento, reemplazar } of recorrerElementosMC(copia)) {
    if (elemento.id !== id || elemento.restricciones.soloLectura) continue;
    reemplazar({ ...elemento, contenido: { ...(elemento.contenido as Record<string, unknown>), ...contenido } });
  }
  return copia;
}
