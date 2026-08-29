import type { ResultadoComparables, Comparable } from './inteligencia-precios.js';
import { etiquetaNivelComparable, textoMotivoComparable } from './inteligencia-precios.js';
import { formatoEuro, formatoFecha } from './calculos.js';
import styles from './styles.module.css';

export type TrabajosComparablesProps = {
  /** `null` mientras se está cargando. El fetch ya no ocurre aquí (Fase 2E, 28/08/2026) — lo hace `AnalisisPrecioCompleto`, que también lo necesita para `evaluarPrecio()`; sin esto habría dos llamadas idénticas a `api.obtenerComparables` por cada apertura del modal. */
  resultado: ResultadoComparables | null;
  /** `true` si ya se pidieron los 10 (en vez de los 5 por defecto). */
  verMas: boolean;
  onVerMas: () => void;
};

/**
 * "Trabajos comparables" (Fase 2C) — puramente presentacional: recibe el
 * resultado ya calculado por `api.obtenerComparables` (que a su vez llama
 * al motor determinista del backend, `comparables.ts`) — cero cálculo de
 * similitud aquí, cero llamada a red aquí.
 */
export function TrabajosComparables({ resultado, verMas, onVerMas }: TrabajosComparablesProps) {
  if (resultado === null) {
    return <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo-claro)' }}>🔎 Buscando trabajos parecidos…</p>;
  }

  if (resultado.disponible === false) {
    const texto = resultado.motivo === 'sin_historico'
      ? 'Todavía no tienes trabajos anteriores suficientes con los que comparar este presupuesto.'
      : 'Este presupuesto todavía no tiene un precio con el que comparar.';
    return <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo-claro)' }}>⚪ {texto}</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {resultado.totalEvaluados < 5 && (
        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-claro)', fontStyle: 'italic' }}>
          Histórico limitado — solo {resultado.totalEvaluados} trabajo{resultado.totalEvaluados === 1 ? '' : 's'} disponible{resultado.totalEvaluados === 1 ? '' : 's'} para comparar.
        </p>
      )}
      {resultado.comparables.map((c) => <TarjetaComparable key={c.trabajo.id} comparable={c} />)}
      {!verMas && resultado.totalEvaluados > resultado.comparables.length && (
        <button
          type="button"
          className={`${styles.btn} ${styles.btnSecundario}`}
          style={{ fontSize: '0.76rem', padding: '0.35rem 0.7rem', alignSelf: 'flex-start' }}
          onClick={onVerMas}
        >
          Ver más
        </button>
      )}
    </div>
  );
}

function TarjetaComparable({ comparable }: { comparable: Comparable }) {
  const { trabajo, nivel, motivos } = comparable;
  const nivelInfo = etiquetaNivelComparable(nivel);
  const p = trabajo.principal;
  return (
    <div style={{ border: '1px solid var(--borde)', borderRadius: 10, padding: '0.65rem 0.85rem', background: 'var(--fondo-panel)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem' }}>
        <strong style={{ fontSize: '0.85rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trabajo.titulo}</strong>
        <span style={{ fontSize: '0.76rem', flexShrink: 0 }}>{nivelInfo.icono} {nivelInfo.texto}</span>
      </div>
      {motivos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
          {motivos.map((m, i) => (
            <span key={i} style={{ fontSize: '0.7rem', color: 'var(--topo-claro)', background: 'var(--fondo-caja)', padding: '0.12rem 0.55rem', borderRadius: 999 }}>
              {textoMotivoComparable(m)}
            </span>
          ))}
        </div>
      )}
      {p.disponible && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--topo-claro)' }}>
          <span>{formatoEuro(p.precio)}</span>
          <span>Margen {trabajo.origenPrincipal === 'real' ? 'real' : 'previsto'}: {p.margenPorcentaje.toFixed(1)}%</span>
          <span>{formatoFecha(trabajo.actualizado)}</span>
        </div>
      )}
    </div>
  );
}
