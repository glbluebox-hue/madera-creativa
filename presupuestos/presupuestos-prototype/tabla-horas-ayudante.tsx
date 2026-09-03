import { useState } from 'react';
import type { RegistroHorasAyudante } from './types.js';
import { generarId } from './mock.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import styles from './styles.module.css';

/** Props de la tabla de horas trabajadas por un ayudante. */
export type TablaHorasAyudanteProps = {
  /** Registros de horas de ayudante. */
  horasAyudante: RegistroHorasAyudante[];
  /** Se llama al añadir un nuevo registro. */
  onAnadir: (h: RegistroHorasAyudante) => void;
  /** Se llama al borrar un registro por id. */
  onBorrar: (id: string) => void;
};

/**
 * Tabla de horas trabajadas por un AYUDANTE, aparte de `TablaHoras` (las
 * horas propias) — petición explícita del usuario, 03/09/2026: separadas
 * en su propio apartado para poder ver de un vistazo cuántas horas ha
 * hecho cada uno, sin mezclarlas. A diferencia de las horas propias (una
 * tarifa fija por proyecto), aquí la tarifa por hora se indica en cada
 * registro — puede variar entre ayudantes o entre días.
 */
export function TablaHorasAyudante({ horasAyudante, onAnadir, onBorrar }: TablaHorasAyudanteProps) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [ayudante, setAyudante] = useState('');
  const [tarea, setTarea] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [tarifa, setTarifa] = useState('');

  const anadir = () => {
    if (!ayudante.trim() || !tarea.trim() || !cantidad || !tarifa) return;
    onAnadir({
      id: generarId(),
      fecha,
      ayudante: ayudante.trim(),
      tarea: tarea.trim(),
      horas: Number(cantidad) || 0,
      tarifaHora: Number(tarifa) || 0,
    });
    setTarea('');
    setCantidad('');
    setTarifa('');
    // El nombre del ayudante y la fecha se mantienen — lo normal es añadir
    // varios registros seguidos del mismo ayudante el mismo día.
  };

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitulo} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          Horas del ayudante
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
              <th>Ayudante</th>
              <th>Tarea</th>
              <th style={{ textAlign: 'right' }}>Horas</th>
              <th style={{ textAlign: 'right' }}>Tarifa/h</th>
              <th style={{ textAlign: 'right' }}>Coste</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {horasAyudante.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.tablaVacia}>
                  Todavía no hay horas de ayudante registradas.
                </td>
              </tr>
            ) : (
              horasAyudante.map((h) => (
                <tr key={h.id}>
                  <td>{h.fecha}</td>
                  <td>{h.ayudante}</td>
                  <td>{h.tarea}</td>
                  <td style={{ textAlign: 'right' }}>{h.horas} h</td>
                  <td style={{ textAlign: 'right' }}>
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(h.tarifaHora)}
                  </td>
                  <td style={{ textAlign: 'right' }} className={styles.importeGasto}>
                    {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(h.horas * h.tarifaHora)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <ConfirmarBorrado onConfirmar={() => onBorrar(h.id)} titulo="Borrar registro de horas de ayudante" />
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
          <div className={styles.campo}>
            <label className={styles.campoLabel}>Ayudante</label>
            <input className={styles.input} value={ayudante} onChange={(e) => setAyudante(e.target.value)} placeholder="Nombre" style={{ width: '130px' }} />
          </div>
          <div className={`${styles.campo} ${styles.crece}`}>
            <label className={styles.campoLabel}>Tarea</label>
            <input className={styles.input} value={tarea} onChange={(e) => setTarea(e.target.value)} placeholder="Descripción de la tarea" />
          </div>
          <div className={styles.campo}>
            <label className={styles.campoLabel}>Horas</label>
            <input className={styles.input} type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0" style={{ width: '80px' }} />
          </div>
          <div className={styles.campo}>
            <label className={styles.campoLabel}>Tarifa/h (€)</label>
            <input className={styles.input} type="number" value={tarifa} onChange={(e) => setTarifa(e.target.value)} placeholder="0,00" style={{ width: '90px' }} />
          </div>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={anadir}>Añadir</button>
        </div>
      )}
    </div>
  );
}
