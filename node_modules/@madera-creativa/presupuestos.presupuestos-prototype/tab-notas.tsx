import { useState, useCallback } from 'react';
import type { Cliente, Nota } from './types.js';
import { generarId } from './mock.js';
import { formatoFecha } from './calculos.js';
import { useDictado, BtnMicrofono } from './use-dictado.js';
import styles from './styles.module.css';

/** Props del panel de notas del cliente. */
export type TabNotasProps = {
  /** Cliente con sus notas. */
  cliente: Cliente;
  /** Guarda los cambios. */
  onActualizar: (cliente: Cliente) => void;
};

/**
 * Pestaña "Notas": apuntes libres del proyecto con fecha automática y dictado por voz.
 */
export function TabNotas({ cliente, onActualizar }: TabNotasProps) {
  const notas = cliente.notas ?? [];
  const [texto, setTexto] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicion, setTextoEdicion] = useState('');

  const guardar = (nuevas: Nota[]) => onActualizar({ ...cliente, notas: nuevas });

  const anadir = () => {
    if (!texto.trim()) return;
    guardar([
      { id: generarId(), fecha: new Date().toISOString(), texto: texto.trim() },
      ...notas,
    ]);
    setTexto('');
  };

  const borrar = (id: string) => guardar(notas.filter((n) => n.id !== id));

  const iniciarEdicion = (n: Nota) => {
    setEditandoId(n.id);
    setTextoEdicion(n.texto);
  };

  const guardarEdicion = () => {
    if (!textoEdicion.trim()) return;
    guardar(notas.map(n => n.id === editandoId ? { ...n, texto: textoEdicion.trim() } : n));
    setEditandoId(null);
    setTextoEdicion('');
  };

  // Dictado para nueva nota
  const onDictadoNueva = useCallback((t: string) => {
    setTexto(prev => (prev ? prev + ' ' : '') + t.trim());
  }, []);
  const dictadoNueva = useDictado(onDictadoNueva);

  // Dictado para nota en edición
  const onDictadoEdicion = useCallback((t: string) => {
    setTextoEdicion(prev => (prev ? prev + ' ' : '') + t.trim());
  }, []);
  const dictadoEdicion = useDictado(onDictadoEdicion);

  return (
    <div className={styles.tabPanel}>
      <h3 style={{ margin: '0 0 1rem' }}>📝 Notas del proyecto</h3>

      {/* Área nueva nota */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-end' }}>
          <textarea
            className={styles.input}
            placeholder={dictadoNueva.estado === 'escuchando' ? '🎤 Escuchando…' : 'Escribe o dicta una nota…'}
            value={texto + (dictadoNueva.interino ? ` ${dictadoNueva.interino}` : '')}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); anadir(); } }}
            rows={2}
            style={{ flex: 1, resize: 'vertical', minHeight: 56 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <BtnMicrofono estado={dictadoNueva.estado} onClick={dictadoNueva.toggleDictado} />
            <button
              className={`${styles.btn} ${styles.btnPrimario}`}
              onClick={anadir}
              disabled={!texto.trim()}
              style={{ height: 36, padding: '0 0.75rem', fontSize: '0.8rem' }}
            >
              Añadir
            </button>
          </div>
        </div>
        {dictadoNueva.estado === 'escuchando' && (
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#c0392b', fontWeight: 600 }}>
            🔴 Dictando — habla despacio y claro. Pulsa el micro para parar.
          </p>
        )}
      </div>

      {/* Lista de notas */}
      {notas.length === 0 ? (
        <div className={styles.tabVacio}>
          <div className={styles.tabVacioIcono}>📝</div>
          <p>Sin notas todavía. Escribe o dicta la primera.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {notas.map((n) => (
            <div className={styles.notaItem} key={n.id} style={{ position: 'relative' }}>
              <span className={styles.notaFecha}>{formatoFecha(n.fecha)}</span>

              {editandoId === n.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.3rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <textarea
                      className={styles.input}
                      value={textoEdicion + (dictadoEdicion.interino ? ` ${dictadoEdicion.interino}` : '')}
                      onChange={(e) => setTextoEdicion(e.target.value)}
                      rows={2}
                      style={{ flex: 1, resize: 'vertical' }}
                      autoFocus
                    />
                    <BtnMicrofono estado={dictadoEdicion.estado} onClick={dictadoEdicion.toggleDictado} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.78rem' }} onClick={guardarEdicion}>✅ Guardar</button>
                    <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem' }} onClick={() => setEditandoId(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className={styles.notaTexto} style={{ marginBottom: '0.25rem' }}>{n.texto}</p>
                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ocre)', fontSize: '0.75rem', padding: '2px 6px' }}
                      onClick={() => iniciarEdicion(n)}>✏️ Editar</button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ocre)', fontSize: '0.75rem', padding: '2px 6px' }}
                      onClick={() => borrar(n.id)}>🗑 Borrar</button>
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
