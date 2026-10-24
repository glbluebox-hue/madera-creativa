import type { ElementoCalendario } from './calendario-modelo.js';
import { CalendarioElementoChip } from './calendario-elemento-chip.js';
import styles from './styles.module.css';

/**
 * Rango de la rejilla horaria — horario laboral extendido (7h-21h), no las
 * 24h completas, para que la vista quepa sin obligar a un scroll enorme
 * cuando casi toda la actividad real cae en este tramo.
 */
const PRIMERA_HORA = 7;
const ULTIMA_HORA = 21;
const ALTO_FRANJA = 52;

function horaNumerica(hora: string): number {
  return Number(hora.slice(0, 2));
}

/**
 * Vista diaria (23/10/2026) — rejilla por franjas horarias (estilo Google
 * Calendar/Outlook), sustituye a la lista plana anterior. Solo Evento/
 * Recordatorio tienen `hora` (ver `ElementoCalendario` en
 * `calendario-modelo.ts`) — el resto (Nota, Tarea, Factura, Cliente,
 * Proyecto) se queda arriba, en la franja "Todo el día", igual que se
 * mostraba todo junto antes de este cambio.
 *
 * Tocar una franja horaria vacía crea un elemento nuevo con esa hora ya
 * puesta (`onCrearConHora`, ver `CalendarioCrearModal`/`horaInicial`);
 * tocar un elemento concreto lo abre sin cambios — `CalendarioElementoChip`
 * ya para la propagación del clic, mismo patrón ya usado en
 * `calendario-mes.tsx`/`calendario-semana.tsx`.
 *
 * `duracionMin` no se usa todavía para un alto proporcional de la franja
 * (un evento largo se queda en su hora de inicio, sin extenderse
 * visualmente) — mejora futura, no bloqueante para que la rejilla básica
 * funcione bien.
 */
export function CalendarioDia({ elementos, onAbrirElemento, onCrear, onCrearConHora }: {
  elementos: ElementoCalendario[];
  onAbrirElemento: (elemento: ElementoCalendario) => void;
  /** Franja "Todo el día" vacía, o botón general de abajo. */
  onCrear: () => void;
  /** Franja horaria vacía de la rejilla — p. ej. "09:00". */
  onCrearConHora: (hora: string) => void;
}) {
  const sinHora = elementos.filter((el) => !el.hora);
  const conHora = elementos.filter((el) => el.hora);

  const horas: number[] = [];
  for (let h = PRIMERA_HORA; h <= ULTIMA_HORA; h++) horas.push(h);

  return (
    <div className={styles.panel} style={{ minHeight: 320 }}>
      <div style={{ marginBottom: '0.9rem' }}>
        <p style={{ margin: '0 0 0.35rem', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--topo-muy-claro)' }}>
          Todo el día
        </p>
        {sinHora.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo-claro)' }}>Nada apuntado sin hora.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sinHora.map((el) => (
              <CalendarioElementoChip key={el.id} elemento={el} onAbrir={onAbrirElemento} />
            ))}
          </div>
        )}
      </div>

      <div style={{ border: '1px solid var(--borde)', borderRadius: 8, overflow: 'hidden' }}>
        {horas.map((h) => {
          const deEstaHora = conHora.filter((el) => horaNumerica(el.hora!) === h);
          const etiqueta = `${String(h).padStart(2, '0')}:00`;
          return (
            <div
              key={h}
              onClick={() => onCrearConHora(etiqueta)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onCrearConHora(etiqueta); }}
              style={{
                display: 'flex', alignItems: 'stretch', minHeight: ALTO_FRANJA, cursor: 'pointer',
                borderTop: h === PRIMERA_HORA ? 'none' : '1px solid var(--borde)',
              }}
            >
              <div style={{
                width: 52, flexShrink: 0, padding: '0.4rem 0.5rem', fontSize: '0.72rem',
                color: 'var(--topo-muy-claro)', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid var(--borde)',
              }}>
                {etiqueta}
              </div>
              <div style={{ flex: 1, padding: '0.3rem 0.5rem', display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
                {deEstaHora.map((el) => (
                  <CalendarioElementoChip key={el.id} elemento={el} onAbrir={onAbrirElemento} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }} onClick={onCrear}>
        + Añadir a este día
      </button>
    </div>
  );
}
