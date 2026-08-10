import type { Cliente } from './types.js';

/** Un recordatorio próximo (montaje o medición) para el panel principal. */
export type ProximoRecordatorio = {
  cliente: Cliente;
  fecha: string;
  tipo: 'montaje' | 'medicion';
};

/** Indicadores agregados para el panel principal (Dirección Creativa). */
export type MetricasDashboard = {
  /** Nº de proyectos en estado presupuestado. */
  presupuestosPendientes: number;
  /** Nº de proyectos en curso. */
  enCurso: number;
  /** Nº de proyectos finalizados. */
  finalizados: number;
  /** Próximos montajes y mediciones (a partir de hoy), ordenados por fecha. */
  proximos: ProximoRecordatorio[];
};

/**
 * Calcula los indicadores del panel principal a partir de la lista de
 * clientes. Las cifras económicas (ingresos/gastos/balance) no salen de
 * aquí — ya las resuelve el servidor sobre la colección real de facturas
 * (ver `resumenFacturas` en `use-facturas.ts`); este cálculo solo agrega
 * lo que depende del estado y las fechas de cada proyecto.
 * @param clientes Lista completa de clientes/proyectos.
 * @returns Métricas agregadas para mostrar en el panel principal.
 */
export function calcularMetricas(clientes: Cliente[]): MetricasDashboard {
  const hoy = new Date().toISOString().slice(0, 10);

  const proximos: ProximoRecordatorio[] = [];
  for (const cliente of clientes) {
    if (cliente.fechaMontaje && cliente.fechaMontaje >= hoy) {
      proximos.push({ cliente, fecha: cliente.fechaMontaje, tipo: 'montaje' });
    }
    if (cliente.fechaMedicion && cliente.fechaMedicion >= hoy) {
      proximos.push({ cliente, fecha: cliente.fechaMedicion, tipo: 'medicion' });
    }
  }
  proximos.sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    presupuestosPendientes: clientes.filter((c) => c.estado === 'presupuestado').length,
    enCurso: clientes.filter((c) => c.estado === 'en_curso').length,
    finalizados: clientes.filter((c) => c.estado === 'finalizado').length,
    proximos: proximos.slice(0, 4),
  };
}
