import { useEffect, useState } from 'react';
import { aFechaISO, agruparPorFecha, DIAS_SEMANA_CORTOS } from './calendario-modelo.js';
import type { ElementoCalendario } from './calendario-modelo.js';
import { CalendarioElementoChip } from './calendario-elemento-chip.js';
import styles from './styles.module.css';

const CONSULTA_MOVIL = '(max-width: 640px)';

/** Ver comentario gemelo en calendario-mes.tsx. */
function useEsMovil(): boolean {
  const [esMovil, setEsMovil] = useState(() => typeof window !== 'undefined' && window.matchMedia(CONSULTA_MOVIL).matches);
  useEffect(() => {
    const mq = window.matchMedia(CONSULTA_MOVIL);
    const escuchar = () => setEsMovil(mq.matches);
    mq.addEventListener('change', escuchar);
    return () => mq.removeEventListener('change', escuchar);
  }, []);
  return esMovil;
}

/**
 * Vista semanal — 7 columnas, una por día. Mismo criterio anti-desplazamiento
 * que la vista mensual (ver comentario en calendario-mes.tsx): nunca scroll
 * horizontal — por debajo de 640px, `.calendarioSemanaCelda`/
 * `.calendarioChipTexto` (`styles.module.css`) encogen la columna y ocultan
 * el texto de cada elemento, dejando solo el punto de color. Columnas con
 * `minmax(0, 1fr)` (no `1fr` a secas) por el mismo motivo que la vista
 * mensual: sin eso, el texto de un chip largo con `white-space: nowrap`
 * fuerza la rejilla entera a ensancharse más que la pantalla (reporte real,
 * captura de tablet, 31/08/2026).
 */
export function CalendarioSemana({ desde, hoy, elementos, onAbrirElemento, onVerDia, onCrearEnFecha }: {
  desde: string;
  hoy: string;
  elementos: ElementoCalendario[];
  onAbrirElemento: (elemento: ElementoCalendario) => void;
  onVerDia: (fechaIso: string) => void;
  onCrearEnFecha: (fechaIso: string) => void;
}) {
  const esMovil = useEsMovil();
  const porDia = agruparPorFecha(elementos);
  const [y, m, d] = desde.split('-').map(Number);
  const inicio = new Date(y, m - 1, d);
  const dias = Array.from({ length: 7 }, (_, i) => {
    const f = new Date(inicio);
    f.setDate(f.getDate() + i);
    return aFechaISO(f);
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
      {dias.map((fechaIso, i) => {
        const esHoy = fechaIso === hoy;
        const dia = Number(fechaIso.split('-')[2]);
        const items = porDia.get(fechaIso) ?? [];
        return (
          <div
            key={fechaIso}
            onClick={() => (esMovil ? onVerDia(fechaIso) : onCrearEnFecha(fechaIso))}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') (esMovil ? onVerDia(fechaIso) : onCrearEnFecha(fechaIso)); }}
            className={styles.calendarioSemanaCelda}
            style={{
              minHeight: 220, borderRadius: 8, padding: '0.5rem',
              background: 'var(--fondo-panel)', border: esHoy ? '1.5px solid var(--topo)' : '1px solid var(--borde)',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4,
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--topo-muy-claro)', textTransform: 'uppercase' }}>{DIAS_SEMANA_CORTOS[i]}</div>
              <div style={{ fontSize: '1rem', fontWeight: esHoy ? 800 : 600, color: esHoy ? 'var(--topo)' : 'var(--negro)' }}>{dia}</div>
            </div>
            <div className={styles.calendarioDiaChips}>
              {items.map((el) => (
                <CalendarioElementoChip key={el.id} elemento={el} onAbrir={onAbrirElemento} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
