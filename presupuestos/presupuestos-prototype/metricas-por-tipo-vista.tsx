import type { MetricasGrupo, NivelConfianzaGrupo } from './metricas-por-tipo.js';
import { formatoEuro } from './calculos.js';

/**
 * "📊 Por tipo de trabajo" (Fase 2D) — puramente presentacional, sin
 * ningún cálculo: recibe las métricas ya calculadas por
 * `calcularMetricasPorTipo` y las pinta. Emojis solo para las 4 opciones
 * fijas de `PreguntaTipoTrabajo` (🍳 Cocina/🚪 Armario/👗 Vestidor/
 * 🪑 Mueble) — cualquier texto libre de "Otro" usa un icono genérico,
 * nunca se intenta adivinar uno por el texto.
 */

const EMOJI_TIPO: Record<string, string> = { Cocina: '🍳', Armario: '🚪', Vestidor: '👗', Mueble: '🪑' };
function emojiPara(tipoTrabajo: string): string {
  return EMOJI_TIPO[tipoTrabajo] ?? '🔧';
}

const NIVEL_INFO: Record<NivelConfianzaGrupo, { icono: string; texto: string }> = {
  alta: { icono: '🟢', texto: 'Confianza alta' },
  media: { icono: '🟡', texto: 'Confianza media' },
  baja: { icono: '⚪', texto: 'Confianza baja' },
};

export function MetricasPorTipoVista({ metricas }: { metricas: MetricasGrupo[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <h3 style={{ margin: 0, fontSize: '0.95rem' }}>📊 Por tipo de trabajo</h3>
      {metricas.length === 0 ? (
        // Estado vacío (corrección real, 28/08/2026: la sección desaparecía
        // por completo con `return null` en vez de explicar por qué — un
        // usuario sin ningún trabajo con `tipoTrabajo` guardado no veía
        // absolutamente nada, ni siquiera el título). Nunca una cifra
        // inventada — solo el mensaje, siempre visible.
        <div style={{ border: '1px solid var(--borde)', borderRadius: 10, padding: '0.9rem 1rem', background: 'var(--fondo-panel)' }}>
          <p style={{ margin: '0 0 0.3rem', fontSize: '0.85rem' }}>
            Todavía no tienes suficientes trabajos con tipo de trabajo registrado para mostrar estadísticas aquí.
          </p>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
            Cuando finalices tus próximos trabajos, podrás ver aquí tus márgenes y rangos de precios por tipo de trabajo.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '0.75rem' }}>
          {metricas.map((m) => <TarjetaMetricaGrupo key={m.tipoTrabajo} metricas={m} />)}
        </div>
      )}
    </div>
  );
}

function TarjetaMetricaGrupo({ metricas: m }: { metricas: MetricasGrupo }) {
  return (
    <div style={{ border: '1px solid var(--borde)', borderRadius: 10, padding: '0.9rem 1rem', background: 'var(--fondo-panel)', minWidth: 0 }}>
      <p style={{ margin: '0 0 0.15rem', fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {emojiPara(m.tipoTrabajo)} {m.tipoTrabajo}
      </p>
      <p style={{ margin: '0 0 0.65rem', fontSize: '0.76rem', color: 'var(--topo-claro)' }}>
        {m.numTrabajos} trabajo{m.numTrabajos !== 1 ? 's' : ''}
      </p>

      {!m.historicoSuficiente ? (
        <>
          <p style={{ margin: '0 0 0.3rem', fontSize: '0.82rem', fontWeight: 600 }}>⚪ Histórico insuficiente</p>
          <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--topo-claro)' }}>
            Necesitas más trabajos de este tipo para obtener una referencia fiable.
          </p>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.6rem' }}>
            <span style={{ fontSize: '0.82rem' }}><strong>{m.margenMediana.toFixed(0)}%</strong> margen habitual</span>
            <span style={{ fontSize: '0.82rem' }}>{formatoEuro(m.precioMinimo)} – {formatoEuro(m.precioMaximo)}</span>
          </div>
          <p style={{ margin: '0 0 0.3rem', fontSize: '0.8rem', fontWeight: 600 }}>
            {NIVEL_INFO[m.nivelConfianza].icono} {NIVEL_INFO[m.nivelConfianza].texto}
          </p>
          <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--topo-claro)' }}>
            {m.numConMargenReal} de {m.numTrabajos} trabajo{m.numTrabajos !== 1 ? 's' : ''} tiene{m.numTrabajos !== 1 ? 'n' : ''} margen real.
          </p>
        </>
      )}
    </div>
  );
}
