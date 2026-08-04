import { useState } from 'react';
import type { Movimiento, TipoMovimiento } from './types.js';
import { generarId } from './mock.js';
import { formatoEuro, formatoFecha } from './calculos.js';
import { ImporteInput } from './importe-input.js';
import styles from './styles.module.css';

/** Props de la tabla de movimientos (gastos e ingresos). */
export type TablaMovimientosProps = {
  /** Movimientos a mostrar. */
  movimientos: Movimiento[];
  /** Se llama al añadir un nuevo movimiento. */
  onAnadir: (m: Movimiento) => void;
  /** Se llama al borrar un movimiento por id. */
  onBorrar: (id: string) => void;
  /** Se llama al editar un movimiento existente. */
  onEditar: (m: Movimiento) => void;
};

/**
 * Tabla editable de gastos e ingresos del proyecto, con formulario inline
 * para añadir nuevas filas y editar las existentes.
 */
export function TablaMovimientos({ movimientos, onAnadir, onBorrar, onEditar }: TablaMovimientosProps) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  // Campos del formulario
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [concepto, setConcepto] = useState('');
  const [categoria, setCategoria] = useState('Materiales');
  const [tipo, setTipo] = useState<TipoMovimiento>('gasto');
  const [importe, setImporte] = useState('');

  /** Abre el formulario en modo edición cargando los valores del movimiento. */
  const iniciarEdicion = (m: Movimiento) => {
    setEditandoId(m.id);
    setFecha(m.fecha);
    setConcepto(m.concepto);
    setCategoria(m.categoria);
    setTipo(m.tipo);
    setImporte(String(m.importe));
    setMostrarForm(true);
  };

  /** Resetea el formulario al estado vacío (modo añadir). */
  const resetForm = () => {
    setEditandoId(null);
    setFecha(new Date().toISOString().slice(0, 10));
    setConcepto('');
    setCategoria('Materiales');
    setTipo('gasto');
    setImporte('');
  };

  const guardar = () => {
    if (!concepto.trim() || !importe) return;
    if (editandoId) {
      onEditar({
        id: editandoId,
        fecha,
        concepto: concepto.trim(),
        categoria: categoria.trim() || 'General',
        tipo,
        importe: Number(importe) || 0,
      });
    } else {
      onAnadir({
        id: generarId(),
        fecha,
        concepto: concepto.trim(),
        categoria: categoria.trim() || 'General',
        tipo,
        importe: Number(importe) || 0,
      });
    }
    resetForm();
    setMostrarForm(false);
  };

  const cancelar = () => {
    resetForm();
    setMostrarForm(false);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitulo}>💰 Gastos e ingresos</h3>
        <button
          className={`${styles.btn} ${styles.btnSecundario}`}
          onClick={() => { resetForm(); setMostrarForm(v => !v); }}
        >
          {mostrarForm && !editandoId ? 'Cerrar' : '+ Añadir movimiento'}
        </button>
      </div>

      <div className={styles.tablaWrap}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Concepto</th>
              <th>Categoría</th>
              <th>Tipo</th>
              <th style={{ textAlign: 'right' }}>Importe</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {movimientos.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.tablaVacia}>
                  Todavía no hay movimientos registrados.
                </td>
              </tr>
            ) : (
              movimientos.map((m) => (
                <tr key={m.id}>
                  <td>{formatoFecha(m.fecha)}</td>
                  <td>{m.concepto}</td>
                  <td>{m.categoria}</td>
                  <td>
                    <span className={`${styles.tipoBadge} ${m.tipo === 'gasto' ? styles.tipoGasto : styles.tipoIngreso}`}>
                      {m.tipo === 'gasto' ? 'Gasto' : 'Ingreso'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }} className={m.tipo === 'gasto' ? styles.importeGasto : styles.importeIngreso}>
                    {m.tipo === 'gasto' ? '-' : '+'}{formatoEuro(m.importe)}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className={styles.btnIcono}
                      onClick={() => iniciarEdicion(m)}
                      title="Editar"
                      style={{ color: 'var(--azul)' }}
                    >
                      ✎
                    </button>
                    <button
                      className={styles.btnIcono}
                      onClick={() => onBorrar(m.id)}
                      title="Borrar"
                    >
                      🗑️
                    </button>
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
            <input className={styles.input} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div className={`${styles.campo} ${styles.crece}`}>
            <label className={styles.campoLabel}>Concepto</label>
            <input className={styles.input} value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Descripción" />
          </div>
          <div className={styles.campo}>
            <label className={styles.campoLabel}>Categoría</label>
            <input className={styles.input} value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Materiales" />
          </div>
          <div className={styles.campo}>
            <label className={styles.campoLabel}>Tipo</label>
            <select className={styles.select} value={tipo} onChange={e => setTipo(e.target.value as TipoMovimiento)}>
              <option value="gasto">Gasto</option>
              <option value="ingreso">Ingreso</option>
            </select>
          </div>
          <div className={styles.campo}>
            <label className={styles.campoLabel}>Importe (€)</label>
            <ImporteInput value={importe} onChange={setImporte} placeholder="0,00" style={{ width: '110px' }} />
          </div>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar}>
            {editandoId ? 'Guardar cambios' : 'Añadir'}
          </button>
          {editandoId && (
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={cancelar}>
              Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
