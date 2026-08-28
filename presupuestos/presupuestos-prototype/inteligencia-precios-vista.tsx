import { useState, useEffect, useCallback, type ReactNode } from 'react';
import * as api from './api.js';
import type { TrabajoAnalizado, AnalisisPrecio } from './inteligencia-precios.js';
import type { Empresa } from './use-empresa.js';
import { interpretarAnalisis } from './inteligencia-precios.js';
import { formatoEuro } from './calculos.js';
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

  if (error) return <p style={{ color: 'var(--rojo)', fontSize: '0.85rem' }}>{error}</p>;

  if (trabajos === null) {
    return <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>🔎 Analizando tus trabajos…</p>;
  }

  if (trabajos.length === 0) {
    return (
      <div className={styles.vacio}>
        <p>Todavía no hay ningún presupuesto aceptado ni proyecto finalizado. En cuanto acabes uno con ingresos y gastos registrados, aparecerá aquí — se analiza automáticamente.</p>
      </div>
    );
  }

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
                  onClick={() => setDetalle(t)}
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

      {detalle && <DetalleTrabajo trabajo={detalle} onCerrar={() => setDetalle(null)} />}
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
