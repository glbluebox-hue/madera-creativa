import { useState } from 'react';
import type { ElementoCalendario, EventoCalendarioMC } from './calendario-modelo.js';
import styles from './styles.module.css';

/**
 * Ver/editar/borrar un evento o recordatorio ya creado — es el único tipo
 * de elemento del Calendario sin una sección propia a la que "acceder al
 * origen" (una nota/tarea/factura/proyecto se abren en su sitio; un
 * evento/recordatorio SOLO vive aquí), así que pulsarlo abre este modal en
 * vez de navegar a ningún sitio.
 */
export function CalendarioDetalleEventoModal({ elemento, onGuardar, onBorrar, onCerrar }: {
  elemento: ElementoCalendario;
  onGuardar: (evento: EventoCalendarioMC) => Promise<void>;
  onBorrar: (id: string) => Promise<void>;
  onCerrar: () => void;
}) {
  const [titulo, setTitulo] = useState(elemento.titulo);
  const [todoElDia, setTodoElDia] = useState(elemento.todoElDia);
  const [hora, setHora] = useState(elemento.hora ?? '');
  const [guardando, setGuardando] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

  const guardar = async () => {
    if (!titulo.trim()) return;
    setGuardando(true);
    try {
      await onGuardar({
        id: elemento.origenId,
        tipo: elemento.tipo as 'evento' | 'recordatorio',
        titulo: titulo.trim(),
        descripcion: elemento.subtitulo ?? '',
        fecha: elemento.fecha,
        hora: todoElDia ? '' : hora,
        todoElDia,
        duracionMin: elemento.duracionMin ?? 0,
        clienteId: elemento.clienteId ?? '',
        proyectoId: elemento.proyectoId ?? '',
        creado: elemento.creado ?? new Date().toISOString(),
        actualizado: new Date().toISOString(),
      });
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!confirmandoBorrado) { setConfirmandoBorrado(true); return; }
    await onBorrar(elemento.origenId);
    onCerrar();
  };

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitulo}>{elemento.tipo === 'evento' ? 'Evento' : 'Recordatorio'}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div>
            <label className={styles.campoLabel}>Título</label>
            <input className={styles.input} value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
          </div>
          <div>
            <label className={styles.campoLabel} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <input type="checkbox" checked={!todoElDia} onChange={(e) => setTodoElDia(!e.target.checked)} />
              Poner una hora
            </label>
            {!todoElDia && (
              <input className={styles.input} type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={{ marginTop: '0.4rem' }} />
            )}
          </div>
        </div>
        <div className={styles.modalAcciones}>
          <button
            className={`${styles.btn} ${styles.btnSecundario}`}
            onClick={borrar}
            style={confirmandoBorrado ? { background: 'var(--rojo)', color: '#fff', borderColor: 'var(--rojo)' } : undefined}
          >
            {confirmandoBorrado ? '¿Seguro? Pulsa de nuevo' : 'Eliminar'}
          </button>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cerrar</button>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar} disabled={guardando || !titulo.trim()}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
