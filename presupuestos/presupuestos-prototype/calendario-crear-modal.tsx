import { useState } from 'react';
import type { EventoCalendarioMC } from './calendario-modelo.js';
import { PRIORIDADES, COLOR_PRIORIDAD, ETIQUETA_PRIORIDAD, type PrioridadNota } from './notas-modelo.js';
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
export function CalendarioCrearModal({ fechaIso, horaInicial, horaFinInicial, proyectos, onGuardarNota, onCrearTarea, onCrearEvento, onCerrar }: {
  fechaIso: string;
  /**
   * Hora ya elegida al tocar una franja de la rejilla horaria de la vista
   * Día (23/10/2026) — solo pre-rellena los campos de Evento/Recordatorio;
   * el usuario sigue pudiendo crear una Nota/Tarea sin hora si cambia de
   * tipo, el pre-rellenado es solo una comodidad de partida.
   */
  horaInicial?: string;
  /** Hora de fin ya elegida con el flujo de dos toques de `CalendarioDia` (24/10/2026) — misma comodidad de partida que `horaInicial`, nunca obligatoria. */
  horaFinInicial?: string;
  proyectos: ProyectoParaSelector[];
  onGuardarNota: (contenido: string, fecha: string, prioridad: PrioridadNota) => Promise<void>;
  /** El propio contenedor se encarga de leer las tareas actuales del proyecto (necesita el proyecto completo, no solo este resumen) antes de guardar la lista con la nueva añadida. */
  onCrearTarea: (proyectoId: string, texto: string, fecha: string) => Promise<void>;
  onCrearEvento: (datos: Omit<EventoCalendarioMC, 'id' | 'creado' | 'actualizado'>) => Promise<void>;
  onCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoRapido | null>(null);
  const [texto, setTexto] = useState('');
  // Sin proyecto preseleccionado a propósito (bug real reportado por el
  // usuario, 24/10/2026: antes tomaba `proyectos[0]`, el primero de la
  // lista que llegara — se abría con un proyecto suyo cualquiera ya
  // elegido sin haberlo pedido). Neutral: el usuario tiene que elegir.
  const [proyectoId, setProyectoId] = useState('');
  const [hora, setHora] = useState(horaInicial ?? '');
  /** Fin de la franja horaria (opcional) — solo para calcular `duracionMin`, nunca obligatorio. */
  const [horaFin, setHoraFin] = useState(horaFinInicial ?? '');
  const [todoElDia, setTodoElDia] = useState(!horaInicial);
  const [prioridad, setPrioridad] = useState<PrioridadNota>('media');
  const [guardando, setGuardando] = useState(false);

  const [dd, mm, aa] = [fechaIso.slice(8, 10), fechaIso.slice(5, 7), fechaIso.slice(0, 4)];

  const proyectoElegido = proyectos.find((p) => p.id === proyectoId);

  /** Minutos entre `hora` y `horaFin` ("HH:mm") si ambas están puestas y `horaFin` es posterior — si no, 0 (igual que antes, un punto en el tiempo sin duración). Nunca se pide: el usuario puede dejar solo la hora de inicio. */
  const duracionMin = (() => {
    if (todoElDia || !hora || !horaFin) return 0;
    const [h1, m1] = hora.split(':').map(Number);
    const [h2, m2] = horaFin.split(':').map(Number);
    const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    return mins > 0 ? mins : 0;
  })();

  const confirmar = async () => {
    if (!texto.trim() && tipo !== 'evento' && tipo !== 'recordatorio') return;
    if ((tipo === 'evento' || tipo === 'recordatorio') && !texto.trim()) return;
    setGuardando(true);
    try {
      if (tipo === 'nota') {
        await onGuardarNota(texto.trim(), fechaIso, prioridad);
      } else if (tipo === 'tarea') {
        if (!proyectoElegido) return;
        await onCrearTarea(proyectoElegido.id, texto.trim(), fechaIso);
      } else if (tipo === 'evento' || tipo === 'recordatorio') {
        await onCrearEvento({
          tipo, titulo: texto.trim(), descripcion: '', fecha: fechaIso,
          hora: todoElDia ? '' : hora, todoElDia, duracionMin, clienteId: '', proyectoId: '',
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
                    <option value="" disabled>Selecciona un proyecto…</option>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
                    <input className={styles.input} type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
                    <span style={{ fontSize: '0.82rem', color: 'var(--topo-claro)' }}>hasta</span>
                    {/* Opcional — sin esto, se guarda como un punto en el tiempo sin duración, igual que antes. */}
                    <input className={styles.input} type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
                  </div>
                )}
              </div>
            )}

            {tipo === 'nota' && (
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
