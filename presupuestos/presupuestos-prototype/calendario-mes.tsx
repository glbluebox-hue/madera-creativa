import { aFechaISO, agruparPorFecha, DIAS_SEMANA_CORTOS } from './calendario-modelo.js';
import type { ElementoCalendario } from './calendario-modelo.js';
import { CalendarioElementoChip } from './calendario-elemento-chip.js';
import styles from './styles.module.css';

const MAX_VISIBLES_POR_DIA = 3;

/**
 * Vista mensual — rejilla de 6 semanas × 7 días (siempre 6 filas, para que
 * la altura no "salte" entre meses de 4 o 5 semanas). Nunca desplaza en
 * horizontal (reporte real del usuario: "se ve muy grande y hay que
 * desplazarse, los recuadros son muy grandes") — un primer intento con
 * scroll horizontal + ancho mínimo por columna quedó peor, no mejor: en
 * vez de eso, `.calendarioDiaCelda`/`.calendarioChipTexto`
 * (`styles.module.css`, `@media (max-width: 640px)`) encogen la celda y
 * ocultan el texto de cada elemento por debajo de ese ancho, dejando solo
 * el punto de color — así las 7 columnas siempre caben sin desplazarse,
 * y tocar un punto sigue abriendo su elemento igual que en escritorio.
 */
export function CalendarioMes({ desde, hasta, hoy, mesActual, elementos, onAbrirElemento, onVerDia, onCrearEnFecha }: {
  desde: string;
  hasta: string;
  hoy: string;
  /** Mes que se está mostrando (0-11) — para atenuar los días de relleno de meses adyacentes. */
  mesActual: number;
  elementos: ElementoCalendario[];
  onAbrirElemento: (elemento: ElementoCalendario) => void;
  onVerDia: (fechaIso: string) => void;
  onCrearEnFecha: (fechaIso: string) => void;
}) {
  const porDia = agruparPorFecha(elementos);
  const dias: string[] = [];
  const [ay, am, ad] = desde.split('-').map(Number);
  const cursor = new Date(ay, am - 1, ad);
  const [by, bm, bd] = hasta.split('-').map(Number);
  const fin = new Date(by, bm - 1, bd);
  while (cursor <= fin) {
    dias.push(aFechaISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '0.4rem' }}>
        {DIAS_SEMANA_CORTOS.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--topo-muy-claro)', textTransform: 'uppercase', letterSpacing: '0.03em', padding: '0.3rem 0' }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {dias.map((fechaIso) => {
          const [, m, d] = fechaIso.split('-').map(Number);
          const delMesActual = (m - 1) === mesActual;
          const esHoy = fechaIso === hoy;
          const items = porDia.get(fechaIso) ?? [];
          const visibles = items.slice(0, MAX_VISIBLES_POR_DIA);
          const restantes = items.length - visibles.length;
          return (
            <div
              key={fechaIso}
              onClick={() => onCrearEnFecha(fechaIso)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onCrearEnFecha(fechaIso); }}
              className={styles.calendarioDiaCelda}
              style={{
                minHeight: 92, borderRadius: 8, padding: '0.35rem',
                background: delMesActual ? 'var(--fondo-panel)' : 'var(--fondo)',
                border: esHoy ? '1.5px solid var(--topo)' : '1px solid var(--borde)',
                opacity: delMesActual ? 1 : 0.55,
                cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2,
              }}
            >
              <span style={{ fontSize: '0.78rem', fontWeight: esHoy ? 800 : 600, color: esHoy ? 'var(--topo)' : 'var(--negro)', marginBottom: 2 }}>
                {d}
              </span>
              <div className={styles.calendarioDiaChips}>
                {visibles.map((el) => (
                  <CalendarioElementoChip key={el.id} elemento={el} compacto onAbrir={onAbrirElemento} />
                ))}
              </div>
              {restantes > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onVerDia(fechaIso); }}
                  className={styles.filtroPill}
                  style={{ fontSize: '0.66rem', padding: '0.1rem 0.4rem', alignSelf: 'flex-start', marginTop: 1 }}
                >
                  +{restantes} más
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
