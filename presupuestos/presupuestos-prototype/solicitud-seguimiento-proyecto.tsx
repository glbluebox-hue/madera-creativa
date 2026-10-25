import { useState, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as api from './api.js';
import type { PresupuestoMC } from './presupuestos-modelo.js';
import { puedeUsar, PRO_O_SUPERIOR, type PlanAcceso } from './planes.js';
import { CandadoPlan } from './candado-plan.js';
import { SolicitudSeguimiento } from './solicitud-seguimiento.js';
import styles from './styles.module.css';

const IconoGlobo = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

export type SolicitudSeguimientoProyectoProps = {
  /** Proyecto cuya cabecera aloja el botón (petición del usuario, 25/10/2026: al lado de "Pedir reseña"). */
  proyectoId: string;
  clienteId: string;
  plan?: PlanAcceso;
  esAdmin?: boolean;
};

/**
 * Entrada de "Pedir seguimiento" en la cabecera de la ficha del cliente —
 * junto a `SolicitudResena` (ver `ficha-cliente.tsx`). A diferencia de
 * "Pedir reseña" (un enlace por cliente), el Seguimiento es por
 * PRESUPUESTO concreto: este componente resuelve primero a cuál de los
 * presupuestos del proyecto se refiere — si solo hay uno, pasa
 * directamente a `SolicitudSeguimiento` (ya con `autoAbrir`, sin pedir un
 * segundo clic); si hay varios, deja elegir cuál antes.
 */
export function SolicitudSeguimientoProyecto({ proyectoId, clienteId, plan, esAdmin }: SolicitudSeguimientoProyectoProps) {
  const tienePlan = puedeUsar(plan, PRO_O_SUPERIOR, esAdmin);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [presupuestos, setPresupuestos] = useState<PresupuestoMC[] | null>(null);
  const [elegidoId, setElegidoId] = useState<string | null>(null);
  // Mismo bug y misma solución que `solicitud-seguimiento.tsx` — ver el comentario allí.
  const [montadoEnNavegador, setMontadoEnNavegador] = useState(false);
  useLayoutEffect(() => { setMontadoEnNavegador(true); }, []);

  const abrir = useCallback(() => {
    setAbierto(true);
    if (presupuestos) return;
    setCargando(true);
    api.obtenerPresupuestosDeProyecto(proyectoId)
      .then((lista) => {
        setPresupuestos(lista);
        if (lista.length === 1) setElegidoId(lista[0].id);
      })
      .catch(() => setPresupuestos([]))
      .finally(() => setCargando(false));
  }, [proyectoId, presupuestos]);

  if (!tienePlan) {
    return (
      <button className={`${styles.btn} ${styles.btnSecundario}`} disabled style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', opacity: 0.7, cursor: 'not-allowed' }} title="Pedir seguimiento requiere el plan PRO o superior">
        {IconoGlobo} Pedir seguimiento <CandadoPlan planMinimo="PRO" compacto />
      </button>
    );
  }

  if (elegidoId) {
    return <SolicitudSeguimiento presupuestoId={elegidoId} clienteId={clienteId} plan={plan} esAdmin={esAdmin} autoAbrir />;
  }

  return (
    <>
      <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={abrir} disabled={cargando} title="Pedir la opinión del cliente sobre uno de sus presupuestos">
        {IconoGlobo} Pedir seguimiento
      </button>

      {abierto && montadoEnNavegador && createPortal(
        <div className={styles.overlay} onClick={() => setAbierto(false)}>
          <div
            className={styles.modal}
            style={{ maxWidth: 380, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', textAlign: 'center' }}>¿Sobre qué presupuesto?</p>

            {cargando && <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--topo-claro)' }}>Cargando…</p>}

            {presupuestos && presupuestos.length === 0 && (
              <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--topo-claro)' }}>
                Este proyecto todavía no tiene ningún presupuesto.
              </p>
            )}

            {presupuestos && presupuestos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {presupuestos.map((p) => (
                  <button
                    key={p.id}
                    className={`${styles.btn} ${styles.btnSecundario}`}
                    onClick={() => setElegidoId(p.id)}
                    style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <span>{p.titulo}</span>
                    {p.estado === 'aceptado' && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--verde)', flexShrink: 0 }}>✓ Aceptado</span>}
                  </button>
                ))}
              </div>
            )}

            <button className={styles.btn} onClick={() => setAbierto(false)} style={{ fontSize: '0.8rem' }}>Cancelar</button>
          </div>
        </div>,
        document.querySelector(`.${styles.app}`) ?? document.body
      )}
    </>
  );
}
