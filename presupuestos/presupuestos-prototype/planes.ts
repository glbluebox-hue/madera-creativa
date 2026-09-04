/**
 * Punto único de verdad del lado del frontend para "qué significa
 * BASIC/PRO/PREMIUM" (Fase 1, 04/09/2026) — funciones puras, sin estado:
 * cada componente que ya recibe el plan de la sesión actual (`sesion.plan`,
 * ver `use-auth.ts`) las llama directamente, en vez de comparar el string
 * del plan a mano. No hay Context de React para esto — el proyecto no usa
 * Context en ningún sitio (todo es paso de props explícito) y no era el
 * momento de introducir un patrón nuevo solo para esto.
 *
 * Backend: mismo criterio y misma tabla de orden en
 * `presupuestos-service/planes.ts` — no se pueden compartir literalmente el
 * mismo archivo entre los dos paquetes, así que esta es la copia mínima del
 * lado del cliente, deliberadamente pequeña para que sea fácil comprobar
 * que dice lo mismo.
 */

export const PLANES_COMERCIALES = ['BASIC', 'PRO', 'PREMIUM'] as const;
export type PlanComercial = typeof PLANES_COMERCIALES[number];
/** El plan real de una cuenta puede ser también `NONE`/`LIFETIME_FREE` (ver `usuario.model.ts` en el backend) — ninguno de los dos cumple nunca un requisito comercial hoy. */
export type PlanAcceso = 'NONE' | 'LIFETIME_FREE' | PlanComercial;

const ORDEN_PLANES: Record<PlanComercial, number> = { BASIC: 0, PRO: 1, PREMIUM: 2 };

/** Atajos de lectura — evitan repetir el array literal en cada sitio que gatea una función. */
export const PRO_O_SUPERIOR: PlanComercial[] = ['PRO', 'PREMIUM'];
export const SOLO_PREMIUM: PlanComercial[] = ['PREMIUM'];

/** Expande un "plan mínimo" a la lista de planes que lo cumplen. */
export function planesDesde(minimo: PlanComercial): PlanComercial[] {
  return PLANES_COMERCIALES.filter((p) => ORDEN_PLANES[p] >= ORDEN_PLANES[minimo]);
}

/**
 * ¿El plan actual de la sesión permite usar una función que exige uno de
 * `permitidos`? Puramente informativo para la interfaz (mostrar/ocultar,
 * habilitar/deshabilitar) — la autorización real y obligatoria vive siempre
 * en el backend (`requirePlan`); esto nunca debe tratarse como el punto de
 * seguridad.
 */
export function puedeUsar(planActual: PlanAcceso | undefined, permitidos: PlanComercial[]): boolean {
  if (!planActual) return false;
  return (permitidos as string[]).includes(planActual);
}
