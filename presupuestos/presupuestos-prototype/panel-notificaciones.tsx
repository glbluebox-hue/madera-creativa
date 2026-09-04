import { useEffect, useState } from 'react';
import * as api from './api.js';
import type { NotifPrefs, PreferenciaNotifTipo, RecordatorioPersonalizado } from './api.js';
import type { EstadoPush } from './use-push.js';
import { puedeUsar, PRO_O_SUPERIOR, type PlanAcceso } from './planes.js';
import { CandadoPlan } from './candado-plan.js';
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
  /** Solo el admin ve el interruptor de "Nuevo usuario registrado" — no tiene sentido para una cuenta normal. */
  esAdmin: boolean;
  /**
   * Plan de la sesión actual (Fase 2.5, 04/09/2026) — BASIC solo tiene el
   * recordatorio de horas; el resto exige PRO+. NOTA: como con el Tablero
   * de medición, hoy no hay una comprobación equivalente en el backend al
   * guardar preferencias — esta es la única protección real para esto por
   * ahora (bajo riesgo: no expone datos de otra cuenta, solo decide si TU
   * propia cuenta recibe un aviso).
   */
  plan?: PlanAcceso;
};

const TIPOS: Array<{ clave: typeof TIPOS_CON_HORA[number]; titulo: string; descripcion: string }> = [
  { clave: 'horas', titulo: 'Recordatorio de horas', descripcion: 'Un aviso si tienes proyectos activos sin horas registradas hoy.' },
  { clave: 'cobrosPendientes', titulo: 'Cobros pendientes', descripcion: 'Resumen de los cobros de presupuestos aceptados que todavía no has marcado como recibidos.' },
  { clave: 'margenBajo', titulo: 'Margen bajo', descripcion: 'Aviso cuando el margen de un proyecto activo baja del 40%.' },
  { clave: 'briefingDiario', titulo: 'Briefing diario', descripcion: 'Un resumen corto: proyectos activos y cobros pendientes.' },
];

const PREFERENCIAS_POR_DEFECTO: NotifPrefs = {
  horas: { activo: true, hora: 20, minuto: 0 },
  cobrosPendientes: { activo: true, hora: 8, minuto: 0 },
  margenBajo: { activo: true, hora: 8, minuto: 0 },
  briefingDiario: { activo: true, hora: 8, minuto: 0 },
  nuevoUsuario: true,
  mensajeSoporte: true,
};

/** Los únicos 4 tipos con hora propia — `nuevoUsuario` es un booleano suelto, sin hora, así que queda fuera de la conversión UTC↔local de abajo. */
const TIPOS_CON_HORA = ['horas', 'cobrosPendientes', 'margenBajo', 'briefingDiario'] as const;

/**
 * Los selectores de hora muestran y recogen la hora LOCAL del propio
 * dispositivo (lo que el usuario espera al elegir "17:00" es que suene a
 * las 17:00 de su reloj) — pero el servidor compara siempre en UTC (mismo
 * criterio en todos los tipos de notificación, ver
 * `notificaciones-programadas.service.ts`/`recordatorio-horas.service.ts`).
 * Sin esta conversión, una hora puesta a las 17:00 se guardaba tal cual
 * como si ya fuera UTC, así que en cualquier huso horario distinto de UTC
 * se disparaba a otra hora — reportado 18/08/2026 ("puse una notificación
 * a las 17:00 pero no ha llegado nada"). Se trabaja en "minutos desde
 * medianoche" para no repetir la aritmética de hora+minuto por separado.
 * Usa el desfase ACTUAL del navegador (no tiene en cuenta un cambio de
 * horario de invierno/verano más adelante — límite aceptado: si eso pasa,
 * basta con volver a guardar para que se reajuste).
 */
function localAUtc(hora: number, minuto: number): { hora: number; minuto: number } {
  const offsetMin = new Date().getTimezoneOffset();
  const total = (((hora * 60 + minuto) + offsetMin) % 1440 + 1440) % 1440;
  return { hora: Math.floor(total / 60), minuto: total % 60 };
}
function utcALocal(hora: number, minuto: number): { hora: number; minuto: number } {
  const offsetMin = new Date().getTimezoneOffset();
  const total = (((hora * 60 + minuto) - offsetMin) % 1440 + 1440) % 1440;
  return { hora: Math.floor(total / 60), minuto: total % 60 };
}
/** Para el valor de un `<input type="time">`. */
function aHHMM(hora: number, minuto: number): string {
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}
function desdeHHMM(valor: string): { hora: number; minuto: number } {
  const [h, m] = valor.split(':').map(Number);
  return { hora: h || 0, minuto: m || 0 };
}

/**
 * Panel de notificaciones (18/08/2026): interruptores + hora propia por
 * tipo, y gestión de recordatorios propios (texto libre, hora,
 * activo/inactivo). Reemplaza el simple botón de campana como punto de
 * entrada — pedido explícito del usuario ("crearía un panel con la
 * posibilidad de activar o desactivar diferentes tipos de notificación").
 * Cada tipo tenía al principio una única hora fija de servidor — ampliado
 * el mismo día a hora propia editable por tipo, con minutos, no solo
 * horas en punto ("todo esto tiene que ser editable y con la posibilidad
 * de poner una hora y también minutos").
 */
export function PanelNotificaciones({ estadoPush, errorPush, onActivarPush, onCerrar, esAdmin, plan }: PanelNotificacionesProps) {
  const tienePlanCompleto = puedeUsar(plan, PRO_O_SUPERIOR, esAdmin);
  const [cargando, setCargando] = useState(true);
  const [preferencias, setPreferencias] = useState<NotifPrefs>(PREFERENCIAS_POR_DEFECTO);
  const [recordatorios, setRecordatorios] = useState<RecordatorioPersonalizado[]>([]);
  const [nuevoTexto, setNuevoTexto] = useState('');
  const [nuevaHora, setNuevaHora] = useState('09:00');
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
        // El servidor guarda todas las horas en UTC — se convierten a hora
        // local aquí, una sola vez, para que el resto del componente
        // trabaje siempre en hora local, tal como la ve y espera el usuario.
        const local: NotifPrefs = {
          horas: preferencias.horas, cobrosPendientes: preferencias.cobrosPendientes,
          margenBajo: preferencias.margenBajo, briefingDiario: preferencias.briefingDiario,
          nuevoUsuario: preferencias.nuevoUsuario, mensajeSoporte: preferencias.mensajeSoporte,
        };
        for (const clave of TIPOS_CON_HORA) {
          const p = preferencias[clave];
          const { hora, minuto } = utcALocal(p.hora, p.minuto);
          local[clave] = { activo: p.activo, hora, minuto };
        }
        setPreferencias(local);
        setRecordatorios(recordatorios.map((r) => {
          const { hora, minuto } = utcALocal(r.hora, r.minuto ?? 0);
          return { ...r, hora, minuto };
        }));
      })
      .catch(() => setError('No se pudieron cargar tus notificaciones.'))
      .finally(() => setCargando(false));
  }, []);

  const cambiarTipo = (clave: typeof TIPOS_CON_HORA[number], cambios: Partial<PreferenciaNotifTipo>) => {
    setPreferencias((prev) => ({ ...prev, [clave]: { ...prev[clave], ...cambios } }));
  };

  const anadirRecordatorio = () => {
    const texto = nuevoTexto.trim();
    if (!texto) return;
    const { hora, minuto } = desdeHHMM(nuevaHora);
    setRecordatorios((prev) => [...prev, { id: crypto.randomUUID(), texto, hora, minuto, activo: true }]);
    setNuevoTexto('');
  };

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      // Se convierte de vuelta a UTC justo aquí, al cruzar hacia el
      // servidor — el estado en memoria de este componente sigue en hora
      // local hasta el último momento.
      const prefsUtc: NotifPrefs = { ...preferencias };
      for (const clave of TIPOS_CON_HORA) {
        const p = preferencias[clave];
        const { hora, minuto } = localAUtc(p.hora, p.minuto);
        prefsUtc[clave] = { activo: p.activo, hora, minuto };
      }
      await Promise.all([
        api.guardarPreferenciasNotificaciones(prefsUtc),
        api.guardarRecordatoriosPersonalizados(recordatorios.map((r) => {
          const { hora, minuto } = localAUtc(r.hora, r.minuto);
          return { ...r, hora, minuto };
        })),
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
          <div className={styles.campo} style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'var(--fondo-caja)', borderRadius: 'var(--radio)' }}>
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
          <div className={styles.campo} style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'var(--fondo-caja)', borderRadius: 'var(--radio)' }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.4rem' }}>
                {TIPOS.map((t) => {
                  const pref = preferencias[t.clave];
                  // Solo "horas" está en BASIC (Fase 2.5, 04/09/2026) — el resto exige PRO+.
                  const bloqueado = t.clave !== 'horas' && !tienePlanCompleto;
                  return (
                    <div key={t.clave} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                      <input
                        type="checkbox"
                        style={{ marginTop: '0.2rem' }}
                        checked={!bloqueado && pref.activo}
                        disabled={bloqueado}
                        onChange={(e) => cambiarTipo(t.clave, { activo: e.target.checked })}
                      />
                      <div style={{ flex: 1, opacity: bloqueado ? 0.6 : 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--negro)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {t.titulo} {bloqueado && <CandadoPlan planMinimo="PRO" compacto />}
                          </span>
                          <input
                            type="time"
                            className={styles.input}
                            style={{ width: '110px' }}
                            value={aHHMM(pref.hora, pref.minuto)}
                            disabled={bloqueado || !pref.activo}
                            onChange={(e) => { const { hora, minuto } = desdeHHMM(e.target.value); cambiarTipo(t.clave, { hora, minuto }); }}
                          />
                        </div>
                        <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>{t.descripcion}</span>
                      </div>
                    </div>
                  );
                })}
                {esAdmin && (
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      style={{ marginTop: '0.2rem' }}
                      checked={preferencias.nuevoUsuario}
                      onChange={(e) => setPreferencias((prev) => ({ ...prev, nuevoUsuario: e.target.checked }))}
                    />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--negro)' }}>Nuevo usuario registrado</span>
                      <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>Aviso al momento cuando alguien se registra — aún no ha verificado su email, puedes revisarlo en el panel.</span>
                    </div>
                  </div>
                )}
                {esAdmin && (
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      style={{ marginTop: '0.2rem' }}
                      checked={preferencias.mensajeSoporte}
                      onChange={(e) => setPreferencias((prev) => ({ ...prev, mensajeSoporte: e.target.checked }))}
                    />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--negro)' }}>Comentarios y sugerencias</span>
                      <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>Aviso al momento cuando un usuario abre o responde un hilo de "Comentarios y sugerencias".</span>
                    </div>
                  </div>
                )}
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
                    <input
                      type="time"
                      className={styles.input}
                      style={{ width: '110px' }}
                      value={aHHMM(r.hora, r.minuto)}
                      onChange={(e) => { const { hora, minuto } = desdeHHMM(e.target.value); setRecordatorios((prev) => prev.map((x) => x.id === r.id ? { ...x, hora, minuto } : x)); }}
                    />
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
                <input
                  type="time"
                  className={styles.input}
                  style={{ width: '110px' }}
                  value={nuevaHora}
                  onChange={(e) => setNuevaHora(e.target.value)}
                />
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
