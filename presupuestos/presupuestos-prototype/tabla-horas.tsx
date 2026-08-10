import { useState } from 'react';
import type { RegistroHoras } from './types.js';
import { generarId } from './mock.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import styles from './styles.module.css';

/** Props de la tabla de horas trabajadas. */
export type TablaHorasProps = {
  /** Registros de horas. */
  horas: RegistroHoras[];
  /** Tarifa por hora para mostrar el coste. */
  tarifaHora: number;
  /** Se llama al añadir un nuevo registro de horas. */
  onAnadir: (h: RegistroHoras) => void;
  /** Se llama al borrar un registro por id. */
  onBorrar: (id: string) => void;
};

/**
 * Tabla de horas trabajadas en el proyecto, con formulario inline.
 */
export function TablaHoras({ horas, tarifaHora, onAnadir, onBorrar }: TablaHorasProps) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [tarea, setTarea] = useState('');
  const [cantidad, setCantidad] = useState('');

  const anadir = () => {
    if (!tarea.trim() || !cantidad) return;
    onAnadir({
      id: generarId(),
      fecha,
      tarea: tarea.trim(),
      horas: Number(cantidad) || 0,
    });
    setTarea('');
    setCantidad('');
  };

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitulo} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          Horas trabajadas
        </h3>
        <button
          className={`${styles.btn} ${styles.btnSecundario}`}
          onClick={() => setMostrarForm((v) => !v)}
        >
          {mostrarForm ? 'Cerrar' : '+ Añadir horas'}
        </button>
      </div>

      <div className={styles.tablaWrap}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tarea</th>
              <th style={{ textAlign: 'right' }}>Horas</th>
              <th style={{ textAlign: 'right' }}>Coste</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {horas.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.tablaVacia}>
                  Todavía no hay horas registradas.
                </td>
              </tr>
            ) : (
              horas.map((h) => (
                <tr key={h.id}>
                  <td>{h.fecha}</td>
                  <td>{h.tarea}</td>
                  <td style={{ textAlign: 'right' }}>{h.horas} h</td>
                  <td style={{ textAlign: 'right' }} className={styles.importeGasto}>
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(h.horas * tarifaHora)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <ConfirmarBorrado onConfirmar={() => onBorrar(h.id)} titulo="Borrar registro de horas" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {mostrarForm && (
        <div className={styles.formInline}>
          <div className={styles.campo}>
            <label className={styles.campoLabel}>Fecha</label>
            <input className={styles.input} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className={`${styles.campo} ${styles.crece}`}>
            <label className={styles.campoLabel}>Tarea</label>
            <input className={styles.input} value={tarea} onChange={(e) => setTarea(e.target.value)} placeholder="Descripción de la tarea" />
          </div>
          <div className={styles.campo}>
            <label className={styles.campoLabel}>Horas</label>
            <input className={styles.input} type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0" style={{ width: '90px' }} />
          </div>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={anadir}>Añadir</button>
        </div>
      )}
    </div>
  );
}
