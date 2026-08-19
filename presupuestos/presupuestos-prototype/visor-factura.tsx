import { useEffect, useState } from 'react';
import type { Factura } from './types.js';
import { formatoEuroPrivado, formatoFecha } from './calculos.js';
import { paginasVisualizablesDeFactura } from './factura-paginas.js';
import * as api from './api.js';
import { urlImagenFiable } from './imagen-fallback.js';
import styles from './styles.module.css';

export type VisorFacturaProps = {
  facturaId: string;
  onCerrar: () => void;
  /** Si no se pasa, el botón "Editar" no se muestra — usado en contextos (p. ej. la ficha de un proveedor) que no tienen el editor de facturas disponible. */
  onEditar?: (f: Factura) => void;
  onDescargarPdf: (id: string) => void;
  /** Modo privacidad activo — oculta el importe (el interruptor vive en Inicio; ver `use-privacidad.ts`). */
  privado?: boolean;
};

/**
 * Ventana de solo-visualización de una factura — clic en "Ver" desde la
 * lista, sin entrar en modo edición. Pide la factura completa (la lista no
 * trae `imagen`/`paginas` por ligereza) y muestra sus páginas en grande,
 * con los datos (proveedor, fecha, importe) como cabecera.
 */
export function VisorFactura({ facturaId, onCerrar, onEditar, onDescargarPdf, privado = false }: VisorFacturaProps) {
  const [factura, setFactura] = useState<Factura | null>(null);
  const [cargando, setCargando] = useState(true);
  const [paginaActiva, setPaginaActiva] = useState(0);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    api.obtenerFactura(facturaId).then((f) => { if (activo) { setFactura(f); setCargando(false); } });
    return () => { activo = false; };
  }, [facturaId]);

  const paginas = factura ? paginasVisualizablesDeFactura(factura) : [];
  const paginaActual = paginas[paginaActiva];

  return (
    <div className={styles.modalFondo} onClick={onCerrar}>
      <div className={styles.modalCaja} style={{ maxWidth: 640, maxHeight: '92dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalCabecera}>
          <h2 className={styles.h2} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{factura?.proveedor || factura?.concepto || 'Factura'}</span>
          </h2>
          <button className={styles.btnIcono} onClick={onCerrar} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {cargando ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--topo-claro)' }}>Cargando factura…</p>
          ) : !factura ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--rojo)' }}>No se pudo cargar esta factura.</p>
          ) : (
            <>
              {/* Datos */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem', fontSize: '0.82rem' }}>
                <span><strong style={{ color: 'var(--topo-claro)', fontWeight: 600 }}>Fecha:</strong> {formatoFecha(factura.fecha)}</span>
                <span><strong style={{ color: 'var(--topo-claro)', fontWeight: 600 }}>Importe:</strong> <span style={{ color: factura.tipo === 'ingreso' ? 'var(--verde)' : 'var(--rojo)', fontWeight: 700 }}>{!privado && (factura.tipo === 'ingreso' ? '+' : '-')}{formatoEuroPrivado(factura.importe, privado)}</span></span>
                {factura.numeroFactura && <span><strong style={{ color: 'var(--topo-claro)', fontWeight: 600 }}>Nº factura:</strong> {factura.numeroFactura}</span>}
                {factura.categoria && <span><strong style={{ color: 'var(--topo-claro)', fontWeight: 600 }}>Categoría:</strong> {factura.categoria}</span>}
              </div>
              {factura.concepto && <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo)' }}>{factura.concepto}</p>}

              {/* Documento */}
              {paginas.length === 0 ? (
                <div className={styles.tabVacio}>
                  <div className={styles.tabVacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                  </div>
                  <p>Esta factura no tiene ningún documento adjunto.</p>
                </div>
              ) : (
                <>
                  {paginas.length > 1 && (
                    <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
                      {paginas.map((p, i) => (
                        <button key={i} onClick={() => setPaginaActiva(i)}
                          style={{ flexShrink: 0, width: 44, height: 58, border: `2px solid ${i === paginaActiva ? 'var(--topo)' : 'var(--borde)'}`,
                            borderRadius: 6, overflow: 'hidden', cursor: 'pointer', padding: 0, background: 'var(--fondo)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--topo-claro)', position: 'relative' }}>
                          {p.tipo === 'pdf' ? (
                            <span style={{ fontSize: '0.6rem', fontWeight: 700 }}>PDF</span>
                          ) : (
                            <img src={urlImagenFiable(p.url)} alt={`Página ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          )}
                          <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: i === paginaActiva ? 'var(--topo)' : 'rgba(0,0,0,0.45)',
                            color: 'var(--blanco)', fontSize: '0.55rem', textAlign: 'center', fontWeight: 700, padding: '1px 0' }}>{i + 1}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ border: '1px solid var(--borde)', borderRadius: 8, overflow: 'hidden', background: 'var(--fondo)' }}>
                    {paginaActual.tipo === 'pdf' ? (
                      <iframe src={urlImagenFiable(paginaActual.url)} title="Documento de la factura" style={{ width: '100%', height: 420, border: 'none', display: 'block' }} />
                    ) : (
                      <img src={urlImagenFiable(paginaActual.url)} alt="Documento de la factura" style={{ width: '100%', maxHeight: 420, objectFit: 'contain', display: 'block' }} />
                    )}
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                {paginas.length > 0 && (
                  <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => onDescargarPdf(factura.id)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    Descargar PDF
                  </button>
                )}
                {onEditar && (
                  <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => onEditar(factura)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
                    Editar
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
