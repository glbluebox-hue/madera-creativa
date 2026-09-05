import express from 'express';
import { UsuarioModel, conectarUsuarios } from './usuario.model.js';
import type { PlanAcceso, TipoAcceso, AccesoUsuario } from './usuario.model.js';
import type { AuthRequest } from './presupuestos-service.app-root.js';

/** Duración de la prueba gratuita — decisión definitiva (05/09/2026), única constante de este número en todo el proyecto. */
export const DURACION_TRIAL_DIAS = 60;

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

/**
 * Calcula el plan EFECTIVO a partir del `acceso` guardado — nunca se fía
 * de `acceso.plan` a solas (prueba gratuita de 60 días, 05/09/2026):
 * si `expiraEn` está definido y ya ha pasado, el acceso se trata como si
 * no existiera ningún plan comercial (`NONE`), sin importar qué plan
 * dijera guardado. Cubre a la vez dos casos con el mismo campo:
 * - El trial (`tipo:'trial'`, `plan:'PRO'`, `expiraEn` = inicio + 60 días).
 * - Cualquier código promocional con `duracionDias` (`codigo-promocional.model.ts`),
 *   que hasta ahora calculaba y guardaba `expiraEn` pero NUNCA se
 *   comprobaba en ningún sitio — un código "temporal" era, en la
 *   práctica, permanente (hallazgo de la auditoría previa, corregido aquí).
 *
 * Una suscripción de pago real siempre tiene `expiraEn: null`
 * (`canjearCodigo`/futuro webhook de pago), así que nunca la afecta esta
 * comprobación. NUNCA modifica el documento en Mongo — el trial vencido
 * sigue teniendo `plan:'PRO'` guardado (se conserva el historial, tal
 * como se pidió), solo se CALCULA como `NONE` al leer.
 *
 * Punto único de verdad: la usan `obtenerPlanUsuario` (autorización,
 * cacheada) y `obtenerEstadoAccesoUsuario` (display, sin caché) — nunca
 * se duplica esta comprobación en ningún otro sitio del proyecto.
 */
export function calcularPlanEfectivo(acceso: Pick<AccesoUsuario, 'plan' | 'expiraEn'> | null | undefined): PlanAcceso {
  if (!acceso) return 'NONE';
  if (acceso.expiraEn && new Date(acceso.expiraEn).getTime() <= Date.now()) return 'NONE';
  return acceso.plan;
}

/** Plan EFECTIVO actual de una cuenta, con caché corta. `'NONE'` si no se encuentra la cuenta (mismo criterio conservador que `ACCESO_POR_DEFECTO`) o si su acceso temporal ya ha expirado (ver `calcularPlanEfectivo`). */
export async function obtenerPlanUsuario(usuarioId: string): Promise<PlanAcceso> {
  const ahora = Date.now();
  const enCache = cachePlanUsuario.get(usuarioId);
  if (enCache && enCache.expira > ahora) return enCache.plan;
  await conectarUsuarios();
  const u = await UsuarioModel.findOne({ id: usuarioId }).select('acceso').lean().exec() as any;
  const plan: PlanAcceso = calcularPlanEfectivo(u?.acceso);
  cachePlanUsuario.set(usuarioId, { plan, expira: ahora + TTL_CACHE_PLAN_MS });
  return plan;
}

/**
 * Estado de acceso completo de una cuenta, para mostrar en la interfaz
 * (nunca para autorizar — eso sigue siendo `obtenerPlanUsuario`/
 * `requirePlan`): `plan` ya es el EFECTIVO (ver `calcularPlanEfectivo`),
 * `tipoAcceso`/`expiraEn` son los valores crudos guardados, para que el
 * frontend pueda distinguir "PRO de pago" de "PRO por prueba gratuita" y
 * calcular los días restantes — nunca se muestra `NONE` tal cual al
 * usuario (eso lo decide la interfaz, no esta función). Sin caché
 * propia (no es una ruta caliente como `requirePlan`) — una consulta más
 * a Mongo por petición a `/auth/yo`/`/almacenamiento/uso` es aceptable.
 */
export async function obtenerEstadoAccesoUsuario(usuarioId: string): Promise<{ plan: PlanAcceso; tipoAcceso: TipoAcceso; expiraEn: string | null }> {
  await conectarUsuarios();
  const u = await UsuarioModel.findOne({ id: usuarioId }).select('acceso').lean().exec() as any;
  const acceso = u?.acceso;
  return {
    plan: calcularPlanEfectivo(acceso),
    tipoAcceso: acceso?.tipo ?? 'free',
    expiraEn: acceso?.expiraEn ?? null,
  };
}

/**
 * Decide si procede iniciar la prueba gratuita de 60 días al verificar el
 * email de una cuenta — función PURA (nunca toca Mongo, solo decide),
 * para poder probarla directamente sin levantar una base de datos. Se
 * llama desde `/auth/verificar-email` (`presupuestos-service.app-root.ts`)
 * justo después de marcar `emailVerificado:true`.
 *
 * Solo concede el trial si `accesoActual` sigue EXACTAMENTE en el estado
 * por defecto (`ACCESO_POR_DEFECTO`: `plan:'NONE'`, `tipo:'free'`,
 * `origen:'registro'`) — nunca lo hace si el registro ya trajo un código
 * promocional válido (ese `acceso` ya no es el por defecto, política del
 * caso B: el código prevalece, nunca se suman los dos) y nunca lo repite
 * una segunda vez sobre una cuenta que ya tiene un trial en marcha o
 * cualquier otro acceso (`plan` ya no sería `'NONE'`) — es la misma
 * comprobación la que da la idempotencia, no hace falta ningún estado
 * aparte para "ya se hizo esto antes".
 *
 * Devuelve el nuevo `AccesoUsuario` a guardar, o `null` si no procede
 * iniciar ningún trial (el llamador no debe escribir nada en ese caso).
 */
export function iniciarTrialSiCorresponde(accesoActual: AccesoUsuario | null | undefined, ahora: Date = new Date()): AccesoUsuario | null {
  if (!(accesoActual?.plan === 'NONE' && accesoActual?.tipo === 'free' && accesoActual?.origen === 'registro')) return null;
  const activadoEn = ahora.toISOString();
  const expiraEn = new Date(ahora.getTime() + DURACION_TRIAL_DIAS * 24 * 60 * 60 * 1000).toISOString();
  return { tipo: 'trial', plan: 'PRO', activadoEn, expiraEn, origen: 'trial', codigoUsado: null };
}

/**
 * Rutas que una cuenta sin ningún plan comercial activo (trial nunca
 * empezado, trial terminado, o cualquier cuenta en `NONE`) debe poder
 * seguir usando — el mínimo para ver su situación, gestionar su cuenta,
 * y recuperar el acceso (Opción 3 de la auditoría, 05/09/2026). Todo lo
 * demás (cualquier dato de negocio: clientes, proyectos, presupuestos,
 * facturas, dibujos...) queda bloqueado. Comparación exacta contra
 * `req.path` — todas son rutas estáticas, sin parámetros.
 */
export const RUTAS_EXENTAS_BLOQUEO_PLAN: readonly string[] = [
  '/auth/yo', '/auth/logout', '/auth/verificar',
  '/perfil', '/perfil/acceso',
  '/codigos/canjear',
  '/almacenamiento/uso',
];

/**
 * ¿Debe bloquearse esta petición porque la cuenta no tiene NINGÚN plan
 * comercial activo? Llamar solo tras confirmar que `usuarioId !== 'admin'`
 * (el admin nunca pasa por aquí, igual que nunca pasa por `requirePlan`).
 * `NONE` es la única señal que bloquea — cubre a la vez "nunca tuvo
 * ningún plan" y "su trial/código temporal ya expiró" (mismo cálculo,
 * `calcularPlanEfectivo`), sin necesidad de distinguirlos aquí. Nunca
 * bloquea `LIFETIME_FREE`/`BASIC`/`PRO`/`PREMIUM` — conserva el
 * comportamiento ya existente para esos planes.
 */
export async function requiereBloqueoPorSinPlan(usuarioId: string, path: string): Promise<boolean> {
  if (RUTAS_EXENTAS_BLOQUEO_PLAN.includes(path)) return false;
  const plan = await obtenerPlanUsuario(usuarioId);
  return plan === 'NONE';
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

/**
 * ¿Puede este usuario usar una capacidad/función cuyo plan mínimo es
 * `planMinimo`? Vive aquí (no en `ia-rutas.ts`, donde nació en la Fase 2) —
 * movida en la Fase 3.1 (05/09/2026) para que sea el único punto de verdad,
 * reutilizable tanto por rutas de IA (`/ia/generar`,
 * `/ia/herramientas/ejecutar`, donde la capacidad viaja en el cuerpo de la
 * petición y por eso no puede ser un middleware de ruta como `requirePlan`)
 * como por el dispatcher de contexto de `asistente-global` — evita crear un
 * segundo sistema de permisos para lo mismo. `planMinimo` puede venir como
 * `string | undefined` (tal cual llega de `CapacidadIA.planMinimo`) sin que
 * el llamante tenga que hacer el cast. La cuenta `admin` nunca queda
 * bloqueada, mismo criterio que `requirePlan`.
 */
export async function capacidadPermitidaParaPlan(usuarioId: string, planMinimo: string | undefined): Promise<boolean> {
  if (!planMinimo) return true;
  if (usuarioId === 'admin') return true;
  const plan = await obtenerPlanUsuario(usuarioId);
  return planPermiteAcceso(plan, planesDesde(planMinimo as PlanComercial));
}

/**
 * Oculta `modelo3D` de un `ProyectoDoc` cuando la cuenta no tiene PRO+
 * (cierre de plan "Modelo 3D / SketchUp Desktop", 05/09/2026) — decisión
 * definitiva del usuario: "Modelo 3D" es función PRO/PREMIUM completa,
 * incluido VERLO, no solo subirlo. No basta con que las rutas de subida
 * exijan `requirePlan(PRO_O_SUPERIOR)`: si el proyecto ya tenía un modelo
 * de antes de un downgrade PRO→BASIC, cualquier respuesta que devuelva el
 * proyecto entero (`GET /proyectos/:id`, y las rutas quirúrgicas de
 * movimientos/tareas/estado/presupuesto/características/trabajo-extra,
 * que también devuelven el documento completo) seguiría enviándoselo tal
 * cual a una cuenta BASIC sin este filtro. Nunca oculta nada a `admin`
 * (mismo bypass que el resto de este archivo). Vive aquí (no en
 * `presupuestos-service.app-root.ts`) por el mismo motivo que
 * `contenidoDibujoUsaFuncionesPro`/`limitarNotifPrefsPorPlan`: es lógica
 * de "qué significa un plan", no de enrutado.
 */
export async function ocultarModelo3DSiNoPro<T extends Record<string, unknown>>(proyecto: T, usuarioId: string): Promise<T> {
  if (usuarioId === 'admin') return proyecto;
  const plan = await obtenerPlanUsuario(usuarioId);
  if (planPermiteAcceso(plan, PRO_O_SUPERIOR)) return proyecto;
  const { modelo3D: _modelo3D, ...resto } = proyecto as Record<string, unknown>;
  return resto as T;
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
