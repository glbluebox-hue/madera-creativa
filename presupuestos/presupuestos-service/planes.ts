import express from 'express';
import { UsuarioModel, conectarUsuarios } from './usuario.model.js';
import type { PlanAcceso } from './usuario.model.js';
import type { AuthRequest } from './presupuestos-service.app-root.js';

/**
 * Motor de autorización por plan comercial (Fase 1+2, 04/09/2026) — punto
 * único de verdad para "qué significa BASIC/PRO/PREMIUM" en el backend.
 * Ningún otro archivo debe comparar `acceso.plan` a mano: todo pasa por
 * `requirePlan()` (rutas normales) o `planPermiteAcceso()`/`planesDesde()`
 * (rutas paramétricas como `/ia/generar`, donde el plan exigido depende del
 * cuerpo de la petición, no de la ruta en sí — ver `ia-rutas.ts`).
 *
 * Deliberadamente NO incluye `NONE` ni `LIFETIME_FREE` en `PLANES_COMERCIALES`:
 * hoy ninguna decisión de producto dice que un código de acceso vitalicio
 * gratuito deba equivaler a BASIC/PRO/PREMIUM — una cuenta con ese `acceso.plan`
 * no cumple ningún requisito comercial hasta que se decida explícitamente
 * (Especificación Técnica V3, sección 20, "Decisión pendiente").
 */
export const PLANES_COMERCIALES = ['BASIC', 'PRO', 'PREMIUM'] as const;
export type PlanComercial = typeof PLANES_COMERCIALES[number];

/** Atajos de lectura para los dos casos de uso reales de esta fase — evita repetir el array literal en cada ruta. */
export const PRO_O_SUPERIOR: PlanComercial[] = ['PRO', 'PREMIUM'];
export const SOLO_PREMIUM: PlanComercial[] = ['PREMIUM'];

const ORDEN_PLANES: Record<PlanComercial, number> = { BASIC: 0, PRO: 1, PREMIUM: 2 };

/** Expande un "plan mínimo" (p. ej. el `planMinimo` de una capacidad de IA) a la lista de planes que lo cumplen — mismo criterio de comparación que usa `requirePlan`, una sola tabla de orden. */
export function planesDesde(minimo: PlanComercial): PlanComercial[] {
  return PLANES_COMERCIALES.filter((p) => ORDEN_PLANES[p] >= ORDEN_PLANES[minimo]);
}

/** ¿El plan actual de la cuenta está entre los permitidos? `acceso.plan` puede ser `NONE`/`LIFETIME_FREE` — nunca cumplen una lista de planes comerciales (ver comentario de arriba). */
export function planPermiteAcceso(planActual: PlanAcceso, permitidos: PlanComercial[]): boolean {
  return (permitidos as string[]).includes(planActual);
}

/**
 * Caché en memoria de "¿qué plan tiene esta cuenta?" — mismo patrón y mismo
 * TTL que `cacheUsuarioActivo` en `presupuestos-service.app-root.ts` (evita
 * repetir la misma consulta a Mongo en cada petición protegida), pero en su
 * propio `Map`: son dos preguntas distintas (¿activa? / ¿qué plan?) que no
 * tiene sentido acoplar en una sola caché.
 */
const TTL_CACHE_PLAN_MS = 60_000;
const cachePlanUsuario = new Map<string, { plan: PlanAcceso; expira: number }>();

/** Plan actual de una cuenta, con caché corta. `'NONE'` si no se encuentra la cuenta (mismo criterio conservador que `ACCESO_POR_DEFECTO`). */
export async function obtenerPlanUsuario(usuarioId: string): Promise<PlanAcceso> {
  const ahora = Date.now();
  const enCache = cachePlanUsuario.get(usuarioId);
  if (enCache && enCache.expira > ahora) return enCache.plan;
  await conectarUsuarios();
  const u = await UsuarioModel.findOne({ id: usuarioId }).select('acceso').lean().exec() as any;
  const plan: PlanAcceso = u?.acceso?.plan ?? 'NONE';
  cachePlanUsuario.set(usuarioId, { plan, expira: ahora + TTL_CACHE_PLAN_MS });
  return plan;
}

/**
 * Middleware de autorización por plan — mismo patrón que `requireAdmin`:
 * debe usarse siempre después de `requireAuth` (nunca solo), nunca sustituye
 * el aislamiento por `usuarioId` ni la comprobación de `estado`, solo añade
 * una capa más encima. La cuenta `admin` nunca queda bloqueada por un gate
 * de plan comercial, igual que ya está exenta de todo lo demás.
 */
/**
 * ¿Usa este contenido de un Dibujo (Tablero de medición) alguna función
 * exclusiva de PRO+ (fotos, cotas)? (Fase 3, 04/09/2026). No hay una ruta
 * ni un campo separado para "dibujo con fotos" — todo vive junto en
 * `Dibujo.contenido`, un blob de Excalidraw — así que se inspecciona el
 * contenido recibido en vez de la ruta en sí, mismo criterio que el gate de
 * capacidades de IA en `ia-rutas.ts`. Vive aquí (no en `cliente.model.ts`
 * ni en la propia ruta) para que sea una función pura, testable sola, sin
 * levantar Mongo ni Express — igual que el resto de este archivo.
 */
export function contenidoDibujoUsaFuncionesPro(contenido: unknown): boolean {
  if (!contenido || typeof contenido !== 'object') return false;
  const c = contenido as Record<string, unknown>;
  if (Array.isArray(c.cotas) && c.cotas.length > 0) return true;
  if (Array.isArray(c.elements)) {
    return c.elements.some((el: any) => el?.type === 'image' && !el?.isDeleted);
  }
  return false;
}

/**
 * Recorta `notifPrefs` a lo que permite BASIC (Fase 3, 04/09/2026,
 * Estrategia V3): "Recordatorio de horas" es la única notificación de
 * BASIC — cobros pendientes/margen bajo/briefing diario exigen PRO+.
 * Fuerza `activo:false` en vez de rechazar la petición entera, para que una
 * cuenta BASIC siga pudiendo guardar cualquier otro cambio del mismo PUT
 * sin que un campo bloqueado tumbe todo el guardado. `nuevoUsuario`/
 * `mensajeSoporte` no se tocan — son del admin (ver
 * `notificarAdminNuevoUsuario`), nunca se leen de una cuenta que no sea la
 * suya, así que no hace falta gatearlos por plan.
 */
export function limitarNotifPrefsPorPlan(notifPrefs: any): any {
  const forzarInactivo = (v: unknown) => (typeof v === 'object' && v !== null ? { ...v, activo: false } : false);
  return {
    ...notifPrefs,
    cobrosPendientes: forzarInactivo(notifPrefs?.cobrosPendientes),
    margenBajo: forzarInactivo(notifPrefs?.margenBajo),
    briefingDiario: forzarInactivo(notifPrefs?.briefingDiario),
  };
}

export function requirePlan(permitidos: PlanComercial[]) {
  return async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    if (req.usuarioId === 'admin') { next(); return; }
    try {
      const plan = await obtenerPlanUsuario(req.usuarioId!);
      if (!planPermiteAcceso(plan, permitidos)) {
        res.status(403).json({ error: 'plan_insuficiente', mensaje: 'Tu plan actual no incluye esta función.' });
        return;
      }
      next();
    } catch (err) { next(err); }
  };
}
