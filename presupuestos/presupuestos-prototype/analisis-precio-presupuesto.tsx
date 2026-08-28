import { useState } from 'react';
import type { AnalisisPrecio } from './inteligencia-precios.js';
import { interpretarAnalisis } from './inteligencia-precios.js';
import { formatoEuro } from './calculos.js';
import styles from './styles.module.css';

const COLOR_ESTADO: Record<'por_encima' | 'cerca' | 'por_debajo', { color: string; fondo: string; icono: string; etiqueta: string }> = {
  por_encima: { color: 'var(--verde)', fondo: 'var(--verde-bg)', icono: '🟢', etiqueta: 'Por encima del objetivo' },
  cerca: { color: 'var(--ocre)', fondo: 'var(--ocre-bg)', icono: '🟡', etiqueta: 'Cerca del objetivo' },
  por_debajo: { color: 'var(--rojo)', fondo: 'var(--rojo-bg)', icono: '🔴', etiqueta: 'Por debajo del objetivo' },
};

export type AnalisisPrecioPresupuestoProps = {
  /** `undefined` mientras se está calculando (proyecto todavía cargando) — se muestra un estado neutro, nunca "sin datos" prematuro. */
  analisis: AnalisisPrecio | undefined;
  /** `true` si este es el snapshot congelado al aceptar (en vez del cálculo en vivo) — cambia el pie de página. */
  esSnapshot?: boolean;
};

/**
 * 🧠 Análisis de precio — bloque embebido en la revisión de un presupuesto
 * (Inteligencia de Precios, Fase 1). Puramente presentacional: no calcula
 * nada por su cuenta, ni hace ninguna llamada — recibe el resultado ya
 * calculado por `analizarPrecioPresupuesto` (en vivo) o el snapshot
 * guardado (`PresupuestoMC.analisisPrecio`, tras aceptar).
 */
export function AnalisisPrecioPresupuesto({ analisis, esSnapshot }: AnalisisPrecioPresupuestoProps) {
  const [completoAbierto, setCompletoAbierto] = useState(false);

  if (!analisis) {
    return (
      <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--fondo-panel)', border: '1px solid var(--borde)', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
        🧠 Calculando análisis de precio…
      </div>
    );
  }

  if (!analisis.disponible) {
    return (
      <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--fondo-panel)', border: '1px solid var(--borde)', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
        🧠 Datos insuficientes — {interpretarAnalisis(analisis)}
      </div>
    );
  }

  const cfg = COLOR_ESTADO[analisis.estado];

  return (
    <div style={{ marginTop: '0.75rem', padding: '0.85rem 1rem', borderRadius: 10, background: cfg.fondo, border: `1px solid ${cfg.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: cfg.color }}>
          {cfg.icono} {cfg.etiqueta}
        </p>
        <button
          className={`${styles.btn} ${styles.btnSecundario}`}
          style={{ fontSize: '0.72rem', padding: '0.3rem 0.7rem' }}
          onClick={() => setCompletoAbierto(true)}
        >
          Ver análisis completo
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', marginTop: '0.6rem', fontSize: '0.8rem' }}>
        <span><strong>{formatoEuro(analisis.precio)}</strong> precio</span>
        <span><strong>{formatoEuro(analisis.costeEstimado)}</strong> coste</span>
        <span><strong>{analisis.margenPorcentaje.toFixed(1)}%</strong> margen previsto</span>
        <span><strong>{analisis.margenObjetivoPorcentaje.toFixed(1)}%</strong> objetivo</span>
      </div>

      {esSnapshot && (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', color: 'var(--topo-claro)' }}>
          Análisis congelado — no se recalcula automáticamente después.
        </p>
      )}

      {completoAbierto && (
        <AnalisisPrecioCompleto analisis={analisis} onCerrar={() => setCompletoAbierto(false)} />
      )}
    </div>
  );
}

function AnalisisPrecioCompleto({ analisis, onCerrar }: { analisis: Extract<AnalisisPrecio, { disponible: true }>; onCerrar: () => void }) {
  const cfg = COLOR_ESTADO[analisis.estado];
  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modal} style={{ maxWidth: 420, padding: '1.5rem' }} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitulo}>🧠 Análisis de precio</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginTop: '0.5rem' }}>
          <Pregunta titulo="¿Cuánto me cuesta?" respuesta={formatoEuro(analisis.costeEstimado)} nota="Coste registrado del proyecto vinculado (gastos + horas × tarifa)." />
          <Pregunta titulo="¿Qué margen tengo?" respuesta={`${analisis.margenPorcentaje.toFixed(1)}%`} />
          <Pregunta titulo="¿Cuál es mi margen objetivo?" respuesta={`${analisis.margenObjetivoPorcentaje.toFixed(1)}%`} />
          <Pregunta titulo="¿Cómo estoy respecto al mercado?" respuesta="Disponible en una fase posterior." atenuado />
          <Pregunta titulo="¿Cómo estoy respecto a mis propios trabajos?" respuesta="Disponible en una fase posterior." atenuado />
          <Pregunta
            titulo="¿Qué recomienda Madera Creativa?"
            respuesta={interpretarAnalisis(analisis)}
          />
          <div>
            <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Estado
            </p>
            <p style={{ margin: 0, fontWeight: 700, color: cfg.color }}>{cfg.icono} {cfg.etiqueta}</p>
          </div>
        </div>

        <button className={styles.btn} style={{ marginTop: '1.25rem', width: '100%' }} onClick={onCerrar}>Cerrar</button>
      </div>
    </div>
  );
}

function Pregunta({ titulo, respuesta, nota, atenuado }: { titulo: string; respuesta: string; nota?: string; atenuado?: boolean }) {
  return (
    <div>
      <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {titulo}
      </p>
      <p style={{ margin: 0, fontSize: '0.88rem', color: atenuado ? 'var(--topo-claro)' : 'inherit', fontStyle: atenuado ? 'italic' : 'normal' }}>
        {respuesta}
      </p>
      {nota && <p style={{ margin: '0.15rem 0 0', fontSize: '0.7rem', color: 'var(--topo-claro)' }}>{nota}</p>}
    </div>
  );
}
