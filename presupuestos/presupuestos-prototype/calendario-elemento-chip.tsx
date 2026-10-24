import { useEffect, useRef, useState } from 'react';
import { CONFIG_TIPO_CALENDARIO } from './calendario-modelo.js';
import type { ElementoCalendario } from './calendario-modelo.js';
import { COLOR_PRIORIDAD } from './notas-modelo.js';
import styles from './styles.module.css';

/** Mantener pulsado un punto antes de considerarlo "long-press" y no un toque normal. */
const RETARDO_PULSACION_LARGA_MS = 450;
/** Si el dedo se mueve más de esto durante la espera, se interpreta como scroll, no como mantener pulsado. */
const TOLERANCIA_MOVIMIENTO_PX = 10;

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
 *
 * Previsualización al mantener pulsado (petición del usuario, 24/10/2026:
 * "en vista móvil se ven solo como puntos, no hay manera de ver más
 * directamente lo que hay apuntado cada día") — mantener el dedo sobre el
 * punto (o pasar el ratón en escritorio) muestra una burbuja flotante con
 * el mismo texto que ya tenía el `title` nativo del navegador (que no
 * funciona bien al tacto en móvil, de ahí que hiciera falta una burbuja
 * propia). Soltar sin moverse abre el elemento igual que un toque normal;
 * si llegó a completarse la espera de "pulsación larga", se suprime el
 * click que el navegador dispara de todas formas al soltar, para no abrir
 * el elemento además de haber mostrado la burbuja.
 */
export function CalendarioElementoChip({ elemento, compacto, onAbrir }: {
  elemento: ElementoCalendario;
  /** Vista mensual: una línea, sin subtítulo, texto más pequeño. */
  compacto?: boolean;
  onAbrir: (elemento: ElementoCalendario) => void;
}) {
  const config = CONFIG_TIPO_CALENDARIO[elemento.tipo];
  const colorPunto = elemento.tipo === 'nota' && elemento.prioridad ? COLOR_PRIORIDAD[elemento.prioridad] : config.color;
  const textoPrevisualizacion = `${config.etiqueta}: ${elemento.titulo}${elemento.subtitulo ? ` · ${elemento.subtitulo}` : ''}`;

  const botonRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inicioTactilRef = useRef<{ x: number; y: number } | null>(null);
  const pulsacionLargaActivaRef = useRef(false);
  const [previsualizacion, setPrevisualizacion] = useState<{ top: number; left: number; arriba: boolean } | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const calcularPosicion = () => {
    const r = botonRef.current?.getBoundingClientRect();
    if (!r) return null;
    const arriba = r.top > 60; // suficiente hueco por encima; si no, se muestra debajo
    const left = Math.min(Math.max(r.left, 8), window.innerWidth - 8);
    const top = arriba ? r.top - 8 : r.bottom + 8;
    return { top, left, arriba };
  };

  const mostrarPrevisualizacion = () => setPrevisualizacion(calcularPosicion());
  const ocultarPrevisualizacion = () => setPrevisualizacion(null);

  const cancelarTemporizador = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const alIniciarToque: React.TouchEventHandler<HTMLButtonElement> = (e) => {
    const t = e.touches[0];
    inicioTactilRef.current = { x: t.clientX, y: t.clientY };
    pulsacionLargaActivaRef.current = false;
    cancelarTemporizador();
    timerRef.current = setTimeout(() => {
      pulsacionLargaActivaRef.current = true;
      mostrarPrevisualizacion();
    }, RETARDO_PULSACION_LARGA_MS);
  };
  const alMoverToque: React.TouchEventHandler<HTMLButtonElement> = (e) => {
    const inicio = inicioTactilRef.current;
    if (!inicio) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - inicio.x) > TOLERANCIA_MOVIMIENTO_PX || Math.abs(t.clientY - inicio.y) > TOLERANCIA_MOVIMIENTO_PX) {
      // Se mueve de verdad → es scroll de la rejilla, no "mantener pulsado": se cancela todo sin abrir ni previsualizar.
      cancelarTemporizador();
      pulsacionLargaActivaRef.current = false;
      ocultarPrevisualizacion();
      inicioTactilRef.current = null;
    }
  };
  const alSoltarToque: React.TouchEventHandler<HTMLButtonElement> = () => {
    cancelarTemporizador();
    ocultarPrevisualizacion();
    inicioTactilRef.current = null;
    // `pulsacionLargaActivaRef` se consulta (y limpia) en el propio onClick,
    // que el navegador dispara justo después de este evento.
  };

  return (
    <button
      ref={botonRef}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (pulsacionLargaActivaRef.current) { pulsacionLargaActivaRef.current = false; return; }
        onAbrir(elemento);
      }}
      onTouchStart={alIniciarToque}
      onTouchMove={alMoverToque}
      onTouchEnd={alSoltarToque}
      onTouchCancel={alSoltarToque}
      onMouseEnter={mostrarPrevisualizacion}
      onMouseLeave={ocultarPrevisualizacion}
      className={styles.calendarioChipBoton}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.4rem', width: '100%',
        textAlign: 'left', background: 'var(--fondo)', border: 'none',
        borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', position: 'relative',
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

      {previsualizacion && (
        <span
          role="tooltip"
          aria-hidden="true"
          style={{
            position: 'fixed', top: previsualizacion.top, left: previsualizacion.left,
            transform: previsualizacion.arriba ? 'translateY(-100%)' : 'none',
            maxWidth: 240, zIndex: 50, pointerEvents: 'none',
            background: 'var(--negro)', color: '#fff', fontSize: '0.75rem', fontWeight: 500,
            padding: '0.4rem 0.6rem', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            whiteSpace: 'normal', lineHeight: 1.35,
          }}
        >
          {textoPrevisualizacion}
        </span>
      )}
    </button>
  );
}
