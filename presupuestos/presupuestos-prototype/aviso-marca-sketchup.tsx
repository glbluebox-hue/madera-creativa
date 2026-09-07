/**
 * Aviso de marca de SketchUp/Trimble (decisión definitiva, 05/09/2026) —
 * extraído a su propio archivo para que exista UNA sola copia del texto en
 * toda la app: antes vivía duplicado dentro de `tarjeta-modelo-3d.tsx`;
 * ahora también lo usa la página de planes (el plan PRO menciona
 * "SketchUp Desktop" como función incluida). "SketchUp" es una marca de
 * Trimble Inc.; Madera Creativa Estudio usa el nombre textual "SketchUp
 * Desktop" únicamente para identificar el software externo al que lleva
 * el enlace real de la app — nunca se presenta como integración oficial,
 * socio o patrocinado por Trimble. Debe aparecer escrito directamente
 * junto a CUALQUIER mención de SketchUp Desktop (nunca detrás de un
 * tooltip/hover), en un tamaño auxiliar pero con contraste suficiente
 * para ser legible — nunca escondido ni relegado solo a una página legal
 * general. No modificar esta decisión sin instrucción explícita.
 */
export const AVISO_MARCA_SKETCHUP = 'SketchUp es una marca de Trimble Inc. Madera Creativa Estudio no está afiliada ni patrocinada por Trimble.';

/** `colorTexto` (08/09/2026) — opcional, para poder leerse sobre la tarjeta Pro oscura de "Elige tu plan"/la landing; por defecto el mismo `--topo-claro` de siempre. */
export function AvisoMarcaSketchUp({ colorTexto }: { colorTexto?: string } = {}) {
  return (
    <p style={{ margin: '0.5rem 0 0', fontSize: '0.68rem', lineHeight: 1.4, color: colorTexto ?? 'var(--topo-claro)' }}>
      {AVISO_MARCA_SKETCHUP}
    </p>
  );
}
