import { useState } from 'react';
import { CATALOGO_PLANES, type PlanComercial } from './planes.js';
import { SelectorPeriodo, type Periodo } from './selector-periodo.js';
import { TarjetaPlan } from './tarjeta-plan.js';

/**
 * Página/bloque de planes comerciales (05/09/2026) — componente de
 * contenido puro, sin cabecera ni chrome de modal propios, para poder
 * usarse tal cual embebido dentro de `PantallaTrialTerminado`/
 * `PantallaElegirPlan` (que ya son pantalla completa) y también dentro de
 * un modal (`.modalFondo`/`.modalCaja`, ver `presupuestos-prototype.tsx`)
 * cuando se abre desde el banner del trial o desde "Mi perfil" — nunca
 * dos copias de la lógica de precios/planes, todo sale de
 * `CATALOGO_PLANES` (planes.ts).
 */
export function PaginaPlanes({ onElegir }: { onElegir?: (plan: PlanComercial, periodo: Periodo) => void } = {}) {
  const [periodo, setPeriodo] = useState<Periodo>('mensual');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <SelectorPeriodo periodo={periodo} onCambiar={setPeriodo} />

      <div
        style={{
          display: 'grid', gap: '1rem', alignItems: 'stretch',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}
      >
        {CATALOGO_PLANES.map((info, i) => (
          <TarjetaPlan
            key={info.plan}
            info={info}
            periodo={periodo}
            destacado={info.plan === 'PRO'}
            heredaDe={i > 0 ? CATALOGO_PLANES[i - 1].nombre : undefined}
            onElegir={onElegir}
          />
        ))}
      </div>
    </div>
  );
}
