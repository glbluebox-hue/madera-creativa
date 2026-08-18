import { useEffect, useState } from 'react';
import * as api from './api.js';
import type { NotifPrefs, RecordatorioPersonalizado } from './api.js';
import type { EstadoPush } from './use-push.js';
import styles from './styles.module.css';

/** Props del panel de notificaciones. */
export type PanelNotificacionesProps = {
  /** Estado actual del permiso/suscripción push del navegador. */
  estadoPush: EstadoPush;
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
 * Panel de notificaciones (18/08/2026): interruptores por tipo + gestión de
 * recordatorios propios (texto libre, hora del día, activo/inactivo).
 * Reemplaza el simple botón de campana como punto de entrada — pedido
 * explícito del usuario ("crearía un panel con la posibilidad de activar o
 * desactivar diferentes tipos de notificación").
 */
export function PanelNotificaciones({ estadoPush, onActivarPush, onCerrar }: PanelNotificacionesProps) {
  const [cargando, setCargando] = useState(true);
  const [preferencias, setPreferencias] = useState<NotifPrefs>({ horas: true, cobrosPendientes: true, margenBajo: true, briefingDiario: true });
  const [recordatorios, setRecordatorios] = useState<RecordatorioPersonalizado[]>([]);
  const [nuevoTexto, setNuevoTexto] = useState('');
  const [nuevaHora, setNuevaHora] = useState(9);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.obtenerPreferenciasNotificaciones()
      .then(({ preferencias, recordatorios }) => { setPreferencias(preferencias); setRecordatorios(recordatorios); })
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
        api.guardarRecordatoriosPersonalizados(recordatorios),
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
