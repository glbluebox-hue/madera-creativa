import type { Proyecto } from './types.js';

/** Resumen económico calculado de un proyecto. */
export type ResumenCliente = {
  /** Suma de todos los ingresos. */
  totalIngresos: number;
  /** Suma de todos los gastos de materiales/movimientos. */
  totalGastos: number;
  /** Total de horas trabajadas (propias). */
  totalHoras: number;
  /** Coste de mano de obra propia (horas * tarifa del proyecto). */
  costeManoObra: number;
  /** Total de horas trabajadas por ayudantes (03/09/2026) — aparte de las propias. */
  totalHorasAyudante: number;
  /** Coste de las horas de ayudante — cada registro lleva su propia tarifa, así que es la suma de horas*tarifa de cada uno, no una tarifa única. */
  costeAyudante: number;
  /** Coste total = gastos + mano de obra propia + ayudante. */
  costeTotal: number;
  /** Margen de ganancia = ingresos - coste total. */
  margen: number;
  /** Porcentaje de margen sobre ingresos. */
  margenPorcentaje: number;
};

/**
 * Calcula el resumen económico de un proyecto a partir de sus
 * movimientos y horas registradas (propias y de ayudante).
 * @param proyecto El proyecto/expediente.
 * @returns El resumen económico con totales y margen.
 */
export function calcularResumen(proyecto: Proyecto): ResumenCliente {
  const totalIngresos = proyecto.movimientos
    .filter((m) => m.tipo === 'ingreso')
    .reduce((s, m) => s + m.importe, 0);

  const totalGastos = proyecto.movimientos
    .filter((m) => m.tipo === 'gasto')
    .reduce((s, m) => s + m.importe, 0);

  const totalHoras = proyecto.horas.reduce((s, h) => s + h.horas, 0);
  const costeManoObra = totalHoras * proyecto.tarifaHora;

  // Las horas de ayudante llevan su propia tarifa en cada registro (puede
  // variar entre ayudantes o entre días) — no hay una tarifa única del
  // proyecto que multiplicar, hay que sumar horas*tarifa registro a registro.
  // `?? []`: campo opcional (ver comentario en `Proyecto.horasAyudante`,
  // types.ts) — los proyectos guardados antes de este incremento no lo
  // tienen todavía.
  const horasAyudante = proyecto.horasAyudante ?? [];
  const totalHorasAyudante = horasAyudante.reduce((s, h) => s + h.horas, 0);
  const costeAyudante = horasAyudante.reduce((s, h) => s + h.horas * h.tarifaHora, 0);

  const costeTotal = totalGastos + costeManoObra + costeAyudante;
  const margen = totalIngresos - costeTotal;
  const margenPorcentaje = totalIngresos > 0 ? (margen / totalIngresos) * 100 : 0;

  return {
    totalIngresos,
    totalGastos,
    totalHoras,
    costeManoObra,
    totalHorasAyudante,
    costeAyudante,
    costeTotal,
    margen,
    margenPorcentaje,
  };
}

/** Marcador del modo privacidad — sustituye cualquier cifra cuando está activo (ver `use-privacidad.ts`). */
export const VALOR_OCULTO = '••••••';

/**
 * Igual que `formatoEuro`, pero sustituye el resultado por `VALOR_OCULTO`
 * cuando el modo privacidad está activo — para no repetir el mismo
 * `privado ? VALOR_OCULTO : formatoEuro(x)` en cada sitio que muestra una
 * cifra (Inicio, Facturas, Proveedores, ficha de cliente).
 */
export function formatoEuroPrivado(valor: number, privado: boolean): string {
  return privado ? VALOR_OCULTO : formatoEuro(valor);
}

/**
 * Formatea un número como moneda en euros.
 * @param valor El importe a formatear.
 * @returns Una cadena con el importe formateado (p. ej. "1.250,00 €").
 */
export function formatoEuro(valor: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(valor);
}

/**
 * Formatea una fecha ISO (yyyy-mm-dd o ISO 8601) como dd/mm/año.
 * @param fecha String de fecha o Date.
 * @returns Una cadena con el formato día/mes/año (p. ej. "28/06/2026").
 */
export function formatoFecha(fecha: string | Date): string {
  if (!fecha) return '';
  // Si ya viene en formato dd/mm/yyyy devolverla tal cual
  if (typeof fecha === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) return fecha;
  const d = typeof fecha === 'string' ? new Date(fecha + (fecha.length === 10 ? 'T12:00:00' : '')) : fecha;
  if (isNaN(d.getTime())) return String(fecha);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Formatea un tamaño en bytes a una cadena legible.
 * @param bytes El tamaño en bytes.
 * @returns Una cadena como "1,2 MB".
 */
export function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
