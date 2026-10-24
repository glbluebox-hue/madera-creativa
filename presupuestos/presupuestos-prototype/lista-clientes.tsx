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
 * Vista principal: lista de CLIENTES (personas), no de proyectos —
 * agrupada por `clienteId` (petición del usuario, 24/10/2026: antes cada
 * fila era un proyecto suelto y un mismo cliente con varios trabajos
 * aparecía repetido tantas veces como proyectos tuviera; confuso al
 * buscarlo). Una persona con un solo proyecto se abre directo, igual que
 * antes. Una persona con varios muestra un desplegable con sus proyectos
 * (nombre, fecha, estado) para elegir cuál abrir — nunca navega sola.
 *
 * No hace falta ninguna llamada nueva al servidor: `clientes` ya trae
 * TODOS los proyectos de golpe (`obtenerResumenProyectos`, sin paginar),
 * así que agrupar es una operación local sobre los datos ya cargados.
 *
 * "Todos" muestra los proyectos activos (presupuestado/en curso) — los
 * finalizados o no aceptados se archivan fuera de la vista por defecto y
 * solo se ven en "Finalizados" (petición del usuario, 20/08/2026: un
 * proyecto cerrado no debe quedarse mezclado con el trabajo activo). El
 * filtro de estado se aplica ANTES de agrupar: si un cliente tiene un
 * proyecto activo y otro finalizado, aparece en las dos pestañas, cada
 * vez solo con el proyecto que corresponde a ese estado.
 */
export function ListaClientes({ clientes, onNuevo, onAbrir, hayMas, cargandoMas, onCargarMas }: ListaClientesProps) {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  /** clienteId cuyo desplegable de proyectos está abierto (null = ninguno). */
  const [expandido, setExpandido] = useState<string | null>(null);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return clientes.filter((c) => {
      if (grupoEstado[c.estado] !== (filtro === 'fin' ? 'fin' : 'curso')) return false;
      if (q && !c.nombre.toLowerCase().includes(q) && !(c.proyecto || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [clientes, busqueda, filtro]);

  /**
   * Agrupa por `clienteId`, conservando el orden de primera aparición en
   * `visibles` (que ya viene ordenado por fecha desde `useProyectos`).
   * Dentro de cada grupo, el proyecto más reciente (`creado` descendente)
   * va primero — es el que se abre directo cuando hay uno solo, y el que
   * encabeza el desplegable cuando hay varios.
   */
  const grupos = useMemo(() => {
    const porCliente = new Map<string, ProyectoResumen[]>();
    const orden: string[] = [];
    for (const c of visibles) {
      if (!porCliente.has(c.clienteId)) { porCliente.set(c.clienteId, []); orden.push(c.clienteId); }
      porCliente.get(c.clienteId)!.push(c);
    }
    return orden.map((clienteId) => {
      const proyectos = [...porCliente.get(clienteId)!].sort((a, b) => b.creado.localeCompare(a.creado));
      return { clienteId, nombre: proyectos[0].nombre, proyectos };
    });
  }, [visibles]);

  const alTocarFila = (grupo: (typeof grupos)[number]) => {
    if (grupo.proyectos.length === 1) { onAbrir(grupo.proyectos[0].id); return; }
    setExpandido((actual) => (actual === grupo.clienteId ? null : grupo.clienteId));
  };

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
            data-tutorial-id="clientes-busqueda"
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
      ) : grupos.length === 0 ? (
        <div className={styles.vacio}>
          <p>Ningún cliente coincide con la búsqueda o el filtro.</p>
        </div>
      ) : (
        <div className={styles.listaClientesFilas}>
          {grupos.map((g) => {
            const unico = g.proyectos.length === 1;
            const abierto = expandido === g.clienteId;
            return (
              <div key={g.clienteId}>
                <div className={styles.clienteFila} onClick={() => alTocarFila(g)}>
                  <div className={styles.clienteAvatar} style={{ background: colorAvatar(g.clienteId) }}>{iniciales(g.nombre)}</div>
                  <div className={styles.clienteFilaCuerpo}>
                    <span className={styles.clienteFilaNombre}>{g.nombre}</span>
                    <span className={styles.clienteFilaSub}>
                      {unico ? (g.proyectos[0].proyecto || 'Sin proyecto definido') : `${g.proyectos.length} proyectos`}
                    </span>
                  </div>
                  {unico && (
                    <span className={`${styles.pillEstado} ${grupoEstado[g.proyectos[0].estado] === 'curso' ? styles.pillEstadoCurso : styles.pillEstadoFin}`}>
                      {etiquetaEstado[g.proyectos[0].estado]}
                    </span>
                  )}
                  <svg
                    className={styles.clienteFilaChevron}
                    style={!unico ? { transform: abierto ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s' } : undefined}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
                {/* Desplegable de proyectos de un cliente con varios trabajos —
                    nunca navega solo, cada fila hija elige un proyecto concreto. */}
                {!unico && abierto && (
                  <div style={{ background: 'var(--fondo)' }}>
                    {g.proyectos.map((p) => (
                      <div
                        key={p.id}
                        className={styles.clienteFila}
                        style={{ paddingLeft: '3.75rem', borderBottom: '1px solid var(--borde-fino)' }}
                        onClick={(e) => { e.stopPropagation(); onAbrir(p.id); }}
                      >
                        <div className={styles.clienteFilaCuerpo}>
                          <span className={styles.clienteFilaNombre} style={{ fontSize: '0.85rem' }}>{p.proyecto || 'Sin proyecto definido'}</span>
                        </div>
                        <span className={`${styles.pillEstado} ${grupoEstado[p.estado] === 'curso' ? styles.pillEstadoCurso : styles.pillEstadoFin}`}>
                          {etiquetaEstado[p.estado]}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
