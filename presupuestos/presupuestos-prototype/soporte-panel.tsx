import { useState, useEffect, useCallback } from 'react';
import * as api from './api.js';
import type { HiloSoporte, TipoHiloSoporte } from './api.js';
import styles from './styles.module.css';

/** Props del panel de soporte del usuario. */
export type SoportePanelProps = {
  onCerrar: () => void;
};

const ETIQUETA_TIPO: Record<TipoHiloSoporte, string> = {
  mejora: 'Mejora', incidencia: 'Incidencia', problema: 'Problema',
};
const COLOR_TIPO: Record<TipoHiloSoporte, string> = {
  mejora: 'var(--verde)', incidencia: 'var(--ocre)', problema: 'var(--rojo)',
};

function formatoFechaHora(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * "Comentarios y sugerencias" (26/08/2026) — el usuario abre un hilo
 * (mejora/incidencia/problema) y puede seguir la conversación con el
 * admin en el mismo sitio; ve su propio historial de hilos, nunca los de
 * otro usuario (el servidor ya filtra por `usuarioId`, esto es solo la
 * vista). Mismo patrón de modal que `PanelNotificaciones`.
 */
export function SoportePanel({ onCerrar }: SoportePanelProps) {
  const [hilos, setHilos] = useState<HiloSoporte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [hiloAbierto, setHiloAbierto] = useState<string | null>(null);

  // Nuevo hilo
  const [creando, setCreando] = useState(false);
  const [nuevoTipo, setNuevoTipo] = useState<TipoHiloSoporte>('mejora');
  const [nuevoTexto, setNuevoTexto] = useState('');
  const [enviandoNuevo, setEnviandoNuevo] = useState(false);

  // Responder a un hilo abierto
  const [respuesta, setRespuesta] = useState('');
  const [enviandoRespuesta, setEnviandoRespuesta] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    api.obtenerMisHilosSoporte()
      .then(setHilos)
      .catch(() => setError('No se pudieron cargar tus comentarios.'))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const enviarNuevo = async () => {
    if (!nuevoTexto.trim()) return;
    setEnviandoNuevo(true);
    try {
      const hilo = await api.crearHiloSoporte(nuevoTipo, nuevoTexto.trim());
      setHilos((prev) => [hilo, ...prev]);
      setNuevoTexto('');
      setCreando(false);
      setHiloAbierto(hilo.id);
    } catch {
      setError('No se pudo enviar el comentario. Inténtalo de nuevo.');
    } finally {
      setEnviandoNuevo(false);
    }
  };

  const enviarRespuesta = async (id: string) => {
    if (!respuesta.trim()) return;
    setEnviandoRespuesta(true);
    try {
      const hilo = await api.responderHiloSoporte(id, respuesta.trim());
      setHilos((prev) => prev.map((h) => (h.id === id ? hilo : h)));
      setRespuesta('');
    } catch {
      setError('No se pudo enviar el mensaje. Inténtalo de nuevo.');
    } finally {
      setEnviandoRespuesta(false);
    }
  };

  const hilo = hilos.find((h) => h.id === hiloAbierto) || null;

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {hilo ? (
          // ── Conversación de un hilo ──
          <>
            <h2 className={styles.modalTitulo} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button type="button" onClick={() => setHiloAbierto(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--topo)', display: 'flex' }} aria-label="Volver">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              {ETIQUETA_TIPO[hilo.tipo]}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '50vh', overflowY: 'auto', margin: '0.75rem 0' }}>
              {hilo.mensajes.map((m) => (
                <div key={m.id} style={{
                  alignSelf: m.autor === 'admin' ? 'flex-start' : 'flex-end',
                  maxWidth: '85%', background: m.autor === 'admin' ? 'var(--fondo-caja)' : 'var(--topo-tinte)',
                  borderRadius: 10, padding: '0.6rem 0.8rem',
                }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--negro)', whiteSpace: 'pre-wrap' }}>{m.texto}</p>
                  <p style={{ margin: '0.3rem 0 0', fontSize: '0.68rem', color: 'var(--topo-claro)' }}>
                    {m.autor === 'admin' ? 'Madera Creativa' : 'Tú'} · {formatoFechaHora(m.fecha)}
                  </p>
                </div>
              ))}
            </div>
            {hilo.estado === 'resuelto' && (
              <p style={{ margin: '0 0 0.6rem', fontSize: '0.78rem', color: 'var(--verde)', fontWeight: 600 }}>Marcado como resuelto — puedes seguir escribiendo si hace falta.</p>
            )}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                className={styles.input}
                style={{ flex: '1 1 160px', minWidth: 0 }}
                value={respuesta}
                onChange={(e) => setRespuesta(e.target.value)}
                placeholder="Escribe un mensaje…"
                onKeyDown={(e) => { if (e.key === 'Enter') enviarRespuesta(hilo.id); }}
              />
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimario}`}
                style={{ flexShrink: 0 }}
                disabled={enviandoRespuesta || !respuesta.trim()}
                onClick={() => enviarRespuesta(hilo.id)}
              >
                {enviandoRespuesta ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </>
        ) : (
          // ── Lista de hilos + nuevo comentario ──
          <>
            <h2 className={styles.modalTitulo} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              Comentarios y sugerencias
            </h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
              ¿Algo no funciona bien? ¿Se te ocurre una mejora? Escríbenos aquí — te contestamos en el mismo sitio.
            </p>

            {creando ? (
              <div className={styles.campo} style={{ marginBottom: '1rem' }}>
                <label className={styles.campoLabel}>Tipo</label>
                <div style={{ display: 'flex', gap: '0.4rem', margin: '0.4rem 0 0.75rem' }}>
                  {(['mejora', 'incidencia', 'problema'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`${styles.btn} ${nuevoTipo === t ? styles.btnPrimario : styles.btnSecundario}`}
                      style={{ flex: 1, justifyContent: 'center', fontSize: '0.8rem' }}
                      onClick={() => setNuevoTipo(t)}
                    >
                      {ETIQUETA_TIPO[t]}
                    </button>
                  ))}
                </div>
                <textarea
                  className={styles.input}
                  style={{ width: '100%', minHeight: 90, resize: 'vertical', fontFamily: 'inherit' }}
                  value={nuevoTexto}
                  onChange={(e) => setNuevoTexto(e.target.value)}
                  placeholder="Cuéntanos qué pasa o qué se te ocurre…"
                  autoFocus
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                  <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => { setCreando(false); setNuevoTexto(''); }}>Cancelar</button>
                  <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} disabled={enviandoNuevo || !nuevoTexto.trim()} onClick={enviarNuevo}>
                    {enviandoNuevo ? 'Enviando…' : 'Enviar'}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} style={{ width: '100%', justifyContent: 'center', marginBottom: '1rem' }} onClick={() => setCreando(true)}>
                + Nuevo comentario
              </button>
            )}

            {cargando ? (
              <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>Cargando…</p>
            ) : hilos.length === 0 ? (
              <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>Todavía no has enviado nada.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '40vh', overflowY: 'auto' }}>
                {hilos.map((h) => {
                  const ultimo = h.mensajes[h.mensajes.length - 1];
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setHiloAbierto(h.id)}
                      style={{
                        textAlign: 'left', background: 'var(--fondo-caja)', border: '1px solid var(--borde)',
                        borderRadius: 8, padding: '0.6rem 0.75rem', cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: COLOR_TIPO[h.tipo] }}>{ETIQUETA_TIPO[h.tipo]}</span>
                        <span style={{ fontSize: '0.68rem', color: h.estado === 'resuelto' ? 'var(--verde)' : 'var(--topo-claro)', fontWeight: 600 }}>
                          {h.estado === 'resuelto' ? 'Resuelto' : 'Abierto'}
                        </span>
                      </div>
                      <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem', color: 'var(--negro)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ultimo?.texto}
                      </p>
                      <p style={{ margin: '0.15rem 0 0', fontSize: '0.68rem', color: 'var(--topo-claro)' }}>{formatoFechaHora(h.actualizadoEn)}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {error && <div className={styles.loginError} style={{ marginTop: '0.75rem' }}>{error}</div>}

        <div className={styles.modalAcciones}>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
