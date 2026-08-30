import { CONFIG_TIPO_CALENDARIO } from './calendario-modelo.js';
import type { ElementoCalendario } from './calendario-modelo.js';
import styles from './styles.module.css';

/**
 * Una fila/chip de un elemento del Calendario — mismo componente en la
 * vista mensual (compacto, dentro de una celda de día), semanal y diaria
 * (más ancho, con hora si la tiene). El punto de color por tipo es la
 * única "diferenciación visual por tipo" que pide el encargo — sin iconos
 * distintos por categoría, para no sobrecargar la interfaz.
 */
export function CalendarioElementoChip({ elemento, compacto, onAbrir }: {
  elemento: ElementoCalendario;
  /** Vista mensual: una línea, sin subtítulo, texto más pequeño. */
  compacto?: boolean;
  onAbrir: (elemento: ElementoCalendario) => void;
}) {
  const config = CONFIG_TIPO_CALENDARIO[elemento.tipo];
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onAbrir(elemento); }}
      title={`${config.etiqueta}: ${elemento.titulo}`}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%',
        textAlign: 'left', background: 'var(--fondo)', border: 'none',
        borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
        padding: compacto ? '0.15rem 0.4rem' : '0.45rem 0.6rem',
        fontSize: compacto ? '0.7rem' : '0.82rem',
        opacity: elemento.hecha ? 0.5 : 1,
      }}
    >
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: config.color, flexShrink: 0 }} />
      {!compacto && elemento.hora && (
        <span style={{ color: 'var(--topo-muy-claro)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{elemento.hora}</span>
      )}
      <span style={{
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: 'var(--negro)', textDecoration: elemento.hecha ? 'line-through' : 'none',
      }}>
        {elemento.titulo}
      </span>
      {!compacto && elemento.subtitulo && (
        <span className={styles.pillEstadoFin} style={{ marginLeft: 'auto', flexShrink: 0, fontSize: '0.68rem' }}>{elemento.subtitulo}</span>
      )}
    </button>
  );
}
