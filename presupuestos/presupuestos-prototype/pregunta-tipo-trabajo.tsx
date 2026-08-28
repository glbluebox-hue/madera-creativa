import { useState } from 'react';
import styles from './styles.module.css';

export type PreguntaTipoTrabajoProps = {
  /** El valor elegido (de las opciones o texto libre tras "Otro"), ya recortado. */
  onConfirmar: (valor: string) => void;
  onSaltar: () => void;
};

const OPCIONES = [
  { emoji: '🍳', valor: 'Cocina' },
  { emoji: '🚪', valor: 'Armario' },
  { emoji: '👗', valor: 'Vestidor' },
  { emoji: '🪑', valor: 'Mueble' },
];

/**
 * "¿Qué tipo de trabajo has realizado?" (Histórico Inteligente, Fase 2A)
 * — pregunta corta y siempre saltable, nunca un formulario de
 * administración aparte. Se muestra al marcar un proyecto como
 * "Finalizado" (`ficha-cliente.tsx`) SOLO si todavía no tiene la
 * característica `tipoTrabajo` guardada; nunca bloquea el cambio de
 * estado, que ya se ha guardado antes de que este modal aparezca.
 */
export function PreguntaTipoTrabajo({ onConfirmar, onSaltar }: PreguntaTipoTrabajoProps) {
  const [otro, setOtro] = useState(false);
  const [textoLibre, setTextoLibre] = useState('');

  return (
    <div className={styles.overlay} onClick={onSaltar}>
      <div className={styles.modal} style={{ maxWidth: 380, padding: '1.5rem' }} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitulo}>¿Qué tipo de trabajo has realizado?</h2>
        <p style={{ margin: '0.3rem 0 1rem', fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
          Nos ayuda a construir tu histórico de precios — puedes saltarlo si prefieres.
        </p>

        {!otro ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {OPCIONES.map((o) => (
              <button
                key={o.valor}
                className={`${styles.btn} ${styles.btnSecundario}`}
                onClick={() => onConfirmar(o.valor)}
              >
                {o.emoji} {o.valor}
              </button>
            ))}
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => setOtro(true)}>
              ➕ Otro
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              className={styles.input}
              autoFocus
              placeholder="Describe el tipo de trabajo"
              value={textoLibre}
              onChange={(e) => setTextoLibre(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && textoLibre.trim()) onConfirmar(textoLibre.trim()); }}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button
              className={`${styles.btn} ${styles.btnPrimario}`}
              disabled={!textoLibre.trim()}
              onClick={() => onConfirmar(textoLibre.trim())}
            >
              Guardar
            </button>
          </div>
        )}

        <button className={styles.btn} style={{ marginTop: '1rem', width: '100%' }} onClick={onSaltar}>
          Saltar
        </button>
      </div>
    </div>
  );
}
