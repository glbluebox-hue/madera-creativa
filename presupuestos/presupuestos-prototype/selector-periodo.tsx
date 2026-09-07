/**
 * Interruptor mensual/anual de la página de planes (05/09/2026) — UN SOLO
 * selector que controla las tres tarjetas a la vez (encargo explícito: "no
 * tres selectores independientes"). Componente controlado y sin estado
 * propio: quien lo usa (`PaginaPlanes`) es dueño del período actual, para
 * que un mismo período se refleje en las tres tarjetas sin tener que
 * sincronizar nada entre ellas.
 */

export type Periodo = 'mensual' | 'anual';

export type SelectorPeriodoProps = {
  periodo: Periodo;
  onCambiar: (periodo: Periodo) => void;
};

export function SelectorPeriodo({ periodo, onCambiar }: SelectorPeriodoProps) {
  return (
    <div
      role="group"
      aria-label="Periodo de facturación"
      style={{
        display: 'inline-flex', alignSelf: 'center', padding: 4, borderRadius: 999,
        background: 'var(--fondo-caja)', border: '1px solid var(--borde)', gap: 2,
      }}
    >
      {(['mensual', 'anual'] as const).map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={periodo === p}
          onClick={() => onCambiar(p)}
          style={{
            border: 'none', cursor: 'pointer', borderRadius: 999, padding: '0.5rem 1.1rem',
            fontSize: '0.82rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            background: periodo === p ? 'var(--topo)' : 'transparent',
            color: periodo === p ? 'var(--blanco)' : 'var(--topo)',
            transition: 'background 0.15s ease, color 0.15s ease',
          }}
        >
          {p === 'mensual' ? 'Mensual' : 'Anual'}
          {p === 'anual' && (
            <span
              style={{
                fontSize: '0.66rem', fontWeight: 800, padding: '0.1em 0.5em', borderRadius: 999,
                background: periodo === p ? 'rgba(255,255,255,0.22)' : 'var(--verde-bg)',
                color: periodo === p ? 'var(--blanco)' : 'var(--verde)',
              }}
            >
              −10%
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
