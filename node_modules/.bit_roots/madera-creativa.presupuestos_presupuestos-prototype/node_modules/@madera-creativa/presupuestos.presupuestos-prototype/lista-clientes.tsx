import type { Cliente } from './types.js';
import styles from './styles.module.css';

/** Props de la lista de clientes. */
export type ListaClientesProps = {
  /** Clientes a mostrar. */
  clientes: Cliente[];
  /** Se llama al pulsar el botón de nuevo cliente. */
  onNuevo: () => void;
  /** Se llama al seleccionar una ficha de cliente. */
  onAbrir: (id: string) => void;
};

const etiquetaEstado: Record<Cliente['estado'], string> = {
  presupuestado: 'Presupuestado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  rechazado: 'No aceptado',
};

const colorEstado: Record<Cliente['estado'], string> = {
  presupuestado: '#e8a020',
  en_curso: '#2d7dd2',
  finalizado: '#3aaa5c',
  rechazado: '#c0392b',
};

/**
 * Vista principal: cuadrícula con todas las fichas de cliente y su margen.
 */
export function ListaClientes({ clientes, onNuevo, onAbrir }: ListaClientesProps) {
  return (
    <div>
      <div className={styles.barraSeccion}>
        <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={onNuevo}>
          + Nueva ficha de cliente
        </button>
      </div>

      {clientes.length === 0 ? (
        <div className={styles.vacio}>
          <div className={styles.vacioIcono}>📋</div>
          <p>Aún no tienes ninguna ficha de cliente.</p>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={onNuevo}>
            Crear mi primera ficha
          </button>
        </div>
      ) : (
        <div className={styles.grid}>
          {clientes.map((c) => (
            <div key={c.id} className={styles.tarjeta} onClick={() => onAbrir(c.id)}>
              <div>
                <span className={styles.estado} style={{ background: colorEstado[c.estado] ?? '#888', color: '#fff' }}>
                  {etiquetaEstado[c.estado]}
                </span>
              </div>
              <h3 className={styles.tarjetaNombre}>{c.nombre}</h3>
              <p className={styles.tarjetaProyecto}>{c.proyecto || 'Sin proyecto definido'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
