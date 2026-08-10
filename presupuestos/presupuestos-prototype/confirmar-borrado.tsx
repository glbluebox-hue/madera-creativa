import { useState, type ReactNode } from 'react';
import styles from './styles.module.css';

const IconoPapelera = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

/** Props del botón de borrar con confirmación. */
export type ConfirmarBorradoProps = {
  /** Se llama solo cuando el usuario confirma el segundo clic. */
  onConfirmar: () => void;
  /** Texto de `title`/`aria-label` del botón antes de confirmar. */
  titulo?: string;
  /** Icono del botón antes de confirmar — por defecto una papelera de línea. */
  icono?: ReactNode;
  /**
   * Texto visible junto al icono antes de confirmar — por defecto el botón
   * es solo icono (uso compacto en filas/tarjetas). Con `label`, se muestra
   * como botón de peligro con texto, para sitios con más espacio (p. ej. la
   * cabecera de una ficha) donde la acción debe ser evidente sin depender
   * solo del `title`.
   */
  label?: string;
};

/**
 * Botón de borrar con confirmación de dos pasos (Incremento 1.8) — antes de
 * este componente, varios sitios de la app borraban de inmediato al primer
 * clic sin ninguna confirmación, mientras otros implementaban su propia
 * versión ligeramente distinta del mismo patrón. Un único componente para
 * todos los casos donde el borrado cabe como una fila/tarjeta con espacio
 * para dos botones (Sí/No) — donde el espacio no lo permite (p. ej. una
 * insignia circular pequeña sobre una miniatura), se mantiene un patrón de
 * confirmación propio, más compacto, documentado en el sitio donde se usa.
 */
export function ConfirmarBorrado({ onConfirmar, titulo = 'Borrar', icono = IconoPapelera, label }: ConfirmarBorradoProps) {
  const [confirmando, setConfirmando] = useState(false);

  if (confirmando) {
    return (
      <span style={{ display: 'flex', gap: '0.25rem' }}>
        <button
          className={`${styles.btn} ${styles.btnPeligro}`}
          style={label ? undefined : { fontSize: '0.72rem', padding: '2px 8px' }}
          onClick={(e) => { e.stopPropagation(); onConfirmar(); setConfirmando(false); }}
        >
          {label ? `¿Seguro? Sí, ${label.toLowerCase()}` : 'Sí'}
        </button>
        <button
          className={`${styles.btn} ${styles.btnSecundario}`}
          style={label ? undefined : { fontSize: '0.72rem', padding: '2px 8px' }}
          onClick={(e) => { e.stopPropagation(); setConfirmando(false); }}
        >
          No
        </button>
      </span>
    );
  }

  if (label) {
    return (
      <button
        className={`${styles.btn} ${styles.btnPeligro}`}
        title={titulo}
        aria-label={titulo}
        onClick={(e) => { e.stopPropagation(); setConfirmando(true); }}
      >
        {icono} {label}
      </button>
    );
  }

  return (
    <button
      className={styles.btnIcono}
      style={{ color: 'var(--rojo)' }}
      title={titulo}
      aria-label={titulo}
      onClick={(e) => { e.stopPropagation(); setConfirmando(true); }}
    >
      {icono}
    </button>
  );
}
