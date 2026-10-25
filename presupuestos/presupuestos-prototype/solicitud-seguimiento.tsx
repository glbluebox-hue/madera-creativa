import { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as api from './api.js';
import type { Seguimiento } from './api.js';
import { puedeUsar, PRO_O_SUPERIOR, type PlanAcceso } from './planes.js';
import { CandadoPlan } from './candado-plan.js';
import styles from './styles.module.css';

const IconoGlobo = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const ESTADOS: { valor: string; etiqueta: string }[] = [
  { valor: 'generado', etiqueta: 'Enlace generado' },
  { valor: 'enviado', etiqueta: 'Enviado al cliente' },
  { valor: 'respondido', etiqueta: 'Respuesta recibida' },
  { valor: 'contactoSolicitado', etiqueta: 'Contacto solicitado' },
  { valor: 'pausa', etiqueta: 'En pausa' },
  { valor: 'cerrado', etiqueta: 'Cerrado' },
];

/** Props del botón/panel de Seguimiento de la ficha del presupuesto. */
export type SolicitudSeguimientoProps = {
  /** Presupuesto para el que se genera el enlace individual de seguimiento. */
  presupuestoId: string;
  /** Cliente (identidad) al que pertenece ese presupuesto — informativo, el enlace se genera sobre el presupuesto. */
  clienteId: string;
  /** Plan de la sesión actual — esta función exige PRO+ en el servidor (`requirePlan`), mismo criterio que "Pedir reseña". */
  plan?: PlanAcceso;
  /** Bypass administrativo — ver `puedeUsar()` en `planes.ts`. */
  esAdmin?: boolean;
  /** Abre el panel directamente al montar — usado por `solicitud-seguimiento-proyecto.tsx` tras elegir presupuesto, para que no haga falta un segundo clic. */
  autoAbrir?: boolean;
};

/**
 * Botón "Pedir seguimiento" de la fila de acciones de un presupuesto —
 * genera un enlace individual (sin caducidad, sin QR: se manda digital,
 * no en cartel físico) que el cliente abre para responder un cuestionario
 * breve sobre su opinión. Una vez generado, el mismo botón se convierte en
 * "Ver seguimiento" y abre un panel con la respuesta (si ya llegó), una
 * nota interna y un selector de estado — ver `cuestionario-seguimiento.tsx`
 * para la página pública.
 */
export function SolicitudSeguimiento({ presupuestoId, plan, esAdmin, autoAbrir }: SolicitudSeguimientoProps) {
  const tienePlan = puedeUsar(plan, PRO_O_SUPERIOR, esAdmin);
  const [abierto, setAbierto] = useState(() => !!autoAbrir);
  const [cargando, setCargando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [seguimiento, setSeguimiento] = useState<Seguimiento | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [notaInterna, setNotaInterna] = useState('');
  const [estado, setEstado] = useState('generado');
  const [error, setError] = useState<string | null>(null);
  // Portal a `document.body` (bug real, 25/10/2026: "la ventana se queda
  // detrás de los otros presupuestos" al abrir desde la lista global) —
  // sin esto, el `.filaListaClic:hover { transform: translateY(-2px) }` de
  // la fila se convierte en el contenedor de este `position: fixed` y el
  // modal queda encogido dentro de la fila en vez de cubrir toda la
  // pantalla. Mismo bug y misma solución ya aplicada en
  // `analisis-precio-presupuesto.tsx` para esta misma lista.
  const [montadoEnNavegador, setMontadoEnNavegador] = useState(false);
  useLayoutEffect(() => { setMontadoEnNavegador(true); }, []);

  const cargar = useCallback(async () => {
    if (!tienePlan) return;
    setCargando(true);
    try {
      const s = await api.obtenerSeguimiento(presupuestoId);
      setSeguimiento(s);
      if (s) { setNotaInterna(s.notaInterna || ''); setEstado(s.estado || 'generado'); }
    } catch { /* silencioso — el chip simplemente se queda en "Pedir seguimiento" */ }
    finally { setCargando(false); }
  }, [presupuestoId, tienePlan]);

  useEffect(() => { cargar(); }, [cargar]);

  const generar = async () => {
    setGenerando(true);
    setError(null);
    try {
      const { token } = await api.generarEnlaceSeguimiento(presupuestoId);
      setUrl(`${window.location.origin}/seguimiento/${token}`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el enlace.');
    } finally {
      setGenerando(false);
    }
  };

  const copiar = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* portapapeles no disponible — el enlace ya se ve en el campo, se puede seleccionar a mano */ }
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await api.actualizarSeguimiento(presupuestoId, { estado, notaInterna });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const abrir = () => { setAbierto(true); setUrl(null); setError(null); };

  const hayRespuesta = !!seguimiento?.respuesta;
  const etiquetaBoton = hayRespuesta ? 'Ver seguimiento' : seguimiento ? 'Seguimiento' : 'Pedir seguimiento';

  return (
    <>
      {tienePlan ? (
        <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={abrir} title="Pedir la opinión del cliente sobre este presupuesto" disabled={cargando}>
          {IconoGlobo} {etiquetaBoton}
          {hayRespuesta && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ocre)', display: 'inline-block', marginLeft: '0.1rem' }} />
          )}
        </button>
      ) : (
        <button className={`${styles.btn} ${styles.btnSecundario}`} disabled style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', opacity: 0.7, cursor: 'not-allowed' }} title="Pedir seguimiento requiere el plan PRO o superior">
          {IconoGlobo} Pedir seguimiento <CandadoPlan planMinimo="PRO" compacto />
        </button>
      )}

      {abierto && tienePlan && montadoEnNavegador && createPortal(
        <div className={styles.overlay} onClick={() => setAbierto(false)}>
          <div
            className={styles.modal}
            style={{ maxWidth: 420, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', textAlign: 'center' }}>Seguimiento del presupuesto</p>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo-claro)', textAlign: 'center' }}>
              Un enlace propio de este presupuesto para preguntarle al cliente qué le ha parecido — sin presionarle, sin caducidad.
            </p>

            {error && <p style={{ color: 'var(--rojo)', fontSize: '0.82rem', margin: 0 }}>{error}</p>}

            {!seguimiento && !url && (
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={generar} disabled={generando}>
                {generando ? 'Generando…' : 'Generar enlace'}
              </button>
            )}

            {url && (
              <>
                <input
                  className={styles.input}
                  value={url}
                  readOnly
                  onFocus={(e) => e.target.select()}
                  style={{ fontSize: '0.78rem', textAlign: 'center' }}
                />
                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                  <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={copiar}>
                    {copiado ? '✓ Copiado' : 'Copiar enlace'}
                  </button>
                  <button className={styles.btn} onClick={generar} disabled={generando}>
                    {generando ? 'Generando…' : 'Regenerar'}
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-claro)' }}>
                  Al regenerar, el enlace anterior deja de funcionar.
                </p>
              </>
            )}

            {seguimiento && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', borderTop: '1px solid var(--borde-fino)', paddingTop: '0.75rem' }}>
                {seguimiento.respuesta ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.82rem' }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{seguimiento.respuesta.valoracion}</p>
                    {seguimiento.respuesta.loQueGusta && (
                      <p style={{ margin: 0 }}><strong>Le gusta:</strong> {seguimiento.respuesta.loQueGusta}</p>
                    )}
                    {seguimiento.respuesta.loQueNoConvence && (
                      <p style={{ margin: 0 }}><strong>Cambiaría:</strong> {seguimiento.respuesta.loQueNoConvence}</p>
                    )}
                    {!!seguimiento.respuesta.ayudaNecesaria?.length && (
                      <p style={{ margin: 0 }}><strong>Podemos ayudar con:</strong> {seguimiento.respuesta.ayudaNecesaria.join(', ')}</p>
                    )}
                    {seguimiento.respuesta.quiereContacto && (
                      <p style={{ margin: 0 }}><strong>Contacto:</strong> {seguimiento.respuesta.quiereContacto}</p>
                    )}
                    {seguimiento.respuesta.comentario && (
                      <p style={{ margin: 0 }}><strong>Comentario:</strong> {seguimiento.respuesta.comentario}</p>
                    )}
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-claro)' }}>
                      Respondido {seguimiento.respondidoEn ? new Date(seguimiento.respondidoEn).toLocaleDateString('es-ES') : ''}
                    </p>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo-claro)' }}>
                    Todavía no ha respondido{seguimiento.primerUsoEn ? ' — pero ya ha abierto el enlace' : ''}.
                  </p>
                )}

                <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                  Estado
                  <select className={styles.select} value={estado} onChange={(e) => setEstado(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '0.3rem' }}>
                    {ESTADOS.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                  </select>
                </label>

                <label style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                  Nota interna (no la ve el cliente)
                  <textarea
                    className={styles.input}
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', marginTop: '0.3rem' }}
                    rows={2}
                    value={notaInterna}
                    onChange={(e) => setNotaInterna(e.target.value)}
                  />
                </label>

                <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar} disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            )}

            <button className={styles.btn} onClick={() => setAbierto(false)} style={{ fontSize: '0.8rem' }}>Cerrar</button>
          </div>
        </div>,
        document.querySelector(`.${styles.app}`) ?? document.body
      )}
    </>
  );
}
