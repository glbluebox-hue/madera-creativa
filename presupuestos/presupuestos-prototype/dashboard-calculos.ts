import type { ProyectoResumen } from './api.js';

/** Un recordatorio próximo (montaje o medición) para el panel principal. */
export type ProximoRecordatorio = {
  proyecto: ProyectoResumen;
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
 * proyectos. Las cifras económicas (ingresos/gastos/balance) no salen de
 * aquí — ya las resuelve el servidor sobre la colección real de facturas
 * (ver `resumenFacturas` en `use-facturas.ts`); este cálculo solo agrega
 * lo que depende del estado y las fechas de cada proyecto.
 * @param proyectos Lista completa de proyectos (resumen, con fecha de montaje/medición).
 * @returns Métricas agregadas para mostrar en el panel principal.
 */
export function calcularMetricas(proyectos: ProyectoResumen[]): MetricasDashboard {
  const hoy = new Date().toISOString().slice(0, 10);

  const proximos: ProximoRecordatorio[] = [];
  for (const proyecto of proyectos) {
    if (proyecto.fechaMontaje && proyecto.fechaMontaje >= hoy) {
      proximos.push({ proyecto, fecha: proyecto.fechaMontaje, tipo: 'montaje' });
    }
    if (proyecto.fechaMedicion && proyecto.fechaMedicion >= hoy) {
      proximos.push({ proyecto, fecha: proyecto.fechaMedicion, tipo: 'medicion' });
    }
  }
  proximos.sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    presupuestosPendientes: proyectos.filter((p) => p.estado === 'presupuestado').length,
    enCurso: proyectos.filter((p) => p.estado === 'en_curso').length,
    finalizados: proyectos.filter((p) => p.estado === 'finalizado').length,
    proximos: proximos.slice(0, 4),
  };
}
