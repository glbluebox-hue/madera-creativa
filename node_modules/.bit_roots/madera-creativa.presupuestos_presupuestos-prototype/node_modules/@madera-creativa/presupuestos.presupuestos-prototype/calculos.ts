import type { Cliente } from './types.js';

/** Resumen económico calculado de un cliente. */
export type ResumenCliente = {
  /** Suma de todos los ingresos. */
  totalIngresos: number;
  /** Suma de todos los gastos de materiales/movimientos. */
  totalGastos: number;
  /** Total de horas trabajadas. */
  totalHoras: number;
  /** Coste de mano de obra (horas * tarifa). */
  costeManoObra: number;
  /** Coste total = gastos + mano de obra. */
  costeTotal: number;
  /** Margen de ganancia = ingresos - coste total. */
  margen: number;
  /** Porcentaje de margen sobre ingresos. */
  margenPorcentaje: number;
};

/**
 * Calcula el resumen económico de un cliente a partir de sus
 * movimientos y horas registradas.
 * @param cliente La ficha del cliente.
 * @returns El resumen económico con totales y margen.
 */
export function calcularResumen(cliente: Cliente): ResumenCliente {
  const totalIngresos = cliente.movimientos
    .filter((m) => m.tipo === 'ingreso')
    .reduce((s, m) => s + m.importe, 0);

  const totalGastos = cliente.movimientos
    .filter((m) => m.tipo === 'gasto')
    .reduce((s, m) => s + m.importe, 0);

  const totalHoras = cliente.horas.reduce((s, h) => s + h.horas, 0);
  const costeManoObra = totalHoras * cliente.tarifaHora;
  const costeTotal = totalGastos + costeManoObra;
  const margen = totalIngresos - costeTotal;
  const margenPorcentaje = totalIngresos > 0 ? (margen / totalIngresos) * 100 : 0;

  return {
    totalIngresos,
    totalGastos,
    totalHoras,
    costeManoObra,
    costeTotal,
    margen,
    margenPorcentaje,
  };
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
