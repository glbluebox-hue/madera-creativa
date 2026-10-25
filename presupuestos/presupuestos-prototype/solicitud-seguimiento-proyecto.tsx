import { useState, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import * as api from './api.js';
import type { PresupuestoMC } from './presupuestos-modelo.js';
import type { Seguimiento } from './api.js';
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
 * directamente a `SolicitudSeguimiento`; si hay varios, deja elegir cuál.
 *
 * Carga el estado de cada presupuesto POR ADELANTADO (no solo al pulsar) —
 * petición explícita del usuario, 25/10/2026: antes solo se podía ver si el
 * cliente ya había contestado desde la sección global "Presupuestos"; aquí
 * el botón se quedaba siempre en "Pedir seguimiento" aunque ya hubiera
 * respuesta. Ahora, igual que en esa lista, se convierte en "Ver
 * seguimiento" (con el punto ocre) en cuanto hay alguna respuesta.
 */
export function SolicitudSeguimientoProyecto({ proyectoId, clienteId, plan, esAdmin }: SolicitudSeguimientoProyectoProps) {
  const tienePlan = puedeUsar(plan, PRO_O_SUPERIOR, esAdmin);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [presupuestos, setPresupuestos] = useState<PresupuestoMC[] | null>(null);
  const [estados, setEstados] = useState<Record<string, Seguimiento | null>>({});
  const [elegidoId, setElegidoId] = useState<string | null>(null);
  // Mismo bug y misma solución que `solicitud-seguimiento.tsx` — ver el comentario allí.
  const [montadoEnNavegador, setMontadoEnNavegador] = useState(false);
  useLayoutEffect(() => { setMontadoEnNavegador(true); }, []);

  useEffect(() => {
    if (!tienePlan) { setCargando(false); return; }
    let cancelado = false;
    setCargando(true);
    api.obtenerPresupuestosDeProyecto(proyectoId)
      .then(async (lista) => {
        if (cancelado) return;
        setPresupuestos(lista);
        const pares = await Promise.all(lista.map(async (p): Promise<[string, Seguimiento | null]> => {
          try { return [p.id, await api.obtenerSeguimiento(p.id)]; }
          catch { return [p.id, null]; }
        }));
        if (!cancelado) setEstados(Object.fromEntries(pares));
      })
      .catch(() => { if (!cancelado) setPresupuestos([]); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [proyectoId, tienePlan]);

  const abrir = () => {
    if (!presupuestos || presupuestos.length === 0) return;
    if (presupuestos.length === 1) { setElegidoId(presupuestos[0].id); return; }
    setAbierto(true);
  };

  if (!tienePlan) {
    return (
      <button className={`${styles.btn} ${styles.btnSecundario}`} disabled style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', opacity: 0.7, cursor: 'not-allowed' }} title="Pedir seguimiento requiere el plan PRO o superior">
        {IconoGlobo} Pedir seguimiento <CandadoPlan planMinimo="PRO" compacto />
      </button>
    );
  }

  // Una vez elegido (o resuelto automáticamente porque solo había uno), el
  // propio `SolicitudSeguimiento` manda: es quien de verdad sabe el estado
  // de ESE presupuesto en concreto y abre ya su panel completo.
  if (elegidoId) {
    return <SolicitudSeguimiento presupuestoId={elegidoId} clienteId={clienteId} plan={plan} esAdmin={esAdmin} autoAbrir />;
  }

  const valores = Object.values(estados);
  const hayRespuesta = valores.some((s) => s?.respuesta);
  const hayAlguno = valores.some((s) => !!s);
  const etiquetaBoton = hayRespuesta ? 'Ver seguimiento' : hayAlguno ? 'Seguimiento' : 'Pedir seguimiento';

  return (
    <>
      <button
        className={`${styles.btn} ${styles.btnSecundario}`}
        onClick={abrir}
        disabled={cargando || (presupuestos !== null && presupuestos.length === 0)}
        title={presupuestos?.length === 0 ? 'Este proyecto todavía no tiene ningún presupuesto' : 'Pedir la opinión del cliente sobre uno de sus presupuestos'}
      >
        {IconoGlobo} {etiquetaBoton}
        {hayRespuesta && (
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ocre)', display: 'inline-block', marginLeft: '0.1rem' }} />
        )}
      </button>

      {abierto && montadoEnNavegador && createPortal(
        <div className={styles.overlay} onClick={() => setAbierto(false)}>
          <div
            className={styles.modal}
            style={{ maxWidth: 380, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', textAlign: 'center' }}>¿Sobre qué presupuesto?</p>

            {presupuestos && presupuestos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {presupuestos.map((p) => {
                  const s = estados[p.id];
                  const etiqueta = s?.respuesta ? 'Ver seguimiento' : s ? 'Seguimiento pedido' : 'Sin seguimiento';
                  return (
                    <button
                      key={p.id}
                      className={`${styles.btn} ${styles.btnSecundario}`}
                      onClick={() => setElegidoId(p.id)}
                      style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <span>{p.titulo}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                        {p.estado === 'aceptado' && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--verde)' }}>✓ Aceptado</span>}
                        <span style={{ fontSize: '0.68rem', color: s?.respuesta ? 'var(--ocre)' : 'var(--topo-claro)', fontWeight: s?.respuesta ? 700 : 400 }}>{etiqueta}</span>
                      </span>
                    </button>
                  );
                })}
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
