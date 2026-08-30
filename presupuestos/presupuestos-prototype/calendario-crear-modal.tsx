import { useState } from 'react';
import type { EventoCalendarioMC } from './calendario-modelo.js';
import styles from './styles.module.css';

type TipoRapido = 'nota' | 'tarea' | 'evento' | 'recordatorio';

/** Solo lo mínimo que hace falta para el selector de proyecto — el listado ligero (`ProyectoResumen`, ver `api.ts`) ya trae esto, sin pedir cada proyecto completo solo para mostrar el desplegable. */
type ProyectoParaSelector = { id: string; proyecto: string };

/**
 * "¿Qué quieres añadir?" — creación rápida desde una fecha del Calendario
 * (encargo, sección "Creación desde el calendario"). La fecha seleccionada
 * queda automáticamente asociada al nuevo elemento; el propio modal nunca
 * escribe en Mongo por su cuenta, delega en las funciones ya existentes
 * que le pasa el contenedor (`onGuardarNota`/`onCrearTarea`/
 * `onCrearEvento`) — reutiliza exactamente los mismos flujos de guardado
 * que Notas/Tareas del proyecto, nunca una ruta paralela.
 */
export function CalendarioCrearModal({ fechaIso, proyectos, onGuardarNota, onCrearTarea, onCrearEvento, onCerrar }: {
  fechaIso: string;
  proyectos: ProyectoParaSelector[];
  onGuardarNota: (contenido: string, fecha: string) => Promise<void>;
  /** El propio contenedor se encarga de leer las tareas actuales del proyecto (necesita el proyecto completo, no solo este resumen) antes de guardar la lista con la nueva añadida. */
  onCrearTarea: (proyectoId: string, texto: string, fecha: string) => Promise<void>;
  onCrearEvento: (datos: Omit<EventoCalendarioMC, 'id' | 'creado' | 'actualizado'>) => Promise<void>;
  onCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoRapido | null>(null);
  const [texto, setTexto] = useState('');
  const [proyectoId, setProyectoId] = useState(proyectos[0]?.id ?? '');
  const [hora, setHora] = useState('');
  const [todoElDia, setTodoElDia] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [dd, mm, aa] = [fechaIso.slice(8, 10), fechaIso.slice(5, 7), fechaIso.slice(0, 4)];

  const proyectoElegido = proyectos.find((p) => p.id === proyectoId);

  const confirmar = async () => {
    if (!texto.trim() && tipo !== 'evento' && tipo !== 'recordatorio') return;
    if ((tipo === 'evento' || tipo === 'recordatorio') && !texto.trim()) return;
    setGuardando(true);
    try {
      if (tipo === 'nota') {
        await onGuardarNota(texto.trim(), fechaIso);
      } else if (tipo === 'tarea') {
        if (!proyectoElegido) return;
        await onCrearTarea(proyectoElegido.id, texto.trim(), fechaIso);
      } else if (tipo === 'evento' || tipo === 'recordatorio') {
        await onCrearEvento({
          tipo, titulo: texto.trim(), descripcion: '', fecha: fechaIso,
          hora: todoElDia ? '' : hora, todoElDia, duracionMin: 0, clienteId: '', proyectoId: '',
        });
      }
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitulo} style={{ marginBottom: '0.3rem' }}>¿Qué quieres añadir?</h3>
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.85rem', color: 'var(--topo-claro)' }}>{dd}/{mm}/{aa}</p>

        {tipo === null ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            {([
              ['nota', 'Nota'], ['tarea', 'Tarea'], ['evento', 'Evento'], ['recordatorio', 'Recordatorio'],
            ] as [TipoRapido, string][]).map(([t, etiqueta]) => (
              <button key={t} className={`${styles.btn} ${styles.btnSecundario}`} style={{ justifyContent: 'center', padding: '1rem 0.5rem' }} onClick={() => setTipo(t)}>
                {etiqueta}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {tipo === 'tarea' && (
              <div>
                <label className={styles.campoLabel}>Proyecto</label>
                {proyectos.length === 0 ? (
                  <p style={{ fontSize: '0.82rem', color: 'var(--topo-claro)' }}>Todavía no tienes ningún proyecto donde añadir una tarea.</p>
                ) : (
                  <select className={styles.select} value={proyectoId} onChange={(e) => setProyectoId(e.target.value)}>
                    {proyectos.map((p) => <option key={p.id} value={p.id}>{p.proyecto || 'Proyecto sin nombre'}</option>)}
                  </select>
                )}
              </div>
            )}

            <div>
              <label className={styles.campoLabel}>
                {tipo === 'nota' ? 'Nota' : tipo === 'tarea' ? 'Tarea' : tipo === 'evento' ? 'Título del evento' : 'Recordatorio'}
              </label>
              <input
                className={styles.input}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={tipo === 'nota' ? 'Escribe la nota…' : tipo === 'tarea' ? 'Ej. Confirmar medidas' : tipo === 'evento' ? 'Ej. Visita a obra' : 'Ej. Llamar a Pedro'}
                autoFocus
              />
            </div>

            {(tipo === 'evento' || tipo === 'recordatorio') && (
              <div>
                <label className={styles.campoLabel} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <input type="checkbox" checked={!todoElDia} onChange={(e) => setTodoElDia(!e.target.checked)} />
                  Poner una hora
                </label>
                {!todoElDia && (
                  <input className={styles.input} type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={{ marginTop: '0.4rem' }} />
                )}
              </div>
            )}

            <div className={styles.modalAcciones} style={{ marginTop: '0.5rem', paddingTop: '0.75rem' }}>
              <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => setTipo(null)} disabled={guardando}>← Atrás</button>
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={confirmar} disabled={guardando || !texto.trim() || (tipo === 'tarea' && !proyectoElegido)}>
                {guardando ? 'Guardando…' : 'Añadir'}
              </button>
            </div>
          </div>
        )}

        {tipo === null && (
          <div className={styles.modalAcciones}>
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cancelar</button>
          </div>
        )}
      </div>
    </div>
  );
}
