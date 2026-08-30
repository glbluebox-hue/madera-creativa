import type { ElementoCalendario } from './calendario-modelo.js';
import { CalendarioElementoChip } from './calendario-elemento-chip.js';
import styles from './styles.module.css';

/** Vista diaria — lista simple de todo lo que hay ese día, con hora cuando la tiene. */
export function CalendarioDia({ elementos, onAbrirElemento, onCrear }: {
  elementos: ElementoCalendario[];
  onAbrirElemento: (elemento: ElementoCalendario) => void;
  onCrear: () => void;
}) {
  return (
    <div className={styles.panel} style={{ minHeight: 320 }}>
      {elementos.length === 0 ? (
        <div className={styles.vacio} style={{ padding: '2rem 1rem' }}>
          <p>Nada por aquí todavía.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {elementos.map((el) => (
            <CalendarioElementoChip key={el.id} elemento={el} onAbrir={onAbrirElemento} />
          ))}
        </div>
      )}
      <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }} onClick={onCrear}>
        + Añadir a este día
      </button>
    </div>
  );
}
