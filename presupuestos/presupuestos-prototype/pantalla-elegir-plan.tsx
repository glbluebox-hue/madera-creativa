import { useState } from 'react';
import { elegirPlan } from './api.js';
import type { PlanComercial } from './planes.js';
import type { Periodo } from './selector-periodo.js';
import { PaginaPlanes } from './pagina-planes.js';
import styles from './styles.module.css';

/**
 * Pantalla obligatoria "Elige tu plan" (08/09/2026, cabecera rediseñada
 * el mismo día) — se muestra justo después de verificar el email, antes
 * de dejar entrar a la app (ver `nuncaEligioPlan` en
 * `presupuestos-prototype.tsx`). El trial de 60 días ya está activo con
 * acceso completo Basic + Pro desde que se verificó el email
 * (`iniciarTrialSiCorresponde`, sin cambios) — esta pantalla NUNCA
 * concede ni quita acceso, solo pide una elección real (para saber qué le
 * tocará pagar cuando exista pasarela de cobro) antes de continuar.
 *
 * Mismo tratamiento visual que la sección de planes de la página
 * comercial (`pagina-presentacion.tsx`): cabecera con eyebrow + título +
 * texto de posicionamiento de los tres planes, y la tarjeta Pro con fondo
 * oscuro y "EL MÁS ELEGIDO" (ver `tarjeta-plan.tsx`) — decisión explícita
 * del cliente, la primera vez que se ve esta pantalla real (recién
 * registrado, sin ese estilo) no se parecía en nada a lo que ya había
 * visto en la presentación.
 *
 * `className={styles.app}` (corrección del mismo día): sin él, esta
 * pantalla no heredaba ni la tipografía Inter ni los tokens de color del
 * resto de la app (ambos declarados dentro de `.app` en
 * `styles.module.css`) — se veía con la fuente serif por defecto del
 * navegador. Mismo fallo que tenía `PantallaTrialTerminado`, corregido
 * también ahí.
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
    <div className={styles.app} style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--fondo)',
      display: 'flex', justifyContent: 'center', padding: '2.5rem 1.5rem', overflowY: 'auto',
    }}>
      <div style={{ maxWidth: 1180, width: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ocre)' }}>
            ¡Bienvenido! Tu prueba de 60 días ya ha empezado
          </span>
          <h1 className={styles.h2} style={{ margin: 0, fontSize: 'clamp(1.6rem, 3.2vw, 2.1rem)' }}>Elige tu plan.</h1>
          <p style={{ margin: 0, maxWidth: 560, fontSize: '0.88rem', color: 'var(--topo-claro)' }}>
            Ya tienes acceso completo a Basic + Pro durante la prueba, elijas lo que elijas — no se te cobra nada ahora.
            Basic: yo gestiono. Pro: la aplicación me ayuda a trabajar. Premium: la aplicación me ayuda a decidir.
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
