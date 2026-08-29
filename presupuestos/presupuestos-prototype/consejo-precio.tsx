import type { ResultadoConsejo, NivelConfianzaConsejo } from './evaluar-precio.js';
import { interpretarAnalisis } from './inteligencia-precios.js';
import { formatoEuro } from './calculos.js';

/**
 * "🧭 Consenso de precio" (Fase 2E, ampliado en Fase 2F) — puramente
 * presentacional: recibe el resultado ya calculado por `evaluarPrecio()` y
 * lo pinta. Nunca decide nada por su cuenta, nunca llama a ninguna IA,
 * nunca inventa una cifra — el rango que muestra es el que ya calculó el
 * motor determinista.
 */

const NIVEL_INFO: Record<NivelConfianzaConsejo, { icono: string; texto: string }> = {
  alta: { icono: '🟢', texto: 'Confianza alta' },
  media: { icono: '🟡', texto: 'Confianza media' },
  baja: { icono: '⚪', texto: 'Confianza baja' },
  insuficiente: { icono: '⚪', texto: 'Confianza insuficiente' },
};

export function ConsejoPrecio({ resultado }: { resultado: ResultadoConsejo | null }) {
  if (resultado === null) {
    return <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--topo-claro)' }}>🔎 Calculando consenso de precio…</p>;
  }

  if (resultado.disponible === false) {
    return <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--topo-claro)' }}>{interpretarAnalisis({ disponible: false, motivo: resultado.motivo })}</p>;
  }

  const nivel = NIVEL_INFO[resultado.nivelConfianza];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {resultado.precioRecomendado && (
        <div style={{ padding: '0.6rem 0.75rem', background: 'var(--fondo-panel)', borderRadius: 8 }}>
          <p style={{ margin: '0 0 0.15rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Precio recomendado
          </p>
          <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
            {formatoEuro(resultado.precioRecomendado.min)}
            {resultado.precioRecomendado.max > resultado.precioRecomendado.min ? ` – ${formatoEuro(resultado.precioRecomendado.max)}` : ''}
          </p>
        </div>
      )}

      <p style={{ margin: 0, fontSize: '0.88rem' }}>{resultado.conclusion}</p>

      {resultado.contradicciones.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {resultado.contradicciones.map((c, i) => (
            <p key={i} style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ocre)', background: 'var(--ocre-bg)', padding: '0.4rem 0.6rem', borderRadius: 8 }}>
              ⚠️ {c}
            </p>
          ))}
        </div>
      )}

      {resultado.notaCostesProvisionales && (
        <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--topo-claro)', fontStyle: 'italic' }}>
          {resultado.notaCostesProvisionales}
        </p>
      )}

      <div>
        <p style={{ margin: '0 0 0.15rem', fontSize: '0.85rem', fontWeight: 700 }}>{nivel.icono} {nivel.texto}</p>
        <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--topo-claro)' }}>{resultado.notaConfianza}</p>
      </div>
    </div>
  );
}
