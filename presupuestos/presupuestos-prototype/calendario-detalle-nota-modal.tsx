import { useState, useEffect } from 'react';
import * as api from './api.js';
import { PRIORIDADES, COLOR_PRIORIDAD, ETIQUETA_PRIORIDAD, type NotaMC, type PrioridadNota } from './notas-modelo.js';
import styles from './styles.module.css';

/**
 * Ver/editar/borrar una nota directamente desde el Calendario, incluida su
 * prioridad (y el color que la representa — mismos colores que en la
 * propia sección Notas, `notas-modelo.ts`) — petición explícita del
 * usuario, 30/08/2026. El `ElementoCalendario` agregado no lleva todos los
 * campos de una nota completa (`titulo`/`tipo`/`items`/`clienteId`…), así
 * que al abrir este modal se pide la nota real por id — mismo patrón que
 * `crearTareaEnProyecto` en `calendario-vista.tsx` (pedir el documento
 * completo justo antes de editarlo, en vez de duplicar sus datos en la
 * capa agregadora de solo lectura del Calendario).
 */
export function CalendarioDetalleNotaModal({ notaId, onCambio, onCerrar }: {
  notaId: string;
  onCambio: () => void;
  onCerrar: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [nota, setNota] = useState<NotaMC | null>(null);
  const [contenido, setContenido] = useState('');
  const [prioridad, setPrioridad] = useState<PrioridadNota>('media');
  const [guardando, setGuardando] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.obtenerNotas()
      .then((notas) => {
        const encontrada = notas.find((n) => n.id === notaId) ?? null;
        setNota(encontrada);
        if (encontrada) { setContenido(encontrada.contenido); setPrioridad(encontrada.prioridad); }
        else setError('Esta nota ya no existe.');
      })
      .catch(() => setError('No se pudo cargar la nota.'))
      .finally(() => setCargando(false));
  }, [notaId]);

  const guardar = async () => {
    if (!nota || !contenido.trim()) return;
    setGuardando(true);
    try {
      await api.guardarNota({ ...nota, contenido: contenido.trim(), prioridad, actualizado: new Date().toISOString() });
      onCambio();
      onCerrar();
    } catch {
      setError('No se pudo guardar la nota.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!confirmandoBorrado) { setConfirmandoBorrado(true); return; }
    await api.borrarNota(notaId);
    onCambio();
    onCerrar();
  };

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitulo}>Nota</h3>

        {cargando ? (
          <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>Cargando…</p>
        ) : !nota ? (
          <>
            <p style={{ color: 'var(--rojo)', fontSize: '0.85rem' }}>{error || 'Esta nota ya no existe.'}</p>
            <div className={styles.modalAcciones}>
              <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cerrar</button>
            </div>
          </>
        ) : nota.tipo === 'lista' ? (
          // Una lista tiene items, no un texto — editarla de verdad pertenece
          // a la propia pantalla de Notas (su checklist ya tiene su propia
          // interfaz); aquí solo se ofrece cambiar la prioridad y borrarla,
          // sin duplicar ese editor.
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--topo-claro)', margin: '0 0 1rem' }}>
              "{nota.titulo || 'Lista sin título'}" es una lista de tareas — para editar sus elementos, ábrela desde Notas.
            </p>
            <div>
              <span className={styles.campoLabel}>Prioridad</span>
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem' }}>
                {PRIORIDADES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPrioridad(p.id)}
                    style={{
                      padding: '0.35rem 0.8rem', borderRadius: 'var(--radio-full, 999px)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                      border: `1.5px solid ${COLOR_PRIORIDAD[p.id]}`,
                      background: prioridad === p.id ? COLOR_PRIORIDAD[p.id] : 'transparent',
                      color: prioridad === p.id ? 'var(--blanco)' : COLOR_PRIORIDAD[p.id],
                    }}
                  >
                    {ETIQUETA_PRIORIDAD[p.id]}
                  </button>
                ))}
              </div>
            </div>
            {error && <p style={{ color: 'var(--rojo)', fontSize: '0.8rem', marginTop: '0.6rem' }}>{error}</p>}
            <div className={styles.modalAcciones}>
              <button
                className={`${styles.btn} ${styles.btnSecundario}`}
                onClick={borrar}
                style={confirmandoBorrado ? { background: 'var(--rojo)', color: '#fff', borderColor: 'var(--rojo)' } : undefined}
              >
                {confirmandoBorrado ? '¿Seguro? Pulsa de nuevo' : 'Eliminar'}
              </button>
              <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cerrar</button>
              <button
                className={`${styles.btn} ${styles.btnPrimario}`}
                onClick={async () => { setGuardando(true); try { await api.guardarNota({ ...nota, prioridad, actualizado: new Date().toISOString() }); onCambio(); onCerrar(); } catch { setError('No se pudo guardar.'); } finally { setGuardando(false); } }}
                disabled={guardando}
              >
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div>
              <label className={styles.campoLabel}>Nota</label>
              <textarea
                className={styles.input}
                style={{ width: '100%', boxSizing: 'border-box', minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }}
                value={contenido}
                onChange={(e) => setContenido(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <span className={styles.campoLabel}>Prioridad</span>
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem' }}>
                {PRIORIDADES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPrioridad(p.id)}
                    style={{
                      padding: '0.35rem 0.8rem', borderRadius: 'var(--radio-full, 999px)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                      border: `1.5px solid ${COLOR_PRIORIDAD[p.id]}`,
                      background: prioridad === p.id ? COLOR_PRIORIDAD[p.id] : 'transparent',
                      color: prioridad === p.id ? 'var(--blanco)' : COLOR_PRIORIDAD[p.id],
                    }}
                  >
                    {ETIQUETA_PRIORIDAD[p.id]}
                  </button>
                ))}
              </div>
            </div>
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
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar} disabled={guardando || !contenido.trim()}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
