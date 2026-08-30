import { aFechaISO, agruparPorFecha, DIAS_SEMANA_CORTOS } from './calendario-modelo.js';
import type { ElementoCalendario } from './calendario-modelo.js';
import { CalendarioElementoChip } from './calendario-elemento-chip.js';

/** Vista semanal — 7 columnas, una por día, con todos sus elementos (sin límite de visibles, a diferencia de la vista mensual: hay más alto disponible por columna). */
export function CalendarioSemana({ desde, hoy, elementos, onAbrirElemento, onCrearEnFecha }: {
  desde: string;
  hoy: string;
  elementos: ElementoCalendario[];
  onAbrirElemento: (elemento: ElementoCalendario) => void;
  onCrearEnFecha: (fechaIso: string) => void;
}) {
  const porDia = agruparPorFecha(elementos);
  const [y, m, d] = desde.split('-').map(Number);
  const inicio = new Date(y, m - 1, d);
  const dias = Array.from({ length: 7 }, (_, i) => {
    const f = new Date(inicio);
    f.setDate(f.getDate() + i);
    return aFechaISO(f);
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
      {dias.map((fechaIso, i) => {
        const esHoy = fechaIso === hoy;
        const dia = Number(fechaIso.split('-')[2]);
        const items = porDia.get(fechaIso) ?? [];
        return (
          <div
            key={fechaIso}
            onClick={() => onCrearEnFecha(fechaIso)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onCrearEnFecha(fechaIso); }}
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
            {items.map((el) => (
              <CalendarioElementoChip key={el.id} elemento={el} onAbrir={onAbrirElemento} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
