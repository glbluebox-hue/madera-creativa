import { useEffect, useState } from 'react';
import * as api from './api.js';
import type { NotifPrefs, RecordatorioPersonalizado } from './api.js';
import type { EstadoPush } from './use-push.js';
import styles from './styles.module.css';

/** Props del panel de notificaciones. */
export type PanelNotificacionesProps = {
  /** Estado actual del permiso/suscripción push del navegador. */
  estadoPush: EstadoPush;
  /** Motivo técnico del último fallo al suscribir, o '' si no hubo ninguno — se muestra junto al aviso para poder diagnosticar sin acceso al dispositivo. */
  errorPush: string;
  /** Pide permiso y registra la suscripción — mismo callback que el botón de campana. */
  onActivarPush: () => Promise<void>;
  onCerrar: () => void;
};

const TIPOS: Array<{ clave: keyof NotifPrefs; titulo: string; descripcion: string }> = [
  { clave: 'horas', titulo: 'Recordatorio de horas', descripcion: 'Un aviso al final del día si tienes proyectos activos sin horas registradas hoy.' },
  { clave: 'cobrosPendientes', titulo: 'Cobros pendientes', descripcion: 'Resumen de los cobros de presupuestos aceptados que todavía no has marcado como recibidos.' },
  { clave: 'margenBajo', titulo: 'Margen bajo', descripcion: 'Aviso cuando el margen de un proyecto activo baja del 40%.' },
  { clave: 'briefingDiario', titulo: 'Briefing diario', descripcion: 'Un resumen corto por la mañana: proyectos activos y cobros pendientes.' },
];

const HORAS_DIA = Array.from({ length: 24 }, (_, i) => i);

/**
 * El selector de hora de un recordatorio muestra y recoge la hora LOCAL
 * del propio dispositivo (lo que el usuario espera al elegir "17:00" es
 * que suene a las 17:00 de su reloj) — pero el servidor compara siempre
 * en UTC (`recordatoriosPersonalizados[].hora`, ver
 * `notificaciones-programadas.service.ts`), mismo criterio que el resto
 * de horas de esta app. Sin esta conversión, un recordatorio puesto a las
 * 17:00 se guardaba tal cual como si ya fuera UTC, así que en cualquier
 * huso horario distinto de UTC se disparaba a otra hora — reportado
 * 18/08/2026 ("puse una notificación a las 17:00 pero no ha llegado
 * nada"). Se usa el desfase ACTUAL del navegador (no tiene en cuenta un
 * cambio de horario de invierno/verano más adelante — límite aceptado: si
 * eso pasa, basta con volver a guardar el recordatorio para que se
 * reajuste).
 */
function horaLocalAUtc(horaLocal: number): number {
  const offsetHoras = new Date().getTimezoneOffset() / 60;
  return (Math.round(horaLocal + offsetHoras) % 24 + 24) % 24;
}
function horaUtcALocal(horaUtc: number): number {
  const offsetHoras = new Date().getTimezoneOffset() / 60;
  return (Math.round(horaUtc - offsetHoras) % 24 + 24) % 24;
}

/**
 * Panel de notificaciones (18/08/2026): interruptores por tipo + gestión de
 * recordatorios propios (texto libre, hora del día, activo/inactivo).
 * Reemplaza el simple botón de campana como punto de entrada — pedido
 * explícito del usuario ("crearía un panel con la posibilidad de activar o
 * desactivar diferentes tipos de notificación").
 */
export function PanelNotificaciones({ estadoPush, errorPush, onActivarPush, onCerrar }: PanelNotificacionesProps) {
  const [cargando, setCargando] = useState(true);
  const [preferencias, setPreferencias] = useState<NotifPrefs>({ horas: true, cobrosPendientes: true, margenBajo: true, briefingDiario: true });
  const [recordatorios, setRecordatorios] = useState<RecordatorioPersonalizado[]>([]);
  const [nuevoTexto, setNuevoTexto] = useState('');
  const [nuevaHora, setNuevaHora] = useState(9);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [probando, setProbando] = useState(false);
  const [resultadoPrueba, setResultadoPrueba] = useState('');

  const probar = async () => {
    setProbando(true);
    setResultadoPrueba('');
    try {
      await api.probarNotificacion();
      setResultadoPrueba('Enviada — debería llegarte en unos segundos.');
    } catch (e) {
      setResultadoPrueba(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setProbando(false);
    }
  };

  useEffect(() => {
    api.obtenerPreferenciasNotificaciones()
      .then(({ preferencias, recordatorios }) => {
        setPreferencias(preferencias);
        // El servidor guarda la hora en UTC — se convierte a hora local
        // aquí, una sola vez, para que el resto del componente (el
        // desplegable, el estado que se edita) trabaje siempre en hora
        // local, tal como la ve y espera el usuario.
        setRecordatorios(recordatorios.map((r) => ({ ...r, hora: horaUtcALocal(r.hora) })));
      })
      .catch(() => setError('No se pudieron cargar tus notificaciones.'))
      .finally(() => setCargando(false));
  }, []);

  const anadirRecordatorio = () => {
    const texto = nuevoTexto.trim();
    if (!texto) return;
    setRecordatorios((prev) => [...prev, { id: crypto.randomUUID(), texto, hora: nuevaHora, activo: true }]);
    setNuevoTexto('');
  };

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      await Promise.all([
        api.guardarPreferenciasNotificaciones(preferencias),
        // Se convierte de vuelta a UTC justo aquí, al cruzar hacia el
        // servidor — el estado en memoria de este componente sigue en
        // hora local hasta el último momento.
        api.guardarRecordatoriosPersonalizados(recordatorios.map((r) => ({ ...r, hora: horaLocalAUtc(r.hora) }))),
      ]);
      onCerrar();
    } catch {
      setError('No se pudieron guardar los cambios. Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitulo} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          Notificaciones
        </h2>

        {estadoPush !== 'concedido' && estadoPush !== 'no-soportado' && (
          <div className={styles.campo} style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'var(--fondo)', borderRadius: 'var(--radio)' }}>
            <p style={{ margin: '0 0 0.6rem', fontSize: '0.85rem', color: 'var(--topo)' }}>
              {estadoPush === 'denegado'
                ? 'Has bloqueado las notificaciones en este navegador — actívalas desde sus ajustes de sitio para poder recibir avisos.'
                : 'Todavía no has activado las notificaciones en este dispositivo.'}
            </p>
            {estadoPush !== 'denegado' && (
              <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} onClick={onActivarPush} disabled={estadoPush === 'activando'}>
                {estadoPush === 'activando' ? 'Activando…' : 'Activar en este dispositivo'}
              </button>
            )}
            {errorPush && (
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--rojo)' }}>
                No se ha podido completar: {errorPush}
              </p>
            )}
          </div>
        )}

        {estadoPush === 'concedido' && (
          <div className={styles.campo} style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'var(--fondo)', borderRadius: 'var(--radio)' }}>
            <p style={{ margin: '0 0 0.6rem', fontSize: '0.85rem', color: 'var(--topo)' }}>
              Notificaciones activadas en este dispositivo.
            </p>
            <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} onClick={probar} disabled={probando}>
              {probando ? 'Enviando…' : 'Enviar notificación de prueba'}
            </button>
            {resultadoPrueba && (
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--topo)' }}>{resultadoPrueba}</p>
            )}
          </div>
        )}

        {cargando ? (
          <p style={{ color: 'var(--topo-claro)' }}>Cargando…</p>
        ) : (
          <>
            <div className={styles.campo} style={{ marginBottom: '1.25rem' }}>
              <label className={styles.campoLabel}>Tipos de notificación</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.4rem' }}>
                {TIPOS.map((t) => (
                  <label key={t.clave} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      style={{ marginTop: '0.2rem' }}
                      checked={preferencias[t.clave]}
                      onChange={(e) => setPreferencias((p) => ({ ...p, [t.clave]: e.target.checked }))}
                    />
                    <span>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', color: 'var(--negro)' }}>{t.titulo}</span>
                      <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>{t.descripcion}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.campo} style={{ marginBottom: '1.25rem' }}>
              <label className={styles.campoLabel}>Tus recordatorios</label>
              {recordatorios.length === 0 && (
                <p style={{ fontSize: '0.8rem', color: 'var(--topo-claro)', margin: '0.3rem 0' }}>Todavía no has creado ninguno.</p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.4rem' }}>
                {recordatorios.map((r) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={r.activo}
                      title={r.activo ? 'Activo' : 'Desactivado'}
                      onChange={(e) => setRecordatorios((prev) => prev.map((x) => x.id === r.id ? { ...x, activo: e.target.checked } : x))}
                    />
                    <input
                      className={styles.input}
                      style={{ flex: 1 }}
                      value={r.texto}
                      onChange={(e) => setRecordatorios((prev) => prev.map((x) => x.id === r.id ? { ...x, texto: e.target.value } : x))}
                    />
                    <select
                      className={styles.input}
                      style={{ width: '90px' }}
                      value={r.hora}
                      onChange={(e) => setRecordatorios((prev) => prev.map((x) => x.id === r.id ? { ...x, hora: Number(e.target.value) } : x))}
                    >
                      {HORAS_DIA.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                    </select>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnSecundario}`}
                      title="Eliminar"
                      onClick={() => setRecordatorios((prev) => prev.filter((x) => x.id !== r.id))}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <input
                  className={styles.input}
                  style={{ flex: 1 }}
                  placeholder="Nuevo recordatorio…"
                  value={nuevoTexto}
                  onChange={(e) => setNuevoTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); anadirRecordatorio(); } }}
                />
                <select className={styles.input} style={{ width: '90px' }} value={nuevaHora} onChange={(e) => setNuevaHora(Number(e.target.value))}>
                  {HORAS_DIA.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                </select>
                <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} onClick={anadirRecordatorio} disabled={!nuevoTexto.trim()}>Añadir</button>
              </div>
            </div>
          </>
        )}

        {error && <div className={styles.loginError}>{error}</div>}

        <div className={styles.modalAcciones}>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar} disabled={guardando || cargando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
