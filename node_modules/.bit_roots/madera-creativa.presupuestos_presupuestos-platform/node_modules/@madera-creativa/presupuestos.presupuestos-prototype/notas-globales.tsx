import { useState, useEffect, useCallback } from 'react';
import { generarId } from './mock.js';
import { formatoFecha } from './calculos.js';
import { useDictado, BtnMicrofono } from './use-dictado.js';
import styles from './styles.module.css';

/** Una nota global (no asociada a cliente). */
export type NotaGlobal = {
  id: string;
  fecha: string;
  texto: string;
  color?: string;
};

const STORAGE_KEY = 'mc_notas_globales';

const COLORES = ['#fffbe6', '#e8f5e9', '#e3f2fd', '#fce4ec', '#f3e5f5', '#fff3e0'];

function cargarNotas(): NotaGlobal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NotaGlobal[]) : [];
  } catch {
    return [];
  }
}

function persistir(notas: NotaGlobal[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notas)); } catch { /* ignore */ }
}

/**
 * Sección de notas globales de la app (página principal).
 * Las notas se guardan en localStorage y persisten entre sesiones.
 * Incluye dictado por voz, edición y colores de fondo.
 */
export function NotasGlobales() {
  const [notas, setNotas] = useState<NotaGlobal[]>(cargarNotas);
  const [texto, setTexto] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicion, setTextoEdicion] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [colorNueva, setColorNueva] = useState(COLORES[0]);

  // Persistir cada vez que cambian las notas
  useEffect(() => { persistir(notas); }, [notas]);

  const anadir = () => {
    if (!texto.trim()) return;
    const nueva: NotaGlobal = {
      id: generarId(),
      fecha: new Date().toISOString(),
      texto: texto.trim(),
      color: colorNueva,
    };
    setNotas(prev => [nueva, ...prev]);
    setTexto('');
  };

  const borrar = (id: string) => setNotas(prev => prev.filter(n => n.id !== id));

  const iniciarEdicion = (n: NotaGlobal) => {
    setEditandoId(n.id);
    setTextoEdicion(n.texto);
  };

  const guardarEdicion = () => {
    if (!textoEdicion.trim()) return;
    setNotas(prev => prev.map(n => n.id === editandoId ? { ...n, texto: textoEdicion.trim() } : n));
    setEditandoId(null);
    setTextoEdicion('');
  };

  // Dictado nueva nota
  const onDictadoNueva = useCallback((t: string) => {
    setTexto(prev => (prev ? prev + ' ' : '') + t.trim());
  }, []);
  const dictadoNueva = useDictado(onDictadoNueva);

  // Dictado edición
  const onDictadoEdicion = useCallback((t: string) => {
    setTextoEdicion(prev => (prev ? prev + ' ' : '') + t.trim());
  }, []);
  const dictadoEdicion = useDictado(onDictadoEdicion);

  const notasFiltradas = notas.filter(n =>
    !busqueda.trim() || n.texto.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className={styles.tabPanel} style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <h2 className={styles.h2} style={{ margin: 0 }}>📋 Notas</h2>
        {notas.length > 3 && (
          <input
            className={styles.input}
            style={{ width: 200, fontSize: '0.82rem' }}
            placeholder="🔍 Buscar nota…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        )}
      </div>

      {/* Área nueva nota */}
      <div style={{
        background: colorNueva, border: '1px solid var(--borde)', borderRadius: 12,
        padding: '1rem', marginBottom: '1.5rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <textarea
          className={styles.input}
          placeholder={dictadoNueva.estado === 'escuchando' ? '🎤 Escuchando… habla ahora' : 'Escribe o dicta una nota rápida…'}
          value={texto + (dictadoNueva.interino ? ` ${dictadoNueva.interino}` : '')}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); anadir(); } }}
          rows={3}
          style={{ width: '100%', resize: 'vertical', background: 'transparent', border: '1px solid rgba(0,0,0,0.1)', marginBottom: '0.6rem' }}
        />

        {/* Paleta de colores + acciones */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Colores */}
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {COLORES.map(c => (
              <button key={c} onClick={() => setColorNueva(c)}
                title="Color de fondo"
                style={{
                  width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: colorNueva === c ? '2.5px solid var(--topo)' : '1.5px solid rgba(0,0,0,0.12)',
                  transform: colorNueva === c ? 'scale(1.2)' : 'scale(1)',
                  transition: 'transform 0.12s',
                  flexShrink: 0,
                }}
              />
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Dictado */}
          <BtnMicrofono estado={dictadoNueva.estado} onClick={dictadoNueva.toggleDictado} />

          {/* Añadir */}
          <button
            className={`${styles.btn} ${styles.btnPrimario}`}
            onClick={anadir}
            disabled={!texto.trim()}
            style={{ fontSize: '0.85rem' }}
          >
            + Añadir
          </button>
        </div>

        {dictadoNueva.estado === 'escuchando' && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: '#c0392b', fontWeight: 600 }}>
            🔴 Dictando — habla despacio. Pulsa el micro para parar.
          </p>
        )}
      </div>

      {/* Lista de notas */}
      {notasFiltradas.length === 0 ? (
        <div className={styles.tabVacio}>
          <div className={styles.tabVacioIcono}>📋</div>
          <p>{busqueda ? 'Sin notas que coincidan.' : 'Sin notas todavía.\nPulsa el micrófono y habla, o escribe arriba.'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {notasFiltradas.map(n => (
            <div key={n.id}
              style={{
                background: n.color ?? '#fffbe6',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 10,
                padding: '0.85rem',
                boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                display: 'flex', flexDirection: 'column', gap: '0.4rem',
                position: 'relative',
              }}
            >
              <span style={{ fontSize: '0.65rem', color: 'var(--topo-claro)', fontWeight: 600 }}>
                {formatoFecha(n.fecha)}
              </span>

              {editandoId === n.id ? (
                <>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <textarea
                      className={styles.input}
                      value={textoEdicion + (dictadoEdicion.interino ? ` ${dictadoEdicion.interino}` : '')}
                      onChange={e => setTextoEdicion(e.target.value)}
                      rows={3}
                      style={{ flex: 1, resize: 'vertical', background: 'rgba(255,255,255,0.6)' }}
                      autoFocus
                    />
                    <BtnMicrofono estado={dictadoEdicion.estado} onClick={dictadoEdicion.toggleDictado} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ flex: 1, justifyContent: 'center', fontSize: '0.78rem' }} onClick={guardarEdicion}>✅ Guardar</button>
                    <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem' }} onClick={() => setEditandoId(null)}>✕</button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.55, whiteSpace: 'pre-wrap', color: 'var(--negro)', flex: 1 }}>
                    {n.texto}
                  </p>
                  <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--topo-claro)', fontSize: '0.72rem', padding: '2px 6px' }}
                      onClick={() => iniciarEdicion(n)}>✏️</button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--topo-claro)', fontSize: '0.72rem', padding: '2px 6px' }}
                      onClick={() => borrar(n.id)}>🗑</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
