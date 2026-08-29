import type { ResultadoConsejo, NivelConfianzaConsejo } from './evaluar-precio.js';
import { interpretarAnalisis } from './inteligencia-precios.js';

/**
 * "🧠 Consejo de precio" (Fase 2E) — puramente presentacional: recibe el
 * resultado ya calculado por `evaluarPrecio()` y lo pinta. Nunca decide
 * nada por su cuenta, nunca llama a ninguna IA, nunca inventa una cifra.
 */

const NIVEL_INFO: Record<NivelConfianzaConsejo, { icono: string; texto: string }> = {
  alta: { icono: '🟢', texto: 'Confianza alta' },
  media: { icono: '🟡', texto: 'Confianza media' },
  baja: { icono: '⚪', texto: 'Confianza baja' },
  insuficiente: { icono: '⚪', texto: 'Confianza insuficiente' },
};

export function ConsejoPrecio({ resultado }: { resultado: ResultadoConsejo | null }) {
  if (resultado === null) {
    return <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--topo-claro)' }}>🔎 Calculando consejo de precio…</p>;
  }

  if (resultado.disponible === false) {
    return <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--topo-claro)' }}>{interpretarAnalisis({ disponible: false, motivo: resultado.motivo })}</p>;
  }

  const nivel = NIVEL_INFO[resultado.nivelConfianza];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <p style={{ margin: 0, fontSize: '0.88rem' }}>{resultado.conclusion}</p>

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
