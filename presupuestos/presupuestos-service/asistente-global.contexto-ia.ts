import type { ConstructorContexto } from './ia-contexto.js';
import { capacidadPermitidaParaPlan } from './planes.js';
import { contextoAsistenteNavegacion } from './asistente-navegacion.contexto-ia.js';
import { contextoAsistenteCifrasReales } from './asistente-cifras-reales.contexto-ia.js';

/**
 * Dispatcher de `asistente-global` (Fase 3.1, 05/09/2026 — reemplaza el `if`
 * interno que había en este mismo archivo desde la Fase 3).
 *
 * `asistente-global` sigue siendo UNA sola capacidad registrada en el
 * manifiesto (`ia-capacidad-asistente-global.ts`, `planMinimo: undefined`
 * — el frontend manda siempre `capacidad: 'asistente-global'`, sin
 * variarlo por plan, así que cambiar eso habría sido un cambio de producto
 * fuera de alcance de esta fase). Lo que cambia es que la lógica de "qué
 * contexto construir" ya NO es una condición interna: son dos
 * `ConstructorContexto` completos, separados en sus propios archivos,
 * cada uno con sus propios tests —
 * - `asistente-navegacion.contexto-ia.ts` — BASIC: clientes/proyectos,
 *   proyecto abierto, sin ninguna cifra en euros. Nunca consulta facturas.
 * - `asistente-cifras-reales.contexto-ia.ts` — PRO+: lo anterior + ingresos/
 *   gastos/balance + el importe de cada presupuesto. Reutiliza el
 *   constructor de navegación para no duplicar las consultas de
 *   clientes/proyecto.
 *
 * Este archivo solo decide cuál de los dos usar, reutilizando
 * `capacidadPermitidaParaPlan` — la MISMA función que ya usan
 * `/ia/generar` y `/ia/herramientas/ejecutar` (`ia-rutas.ts`) para
 * cualquier otra capacidad con `planMinimo`. No es una comprobación de plan
 * nueva ni un segundo sistema de permisos: es el mismo motor de
 * `planes.ts`, aplicado aquí porque esta capacidad concreta necesita
 * decidir SU PROPIO contexto según el plan, algo que ninguna otra
 * capacidad de este código necesita hacer.
 */
export const contextoAsistenteGlobal: ConstructorContexto = {
  async construir(referencias, usuarioId) {
    const tieneCifrasReales = await capacidadPermitidaParaPlan(usuarioId, 'PRO');
    return tieneCifrasReales
      ? contextoAsistenteCifrasReales.construir(referencias, usuarioId)
      : contextoAsistenteNavegacion.construir(referencias, usuarioId);
  },
};
