import { useState } from 'react';
import type { Cliente, Tarea } from './types.js';
import { generarId } from './mock.js';
import styles from './styles.module.css';

/** Tareas por defecto del flujo de carpintería. */
const TAREAS_BASE = [
  'Medir', 'Diseñar', 'Presupuesto', 'Cobro inicial', 'Comprar material',
  'Fabricar', 'Lijar', 'Pintar', 'Montar', 'Cobro final',
];

/** Props del panel de tareas. */
export type TabTareasProps = {
  /** Cliente con su checklist. */
  cliente: Cliente;
  /** Guarda los cambios. */
  onActualizar: (cliente: Cliente) => void;
};

/**
 * Pestaña "Tareas": checklist del proyecto con las fases de carpintería.
 * Permite marcar, añadir y eliminar tareas.
 */
export function TabTareas({ cliente, onActualizar }: TabTareasProps) {
  const tareas = cliente.tareas ?? [];
  const [nueva, setNueva] = useState('');

  const guardar = (nuevas: Tarea[]) => onActualizar({ ...cliente, tareas: nuevas });

  const crearBase = () =>
    guardar(TAREAS_BASE.map((t) => ({ id: generarId(), texto: t, hecha: false })));

  const alternar = (id: string) =>
    guardar(tareas.map((t) => (t.id === id ? { ...t, hecha: !t.hecha } : t)));

  const anadir = () => {
    if (!nueva.trim()) return;
    guardar([...tareas, { id: generarId(), texto: nueva.trim(), hecha: false }]);
    setNueva('');
  };

  const borrar = (id: string) => guardar(tareas.filter((t) => t.id !== id));

  const hechas = tareas.filter((t) => t.hecha).length;

  return (
    <div className={styles.tabPanel}>
      <div className={styles.barraSeccion}>
        <h3 style={{ margin: 0 }}>
          Tareas del proyecto {tareas.length > 0 && <span style={{ color: 'var(--topo-claro)', fontWeight: 400 }}>({hechas}/{tareas.length})</span>}
        </h3>
        {tareas.length === 0 && (
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={crearBase}>Crear checklist de carpintería</button>
        )}
      </div>

      {tareas.length === 0 ? (
        <div className={styles.tabVacio}>
          <div className={styles.tabVacioIcono}>☑️</div>
          <p>Crea la checklist con las fases típicas: medir, diseñar, fabricar, montar, cobrar…</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {tareas.map((t) => (
              <div
                key={t.id}
                className={`${styles.checklistItem} ${t.hecha ? styles.checklistHecha : ''}`}
                onClick={() => alternar(t.id)}
              >
                <span className={styles.checklistCheck}>{t.hecha ? '✓' : ''}</span>
                <span className={styles.checklistTexto} style={{ flex: 1 }}>{t.texto}</span>
                <button
                  className={styles.btnIconoBorrar ?? ''}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--topo-claro)' }}
                  onClick={(e) => { e.stopPropagation(); borrar(t.id); }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              className={styles.input}
              placeholder="Nueva tarea…"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && anadir()}
            />
            <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={anadir}>Añadir</button>
          </div>
        </>
      )}
    </div>
  );
}
