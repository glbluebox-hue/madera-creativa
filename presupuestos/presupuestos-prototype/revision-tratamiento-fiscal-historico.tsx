import { useEffect, useState } from 'react';
import * as api from './api.js';
import type { ResumenTratamientoFiscalHistorico } from './api.js';
import styles from './styles.module.css';

/**
 * Revisión de facturas históricas sin tratamiento fiscal (Fase 3C.3) —
 * mecanismo seguro pedido explícitamente: primero analiza EN MEMORIA (sin
 * escribir nada) y muestra un resumen real; solo si el usuario confirma se
 * aplica el tratamiento automático. Nunca se dispara sola, nunca escribe
 * nada sin esta confirmación explícita, y nunca inventa un porcentaje para
 * las que quedan en revisión manual o pendientes de una pregunta factual
 * (esas se responden abriendo la factura normalmente, con el bloque
 * "Tratamiento fiscal" ya actualizado en `escaner-factura.tsx`).
 */
export function RevisionTratamientoFiscalHistorico({ onCerrar, onAplicado }: { onCerrar: () => void; onAplicado: () => void }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenTratamientoFiscalHistorico | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<{ resueltas: number; conPregunta: number; sinCambios: number } | null>(null);

  useEffect(() => {
    let cancelado = false;
    api.analizarTratamientoFiscalHistorico()
      .then((r) => { if (!cancelado) setResumen(r); })
      .catch(() => { if (!cancelado) setError('No se pudo analizar el tratamiento fiscal de las facturas históricas.'); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, []);

  const aplicar = async () => {
    setAplicando(true);
    setError(null);
    try {
      const r = await api.aplicarTratamientoFiscalHistorico();
      setResultado(r);
      onAplicado();
    } catch {
      setError('No se pudo aplicar el tratamiento fiscal automático.');
    } finally {
      setAplicando(false);
    }
  };

  return (
    <div className={styles.modalFondo} onClick={onCerrar}>
      <div className={styles.modalCaja} style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalCabecera}>
          <h2 className={styles.h2}>Tratamiento fiscal de facturas antiguas</h2>
          <button className={styles.btnIcono} onClick={onCerrar} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {cargando && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--topo-claro)' }}>Analizando tus facturas de gasto sin tratamiento fiscal…</p>}
          {error && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--rojo)' }}>{error}</p>}

          {resumen && !resultado && (
            <>
              <p style={{ margin: 0, fontSize: '0.85rem' }}>
                Tienes <strong>{resumen.total}</strong> factura{resumen.total !== 1 ? 's' : ''} de gasto sin tratamiento fiscal todavía.
              </p>
              {resumen.total > 0 && (
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <li>✓ <strong>{resumen.resolublesAutomaticamente}</strong> se pueden resolver automáticamente ahora mismo.</li>
                  <li>? <strong>{resumen.necesitanPregunta}</strong> necesitan que respondas un dato factual (se te preguntará al abrir cada una).</li>
                  <li>— <strong>{resumen.revisionManual}</strong> quedan en revisión manual — todavía no tenemos una regla ni una pregunta para ellas.</li>
                </ul>
              )}
              {resumen.total === 0 ? (
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>No hay ninguna factura pendiente — todas tus facturas de gasto ya tienen un tratamiento fiscal decidido.</p>
              ) : (
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
                  No se guarda nada hasta que lo confirmes. Solo se aplicarán las {resumen.resolublesAutomaticamente} resolubles automáticamente
                  {resumen.necesitanPregunta > 0 && ` y se dejará preparada la pregunta para las ${resumen.necesitanPregunta} que la necesiten`};
                  las de revisión manual no se tocan.
                </p>
              )}
            </>
          )}

          {resultado && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--verde, #2e7d32)' }}>
              ✓ Aplicado: {resultado.resueltas} factura{resultado.resueltas !== 1 ? 's' : ''} resuelta{resultado.resueltas !== 1 ? 's' : ''} automáticamente
              {resultado.conPregunta > 0 && `, ${resultado.conPregunta} con una pregunta lista para cuando las abras`}.
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar} style={{ flex: 1, justifyContent: 'center' }}>
              {resultado ? 'Cerrar' : 'Cancelar'}
            </button>
            {resumen && !resultado && resumen.total > 0 && (
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={aplicar} disabled={aplicando} style={{ flex: 2, justifyContent: 'center' }}>
                {aplicando ? 'Aplicando…' : 'Aplicar tratamiento automático'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
