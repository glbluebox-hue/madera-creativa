import { useState, useEffect, useCallback } from 'react';
import type { Proveedor, Producto, Factura } from './types.js';
import * as api from './api.js';
import { formatoEuroPrivado, formatoFecha } from './calculos.js';
import { ImporteInput } from './importe-input.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import { useAvisoGuardado, AvisoGuardado } from './aviso-guardado.js';
import { colorAvatar } from './avatar-utils.js';
import { VisorFactura } from './visor-factura.js';
import styles from './styles.module.css';

/** Props de la sección de proveedores. */
export type SeccionProveedoresProps = {
  proveedores: Proveedor[];
  productos: Producto[];
  /** Modo privacidad activo — oculta los importes (el interruptor vive en Inicio; ver `use-privacidad.ts`). */
  privado: boolean;
  onCrearProveedor: (p: Omit<Proveedor, 'id' | 'creado'>) => void;
  onActualizarProveedor: (p: Proveedor) => void;
  onBorrarProveedor: (id: string) => void;
  onCrearProducto: (p: Omit<Producto, 'id'>) => void;
  onActualizarProducto: (p: Producto) => void;
  onBorrarProducto: (id: string) => void;
};

type VistaProveedores = 'lista' | 'ficha' | 'catalogo';

// Iconos de línea reutilizados en esta sección (Dirección Creativa) — sustituyen a los emoji anteriores.
// Tamaño por defecto pensado para texto en línea; se puede ampliar (p. ej. estados vacíos) con la prop `s`.
const IconoEditar = ({ s = 15 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>;
const IconoCerrar = ({ s = 14 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const IconoProveedor = ({ s = 17 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>;
const IconoProducto = ({ s = 16 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>;
const IconoContacto = ({ s = 13 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
const IconoTelefono = ({ s = 13 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.34 1.9.63 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.29 1.85.5 2.81.63A2 2 0 0 1 22 16.92z" /></svg>;
const IconoEmail = ({ s = 13 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><polyline points="22 6 12 13 2 6" /></svg>;
const IconoUbicacion = ({ s = 13 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>;
const IconoFactura = ({ s = 16 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>;
const IconoBuscar = ({ s = 14 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
const IconoOjo = ({ s = 13 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
const IconoDescargar = ({ s = 13 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>;

const CATEGORIAS = ['Tableros', 'Herrajes', 'Barnices y pinturas', 'Cantos', 'Perfiles', 'Vidrio', 'Iluminación', 'Otros'];
const UNIDADES = ['ud', 'm²', 'ml', 'm³', 'kg', 'litro', 'caja', 'rollo'];

/** Formulario de proveedor. */
function FormProveedor({
  inicial,
  onGuardar,
  onCerrar,
}: {
  inicial?: Partial<Proveedor>;
  onGuardar: (datos: Omit<Proveedor, 'id' | 'creado'>) => void;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [contacto, setContacto] = useState(inicial?.contacto ?? '');
  const [telefono, setTelefono] = useState(inicial?.telefono ?? '');
  const [email, setEmail] = useState(inicial?.email ?? '');
  const [direccion, setDireccion] = useState(inicial?.direccion ?? '');
  const [notas, setNotas] = useState(inicial?.notas ?? '');

  return (
    <div className={styles.modalFondo} onClick={onCerrar}>
      <div className={styles.modalCaja} style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className={styles.modalCabecera}>
          <h2 className={styles.h2} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <IconoEditar />
            {inicial?.nombre ? 'Editar proveedor' : 'Nuevo proveedor'}
          </h2>
          <button className={styles.btnIcono} onClick={onCerrar} aria-label="Cerrar"><IconoCerrar /></button>
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label className={styles.label}>Nombre *<input className={styles.input} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del proveedor" /></label>
          <label className={styles.label}>Contacto<input className={styles.input} value={contacto} onChange={e => setContacto(e.target.value)} placeholder="Nombre de la persona de contacto" /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <label className={styles.label}>Teléfono<input className={styles.input} type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="612 345 678" /></label>
            <label className={styles.label}>Email<input className={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="info@proveedor.com" /></label>
          </div>
          <label className={styles.label}>Dirección<input className={styles.input} value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Calle, ciudad…" /></label>
          <label className={styles.label}>Notas<textarea className={styles.input} value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Condiciones, descuentos habituales…" /></label>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cancelar</button>
            <button className={`${styles.btn} ${styles.btnPrimario}`} disabled={!nombre.trim()} onClick={() => onGuardar({ nombre, contacto, telefono, email, direccion, notas })}>Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Formulario de producto/material. */
function FormProducto({
  inicial,
  proveedores,
  onGuardar,
  onCerrar,
}: {
  inicial?: Partial<Producto>;
  proveedores: Proveedor[];
  onGuardar: (p: Omit<Producto, 'id'>) => void;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [unidad, setUnidad] = useState(inicial?.unidad ?? 'ud');
  const [precio, setPrecio] = useState(inicial?.precio ? String(inicial.precio) : '');
  const [proveedorId, setProveedorId] = useState(inicial?.proveedorId ?? '');
  const [categoria, setCategoria] = useState(inicial?.categoria ?? '');

  return (
    <div className={styles.modalFondo} onClick={onCerrar}>
      <div className={styles.modalCaja} style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className={styles.modalCabecera}>
          <h2 className={styles.h2} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {inicial?.nombre ? <IconoEditar /> : <IconoProducto />}
            {inicial?.nombre ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          <button className={styles.btnIcono} onClick={onCerrar} aria-label="Cerrar"><IconoCerrar /></button>
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label className={styles.label}>Nombre / referencia *<input className={styles.input} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tablero melamina blanco 244×122" /></label>
          <label className={styles.label}>Descripción<input className={styles.input} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Detalles adicionales…" /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <label className={styles.label}>
              Categoría
              <select className={styles.select} value={categoria} onChange={e => setCategoria(e.target.value)}>
                <option value="">Sin categoría</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className={styles.label}>
              Unidad
              <select className={styles.select} value={unidad} onChange={e => setUnidad(e.target.value)}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
          </div>
          <label className={styles.label}>
            Precio por {unidad} (€)
            <ImporteInput value={precio} onChange={setPrecio} placeholder="0,00" />
          </label>
          <label className={styles.label}>
            Proveedor habitual
            <select className={styles.select} value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
              <option value="">Sin proveedor asignado</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cancelar</button>
            <button
              className={`${styles.btn} ${styles.btnPrimario}`}
              disabled={!nombre.trim()}
              onClick={() => onGuardar({
                nombre, descripcion, unidad,
                precio: parseFloat(precio.replace(',', '.')) || 0,
                proveedorId: proveedorId || undefined,
                categoria: categoria || undefined,
                fechaPrecio: new Date().toISOString(),
              })}
            >Guardar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Sección principal de proveedores y catálogo de materiales.
 * Permite crear fichas de proveedores, ver facturas asociadas y gestionar
 * el catálogo de productos con precios actualizados.
 */
export function SeccionProveedores({
  proveedores, productos, privado,
  onCrearProveedor, onActualizarProveedor, onBorrarProveedor,
  onCrearProducto, onActualizarProducto, onBorrarProducto,
}: SeccionProveedoresProps) {
  const [vista, setVista] = useState<VistaProveedores>('lista');
  const [proveedorActivo, setProveedorActivo] = useState<Proveedor | null>(null);
  const [modalProveedor, setModalProveedor] = useState(false);
  const [editandoProveedor, setEditandoProveedor] = useState<Proveedor | null>(null);
  const [modalProducto, setModalProducto] = useState(false);
  const [editandoProducto, setEditandoProducto] = useState<Producto | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [viendoFacturaId, setViendoFacturaId] = useState<string | null>(null);
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const avisoGuardado = useAvisoGuardado();

  const descargarPdfProveedor = async (id: string) => {
    setDescargandoPdf(true);
    try { await api.descargarPdfFactura(id); } finally { setDescargandoPdf(false); }
  };

  // Total gastado y nº de facturas por proveedor (texto), agregado en el
  // servidor (Incremento 1.5) — antes se calculaba recorriendo el array
  // completo de facturas en memoria, que ya no está disponible entero aquí.
  const [resumenProveedores, setResumenProveedores] = useState<{ proveedor: string; proveedorId?: string; totalGastado: number; numFacturas: number }[]>([]);
  useEffect(() => { api.obtenerResumenPorProveedor().then(setResumenProveedores); }, []);

  // Facturas del proveedor abierto en la ficha — se piden solo para ese
  // proveedor, no para todos a la vez.
  const [facturasProveedorActivo, setFacturasProveedorActivo] = useState<Factura[]>([]);
  useEffect(() => {
    if (!proveedorActivo) { setFacturasProveedorActivo([]); return; }
    api.obtenerFacturasDeProveedor(proveedorActivo.nombre).then(setFacturasProveedorActivo);
  }, [proveedorActivo]);

  /**
   * Filas del resumen que corresponden a un proveedor — prioriza la
   * relación real por `proveedorId` (Fase Facturas Profesional) cuando la
   * fila ya la tiene; si no, cae en la búsqueda difusa por texto de antes,
   * para las facturas creadas antes de que existiera la relación.
   */
  const resumenDeProveedor = useCallback((p: Proveedor) =>
    resumenProveedores.filter(r => (r.proveedorId ? r.proveedorId === p.id : (r.proveedor?.toLowerCase().includes(p.nombre.toLowerCase()) || r.proveedor === p.nombre))),
    [resumenProveedores]);

  /** Total comprado a un proveedor, ya agregado en el servidor. */
  const totalProveedor = (p: Proveedor) =>
    resumenDeProveedor(p).reduce((s, r) => s + r.totalGastado, 0);

  /** Número de facturas de gasto vinculadas a un proveedor. */
  const numFacturasProveedor = (p: Proveedor) =>
    resumenDeProveedor(p).reduce((s, r) => s + r.numFacturas, 0);

  /** Productos de un proveedor. */
  const productosDeProveedor = (p: Proveedor) =>
    productos.filter(prod => prod.proveedorId === p.id);

  const productosFiltrados = productos.filter(p => {
    const matchBusqueda = !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.descripcion?.toLowerCase().includes(busqueda.toLowerCase());
    const matchCat = !categoriaFiltro || p.categoria === categoriaFiltro;
    return matchBusqueda && matchCat;
  });

  const categorias = [...new Set(productos.map(p => p.categoria).filter(Boolean))] as string[];

  // ── VISTA FICHA PROVEEDOR ──
  if ((vista as string) === 'ficha' && proveedorActivo) {
    const factProv = facturasProveedorActivo;
    const prodProv = productosDeProveedor(proveedorActivo);
    const total = totalProveedor(proveedorActivo);

    return (
      <div className={styles.tabPanel}>
        <AvisoGuardado visible={avisoGuardado.visible} />
        <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ marginBottom: '1rem' }}
          onClick={() => { setVista('lista'); setProveedorActivo(null); }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -2, marginRight: 4 }}><polyline points="15 18 9 12 15 6" /></svg>
          Volver
        </button>

        {/* Cabecera proveedor */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <div>
            <h2 className={styles.h2} style={{ margin: '0 0 0.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><IconoProveedor /> {proveedorActivo.nombre}</h2>
            {proveedorActivo.contacto && <p style={{ margin: '0 0 0.1rem', fontSize: '0.82rem', color: 'var(--topo-claro)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><IconoContacto /> {proveedorActivo.contacto}</p>}
            {proveedorActivo.telefono && <p style={{ margin: '0 0 0.1rem', fontSize: '0.82rem', color: 'var(--topo-claro)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><IconoTelefono /> <a href={`tel:${proveedorActivo.telefono}`}>{proveedorActivo.telefono}</a></p>}
            {proveedorActivo.email && <p style={{ margin: '0 0 0.1rem', fontSize: '0.82rem', color: 'var(--topo-claro)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><IconoEmail /> <a href={`mailto:${proveedorActivo.email}`}>{proveedorActivo.email}</a></p>}
            {proveedorActivo.direccion && <p style={{ margin: '0 0 0.1rem', fontSize: '0.82rem', color: 'var(--topo-claro)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><IconoUbicacion /> {proveedorActivo.direccion}</p>}
            {proveedorActivo.notas && <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--topo)', fontStyle: 'italic' }}>"{proveedorActivo.notas}"</p>}
          </div>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => { setEditandoProveedor(proveedorActivo); setModalProveedor(true); }}><IconoEditar /> Editar</button>
        </div>

        {/* KPI total comprado */}
        <div className={styles.kpiGrid} style={{ marginBottom: '1.5rem' }}>
          <div className={styles.kpiTarjeta}>
            <div className={styles.kpiCabecera}>
              <div className={styles.kpiIconoChipTopo} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconoFactura /></div>
              <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Total comprado</span>
            </div>
            <span className={styles.kpiValor}>{formatoEuroPrivado(total, privado)}</span>
            <span className={styles.kpiSub}>{factProv.filter(f => f.tipo === 'gasto').length} facturas</span>
          </div>
          <div className={styles.kpiTarjeta}>
            <div className={styles.kpiCabecera}>
              <div className={styles.kpiIconoChipVerde} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconoProducto /></div>
              <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Productos en catálogo</span>
            </div>
            <span className={styles.kpiValor}>{prodProv.length}</span>
            <span className={styles.kpiSub}>materiales registrados</span>
          </div>
        </div>

        {/* Facturas del proveedor */}
        <h3 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><IconoFactura /> Facturas de compra</h3>
        {factProv.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--topo-claro)', marginBottom: '1.5rem' }}>Sin facturas vinculadas. Las facturas se vinculan automáticamente por nombre del proveedor.</p>
        ) : (
          <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
            <table className={styles.tabla} style={{ width: '100%' }}>
              <thead><tr><th>Fecha</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Importe</th><th></th></tr></thead>
              <tbody>
                {factProv.map(f => (
                  <tr key={f.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{formatoFecha(f.fecha)}</td>
                    <td style={{ fontSize: '0.82rem' }}>{f.concepto || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: f.tipo === 'gasto' ? 'var(--rojo)' : 'var(--verde)', whiteSpace: 'nowrap' }}>{formatoEuroPrivado(f.importe, privado)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {f.tieneDocumento && (
                        <span style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                          <button className={styles.btnIcono} title="Ver factura" aria-label="Ver factura" onClick={() => setViendoFacturaId(f.id)}><IconoOjo /></button>
                          <button className={styles.btnIcono} title="Descargar PDF" aria-label="Descargar PDF" onClick={() => descargarPdfProveedor(f.id)} disabled={descargandoPdf}><IconoDescargar /></button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {viendoFacturaId && (
          <VisorFactura
            facturaId={viendoFacturaId}
            onCerrar={() => setViendoFacturaId(null)}
            onDescargarPdf={descargarPdfProveedor}
            privado={privado}
          />
        )}

        {/* Productos de este proveedor */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><IconoProducto /> Sus materiales en catálogo</h3>
          <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.8rem' }}
            onClick={() => { setEditandoProducto({ proveedorId: proveedorActivo.id } as Producto); setModalProducto(true); }}>
            + Añadir material
          </button>
        </div>
        {prodProv.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--topo-claro)' }}>Sin materiales en el catálogo. Pulsa "+ Añadir material" para registrar precios.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {prodProv.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--fondo)', border: '1px solid var(--borde)', borderRadius: 'var(--radio-md)', padding: '0.6rem 0.85rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem' }}>{p.nombre}</p>
                  {p.descripcion && <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-claro)' }}>{p.descripcion}</p>}
                  {p.categoria && <span style={{ fontSize: '0.65rem', background: 'var(--borde-fino)', color: 'var(--topo)', padding: '1px 6px', borderRadius: 'var(--radio-full, 999px)' }}>{p.categoria}</span>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800, color: 'var(--topo)', fontSize: '0.95rem' }}>{formatoEuroPrivado(p.precio, privado)}</p>
                  <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--topo-claro)' }}>por {p.unidad}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button className={styles.btnIcono} title="Editar material" aria-label="Editar material" onClick={() => { setEditandoProducto(p); setModalProducto(true); }}><IconoEditar /></button>
                  <ConfirmarBorrado onConfirmar={() => onBorrarProducto(p.id)} titulo="Eliminar material" />
                </div>
              </div>
            ))}
          </div>
        )}

        {modalProveedor && editandoProveedor && (
          <FormProveedor
            inicial={editandoProveedor}
            onGuardar={datos => { onActualizarProveedor({ ...proveedorActivo, ...datos }); setProveedorActivo(prev => prev ? { ...prev, ...datos } : prev); setModalProveedor(false); setEditandoProveedor(null); avisoGuardado.mostrar(); }}
            onCerrar={() => { setModalProveedor(false); setEditandoProveedor(null); }}
          />
        )}
        {modalProducto && (
          <FormProducto
            inicial={editandoProducto ?? undefined}
            proveedores={proveedores}
            onGuardar={datos => {
              if (editandoProducto?.id) onActualizarProducto({ ...editandoProducto, ...datos });
              else onCrearProducto(datos);
              setModalProducto(false); setEditandoProducto(null);
              avisoGuardado.mostrar();
            }}
            onCerrar={() => { setModalProducto(false); setEditandoProducto(null); }}
          />
        )}
      </div>
    );
  }

  // ── VISTA CATÁLOGO ──
  if ((vista as string) === 'catalogo') {
    return (
      <div className={styles.tabPanel}>
        <AvisoGuardado visible={avisoGuardado.visible} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <h2 className={styles.h2} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><IconoProducto /> Catálogo de materiales</h2>
          <button className={styles.btnCirculoOscuro} title="Nuevo material" onClick={() => { setEditandoProducto(null); setModalProducto(true); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div className={styles.clientesBusqueda} style={{ flex: 1, minWidth: 160 }}>
            <IconoBuscar />
            <input placeholder="Buscar material…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <select className={styles.select} style={{ width: 160 }} value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {productosFiltrados.length === 0 ? (
          <div className={styles.vacio}>
            <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center' }}><IconoProducto s={40} /></div>
            <p>{busqueda || categoriaFiltro ? 'Sin resultados.' : 'El catálogo está vacío.\nAñade materiales con sus precios.'}</p>
            <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => { setEditandoProducto(null); setModalProducto(true); }}>+ Añadir primer material</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {categorias.length > 0
              ? CATEGORIAS.filter(c => productosFiltrados.some(p => p.categoria === c) || (!categoriaFiltro && productosFiltrados.some(p => !p.categoria))).map(cat => {
                  const items = productosFiltrados.filter(p => p.categoria === cat);
                  if (!items.length) return null;
                  return (
                    <div key={cat}>
                      <p style={{ margin: '0.75rem 0 0.3rem', fontSize: '0.72rem', fontWeight: 800, color: 'var(--topo-claro)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{cat}</p>
                      {items.map(p => <ProductoFila key={p.id} p={p} prov={proveedores.find(x => x.id === p.proveedorId)} privado={privado} onEditar={() => { setEditandoProducto(p); setModalProducto(true); }} onBorrar={() => onBorrarProducto(p.id)} />)}
                    </div>
                  );
                })
              : productosFiltrados.map(p => <ProductoFila key={p.id} p={p} prov={proveedores.find(x => x.id === p.proveedorId)} privado={privado} onEditar={() => { setEditandoProducto(p); setModalProducto(true); }} onBorrar={() => onBorrarProducto(p.id)} />)
            }
            {productosFiltrados.some(p => !p.categoria) && (
              <>
                {categorias.length > 0 && <p style={{ margin: '0.75rem 0 0.3rem', fontSize: '0.72rem', fontWeight: 800, color: 'var(--topo-claro)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Sin categoría</p>}
                {productosFiltrados.filter(p => !p.categoria).map(p => <ProductoFila key={p.id} p={p} prov={proveedores.find(x => x.id === p.proveedorId)} privado={privado} onEditar={() => { setEditandoProducto(p); setModalProducto(true); }} onBorrar={() => onBorrarProducto(p.id)} />)}
              </>
            )}
          </div>
        )}

        {modalProducto && (
          <FormProducto
            inicial={editandoProducto ?? undefined}
            proveedores={proveedores}
            onGuardar={datos => {
              if (editandoProducto?.id) onActualizarProducto({ ...editandoProducto, ...datos });
              else onCrearProducto(datos);
              setModalProducto(false); setEditandoProducto(null);
              avisoGuardado.mostrar();
            }}
            onCerrar={() => { setModalProducto(false); setEditandoProducto(null); }}
          />
        )}
      </div>
    );
  }

  // ── VISTA LISTA PROVEEDORES ──
  return (
    <div className={styles.tabPanel}>
      <AvisoGuardado visible={avisoGuardado.visible} />
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--borde-fino)', borderRadius: 'var(--radio-md)', padding: '3px' }}>
          <button className={`${styles.btn} ${vista === 'lista' ? styles.btnPrimario : ''}`} style={{ fontSize: '0.82rem' }} onClick={() => setVista('lista')}><IconoProveedor s={14} /> Proveedores</button>
          <button className={`${styles.btn} ${vista === 'catalogo' ? styles.btnPrimario : ''}`} style={{ fontSize: '0.82rem' }} onClick={() => setVista('catalogo')}><IconoProducto s={14} /> Catálogo</button>
        </div>
        <button className={styles.btnCirculoOscuro} style={{ marginLeft: 'auto' }} title="Nuevo proveedor" data-tutorial-id="nuevo-proveedor-btn" onClick={() => { setEditandoProveedor(null); setModalProveedor(true); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </div>

      {/* Resumen global */}
      {proveedores.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div className={styles.kpiTarjeta}>
            <div className={styles.kpiCabecera}>
              <div className={styles.kpiIconoChipTopo} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconoProveedor s={16} /></div>
              <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Proveedores</span>
            </div>
            <span className={styles.kpiValor}>{proveedores.length}</span>
          </div>
          <div className={styles.kpiTarjeta}>
            <div className={styles.kpiCabecera}>
              <div className={styles.kpiIconoChipRojo} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconoFactura s={16} /></div>
              <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Total compras</span>
            </div>
            <span className={`${styles.kpiValor}`} style={{ color: 'var(--rojo)' }}>{formatoEuroPrivado(proveedores.reduce((s, p) => s + totalProveedor(p), 0), privado)}</span>
          </div>
          <div className={styles.kpiTarjeta}>
            <div className={styles.kpiCabecera}>
              <div className={styles.kpiIconoChipOcre} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconoProducto s={16} /></div>
              <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Materiales</span>
            </div>
            <span className={styles.kpiValor}>{productos.length}</span>
            <span className={styles.kpiSub}>en catálogo</span>
          </div>
        </div>
      )}

      {/* Lista proveedores */}
      {proveedores.length === 0 ? (
        <div className={styles.vacio}>
          <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center' }}><IconoProveedor s={40} /></div>
          <p>Sin proveedores todavía.<br />Añade el primero para empezar a controlar tus compras.</p>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => { setEditandoProveedor(null); setModalProveedor(true); }}>+ Añadir proveedor</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {proveedores.map(p => {
            const total = totalProveedor(p);
            const nFacturas = numFacturasProveedor(p);
            const nProductos = productosDeProveedor(p).length;
            return (
              <div key={p.id}
                className={`${styles.filaLista} ${styles.filaListaClic}`}
                style={{ padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                onClick={() => { setProveedorActivo(p); setVista('ficha'); }}
              >
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: colorAvatar(p.id), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--blanco)' }}>
                  <IconoProveedor s={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 0.1rem', fontWeight: 700, fontSize: '0.92rem', color: 'var(--negro)' }}>{p.nombre}</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-claro)' }}>
                    {p.contacto ? `${p.contacto} · ` : ''}{nFacturas} factura{nFacturas !== 1 ? 's' : ''} · {nProductos} material{nProductos !== 1 ? 'es' : ''}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: '0.95rem', color: 'var(--topo)' }}>{formatoEuroPrivado(total, privado)}</p>
                  <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--topo-claro)' }}>total comprado</p>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }} onClick={e => e.stopPropagation()}>
                  <ConfirmarBorrado onConfirmar={() => onBorrarProveedor(p.id)} titulo="Eliminar proveedor" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalProveedor && (
        <FormProveedor
          inicial={editandoProveedor ?? undefined}
          onGuardar={datos => {
            if (editandoProveedor?.id) onActualizarProveedor({ ...editandoProveedor, ...datos });
            else onCrearProveedor(datos);
            setModalProveedor(false); setEditandoProveedor(null);
            avisoGuardado.mostrar();
          }}
          onCerrar={() => { setModalProveedor(false); setEditandoProveedor(null); }}
        />
      )}
    </div>
  );
}

/** Fila de producto en el catálogo. */
function ProductoFila({ p, prov, privado, onEditar, onBorrar }: { p: Producto; prov?: Proveedor; privado: boolean; onEditar: () => void; onBorrar: () => void }) {
  return (
    <div className={styles.filaLista} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.85rem' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: 'var(--negro)' }}>{p.nombre}</p>
        {p.descripcion && <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-claro)' }}>{p.descripcion}</p>}
        {prov && <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: 'var(--topo-claro)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><IconoProveedor s={11} /> {prov.nombre}</p>}
        {p.fechaPrecio && <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--topo-muy-claro)' }}>Precio actualizado: {formatoFecha(p.fechaPrecio)}</p>}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ margin: 0, fontWeight: 800, color: 'var(--topo)', fontSize: '0.95rem' }}>{formatoEuroPrivado(p.precio, privado)}</p>
        <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--topo-claro)' }}>por {p.unidad}</p>
      </div>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--topo-muy-claro)' }} title="Editar material" aria-label="Editar material" onClick={onEditar}><IconoEditar /></button>
        <ConfirmarBorrado onConfirmar={onBorrar} titulo="Eliminar material" />
      </div>
    </div>
  );
}


