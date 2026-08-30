import { CONFIG_TIPO_CALENDARIO } from './calendario-modelo.js';
import type { ElementoCalendario } from './calendario-modelo.js';
import { COLOR_PRIORIDAD } from './notas-modelo.js';
import styles from './styles.module.css';

/**
 * Una fila/chip de un elemento del Calendario — mismo componente en la
 * vista mensual (compacto, dentro de una celda de día), semanal y diaria
 * (más ancho, con hora si la tiene). El punto de color es la
 * diferenciación visual principal que pide el encargo — sin iconos
 * distintos por categoría, para no sobrecargar la interfaz. Para una
 * 'nota', el punto usa el color de SU PROPIA prioridad (alta/media/baja,
 * mismos colores que en la sección Notas — `notas-modelo.ts`) en vez del
 * color genérico de "nota", para que la prioridad se vea de un vistazo
 * también desde el Calendario (petición explícita del usuario, 30/08/2026).
 *
 * Por debajo de 640px de ancho (`styles.module.css`, clases
 * `calendarioChipBoton`/`calendarioChipTexto`), el texto se oculta y solo
 * queda el punto — así 7 columnas de mes/semana caben siempre sin
 * necesitar desplazamiento horizontal (reporte real: "se ve muy grande y
 * hay que desplazarse"). Tocar el punto sigue abriendo el elemento igual.
 */
export function CalendarioElementoChip({ elemento, compacto, onAbrir }: {
  elemento: ElementoCalendario;
  /** Vista mensual: una línea, sin subtítulo, texto más pequeño. */
  compacto?: boolean;
  onAbrir: (elemento: ElementoCalendario) => void;
}) {
  const config = CONFIG_TIPO_CALENDARIO[elemento.tipo];
  const colorPunto = elemento.tipo === 'nota' && elemento.prioridad ? COLOR_PRIORIDAD[elemento.prioridad] : config.color;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onAbrir(elemento); }}
      title={`${config.etiqueta}: ${elemento.titulo}`}
      className={styles.calendarioChipBoton}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%',
        textAlign: 'left', background: 'var(--fondo)', border: 'none',
        borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
        padding: compacto ? '0.15rem 0.4rem' : '0.45rem 0.6rem',
        fontSize: compacto ? '0.7rem' : '0.82rem',
        opacity: elemento.hecha ? 0.5 : 1,
      }}
    >
      <span aria-hidden="true" className={styles.calendarioChipPunto} style={{ width: 7, height: 7, borderRadius: '50%', background: colorPunto, flexShrink: 0 }} />
      {!compacto && elemento.hora && (
        <span className={styles.calendarioChipTexto} style={{ color: 'var(--topo-muy-claro)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{elemento.hora}</span>
      )}
      <span className={styles.calendarioChipTexto} style={{
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: 'var(--negro)', textDecoration: elemento.hecha ? 'line-through' : 'none',
      }}>
        {elemento.titulo}
      </span>
      {!compacto && elemento.subtitulo && (
        <span className={`${styles.pillEstadoFin} ${styles.calendarioChipTexto}`} style={{ marginLeft: 'auto', flexShrink: 0, fontSize: '0.68rem' }}>{elemento.subtitulo}</span>
      )}
    </button>
  );
}
