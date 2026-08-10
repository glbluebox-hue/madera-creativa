import { useState, type ReactNode } from 'react';
import type { Cliente, Factura } from './types.js';
import type { ResumenFacturas } from './use-facturas.js';
import { calcularMetricas } from './dashboard-calculos.js';
import { formatoEuro, formatoFecha } from './calculos.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import styles from './styles.module.css';

/** Props del panel principal (dashboard). */
export type DashboardProps = {
  /** Nombre para el saludo. */
  nombre: string;
  /** Lista de clientes/proyectos (ya cargados). */
  clientes: Cliente[];
  /** Facturas más recientes primero (ya vienen así del servidor). */
  facturas: Factura[];
  /** Totales ya resueltos por el servidor sobre toda la colección de facturas. */
  resumen: ResumenFacturas;
  /** Abre la ficha de un cliente. */
  onAbrir: (id: string) => void;
  /** Borra una factura (Actividad reciente). */
  onBorrarFactura: (id: string) => void;
  /** Guarda un cliente actualizado (Próximos montajes y mediciones). */
  onActualizarCliente: (cliente: Cliente) => void;
};

const ICONOS: Record<string, ReactNode> = {
  ingreso: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>,
  gasto: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>,
  balance: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>,
  presupuestos: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
  montaje: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><rect x="2" y="7" width="20" height="14" rx="2" /></svg>,
  medicion: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /></svg>,
};

/** Una tarjeta KPI del panel principal. */
function Kpi({
  icono, color, etiqueta, valor, sub,
}: { icono: keyof typeof ICONOS; color: 'verde' | 'rojo' | 'topo'; etiqueta: string; valor: string; sub: string }) {
  return (
    <div className={styles.kpiTarjeta}>
      <div className={styles.kpiCabecera}>
        <div className={`${styles.kpiIconoChip} ${styles['kpiIconoChip' + color[0].toUpperCase() + color.slice(1)]}`}>{ICONOS[icono]}</div>
        <span className={styles.kpiLabel}>{etiqueta}</span>
      </div>
      <span className={styles.kpiValor}>{valor}</span>
      <span className={styles.kpiSub}>{sub}</span>
    </div>
  );
}

/**
 * Panel principal: resumen visual del negocio (ingresos, gastos, balance,
 * presupuestos en curso), actividad reciente sobre facturas reales (con
 * borrado directo), y próximos montajes/mediciones a partir de las fechas
 * reales de cada cliente (con alta y borrado directo). Sin datos
 * inventados: lo que no hay todavía se muestra vacío, no relleno con
 * ejemplos (Dirección Creativa).
 */
export function Dashboard({ nombre, clientes, facturas, resumen, onAbrir, onBorrarFactura, onActualizarCliente }: DashboardProps) {
  const m = calcularMetricas(clientes);
  const actividad = facturas.slice(0, 4);
  const primerNombre = (nombre || '').split(' ')[0];

  const [agregando, setAgregando] = useState(false);
  const [nuevoClienteId, setNuevoClienteId] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState<'montaje' | 'medicion'>('montaje');
  const [nuevaFecha, setNuevaFecha] = useState('');

  const guardarRecordatorio = () => {
    const cliente = clientes.find((c) => c.id === nuevoClienteId);
    if (!cliente || !nuevaFecha) return;
    onActualizarCliente({
      ...cliente,
      ...(nuevoTipo === 'montaje' ? { fechaMontaje: nuevaFecha } : { fechaMedicion: nuevaFecha }),
    });
    setAgregando(false);
    setNuevoClienteId('');
    setNuevaFecha('');
  };

  const borrarRecordatorio = (cliente: Cliente, tipo: 'montaje' | 'medicion') => {
    onActualizarCliente({
      ...cliente,
      ...(tipo === 'montaje' ? { fechaMontaje: '' } : { fechaMedicion: '' }),
    });
  };

  return (
    <div className={styles.dashboard}>
      <div className={styles.dashboardTop}>
        <h2 className={styles.h2}>¡Buenas {horaDelDia()}, {primerNombre}!</h2>
        <p className={styles.dashboardSub}>Aquí tienes un resumen de tu actividad</p>
      </div>

      <div className={styles.kpiGrid}>
        <Kpi icono="ingreso" color="verde" etiqueta="Ingresos" valor={formatoEuro(resumen.totalIngresos)} sub={`${resumen.numIngresos} facturas`} />
        <Kpi icono="gasto" color="rojo" etiqueta="Gastos" valor={formatoEuro(resumen.totalGastos)} sub={`${resumen.numGastos} facturas`} />
        <Kpi icono="balance" color={resumen.balance >= 0 ? 'verde' : 'rojo'} etiqueta="Balance" valor={formatoEuro(resumen.balance)} sub={`${resumen.numFacturas} facturas`} />
        <Kpi icono="presupuestos" color="topo" etiqueta="Presupuestos" valor={String(m.presupuestosPendientes + m.enCurso)} sub={m.enCurso > 0 ? `${m.enCurso} en curso` : `${m.presupuestosPendientes} pendientes`} />
      </div>

      <div className={styles.dashboardCols}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitulo}>Actividad reciente</h3>
          </div>
          {actividad.length === 0 ? (
            <p className={styles.dashboardVacio}>Todavía no hay facturas registradas.</p>
          ) : (
            actividad.map((f) => (
              <div key={f.id} className={styles.actividadItem}>
                <div className={`${styles.kpiIconoChip} ${f.tipo === 'ingreso' ? styles.kpiIconoChipVerde : styles.kpiIconoChipRojo}`} style={{ width: 34, height: 34 }}>
                  {ICONOS[f.tipo]}
                </div>
                <div className={styles.actividadCuerpo}>
                  <span className={styles.actividadTitulo}>{f.concepto}</span>
                  <span className={styles.actividadSub}>{f.proveedor}</span>
                </div>
                <div className={styles.actividadDerecha} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span className={styles.actividadFecha}>{formatoFecha(f.fecha)}</span>
                    <span className={f.tipo === 'ingreso' ? styles.valorVerde : styles.valorRojo}>
                      {f.tipo === 'gasto' ? '-' : ''}{formatoEuro(f.importe)}
                    </span>
                  </div>
                  <ConfirmarBorrado titulo="Borrar factura" onConfirmar={() => onBorrarFactura(f.id)} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitulo}>Próximos montajes y mediciones</h3>
            <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.72rem', padding: '0.35rem 0.65rem' }} onClick={() => setAgregando((v) => !v)}>
              {agregando ? 'Cancelar' : '+ Añadir'}
            </button>
          </div>

          {agregando && (
            <div className={styles.formInline} style={{ marginTop: 0, marginBottom: '1rem' }}>
              <div className={styles.campo}>
                <label className={styles.campoLabel}>Cliente</label>
                <select className={styles.select} value={nuevoClienteId} onChange={(e) => setNuevoClienteId(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className={styles.campo}>
                <label className={styles.campoLabel}>Tipo</label>
                <select className={styles.select} value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value as 'montaje' | 'medicion')}>
                  <option value="montaje">Montaje</option>
                  <option value="medicion">Medición</option>
                </select>
              </div>
              <div className={styles.campo}>
                <label className={styles.campoLabel}>Fecha</label>
                <input className={styles.input} type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} />
              </div>
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardarRecordatorio} disabled={!nuevoClienteId || !nuevaFecha}>
                Guardar
              </button>
            </div>
          )}

          {m.proximos.length === 0 ? (
            <p className={styles.dashboardVacio}>No hay montajes ni mediciones programadas.</p>
          ) : (
            m.proximos.map((p, i) => (
              <div key={i} className={styles.actividadItem}>
                <div className={styles.kpiIconoChip} style={{ width: 34, height: 34, cursor: 'pointer' }} onClick={() => onAbrir(p.cliente.id)}>{ICONOS[p.tipo]}</div>
                <div className={styles.actividadCuerpo} style={{ cursor: 'pointer' }} onClick={() => onAbrir(p.cliente.id)}>
                  <span className={styles.actividadTitulo}>{p.cliente.nombre}</span>
                  <span className={styles.actividadSub}>{p.tipo === 'montaje' ? 'Montaje' : 'Medición'} — {p.cliente.proyecto || 'Sin proyecto'}</span>
                </div>
                <div className={styles.actividadDerecha} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                  <span className={styles.actividadFecha}>{formatoFecha(p.fecha)}</span>
                  <ConfirmarBorrado titulo="Quitar recordatorio" onConfirmar={() => borrarRecordatorio(p.cliente, p.tipo)} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** Saludo según la hora del día. */
function horaDelDia(): string {
  const h = new Date().getHours();
  if (h < 12) return 'días';
  if (h < 20) return 'tardes';
  return 'noches';
}
