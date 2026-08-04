import type { Cliente } from './types.js';
import { calcularResumen } from './calculos.js';

/** Indicadores agregados para el dashboard principal. */
export type MetricasDashboard = {
  /** Nº de proyectos en estado presupuestado. */
  presupuestosPendientes: number;
  /** Nº de proyectos en fabricación. */
  enFabricacion: number;
  /** Nº de proyectos en montaje. */
  enMontaje: number;
  /** Nº de proyectos finalizados. */
  finalizados: number;
  /** Nº total de proyectos. */
  totalProyectos: number;
  /** Facturación (ingresos) del mes actual. */
  facturacionMes: number;
  /** Gastos del mes actual. */
  gastosMes: number;
  /** Beneficio del mes actual (ingresos - gastos del mes). */
  beneficioMes: number;
  /** Beneficio del año actual. */
  beneficioAnio: number;
  /** Facturación total acumulada. */
  facturacionTotal: number;
  /** Próximos montajes (cliente + fecha), ordenados por fecha. */
  proximosMontajes: { cliente: Cliente; fecha: string }[];
  /** Próximas mediciones (cliente + fecha), ordenadas por fecha. */
  proximasMediciones: { cliente: Cliente; fecha: string }[];
};

/** Devuelve YYYY-MM del mes actual. */
function claveMesActual(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Devuelve YYYY del año actual. */
function claveAnioActual(): string {
  return new Date().toISOString().slice(0, 4);
}

/**
 * Calcula todos los indicadores del dashboard a partir de la lista de clientes.
 * @param clientes Lista completa de clientes/proyectos.
 * @returns Métricas agregadas para mostrar en el panel principal.
 */
export function calcularMetricas(clientes: Cliente[]): MetricasDashboard {
  const mes = claveMesActual();
  const anio = claveAnioActual();

  let facturacionMes = 0;
  let gastosMes = 0;
  let beneficioAnio = 0;
  let facturacionTotal = 0;

  for (const c of clientes) {
    for (const m of c.movimientos) {
      const mesMov = (m.fecha || '').slice(0, 7);
      const anioMov = (m.fecha || '').slice(0, 4);
      if (m.tipo === 'ingreso') {
        facturacionTotal += m.importe;
        if (mesMov === mes) facturacionMes += m.importe;
        if (anioMov === anio) beneficioAnio += m.importe;
      } else {
        if (mesMov === mes) gastosMes += m.importe;
        if (anioMov === anio) beneficioAnio -= m.importe;
      }
    }
    // Restamos mano de obra del año al beneficio anual
    const r = calcularResumen(c);
    if ((c.creado || '').slice(0, 4) === anio) {
      beneficioAnio -= r.costeManoObra;
    }
  }

  const hoy = new Date().toISOString().slice(0, 10);

  const proximosMontajes: { cliente: Cliente; fecha: string }[] = [];
  const proximasMediciones: { cliente: Cliente; fecha: string }[] = [];

  return {
    presupuestosPendientes: clientes.filter((c) => c.estado === 'presupuestado').length,
    enFabricacion: clientes.filter((c) => c.estado === 'en_curso').length,
    enMontaje: 0,
    finalizados: clientes.filter((c) => c.estado === 'finalizado').length,
    totalProyectos: clientes.length,
    facturacionMes,
    gastosMes,
    beneficioMes: facturacionMes - gastosMes,
    beneficioAnio,
    facturacionTotal,
    proximosMontajes,
    proximasMediciones,
  };
}
