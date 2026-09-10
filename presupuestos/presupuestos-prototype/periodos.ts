/**
 * Períodos económicos del dashboard (Fase 1 — "Períodos + Resultado").
 *
 * Un único sitio donde se traduce "Este mes" / "Este trimestre" / … a un
 * rango de fechas `[desde, hasta]` en ISO `AAAA-MM-DD`, que es lo que
 * consume el backend (`GET /facturas/resumen-economico`).
 *
 * Todo el cálculo se hace con los componentes LOCALES de la fecha
 * (`getFullYear`, `getMonth`, `getDate`) y se construye la cadena a mano.
 * Nunca se usa `Date.toISOString()` (da UTC) ni `new Date('2026-01-01')`
 * (ISO sin hora se parsea como UTC) — así una fecha límite como
 * `2026-01-01` no puede "resbalar" a diciembre del año anterior en husos
 * negativos (bug de zona horaria señalado en la auditoría, sección C).
 */

/** Claves de período soportadas en la Fase 1. */
export type ClavePeriodo =
  | 'este-mes'
  | 'mes-anterior'
  | 'este-trimestre'
  | 'trimestre-anterior'
  | 'este-anio';
// Reservado para fases posteriores (la arquitectura ya lo admite):
//   | 'anio-anterior'
//   | 'personalizado'   (con { desde, hasta } elegidos a mano)

/** Opciones del selector, en el orden en que se muestran. */
export const PERIODOS: { clave: ClavePeriodo; etiqueta: string }[] = [
  { clave: 'este-mes', etiqueta: 'Este mes' },
  { clave: 'mes-anterior', etiqueta: 'Mes anterior' },
  { clave: 'este-trimestre', etiqueta: 'Este trimestre' },
  { clave: 'trimestre-anterior', etiqueta: 'Trimestre anterior' },
  { clave: 'este-anio', etiqueta: 'Este año' },
];

export const CLAVE_PERIODO_DEFECTO: ClavePeriodo = 'este-mes';

/** Rango resuelto de un período. */
export type RangoPeriodo = {
  /** Primer día del período, ISO `AAAA-MM-DD` (inclusive). */
  desde: string;
  /** Último día del período, ISO `AAAA-MM-DD` (inclusive). */
  hasta: string;
  /** Etiqueta legible ("Este mes", …). */
  etiqueta: string;
  clave: ClavePeriodo;
};

/** ISO `AAAA-MM-DD` a partir de componentes locales (mes en 1-12). */
function iso(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Último día (1-31) del mes indicado. `new Date(anio, mes, 0)` = "día 0 del
 * mes siguiente" = último día de este mes, y el constructor con números es
 * hora LOCAL, así que es seguro frente a zona horaria.
 * @param mes Mes en 1-12.
 */
function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

/**
 * Traduce una clave de período a su rango `[desde, hasta]`.
 * @param clave Período a resolver.
 * @param hoy Fecha de referencia (por defecto, ahora) — parámetro para poder testear.
 */
export function rangoPeriodo(clave: ClavePeriodo, hoy: Date = new Date()): RangoPeriodo {
  const anio = hoy.getFullYear();
  const mes0 = hoy.getMonth(); // 0-11
  const etiqueta = PERIODOS.find((p) => p.clave === clave)?.etiqueta ?? '';
  const construir = (desde: string, hasta: string): RangoPeriodo => ({ desde, hasta, etiqueta, clave });

  switch (clave) {
    case 'este-mes': {
      const mes = mes0 + 1;
      return construir(iso(anio, mes, 1), iso(anio, mes, ultimoDiaDelMes(anio, mes)));
    }
    case 'mes-anterior': {
      // `new Date(anio, mes0 - 1, 1)` normaliza el cambio de año (enero → diciembre anterior) en hora local.
      const d = new Date(anio, mes0 - 1, 1);
      const y = d.getFullYear();
      const mes = d.getMonth() + 1;
      return construir(iso(y, mes, 1), iso(y, mes, ultimoDiaDelMes(y, mes)));
    }
    case 'este-trimestre': {
      const trimestre = Math.floor(mes0 / 3); // 0-3
      const mesInicio = trimestre * 3 + 1; // 1,4,7,10
      const mesFin = mesInicio + 2;
      return construir(iso(anio, mesInicio, 1), iso(anio, mesFin, ultimoDiaDelMes(anio, mesFin)));
    }
    case 'trimestre-anterior': {
      const trimestre = Math.floor(mes0 / 3);
      let y = anio;
      let mesInicio = trimestre * 3 + 1 - 3; // el trimestre anterior
      if (mesInicio <= 0) {
        y -= 1;
        mesInicio += 12;
      }
      const mesFin = mesInicio + 2;
      return construir(iso(y, mesInicio, 1), iso(y, mesFin, ultimoDiaDelMes(y, mesFin)));
    }
    case 'este-anio':
      return construir(iso(anio, 1, 1), iso(anio, 12, 31));
  }
}
