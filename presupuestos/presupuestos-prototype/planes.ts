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
 * en el backend (`requirePlan`/`capacidadPermitidaParaPlan`); esto nunca
 * debe tratarse como el punto de seguridad.
 *
 * `esAdmin` (bypass administrativo, 05/09/2026) — mismo criterio exacto
 * que el backend (`req.usuarioId === 'admin'` en `requirePlan`/
 * `capacidadPermitidaParaPlan`, `presupuestos-service/planes.ts`): la
 * cuenta admin nunca queda bloqueada por ningún plan, sin necesidad de que
 * su `Usuario.acceso.plan` almacenado sea ni parezca PREMIUM. `sesion.esAdmin`
 * ya existe (viene de `Usuario.esAdmin` en el backend, la única fuente de
 * verdad — ver `use-auth.ts`) y ya se usa para el resto de la interfaz de
 * administrador; esto solo reutiliza la misma señal para gatear planes,
 * nunca una segunda definición de "admin".
 */
export function puedeUsar(planActual: PlanAcceso | undefined, permitidos: PlanComercial[], esAdmin?: boolean): boolean {
  if (esAdmin) return true;
  if (!planActual) return false;
  return (permitidos as string[]).includes(planActual);
}

/* ===== CATÁLOGO COMERCIAL (05/09/2026, experiencia de registro/trial/planes) =====
 *
 * Punto único de verdad de nombres/precios/periodos/características/límites
 * para TODA la interfaz comercial (página de planes, pantalla de trial
 * terminado, cualquier sitio futuro que necesite mostrar un plan) — nunca
 * se repiten estos números en otro archivo. Encargo explícito: "si ya
 * existe planes.ts, reutilízalo y amplíalo en lugar de duplicar datos".
 *
 * Los precios y el 25/100 GB de almacenamiento son datos SOLO DE
 * PRESENTACIÓN — la autorización real (backend) y el límite real de
 * almacenamiento (backend, `almacenamiento-cuota.ts`) no leen nada de
 * aquí; si algún día divergen, hay que corregir ambos sitios a mano (no
 * hay forma de compartir un archivo entre frontend y backend en este
 * monorepo — mismo criterio ya documentado arriba para `PLANES_COMERCIALES`).
 */

/** Descuento del pago anual frente al mensual — decisión definitiva, siempre 10 %, nunca otro número. */
export const DESCUENTO_ANUAL_PORCENTAJE = 10;

/** Ficha comercial completa de un plan — usada por `TarjetaPlan`/`PaginaPlanes`. */
export type InfoPlanComercial = {
  plan: PlanComercial;
  /** Nombre para mostrar — mismo valor que `plan`, pero con mayúscula solo inicial (Basic, Pro, Premium), nunca todo mayúsculas en el texto corrido. */
  nombre: string;
  /** Frase de posicionamiento — estrategia de venta ya decidida, no sustituir sin instrucción explícita. */
  lema: string;
  precioMensual: number;
  /** Precio anual ya con el 10 % de descuento aplicado — cifra oficial de lanzamiento, no derivada por cálculo para evitar cualquier redondeo de coma flotante en lo que se muestra. */
  precioAnual: number;
  almacenamientoGB: number;
  /**
   * Funciones PROPIAS de este plan — nunca repite las del plan inferior
   * (`TarjetaPlan` antepone "Todo Basic/Pro, además:" antes de esta lista
   * para PRO/PREMIUM). No inventar funciones que no existan en el código
   * real — cada una debe corresponder a un gate/capacidad ya implementado.
   */
  caracteristicasPropias: string[];
};

export const CATALOGO_PLANES: readonly InfoPlanComercial[] = [
  {
    plan: 'BASIC', nombre: 'Basic', lema: 'Yo gestiono.',
    precioMensual: 19, precioAnual: 205.20, almacenamientoGB: 5,
    caracteristicasPropias: [
      'Gestión de clientes y proyectos',
      'Presupuestos y facturas',
      'Tablero de mediciones y dibujo',
    ],
  },
  {
    plan: 'PRO', nombre: 'Pro', lema: 'La aplicación me ayuda a trabajar.',
    precioMensual: 39, precioAnual: 421.20, almacenamientoGB: 25,
    caracteristicasPropias: [
      'Portal para clientes',
      'Aceptación y firma digital',
      'Fotografías y cotas de medición',
      'Modelo 3D y enlace con SketchUp Desktop',
      'Escáner de facturas con IA',
      'Análisis de rentabilidad propia',
    ],
  },
  {
    plan: 'PREMIUM', nombre: 'Premium', lema: 'La aplicación me ayuda a decidir.',
    precioMensual: 59, precioAnual: 637.20, almacenamientoGB: 100,
    caracteristicasPropias: [
      'Copiloto visual para presupuestos',
      'Investigación de mercado con IA',
      'Comparables inteligentes',
    ],
  },
] as const;

/** Cuánto se ahorra al año pagando anual en vez de mensual — para mostrar "Ahorras X €/año" sin que el usuario tenga que hacer la cuenta. */
export function calcularAhorroAnual(info: InfoPlanComercial): number {
  return Math.round((info.precioMensual * 12 - info.precioAnual) * 100) / 100;
}

/** `19 €`/`205,20 €` — coma decimal (convención española del proyecto), sin decimales si es un número redondo. */
export function formatoPrecio(valor: number): string {
  const texto = Number.isInteger(valor) ? valor.toFixed(0) : valor.toFixed(2);
  return `${texto.replace('.', ',')} €`;
}
