import { useState, useEffect } from 'react';
import * as api from './api.js';
import type { Tarea } from './types.js';
import type { ElementoCalendario } from './calendario-modelo.js';
import styles from './styles.module.css';

/**
 * Ver/editar/marcar hecha/borrar una tarea directamente desde el Calendario
 * (bug real reportado por el usuario, 23/10/2026: abrir una tarea con
 * proyecto asociado saltaba de inmediato a la ficha del cliente/proyecto,
 * sin mostrar nunca el texto de la propia tarea — `abrirElementoCalendario`
 * en `presupuestos-prototype.tsx` resuelve `elemento.proyectoId` antes que
 * cualquier caso por `tipo`, y una tarea de un proyecto siempre lo tiene).
 *
 * Una tarea vive anidada dentro de `Proyecto.tareas` (no tiene colección ni
 * endpoint propios) — se pide el proyecto completo y se localiza por id,
 * mismo patrón ya usado por `crearTareaEnProyecto`/`CalendarioDetalleNotaModal`.
 */
export function CalendarioDetalleTareaModal({ elemento, onCambio, onCerrar, onIrAProyecto }: {
  elemento: ElementoCalendario;
  onCambio: () => void;
  onCerrar: () => void;
  /** Navegar explícitamente a la ficha del proyecto/cliente, a petición del usuario dentro del modal — nunca automático al abrir. */
  onIrAProyecto: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [tareas, setTareas] = useState<Tarea[] | null>(null);
  const [texto, setTexto] = useState('');
  const [hecha, setHecha] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!elemento.proyectoId) { setError('Esta tarea no tiene ningún proyecto asociado.'); setCargando(false); return; }
    api.obtenerProyecto(elemento.proyectoId)
      .then((proyecto) => {
        const todas = proyecto.tareas ?? [];
        const encontrada = todas.find((t) => t.id === elemento.origenId) ?? null;
        setTareas(todas);
        if (encontrada) { setTexto(encontrada.texto); setHecha(encontrada.hecha); }
        else setError('Esta tarea ya no existe.');
      })
      .catch(() => setError('No se pudo cargar la tarea.'))
      .finally(() => setCargando(false));
  }, [elemento.proyectoId, elemento.origenId]);

  const guardar = async () => {
    if (!tareas || !texto.trim() || !elemento.proyectoId) return;
    setGuardando(true);
    try {
      const actualizadas = tareas.map((t) => (t.id === elemento.origenId ? { ...t, texto: texto.trim(), hecha } : t));
      await api.guardarTareasProyecto(elemento.proyectoId, actualizadas);
      onCambio();
      onCerrar();
    } catch {
      setError('No se pudo guardar la tarea.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!tareas || !elemento.proyectoId) return;
    if (!confirmandoBorrado) { setConfirmandoBorrado(true); return; }
    await api.guardarTareasProyecto(elemento.proyectoId, tareas.filter((t) => t.id !== elemento.origenId));
    onCambio();
    onCerrar();
  };

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitulo}>Tarea</h3>

        {cargando ? (
          <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>Cargando…</p>
        ) : !tareas || error === 'Esta tarea ya no existe.' || !elemento.proyectoId ? (
          <>
            <p style={{ color: 'var(--rojo)', fontSize: '0.85rem' }}>{error || 'No se pudo cargar la tarea.'}</p>
            <div className={styles.modalAcciones}>
              <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cerrar</button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div>
              <label className={styles.campoLabel}>Tarea</label>
              <textarea
                className={styles.input}
                style={{ width: '100%', boxSizing: 'border-box', minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                autoFocus
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={hecha} onChange={(e) => setHecha(e.target.checked)} />
              Hecha
            </label>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecundario}`}
              style={{ alignSelf: 'flex-start', fontSize: '0.78rem' }}
              onClick={onIrAProyecto}
            >
              Ver ficha del proyecto
            </button>
            {error && <p style={{ color: 'var(--rojo)', fontSize: '0.8rem' }}>{error}</p>}
            <div className={styles.modalAcciones}>
              <button
                className={`${styles.btn} ${styles.btnSecundario}`}
                onClick={borrar}
                style={confirmandoBorrado ? { background: 'var(--rojo)', color: '#fff', borderColor: 'var(--rojo)' } : undefined}
              >
                {confirmandoBorrado ? '¿Seguro? Pulsa de nuevo' : 'Eliminar'}
              </button>
              <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cerrar</button>
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar} disabled={guardando || !texto.trim()}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
