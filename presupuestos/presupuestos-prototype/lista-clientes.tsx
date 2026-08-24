import { useMemo, useState } from 'react';
import type { ProyectoResumen } from './api.js';
import { colorAvatar, iniciales } from './avatar-utils.js';
import { etiquetaEstado, grupoEstado } from './estado-utils.js';
import styles from './styles.module.css';

/** Props de la lista de proyectos. */
export type ListaClientesProps = {
  /** Proyectos a mostrar, con el nombre de su cliente ya resuelto. */
  clientes: ProyectoResumen[];
  /** Se llama al pulsar el botón de nuevo proyecto. */
  onNuevo: () => void;
  /** Se llama al seleccionar una ficha de proyecto. */
  onAbrir: (id: string) => void;
  /** true si quedan más clientes por cargar (Incremento 1.5). */
  hayMas?: boolean;
  /** true mientras se carga la siguiente página. */
  cargandoMas?: boolean;
  /** Se llama al pulsar "Cargar más". */
  onCargarMas?: () => void;
};

type Filtro = 'todos' | 'fin';

/**
 * Vista principal: lista de proyectos con avatar del cliente, nombre del
 * proyecto e insignia de estado — búsqueda y filtro por estado sobre los
 * proyectos ya cargados. Cada fila es un PROYECTO, no un cliente
 * (incremento "Cliente ≠ Proyecto", 20/08/2026): un mismo cliente puede
 * aparecer en varias filas si tiene varios proyectos.
 *
 * "Todos" muestra los proyectos activos (presupuestado/en curso) — los
 * finalizados o no aceptados se archivan fuera de la vista por defecto y
 * solo se ven en "Finalizados" (petición del usuario, 20/08/2026: un
 * proyecto cerrado no debe quedarse mezclado con el trabajo activo). La
 * insignia de estado de cada fila permite distinguir presupuestado/en
 * curso sin entrar en la ficha, así que no hace falta un filtro aparte
 * para eso.
 */
export function ListaClientes({ clientes, onNuevo, onAbrir, hayMas, cargandoMas, onCargarMas }: ListaClientesProps) {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return clientes.filter((c) => {
      if (grupoEstado[c.estado] !== (filtro === 'fin' ? 'fin' : 'curso')) return false;
      if (q && !c.nombre.toLowerCase().includes(q) && !(c.proyecto || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [clientes, busqueda, filtro]);

  return (
    <div>
      <div className={styles.clientesCabecera}>
        <div className={styles.clientesBusqueda}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="text"
            placeholder="Buscar cliente o proyecto…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {/* El botón "+ Nueva ficha" vive junto a los filtros, no junto a la
          búsqueda — en móvil, esa fila queda justo debajo del botón fijo de
          menú (esquina superior derecha) y los dos círculos se solapaban,
          dejando el "+" sin poder pulsarse (fallo real reportado). */}
      <div className={styles.filtrosPill}>
        <button className={`${styles.filtroPill} ${filtro === 'todos' ? styles.filtroPillActivo : ''}`} onClick={() => setFiltro('todos')}>Todos</button>
        <button className={`${styles.filtroPill} ${filtro === 'fin' ? styles.filtroPillActivo : ''}`} onClick={() => setFiltro('fin')}>Finalizados</button>
        <button className={styles.btnCirculoOscuro} onClick={onNuevo} title="Nuevo proyecto" style={{ marginLeft: 'auto' }} data-tutorial-id="nuevo-cliente-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </div>

      {clientes.length === 0 ? (
        <div className={styles.vacio}>
          <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
          </div>
          <p>Aún no tienes ningún proyecto.</p>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={onNuevo}>
            Crear mi primer proyecto
          </button>
        </div>
      ) : visibles.length === 0 ? (
        <div className={styles.vacio}>
          <p>Ningún cliente coincide con la búsqueda o el filtro.</p>
        </div>
      ) : (
        <div className={styles.listaClientesFilas}>
          {visibles.map((c) => (
            <div key={c.id} className={styles.clienteFila} onClick={() => onAbrir(c.id)}>
              <div className={styles.clienteAvatar} style={{ background: colorAvatar(c.clienteId) }}>{iniciales(c.nombre)}</div>
              <div className={styles.clienteFilaCuerpo}>
                <span className={styles.clienteFilaNombre}>{c.nombre}</span>
                <span className={styles.clienteFilaSub}>{c.proyecto || 'Sin proyecto definido'}</span>
              </div>
              <span className={`${styles.pillEstado} ${grupoEstado[c.estado] === 'curso' ? styles.pillEstadoCurso : styles.pillEstadoFin}`}>
                {etiquetaEstado[c.estado]}
              </span>
              <svg className={styles.clienteFilaChevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </div>
          ))}
        </div>
      )}

      {hayMas && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.25rem' }}>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCargarMas} disabled={cargandoMas}>
            {cargandoMas ? 'Cargando…' : 'Cargar más'}
          </button>
        </div>
      )}
    </div>
  );
}
