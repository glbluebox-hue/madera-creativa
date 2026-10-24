import { useEffect, useState } from 'react';
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
 * Tocar una franja horaria vacía arma esa hora como inicio (sin abrir nada
 * todavía); un segundo toque en OTRA franja calcula inicio/fin (el menor y
 * el mayor de las dos) y abre el formulario con la franja completa ya
 * puesta — flujo de "dos toques" en vez de arrastre (24/10/2026, decisión
 * explícita del usuario tras evaluar un gesto de arrastre tipo Google
 * Calendar: mismo resultado final, sin el riesgo de gestos táctiles en
 * conflicto con el scroll vertical de la propia rejilla en móvil). Tocar
 * la MISMA franja ya armada otra vez se trata como "un solo toque, sin
 * fin" — comportamiento de antes. Tocar un elemento concreto lo abre sin
 * cambios y limpia cualquier franja armada pendiente, para no dejar un
 * estado "fantasma" a medias — `CalendarioElementoChip` ya para la
 * propagación del clic, mismo patrón ya usado en
 * `calendario-mes.tsx`/`calendario-semana.tsx`.
 *
 * `duracionMin` no se usa todavía para un alto proporcional de la franja
 * (un evento largo se queda en su hora de inicio, sin extenderse
 * visualmente) — mejora futura, no bloqueante para que la rejilla básica
 * funcione bien.
 */
export function CalendarioDia({ fechaIso, elementos, onAbrirElemento, onCrear, onCrearConHora }: {
  /** Solo para resetear la franja armada al cambiar de día sin salir de la vista Día (flechas Anterior/Siguiente) — el componente no se desmonta en ese caso, así que el estado local no se limpia solo. */
  fechaIso: string;
  elementos: ElementoCalendario[];
  onAbrirElemento: (elemento: ElementoCalendario) => void;
  /** Franja "Todo el día" vacía, o botón general de abajo. */
  onCrear: () => void;
  /** Franja horaria vacía de la rejilla — p. ej. "09:00", con fin opcional si el usuario marcó dos franjas distintas. */
  onCrearConHora: (hora: string, horaFin?: string) => void;
}) {
  const [horaArmada, setHoraArmada] = useState<string | null>(null);

  // Cambiar de día (Anterior/Siguiente) sin salir de la vista Día reutiliza
  // la misma instancia del componente — sin esto, una franja armada en un
  // día se quedaría "pegada" al navegar a otro.
  useEffect(() => { setHoraArmada(null); }, [fechaIso]);

  const abrirYLimpiar = (elemento: ElementoCalendario) => {
    setHoraArmada(null);
    onAbrirElemento(elemento);
  };

  const alTocarFranja = (etiqueta: string) => {
    if (horaArmada === null) { setHoraArmada(etiqueta); return; }
    if (horaArmada === etiqueta) { setHoraArmada(null); onCrearConHora(etiqueta); return; }
    const [inicio, fin] = horaArmada < etiqueta ? [horaArmada, etiqueta] : [etiqueta, horaArmada];
    setHoraArmada(null);
    onCrearConHora(inicio, fin);
  };

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
              <CalendarioElementoChip key={el.id} elemento={el} onAbrir={abrirYLimpiar} />
            ))}
          </div>
        )}
      </div>

      <div style={{ border: '1px solid var(--borde)', borderRadius: 8, overflow: 'hidden' }}>
        {horas.map((h) => {
          const deEstaHora = conHora.filter((el) => horaNumerica(el.hora!) === h);
          const etiqueta = `${String(h).padStart(2, '0')}:00`;
          const armada = horaArmada === etiqueta;
          return (
            <div
              key={h}
              onClick={() => alTocarFranja(etiqueta)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') alTocarFranja(etiqueta); }}
              style={{
                display: 'flex', alignItems: 'stretch', minHeight: ALTO_FRANJA, cursor: 'pointer',
                borderTop: h === PRIMERA_HORA ? 'none' : '1px solid var(--borde)',
                background: armada ? 'var(--azul-bg)' : undefined,
                boxShadow: armada ? 'inset 0 0 0 2px var(--azul)' : undefined,
              }}
            >
              <div style={{
                width: 52, flexShrink: 0, padding: '0.4rem 0.5rem', fontSize: '0.72rem',
                color: armada ? 'var(--azul)' : 'var(--topo-muy-claro)', fontWeight: armada ? 700 : undefined,
                fontVariantNumeric: 'tabular-nums', borderRight: '1px solid var(--borde)',
              }}>
                {etiqueta}
              </div>
              <div style={{ flex: 1, padding: '0.3rem 0.5rem', display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
                {armada && deEstaHora.length === 0 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--azul)' }}>Toca otra hora para marcar el fin, o esta misma para un solo horario.</span>
                )}
                {deEstaHora.map((el) => (
                  <CalendarioElementoChip key={el.id} elemento={el} onAbrir={abrirYLimpiar} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }} onClick={() => { setHoraArmada(null); onCrear(); }}>
        + Añadir a este día
      </button>
    </div>
  );
}
