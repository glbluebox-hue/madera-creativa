import { useState } from 'react';
import type { Proyecto, Tarea } from './types.js';
import { generarId } from './mock.js';
import * as api from './api.js';
import styles from './styles.module.css';

/** Tareas por defecto del flujo de carpintería. */
const TAREAS_BASE = [
  'Medir', 'Diseñar', 'Presupuesto', 'Cobro inicial', 'Comprar material',
  'Fabricar', 'Lijar', 'Pintar', 'Montar', 'Cobro final',
];

/** Props del panel de tareas. */
export type TabTareasProps = {
  /** Proyecto con su checklist. */
  proyecto: Proyecto;
  /** Guarda los cambios. */
  onActualizar: (proyecto: Proyecto) => void;
};

/**
 * Pestaña "Tareas": checklist del proyecto con las fases de carpintería.
 * Permite marcar, añadir y eliminar tareas.
 */
export function TabTareas({ proyecto, onActualizar }: TabTareasProps) {
  const tareas = proyecto.tareas ?? [];
  const [nueva, setNueva] = useState('');

  // Ruta quirúrgica dedicada (Hardening Fase 2) — ver comentario en
  // `ficha-proyecto.tsx`.
  const guardar = (nuevas: Tarea[]) => api.guardarTareasProyecto(proyecto.id, nuevas).then(onActualizar);

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
          <div className={styles.tabVacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
          </div>
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
                <span className={styles.checklistCheck}>{t.hecha ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> : ''}</span>
                <span className={styles.checklistTexto} style={{ flex: 1 }}>{t.texto}</span>
                <button
                  className={styles.btnIconoBorrar ?? ''}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--topo-claro)' }}
                  onClick={(e) => { e.stopPropagation(); borrar(t.id); }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
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
