import type { Cliente } from './types.js';
import { calcularMetricas } from './dashboard-calculos.js';
import { formatoEuro } from './calculos.js';
import styles from './styles.module.css';

/** Props del panel principal (dashboard). */
export type DashboardProps = {
  /** Lista de clientes/proyectos. */
  clientes: Cliente[];
  /** Abre la ficha de un cliente. */
  onAbrir: (id: string) => void;
};

/** Una tarjeta KPI del dashboard. */
function Kpi({
  icono,
  etiqueta,
  valor,
  color,
}: {
  icono: string;
  etiqueta: string;
  valor: string;
  color: string;
}) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiIcono} style={{ background: color }}>
        <span>{icono}</span>
      </div>
      <div className={styles.kpiTexto}>
        <span className={styles.kpiValor}>{valor}</span>
        <span className={styles.kpiEtiqueta}>{etiqueta}</span>
      </div>
    </div>
  );
}

/** Formatea una fecha ISO a formato corto en español. */
function fechaCorta(iso: string): string {
  try {
    const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

/**
 * Panel principal del ERP: indicadores visuales del negocio (proyectos por
 * estado, facturación, gastos, beneficio) y agenda de próximos montajes y
 * mediciones.
 */
export function Dashboard({ clientes, onAbrir }: DashboardProps) {
  const m = calcularMetricas(clientes);

  return (
    <div className={styles.dashboard}>
      <h2 className={styles.h2}>Panel de control</h2>

      {/* Estado de los proyectos */}
      <div className={styles.kpiGrid}>
        <Kpi icono="📝" etiqueta="Presupuestos pendientes" valor={String(m.presupuestosPendientes)} color="var(--azul-bg)" />
        <Kpi icono="🪚" etiqueta="En fabricación" valor={String(m.enFabricacion)} color="var(--ocre-bg)" />
        <Kpi icono="🔧" etiqueta="En montaje" valor={String(m.enMontaje)} color="var(--rojo-bg)" />
        <Kpi icono="✅" etiqueta="Terminados" valor={String(m.finalizados)} color="var(--verde-bg)" />
      </div>

      {/* Económicos */}
      <div className={styles.kpiGrid}>
        <Kpi icono="💶" etiqueta="Facturación del mes" valor={formatoEuro(m.facturacionMes)} color="var(--verde-bg)" />
        <Kpi icono="🧾" etiqueta="Gastos del mes" valor={formatoEuro(m.gastosMes)} color="var(--rojo-bg)" />
        <Kpi icono="📈" etiqueta="Beneficio del mes" valor={formatoEuro(m.beneficioMes)} color="var(--azul-bg)" />
        <Kpi icono="🏆" etiqueta="Beneficio del año" valor={formatoEuro(m.beneficioAnio)} color="var(--morado-bg)" />
      </div>

      {/* Agenda */}
      <div className={styles.agendaGrid}>
        <div className={styles.agendaPanel}>
          <h3 className={styles.agendaTitulo}>🔧 Próximos montajes</h3>
          {m.proximosMontajes.length === 0 ? (
            <p className={styles.agendaVacio}>No hay montajes programados.</p>
          ) : (
            m.proximosMontajes.map(({ cliente, fecha }) => (
              <div key={cliente.id} className={styles.agendaItem} onClick={() => onAbrir(cliente.id)}>
                <span className={styles.agendaFecha}>{fechaCorta(fecha)}</span>
                <div className={styles.agendaInfo}>
                  <span className={styles.agendaNombre}>{cliente.nombre}</span>
                  <span className={styles.agendaProyecto}>{cliente.proyecto || 'Sin proyecto'}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.agendaPanel}>
          <h3 className={styles.agendaTitulo}>📐 Próximas mediciones</h3>
          {m.proximasMediciones.length === 0 ? (
            <p className={styles.agendaVacio}>No hay mediciones programadas.</p>
          ) : (
            m.proximasMediciones.map(({ cliente, fecha }) => (
              <div key={cliente.id} className={styles.agendaItem} onClick={() => onAbrir(cliente.id)}>
                <span className={styles.agendaFecha}>{fechaCorta(fecha)}</span>
                <div className={styles.agendaInfo}>
                  <span className={styles.agendaNombre}>{cliente.nombre}</span>
                  <span className={styles.agendaProyecto}>{cliente.proyecto || 'Sin proyecto'}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
