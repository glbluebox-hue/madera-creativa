import { useEffect, useState } from 'react';
import * as api from './api.js';
import type { FacturaConProblemaFiscal } from './api.js';
import type { Factura } from './types.js';
import styles from './styles.module.css';

/**
 * Detector de facturas con posible desglose fiscal incorrecto (auditoría
 * 12/09/2026) — SOLO LECTURA: analiza y muestra, nunca corrige, nunca
 * reextrae con IA, nunca guarda nada. Pensado sobre todo para localizar las
 * facturas afectadas por el bug real de extracción con varios tramos de
 * IGIC/IVA (un albarán con partidas al 3% y al 7%, por ejemplo), que
 * quedaron guardadas con datos incompletos antes de que existiera
 * `lineasFiscales`. El usuario decide, factura a factura, si la abre y la
 * corrige (reextrayendo con IA o a mano) — este panel solo es un listado.
 */

const ETIQUETA_CATEGORIA: Record<string, string> = {
  descuadre_total: 'Descuadre con el importe total',
  datos_fiscales_incompletos: 'Datos fiscales incompletos',
  tipo_exento_con_cuota: 'Exenta/sin impuesto con cuota',
  mezcla_iva_igic: 'Mezcla de IVA e IGIC',
};

export function RevisionDesglosefiscalIncorrecto({ onCerrar, onAbrirFactura }: { onCerrar: () => void; onAbrirFactura: (f: Factura) => void }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ total: number; porCategoria: Record<string, number>; facturas: FacturaConProblemaFiscal[] } | null>(null);
  /** id de la factura que se está abriendo en este momento — para deshabilitar solo su botón mientras carga. */
  const [abriendoId, setAbriendoId] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    api.detectarDesglosesFiscalesIncorrectos()
      .then((r) => { if (!cancelado) setResultado(r); })
      .catch(() => { if (!cancelado) setError('No se pudo analizar el desglose fiscal de las facturas.'); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, []);

  const abrir = async (id: string) => {
    setAbriendoId(id);
    setError(null);
    try {
      const factura = await api.obtenerFactura(id);
      onAbrirFactura(factura);
    } catch {
      setError('No se pudo abrir esa factura — inténtalo de nuevo.');
      setAbriendoId(null);
    }
  };

  return (
    <div className={styles.modalFondo} onClick={onCerrar}>
      <div className={styles.modalCaja} style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalCabecera}>
          <h2 className={styles.h2}>Facturas con posible desglose fiscal incorrecto</h2>
          <button className={styles.btnIcono} onClick={onCerrar} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {cargando && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--topo-claro)' }}>Analizando el desglose fiscal de tus facturas…</p>}
          {error && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--rojo)' }}>{error}</p>}

          {resultado && (
            <>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>
                {resultado.total === 0
                  ? 'No hay ninguna factura con un desglose fiscal que no cuadre — todo correcto.'
                  : <>Se han encontrado <strong>{resultado.total}</strong> factura{resultado.total !== 1 ? 's' : ''} con algo que revisar.</>}
              </p>
              {resultado.total > 0 && (
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  {Object.entries(resultado.porCategoria).map(([categoria, n]) => (
                    <li key={categoria}>{ETIQUETA_CATEGORIA[categoria] ?? categoria}: <strong>{n}</strong></li>
                  ))}
                </ul>
              )}
              {resultado.total > 0 && (
                <>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--topo-claro)' }}>
                    Este análisis no modifica nada. Ábrelas una a una y corrígelas a mano (reextrayendo con IA o editando el desglose) — no hay corrección automática posible, porque el dato que falta no se puede reconstruir por software.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 320, overflowY: 'auto' }}>
                    {resultado.facturas.map((f) => (
                      <div key={f.id} style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '0.85rem' }}>{f.proveedor || f.concepto || 'Sin nombre'}</strong>
                          <span style={{ fontSize: '0.78rem', color: 'var(--topo-claro)' }}>{f.fecha} · {f.importe.toFixed(2)}€</span>
                        </div>
                        <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--ocre, #a67c00)' }}>{ETIQUETA_CATEGORIA[f.categoria] ?? f.categoria}</span>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo)' }}>{f.explicacion}</p>
                        {f.diferencia !== null && (
                          <span style={{ fontSize: '0.74rem', color: 'var(--topo-claro)' }}>Diferencia: {f.diferencia.toFixed(2)}€</span>
                        )}
                        <button
                          type="button" className={`${styles.btn} ${styles.btnSecundario}`}
                          style={{ alignSelf: 'flex-start', fontSize: '0.74rem', marginTop: '0.2rem' }}
                          onClick={() => abrir(f.id)}
                          disabled={abriendoId === f.id}
                        >
                          {abriendoId === f.id ? 'Abriendo…' : 'Abrir para corregir'}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar} style={{ flex: 1, justifyContent: 'center' }}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
