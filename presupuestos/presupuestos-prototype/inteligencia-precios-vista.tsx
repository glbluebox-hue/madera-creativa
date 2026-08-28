import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import * as api from './api.js';
import type { TrabajoAnalizado, AnalisisPrecio } from './inteligencia-precios.js';
import type { Empresa } from './use-empresa.js';
import { interpretarAnalisis, desviacionPuntos } from './inteligencia-precios.js';
import { calcularMetricasPorTipo } from './metricas-por-tipo.js';
import { MetricasPorTipoVista } from './metricas-por-tipo-vista.js';
import { formatoEuro, formatoFecha } from './calculos.js';
import styles from './styles.module.css';

export type InteligenciaPreciosVistaProps = {
  empresa: Empresa;
};

const COLOR_ESTADO: Record<'por_encima' | 'cerca' | 'por_debajo', string> = {
  por_encima: 'var(--verde)', cerca: 'var(--ocre)', por_debajo: 'var(--rojo)',
};
const ICONO_ESTADO: Record<'por_encima' | 'cerca' | 'por_debajo', string> = {
  por_encima: '🟢', cerca: '🟡', por_debajo: '🔴',
};

/**
 * 🧠 Centro de Inteligencia de Precios — un único "trabajo" por proyecto
 * (o por presupuesto suelto), con MARGEN REAL (proyecto finalizado,
 * ingresos ya cobrados) y/o MARGEN PREVISTO (presupuesto aceptado, precio
 * cotizado) — nunca mezclados en un único número, siempre etiquetados por
 * su origen. Ver `svc.analizarTrabajos` (backend) para la lógica de fusión.
 */
export function InteligenciaPreciosVista({ empresa }: InteligenciaPreciosVistaProps) {
  const [trabajos, setTrabajos] = useState<TrabajoAnalizado[] | null>(null);
  const [error, setError] = useState('');
  const [detalle, setDetalle] = useState<TrabajoAnalizado | null>(null);
  const [pestana, setPestana] = useState<'resumen' | 'historico'>('resumen');

  const cargar = useCallback(() => {
    setTrabajos(null);
    api.analizarInteligenciaPrecios()
      .then(setTrabajos)
      .catch((e) => setError(String(e).replace(/^Error:\s*/, '')));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (empresa.margenObjetivoPorcentaje === null) {
    return (
      <div className={styles.vacio}>
        <p style={{ fontWeight: 700, margin: '0 0 0.4rem' }}>🧠 Configura tu margen objetivo</p>
        <p>Ajustes de empresa → Margen objetivo (%). Sin él, Inteligencia de Precios no puede comparar tus trabajos con ningún objetivo.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--borde)' }}>
        <BotonPestana activa={pestana === 'resumen'} onClick={() => setPestana('resumen')}>Resumen</BotonPestana>
        <BotonPestana activa={pestana === 'historico'} onClick={() => setPestana('historico')}>Histórico</BotonPestana>
      </div>

      {error && <p style={{ color: 'var(--rojo)', fontSize: '0.85rem' }}>{error}</p>}

      {!error && trabajos === null && (
        <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>🔎 Analizando tus trabajos…</p>
      )}

      {!error && trabajos !== null && trabajos.length === 0 && (
        <div className={styles.vacio}>
          <p>Todavía no hay ningún presupuesto aceptado ni proyecto finalizado. En cuanto acabes uno con ingresos y gastos registrados, aparecerá aquí — se analiza automáticamente.</p>
        </div>
      )}

      {!error && trabajos !== null && trabajos.length > 0 && pestana === 'resumen' && (
        <ResumenInteligenciaPrecios trabajos={trabajos} empresa={empresa} onVerDetalle={setDetalle} />
      )}

      {!error && trabajos !== null && trabajos.length > 0 && pestana === 'historico' && (
        <HistoricoInteligente trabajos={trabajos} onVerDetalle={setDetalle} />
      )}

      {detalle && <DetalleTrabajo trabajo={detalle} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}

function BotonPestana({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', font: 'inherit',
        padding: '0.6rem 0.9rem', marginBottom: '-1px',
        fontSize: '0.88rem', fontWeight: 700,
        color: activa ? 'var(--topo-ink, var(--negro))' : 'var(--topo-claro)',
        borderBottom: activa ? '2px solid var(--topo-ink, var(--negro))' : '2px solid transparent',
      }}
    >
      {children}
    </button>
  );
}

/** Pestaña "Resumen" — el panel original de Inteligencia de Precios (Fase 1), sin cambios de comportamiento. */
function ResumenInteligenciaPrecios({ trabajos, empresa, onVerDetalle }: { trabajos: TrabajoAnalizado[]; empresa: Empresa; onVerDetalle: (t: TrabajoAnalizado) => void }) {
  const conMargenReal = trabajos.filter((t) => t.real?.disponible);
  const conMargenPrevisto = trabajos.filter((t) => t.previsto?.disponible);
  const analizados = trabajos.filter((t) => t.principal.disponible);
  const pendientes = trabajos.filter((t) => !t.principal.disponible);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <section style={{ background: 'var(--fondo-panel)', border: '1px solid var(--borde)', borderRadius: 10, padding: '1.1rem 1.3rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>Resumen</h3>
        <p style={{ margin: '0 0 0.85rem', fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
          <strong>{trabajos.length}</strong> trabajo{trabajos.length !== 1 ? 's' : ''} encontrado{trabajos.length !== 1 ? 's' : ''} ·{' '}
          <strong>{analizados.length}</strong> analizable{analizados.length !== 1 ? 's' : ''} ·{' '}
          <strong>{pendientes.length}</strong> necesita{pendientes.length === 1 ? '' : 'n'} más datos
        </p>

        {analizados.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
            Ninguno de tus trabajos tiene todavía margen calculable — necesitan ingresos/gastos registrados (proyecto finalizado) o un presupuesto aceptado con coste vinculado.
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
              <BloqueOrigen etiqueta="Trabajos con margen real" trabajos={conMargenReal} campo="real" objetivo={empresa.margenObjetivoPorcentaje} />
              <BloqueOrigen etiqueta="Trabajos con margen previsto" trabajos={conMargenPrevisto} campo="previsto" objetivo={empresa.margenObjetivoPorcentaje} />
            </div>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Distribución</p>
            <Distribucion analizados={analizados} />
          </>
        )}
      </section>

      <section style={{ background: 'var(--fondo-panel)', border: '1px solid var(--borde)', borderRadius: 10, padding: '1.1rem 1.3rem' }}>
        <h3 style={{ margin: '0 0 0.4rem', fontSize: '0.95rem' }}>Comparación con mercado</h3>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
          Aún no tenemos referencias de mercado para tu tipo de trabajo — puedes seguir usando tu margen objetivo mientras tanto.
        </p>
      </section>

      {analizados.length > 0 && (
        <section style={{ background: 'var(--fondo-panel)', border: '1px solid var(--borde)', borderRadius: 10, padding: '1.1rem 1.3rem' }}>
          <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.95rem' }}>Trabajos analizados</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {[...analizados].sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || '')).map((t) => {
              const p = t.principal;
              if (!p.disponible) return null;
              return (
                <button
                  key={t.id}
                  onClick={() => onVerDetalle(t)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem',
                    fontSize: '0.85rem', padding: '0.5rem 0', borderBottom: '1px solid var(--borde-fino)',
                    border: 'none', borderBottomWidth: 1, background: 'transparent', font: 'inherit', color: 'inherit',
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titulo}</span>
                  <span style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--topo-claro)' }}>{t.origenPrincipal === 'real' ? 'Margen real' : 'Margen previsto'}</span>
                    <strong style={{ color: COLOR_ESTADO[p.estado] }}>{p.margenPorcentaje.toFixed(1)}%</strong>
                    <span>{ICONO_ESTADO[p.estado]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {pendientes.length > 0 && (
        <section style={{ background: 'var(--fondo-panel)', border: '1px solid var(--borde)', borderRadius: 10, padding: '1.1rem 1.3rem' }}>
          <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.95rem' }}>⚪ Pendientes de datos</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {pendientes.map((t) => (
              <div key={t.id} style={{ fontSize: '0.82rem', padding: '0.35rem 0', borderBottom: '1px solid var(--borde-fino)' }}>
                <p style={{ margin: 0 }}>{t.titulo}</p>
                <p style={{ margin: '0.15rem 0 0', color: 'var(--topo-claro)', fontSize: '0.76rem' }}>{interpretarAnalisis(t.principal)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BloqueOrigen({ etiqueta, trabajos, campo, objetivo }: { etiqueta: string; trabajos: TrabajoAnalizado[]; campo: 'real' | 'previsto'; objetivo: number }) {
  if (trabajos.length === 0) {
    return (
      <div>
        <p style={{ margin: '0 0 0.15rem', fontSize: '0.7rem', color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{etiqueta}</p>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--topo-claro)' }}>—</p>
      </div>
    );
  }
  const margenes = trabajos.map((t) => { const a = t[campo]; return a?.disponible ? a.margenPorcentaje : 0; });
  const media = margenes.reduce((s, m) => s + m, 0) / margenes.length;
  return (
    <div>
      <p style={{ margin: '0 0 0.15rem', fontSize: '0.7rem', color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{etiqueta}</p>
      <p style={{ margin: 0, fontWeight: 800, fontSize: '1.15rem' }}>{trabajos.length}</p>
      <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: 'var(--topo-claro)' }}>Media {media.toFixed(1)}% · objetivo {objetivo.toFixed(1)}%</p>
    </div>
  );
}

function Distribucion({ analizados }: { analizados: TrabajoAnalizado[] }) {
  const porEncima = analizados.filter((t) => t.principal.disponible && t.principal.estado === 'por_encima').length;
  const cerca = analizados.filter((t) => t.principal.disponible && t.principal.estado === 'cerca').length;
  const porDebajo = analizados.filter((t) => t.principal.disponible && t.principal.estado === 'por_debajo').length;
  return (
    <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', fontSize: '0.82rem' }}>
      <span>🟢 {porEncima} por encima</span>
      <span>🟡 {cerca} cerca</span>
      <span>🔴 {porDebajo} por debajo</span>
    </div>
  );
}

// ── Pestaña "Histórico" (Fase 2B) ────────────────────────────────────────────
//
// Lista de TODOS los trabajos (Proyecto como unidad única, ver
// `svc.analizarTrabajos`) con filtros y ordenación — reutiliza exactamente
// los mismos datos y el mismo `DetalleTrabajo` que la pestaña Resumen, sin
// ningún cálculo de margen nuevo. Los trabajos con datos insuficientes se
// siguen mostrando (nunca se ocultan en silencio), marcados "⚪ Sin datos".

type FiltroOrigen = 'todos' | 'real' | 'previsto' | 'sin_datos';
type FiltroEstado = 'todos' | 'por_encima' | 'cerca' | 'por_debajo';
type OrdenHistorico = 'reciente' | 'margen_desc' | 'margen_asc' | 'desviacion';

const estiloSelect = {
  fontSize: '0.82rem', padding: '0.4rem 0.6rem', borderRadius: 8,
  border: '1px solid var(--borde)', background: 'var(--blanco)', color: 'inherit',
};

function HistoricoInteligente({ trabajos, onVerDetalle }: { trabajos: TrabajoAnalizado[]; onVerDetalle: (t: TrabajoAnalizado) => void }) {
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroOrigen, setFiltroOrigen] = useState<FiltroOrigen>('todos');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todos');
  const [orden, setOrden] = useState<OrdenHistorico>('reciente');

  const tiposDisponibles = useMemo(() => {
    const vistos = new Set<string>();
    for (const t of trabajos) if (t.tipoTrabajo) vistos.add(t.tipoTrabajo);
    return [...vistos].sort((a, b) => a.localeCompare(b));
  }, [trabajos]);

  const filtrados = useMemo(() => trabajos.filter((t) => {
    if (filtroTipo !== 'todos' && t.tipoTrabajo !== filtroTipo) return false;
    if (filtroOrigen === 'sin_datos' && t.principal.disponible) return false;
    if (filtroOrigen !== 'todos' && filtroOrigen !== 'sin_datos' && t.origenPrincipal !== filtroOrigen) return false;
    if (filtroEstado !== 'todos' && (!t.principal.disponible || t.principal.estado !== filtroEstado)) return false;
    return true;
  }), [trabajos, filtroTipo, filtroOrigen, filtroEstado]);

  const ordenados = useMemo(() => {
    const copia = [...filtrados];
    if (orden === 'margen_desc') {
      return copia.sort((a, b) => (b.principal.disponible ? b.principal.margenPorcentaje : -Infinity) - (a.principal.disponible ? a.principal.margenPorcentaje : -Infinity));
    }
    if (orden === 'margen_asc') {
      return copia.sort((a, b) => (a.principal.disponible ? a.principal.margenPorcentaje : Infinity) - (b.principal.disponible ? b.principal.margenPorcentaje : Infinity));
    }
    if (orden === 'desviacion') {
      return copia.sort((a, b) => {
        const da = desviacionPuntos(a);
        const db = desviacionPuntos(b);
        if (da === null && db === null) return 0;
        if (da === null) return 1;
        if (db === null) return -1;
        return Math.abs(db) - Math.abs(da);
      });
    }
    return copia.sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || ''));
  }, [filtrados, orden]);

  const metricasPorTipo = useMemo(() => calcularMetricasPorTipo(trabajos), [trabajos]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--topo-claro)' }}>
        Estos son tus trabajos anteriores — lo que presupuestaste, lo que realmente ocurrió y el margen que obtuviste.
      </p>

      <MetricasPorTipoVista metricas={metricasPorTipo} />

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={estiloSelect}>
          <option value="todos">Todos los tipos</option>
          {tiposDisponibles.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
        </select>
        <select value={filtroOrigen} onChange={(e) => setFiltroOrigen(e.target.value as FiltroOrigen)} style={estiloSelect}>
          <option value="todos">Real y previsto</option>
          <option value="real">Solo margen real</option>
          <option value="previsto">Solo margen previsto</option>
          <option value="sin_datos">Sin datos todavía</option>
        </select>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)} style={estiloSelect}>
          <option value="todos">Cualquier estado</option>
          <option value="por_encima">🟢 Por encima del objetivo</option>
          <option value="cerca">🟡 Cerca del objetivo</option>
          <option value="por_debajo">🔴 Por debajo del objetivo</option>
        </select>
        <div style={{ flex: 1 }} />
        <select value={orden} onChange={(e) => setOrden(e.target.value as OrdenHistorico)} style={estiloSelect}>
          <option value="reciente">Más reciente</option>
          <option value="margen_desc">Margen más alto</option>
          <option value="margen_asc">Margen más bajo</option>
          <option value="desviacion">Mayor desviación</option>
        </select>
      </div>

      {ordenados.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--topo-claro)' }}>Ningún trabajo coincide con estos filtros.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {ordenados.map((t) => <FilaHistorico key={t.id} trabajo={t} onClick={() => onVerDetalle(t)} />)}
        </div>
      )}
    </div>
  );
}

function FilaHistorico({ trabajo, onClick }: { trabajo: TrabajoAnalizado; onClick: () => void }) {
  const p = trabajo.principal;
  const desv = desviacionPuntos(trabajo);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem',
        fontSize: '0.85rem', padding: '0.7rem 0.9rem', border: '1px solid var(--borde)', borderRadius: 10,
        background: 'var(--fondo-panel)', font: 'inherit', color: 'inherit', width: '100%', textAlign: 'left', cursor: 'pointer',
      }}
    >
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{trabajo.titulo}</span>
        <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.72rem', color: 'var(--topo-claro)' }}>
          {trabajo.tipoTrabajo && <span style={{ background: 'var(--fondo)', padding: '0.1rem 0.55rem', borderRadius: 999 }}>{trabajo.tipoTrabajo}</span>}
          {trabajo.actualizado && <span>{formatoFecha(trabajo.actualizado)}</span>}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexShrink: 0 }}>
        {desv !== null && (
          <span style={{ fontSize: '0.72rem', color: desv >= 0 ? 'var(--verde)' : 'var(--rojo)' }}>
            {desv >= 0 ? '+' : ''}{desv.toFixed(1)}pt
          </span>
        )}
        {p.disponible ? (
          <>
            <span style={{ fontSize: '0.72rem', color: 'var(--topo-claro)' }}>{trabajo.origenPrincipal === 'real' ? 'Real' : 'Previsto'}</span>
            <strong style={{ color: COLOR_ESTADO[p.estado] }}>{p.margenPorcentaje.toFixed(1)}%</strong>
            <span>{ICONO_ESTADO[p.estado]}</span>
          </>
        ) : (
          <span style={{ fontSize: '0.75rem', color: 'var(--topo-claro)' }}>⚪ Sin datos</span>
        )}
      </div>
    </button>
  );
}

function DetalleTrabajo({ trabajo, onCerrar }: { trabajo: TrabajoAnalizado; onCerrar: () => void }) {
  const previsto = trabajo.previsto?.disponible ? trabajo.previsto : null;
  const real = trabajo.real?.disponible ? trabajo.real : null;

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} style={{ maxWidth: 440, padding: '1.5rem' }} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitulo}>{trabajo.titulo}</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', marginTop: '0.5rem' }}>
          {previsto && (
            <Bloque titulo="Lo que presupuestaste">
              <Fila etiqueta="Precio previsto" valor={formatoEuro(previsto.precio)} />
              <Fila etiqueta="Margen previsto" valor={`${previsto.margenPorcentaje.toFixed(1)}%`} color={COLOR_ESTADO[previsto.estado]} />
            </Bloque>
          )}

          {real && (
            <Bloque titulo="Lo que ocurrió realmente">
              <Fila etiqueta="Ingresos reales" valor={formatoEuro(real.precio)} />
              <Fila etiqueta="Coste real" valor={formatoEuro(real.costeEstimado)} />
              <Fila etiqueta="Margen real" valor={`${real.margenPorcentaje.toFixed(1)}%`} color={COLOR_ESTADO[real.estado]} />
            </Bloque>
          )}

          {previsto && real && (
            <Bloque titulo="Desviación">
              <Fila etiqueta="Margen previsto" valor={`${previsto.margenPorcentaje.toFixed(1)}%`} />
              <Fila etiqueta="Margen real" valor={`${real.margenPorcentaje.toFixed(1)}%`} />
              <Fila
                etiqueta="Desviación"
                valor={`${real.margenPorcentaje - previsto.margenPorcentaje >= 0 ? '+' : ''}${(real.margenPorcentaje - previsto.margenPorcentaje).toFixed(1)} puntos`}
                color={real.margenPorcentaje - previsto.margenPorcentaje >= 0 ? 'var(--verde)' : 'var(--rojo)'}
              />
            </Bloque>
          )}

          {!previsto && (
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)', fontStyle: 'italic' }}>Sin presupuesto previo asociado.</p>
          )}

          <div>
            <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Objetivo</p>
            <p style={{ margin: 0, fontSize: '0.88rem' }}>{interpretarAnalisis((real ?? previsto) as AnalisisPrecio, trabajo.origenPrincipal === 'real' ? 'real' : 'previsto')}</p>
          </div>
        </div>

        <button className={styles.btn} style={{ marginTop: '1.25rem', width: '100%' }} onClick={onCerrar}>Cerrar</button>
      </div>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <p style={{ margin: '0 0 0.4rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--topo-ink)' }}>{titulo}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>{children}</div>
    </div>
  );
}

function Fila({ etiqueta, valor, color }: { etiqueta: string; valor: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
      <span style={{ color: 'var(--topo-claro)' }}>{etiqueta}</span>
      <strong style={{ color: color || 'inherit' }}>{valor}</strong>
    </div>
  );
}
