import { useState, useRef } from 'react';
import type { Factura, Proveedor } from './types.js';
import { EscanerDocumento } from './escaner-documento.js';
import type { ResultadoEscaneo } from './escaner-documento.js';
import { ImporteInput } from './importe-input.js';
import styles from './styles.module.css';

/** Props del escáner de facturas. */
export type EscanerFacturaProps = {
  /** Lista de clientes para vincular la factura de gasto. */
  clientes: { id: string; nombre: string }[];
  /** Lista de proveedores para el desplegable. */
  proveedores?: Proveedor[];
  /** Callback al guardar la factura procesada. */
  onGuardar: (f: Factura) => void;
  /** Callback al cerrar sin guardar. */
  onCerrar: () => void;
  /** Factura existente para editar (si se pasa, el modal abre en modo edición). */
  facturaEditar?: Factura;
};

/** Una página del documento escaneado. */
type Pagina = { id: string; dataUrl: string; nombre: string };

/** Genera un id único. */
function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Lee un File y devuelve su dataURL. */
function leerArchivo(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target?.result as string);
    reader.readAsDataURL(file);
  });
}

/**
 * Modal para añadir facturas manualmente o con captura de imagen.
 * Soporta múltiples hojas/páginas que se combinan como un único documento.
 */
export function EscanerFactura({ clientes, proveedores = [], onGuardar, onCerrar, facturaEditar }: EscanerFacturaProps) {
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const esEdicion = !!facturaEditar;
  const [paginas, setPaginas] = useState<Pagina[]>(() =>
    facturaEditar?.imagen ? [{ id: uid(), dataUrl: facturaEditar.imagen, nombre: 'Imagen actual' }] : []
  );
  const [paginaVista, setPaginaVista] = useState(0);
  const [tipo, setTipo] = useState<'ingreso' | 'gasto'>(facturaEditar?.tipo ?? 'gasto');
  const [fecha, setFecha] = useState(facturaEditar?.fecha ?? new Date().toISOString().slice(0, 10));
  const [importe, setImporte] = useState(facturaEditar ? String(facturaEditar.importe) : '');
  const [concepto, setConcepto] = useState(facturaEditar?.concepto ?? '');
  const [proveedor, setProveedor] = useState(facturaEditar?.proveedor ?? '');
  const [clienteId, setClienteId] = useState(facturaEditar?.clienteId ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const [escanerDocAbierto, setEscanerDocAbierto] = useState(false);

  /** Cuando el escáner de documento confirma, rellena campos automáticamente. */
  const onDocumentoEscaneado = (r: ResultadoEscaneo) => {
    // Añadir la imagen como página
    setPaginas(prev => {
      const nueva = { id: uid(), dataUrl: r.dataUrl, nombre: 'Documento escaneado' };
      const updated = [...prev, nueva];
      setPaginaVista(updated.length - 1);
      return updated;
    });
    // Rellenar campos con datos OCR
    if (r.importe) setImporte(r.importe.toFixed(2));
    if (r.tipo) setTipo(r.tipo);
    if (r.proveedor) setProveedor(r.proveedor);
    if (r.fecha) setFecha(r.fecha);
    setEscanerDocAbierto(false);
  };

  /** Añade uno o más archivos como páginas nuevas al final. */
  const agregarArchivos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const nuevas: Pagina[] = [];
    for (const file of Array.from(files)) {
      const dataUrl = await leerArchivo(file);
      nuevas.push({ id: uid(), dataUrl, nombre: file.name });
    }
    setPaginas(prev => {
      const updated = [...prev, ...nuevas];
      setPaginaVista(updated.length - 1);
      return updated;
    });
  };

  const quitarPagina = (id: string) => {
    setPaginas(prev => {
      const updated = prev.filter(p => p.id !== id);
      setPaginaVista(v => Math.min(v, Math.max(0, updated.length - 1)));
      return updated;
    });
  };

  const moverPagina = (id: string, dir: -1 | 1) => {
    setPaginas(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx < 0) return prev;
      const nuevo = idx + dir;
      if (nuevo < 0 || nuevo >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[nuevo]] = [arr[nuevo], arr[idx]];
      setPaginaVista(nuevo);
      return arr;
    });
  };

  const guardar = () => {
    const f: Factura = {
      // En edición conservar id y fecha de creación originales
      id: facturaEditar?.id ?? uid(),
      tipo,
      fecha,
      concepto,
      importe: parseFloat(String(importe).replace(',', '.')) || 0,
      proveedor,
      clienteId: tipo === 'gasto' ? clienteId : '',
      imagen: paginas[0]?.dataUrl ?? facturaEditar?.imagen ?? '',
      imagenes: paginas.length ? paginas.map(p => p.dataUrl) : facturaEditar?.imagenes ?? [],
      creado: facturaEditar?.creado ?? new Date().toISOString(),
    };
    onGuardar(f);
  };

  const paginaActual = paginas[paginaVista];

  return (
    <div className={styles.modalFondo} onClick={onCerrar}>
      <div className={styles.modalCaja} style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalCabecera}>
          <h2 className={styles.h2}>{esEdicion ? '✏️ Editar factura' : '🧾 Nueva factura'}</h2>
          <button className={styles.btnIcono} onClick={onCerrar}>✕</button>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ── Botones de captura ── */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input ref={camaraRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
              onChange={e => agregarArchivos(e.target.files)} />
            <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ flex: 1, justifyContent: 'center', minWidth: 80 }}
              onClick={() => camaraRef.current?.click()}>📷 Foto</button>
            {/* Escáner de documento con detección automática */}
            <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ flex: 2, justifyContent: 'center', minWidth: 140 }}
              onClick={() => setEscanerDocAbierto(true)}>
              📄 Escanear y detectar precio
            </button>
            <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }}
              onChange={e => agregarArchivos(e.target.files)} />
            <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ flex: 1, justifyContent: 'center', minWidth: 80 }}
              onClick={() => inputRef.current?.click()}>⬆️ Subir</button>
          </div>

          {/* Escáner de documento modal */}
          {escanerDocAbierto && (
            <EscanerDocumento
              onCerrar={() => setEscanerDocAbierto(false)}
              onConfirmar={onDocumentoEscaneado}
            />
          )}

          {/* ── Visor multihoja ── */}
          {paginas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

              {/* Miniaturas de páginas */}
              <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                {paginas.map((p, i) => (
                  <div key={p.id}
                    onClick={() => setPaginaVista(i)}
                    style={{ position: 'relative', flexShrink: 0, cursor: 'pointer',
                      border: `2px solid ${i === paginaVista ? 'var(--topo)' : 'var(--borde)'}`,
                      borderRadius: 6, overflow: 'hidden', width: 54, height: 72,
                      background: '#f5f3ef',
                    }}
                  >
                    <img src={p.dataUrl} alt={`Hoja ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: i === paginaVista ? 'var(--topo)' : 'rgba(0,0,0,0.45)',
                      color: '#fff', fontSize: '0.6rem', textAlign: 'center', padding: '1px 0', fontWeight: 700 }}>
                      {i + 1}
                    </span>
                  </div>
                ))}
                {/* Botón añadir hoja */}
                <button
                  onClick={() => inputRef.current?.click()}
                  style={{ flexShrink: 0, width: 54, height: 72, border: '2px dashed var(--borde)',
                    borderRadius: 6, background: 'transparent', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--topo-claro)', fontSize: '1.2rem', gap: '2px' }}
                  title="Añadir hoja">
                  <span>＋</span>
                  <span style={{ fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.02em' }}>HOJA</span>
                </button>
              </div>

              {/* Vista previa de la hoja seleccionada */}
              {paginaActual && (
                <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--borde)', background: '#f5f3ef' }}>
                  <img src={paginaActual.dataUrl} alt={`Hoja ${paginaVista + 1}`}
                    style={{ width: '100%', maxHeight: 180, objectFit: 'contain', display: 'block' }} />
                  {/* Controles de la hoja activa */}
                  <div style={{ display: 'flex', gap: '0.35rem', padding: '0.4rem 0.5rem',
                    background: 'rgba(248,246,242,0.95)', borderTop: '1px solid var(--borde-fino)',
                    justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--topo-claro)', fontWeight: 600 }}>
                      Hoja {paginaVista + 1} / {paginas.length}
                    </span>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button onClick={() => moverPagina(paginaActual.id, -1)} disabled={paginaVista === 0}
                        className={styles.btnIcono} title="Mover antes" style={{ opacity: paginaVista === 0 ? 0.3 : 1 }}>←</button>
                      <button onClick={() => moverPagina(paginaActual.id, 1)} disabled={paginaVista === paginas.length - 1}
                        className={styles.btnIcono} title="Mover después" style={{ opacity: paginaVista === paginas.length - 1 ? 0.3 : 1 }}>→</button>
                      <button onClick={() => quitarPagina(paginaActual.id)}
                        className={styles.btnIcono} title="Quitar hoja" style={{ color: 'var(--rojo)' }}>🗑</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tipo */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`${styles.btn} ${tipo === 'ingreso' ? styles.btnVerde : styles.btnSecundario}`}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setTipo('ingreso')}
            >
              💰 Ingreso
            </button>
            <button
              className={`${styles.btn} ${tipo === 'gasto' ? styles.btnPeligro : styles.btnSecundario}`}
              style={{ flex: 1, justifyContent: 'center', color: tipo === 'gasto' ? 'var(--rojo)' : undefined }}
              onClick={() => setTipo('gasto')}
            >
              🧾 Gasto
            </button>
          </div>

          <label className={styles.label}>Fecha
            <input className={styles.input} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>

          <label className={styles.label}>Importe (€)
            <ImporteInput value={importe} onChange={setImporte} placeholder="0,00" />
          </label>

          <label className={styles.label}>Proveedor / Emisor
            <div style={{ position: 'relative' }}>
              <input
                className={styles.input}
                type="text"
                placeholder="Nombre del proveedor"
                value={proveedor}
                onChange={(e) => { setProveedor(e.target.value); setMostrarSugerencias(true); }}
                onFocus={() => setMostrarSugerencias(true)}
                onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
                autoComplete="off"
              />
              {/* Desplegable de proveedores existentes */}
              {mostrarSugerencias && proveedores.length > 0 && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
                  background: '#fff', border: '1px solid var(--borde)', borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100,
                  maxHeight: 180, overflowY: 'auto',
                }}>
                  {proveedores
                    .filter(p => !proveedor.trim() || p.nombre.toLowerCase().includes(proveedor.toLowerCase()))
                    .map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => { setProveedor(p.nombre); setMostrarSugerencias(false); }}
                        style={{
                          width: '100%', textAlign: 'left', background: 'none', border: 'none',
                          padding: '0.55rem 0.85rem', cursor: 'pointer', fontSize: '0.85rem',
                          color: 'var(--negro)', display: 'flex', alignItems: 'center', gap: '0.5rem',
                          borderBottom: '1px solid var(--borde-fino)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--fondo)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <span>🏭</span>
                        <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                        {p.contacto && <span style={{ fontSize: '0.72rem', color: 'var(--topo-claro)', marginLeft: 'auto' }}>{p.contacto}</span>}
                      </button>
                    ))
                  }
                  {proveedores.filter(p => !proveedor.trim() || p.nombre.toLowerCase().includes(proveedor.toLowerCase())).length === 0 && (
                    <p style={{ margin: 0, padding: '0.6rem 0.85rem', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>Sin proveedores — se creará uno nuevo al guardar</p>
                  )}
                </div>
              )}
            </div>
          </label>

          <label className={styles.label}>Concepto
            <input className={styles.input} type="text" placeholder="Descripción de la factura" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </label>

          {tipo === 'gasto' && clientes.length > 0 && (
            <label className={styles.label}>Vincular a cliente (opcional)
              <select className={styles.select} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Sin cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar} style={{ flex: 1, justifyContent: 'center' }}>
              Cancelar
            </button>
            <button
              className={`${styles.btn} ${styles.btnPrimario}`}
              style={{ flex: 2, justifyContent: 'center' }}
              disabled={!importe || parseFloat(String(importe).replace(',', '.')) <= 0}
              onClick={guardar}
            >
              {esEdicion ? '✅ Guardar cambios' : 'Guardar factura'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
