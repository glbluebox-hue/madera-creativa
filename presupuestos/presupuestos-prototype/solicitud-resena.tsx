import { useState } from 'react';
import QRCode from 'qrcode';
import * as api from './api.js';
import { puedeUsar, PRO_O_SUPERIOR, type PlanAcceso } from './planes.js';
import { CandadoPlan } from './candado-plan.js';
import styles from './styles.module.css';

const IconoEstrella = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

/** Props del botón/modal de solicitud de reseña. */
export type SolicitudResenaProps = {
  /** Cliente (identidad) para el que se genera el enlace individual. */
  clienteId: string;
  /** Plan de la sesión actual (Fase 2.5, 04/09/2026) — esta función exige PRO+ en el servidor (`requirePlan`); sin plan suficiente, el botón se muestra deshabilitado con el motivo, en vez de fallar al pulsarlo. */
  plan?: PlanAcceso;
  /** Bypass administrativo (05/09/2026) — ver `puedeUsar()` en `planes.ts`. */
  esAdmin?: boolean;
};

/**
 * Botón "Pedir reseña" de la cabecera de la ficha — genera un enlace/QR
 * individual y seguro para ESTE cliente (uno por cliente, revocando el
 * anterior al regenerarlo) que, al abrirse o escanearse, muestra el cartel
 * de agradecimiento de la empresa y un botón hacia la reseña de Google
 * (ver `resena-rutas.ts`). El QR se genera en el
 * propio navegador con el mismo paquete (`qrcode`) que ya usa el Motor
 * Documental para el elemento "Código QR" — no hace falta pedirlo al
 * servidor.
 */
export function SolicitudResena({ clienteId, plan, esAdmin }: SolicitudResenaProps) {
  const tienePlan = puedeUsar(plan, PRO_O_SUPERIOR, esAdmin);
  const [abierto, setAbierto] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generar = async () => {
    setGenerando(true);
    setError(null);
    try {
      const { token } = await api.generarEnlaceResena(clienteId);
      const enlace = `${window.location.origin}/resena/${token}`;
      const qr = await QRCode.toDataURL(enlace, { margin: 1 });
      setUrl(enlace);
      setQrDataUrl(qr);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el enlace.');
    } finally {
      setGenerando(false);
    }
  };

  const abrir = () => {
    setAbierto(true);
    setUrl(null);
    setQrDataUrl(null);
    setError(null);
  };

  const copiar = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* portapapeles no disponible — el enlace ya se ve en el campo, se puede seleccionar a mano */ }
  };

  return (
    <>
      {tienePlan ? (
        <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={abrir} title="Generar enlace/QR de solicitud de reseña">
          {IconoEstrella} Pedir reseña
        </button>
      ) : (
        <button className={`${styles.btn} ${styles.btnSecundario}`} disabled style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', opacity: 0.7, cursor: 'not-allowed' }} title="Pedir reseña requiere el plan PRO o superior">
          {IconoEstrella} Pedir reseña <CandadoPlan planMinimo="PRO" compacto />
        </button>
      )}

      {abierto && tienePlan && (
        <div className={styles.overlay} onClick={() => setAbierto(false)}>
          <div
            className={styles.modal}
            style={{ maxWidth: 380, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>Solicitar reseña</p>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo-claro)' }}>
              Genera un enlace y código QR propios de este cliente. Al pulsarlo o escanearlo, verá el cartel de agradecimiento y un botón para dejar la reseña en Google.
            </p>

            {error && <p style={{ color: 'var(--rojo)', fontSize: '0.82rem', margin: 0 }}>{error}</p>}

            {!url ? (
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={generar} disabled={generando}>
                {generando ? 'Generando…' : 'Generar enlace'}
              </button>
            ) : (
              <>
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt="Código QR de la reseña"
                    style={{ width: 200, height: 200, alignSelf: 'center', imageRendering: 'pixelated', borderRadius: 6, border: '1px solid var(--borde)' }}
                  />
                )}
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
                  Al regenerar, el enlace y el QR anteriores dejan de funcionar.
                </p>
              </>
            )}

            <button className={styles.btn} onClick={() => setAbierto(false)} style={{ fontSize: '0.8rem' }}>Cerrar</button>
          </div>
        </div>
      )}
    </>
  );
}
