import type { ReactNode } from 'react';
import type { PlanComercial } from './planes.js';

/** Props de la insignia de función bloqueada por plan. */
export type CandadoPlanProps = {
  /** Plan mínimo que hace falta para esta función — se muestra tal cual, nunca un texto suelto. */
  planMinimo: PlanComercial;
  /** Versión más pequeña, para pegar junto a un icono de herramienta (p. ej. la barra del Tablero de medición). */
  compacto?: boolean;
};

/**
 * Insignia "🔒 PRO"/"🔒 PREMIUM" (Fase 2.5, 04/09/2026) — la señal visual que
 * le faltaba al frontend. El backend (`requirePlan`, Fase 2) sigue siendo la
 * única autoridad real: esto nunca decide nada, solo explica por qué un
 * control está deshabilitado. Reutiliza el nombre del plan de `planes.ts`
 * (`PlanComercial`), nunca un string suelto — así un candado jamás puede
 * decir un plan que no existe.
 *
 * Deliberadamente NO es un wrapper universal de tipo `<FeatureBloqueada>`
 * que envuelva cualquier botón: los controles reales de la app tienen
 * estructuras y estilos demasiado distintos entre sí (un botón suelto, una
 * herramienta de una barra de iconos, un interruptor dentro de una lista)
 * como para forzarlos dentro de un único componente sin acabar
 * refactorizándolos — justo lo que se pidió evitar. Cada sitio decide con
 * `puedeUsar()` (mismo criterio central, ver `planes.ts`) si deshabilita su
 * propio control y muestra este candado al lado.
 */
export function CandadoPlan({ planMinimo, compacto }: CandadoPlanProps) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.3em',
        fontSize: compacto ? '0.62rem' : '0.7rem', fontWeight: 700,
        padding: compacto ? '0.05em 0.4em' : '0.15em 0.6em',
        borderRadius: 20, background: 'var(--ocre-bg)', color: 'var(--ocre)',
        whiteSpace: 'nowrap', letterSpacing: '0.02em', lineHeight: 1.6,
      }}
      title={`Disponible en el plan ${planMinimo}`}
    >
      🔒 {planMinimo}
    </span>
  );
}

/**
 * Bloque explicativo más completo, para cuando una sección entera queda
 * bloqueada (no solo un botón suelto) — mismo lenguaje visual que ya usa
 * `InteligenciaPreciosVista` desde la Fase 2. "Disponible en…", nunca un
 * mensaje comercial agresivo.
 */
export function MensajeFuncionBloqueada({ planMinimo, titulo, children }: { planMinimo: PlanComercial; titulo: string; children?: ReactNode }) {
  return (
    <div style={{
      border: '1px solid var(--borde)', borderRadius: 'var(--radio-md, 10px)',
      padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem',
    }}>
      <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {titulo} <CandadoPlan planMinimo={planMinimo} />
      </p>
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
        {children ?? `Disponible en el plan ${planMinimo}.`}
      </p>
    </div>
  );
}
