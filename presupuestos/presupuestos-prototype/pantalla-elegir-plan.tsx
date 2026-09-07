import { useState } from 'react';
import { elegirPlan } from './api.js';
import type { PlanComercial } from './planes.js';
import type { Periodo } from './selector-periodo.js';
import { PaginaPlanes } from './pagina-planes.js';
import styles from './styles.module.css';

/**
 * Pantalla obligatoria "Elige tu plan" (08/09/2026) — se muestra justo
 * después de verificar el email, antes de dejar entrar a la app (ver
 * `nuncaEligioPlan` en `presupuestos-prototype.tsx`). El trial de 60 días
 * ya está activo con acceso completo Basic + Pro desde que se verificó el
 * email (`iniciarTrialSiCorresponde`, sin cambios) — esta pantalla NUNCA
 * concede ni quita acceso, solo pide una elección real (para saber qué le
 * tocará pagar cuando exista pasarela de cobro) antes de continuar.
 *
 * Mismo tratamiento visual que la landing comercial (tarjeta Pro con fondo
 * oscuro y "EL MÁS ELEGIDO", ver `tarjeta-plan.tsx`) — decisión explícita
 * del cliente: la pantalla debe verse "exactamente como en la Landing Page".
 */
export function PantallaElegirPlan({ onElegido, onCerrarSesion }: { onElegido: () => void; onCerrarSesion: () => void }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const manejarEleccion = async (plan: PlanComercial, periodo: Periodo) => {
    setError('');
    setGuardando(true);
    const resultado = await elegirPlan(plan, periodo);
    setGuardando(false);
    if (resultado.ok === false) { setError(resultado.error); return; }
    onElegido();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--fondo)',
      display: 'flex', justifyContent: 'center', padding: '2rem 1.5rem', overflowY: 'auto',
    }}>
      <div style={{ maxWidth: 900, width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 className={styles.h2} style={{ marginBottom: '0.4rem' }}>Elige tu plan.</h1>
          <p style={{ margin: 0, color: 'var(--topo-claro)', fontSize: '0.92rem' }}>
            Tu prueba gratuita de 60 días ya ha empezado, con acceso completo a Basic + Pro. Elige el plan que más se ajusta a ti — no se te cobra nada ahora.
          </p>
        </div>

        <PaginaPlanes onElegir={manejarEleccion} />

        {guardando && <p style={{ margin: 0, textAlign: 'center', fontSize: '0.8rem', color: 'var(--topo-claro)' }}>Guardando tu elección…</p>}
        {error && <p style={{ margin: 0, textAlign: 'center', fontSize: '0.82rem', color: 'var(--rojo)' }}>{error} Puedes volver a pulsar "Elegir" para intentarlo de nuevo.</p>}

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button type="button" className={styles.btnIcono} onClick={onCerrarSesion}>Cerrar sesión</button>
        </div>
      </div>
    </div>
  );
}
