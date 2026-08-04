import { useState } from 'react';
import type { Proveedor, Producto, Factura } from './types.js';
import { formatoEuro, formatoFecha } from './calculos.js';
import { ImporteInput } from './importe-input.js';
import styles from './styles.module.css';

/** Props de la sección de proveedores. */
export type SeccionProveedoresProps = {
  proveedores: Proveedor[];
  productos: Producto[];
  facturas: Factura[];
  onCrearProveedor: (p: Omit<Proveedor, 'id' | 'creado'>) => void;
  onActualizarProveedor: (p: Proveedor) => void;
  onBorrarProveedor: (id: string) => void;
  onCrearProducto: (p: Omit<Producto, 'id'>) => void;
  onActualizarProducto: (p: Producto) => void;
  onBorrarProducto: (id: string) => void;
};

type VistaProveedores = 'lista' | 'ficha' | 'catalogo';

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
          <h2 className={styles.h2}>{inicial?.nombre ? '✏️ Editar proveedor' : '🏭 Nuevo proveedor'}</h2>
          <button className={styles.btnIcono} onClick={onCerrar}>✕</button>
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
          <h2 className={styles.h2}>{inicial?.nombre ? '✏️ Editar producto' : '📦 Nuevo producto'}</h2>
          <button className={styles.btnIcono} onClick={onCerrar}>✕</button>
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
  proveedores, productos, facturas,
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
  const [confirmBorrar, setConfirmBorrar] = useState<string | null>(null);

  /** Facturas vinculadas a un proveedor (por nombre). */
  const facturasDeProveedor = (p: Proveedor) =>
    facturas.filter(f => f.proveedor?.toLowerCase().includes(p.nombre.toLowerCase()) || f.proveedor === p.nombre);

  /** Total comprado a un proveedor. */
  const totalProveedor = (p: Proveedor) =>
    facturasDeProveedor(p).filter(f => f.tipo === 'gasto').reduce((s, f) => s + f.importe, 0);

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
    const factProv = facturasDeProveedor(proveedorActivo);
    const prodProv = productosDeProveedor(proveedorActivo);
    const total = totalProveedor(proveedorActivo);

    return (
      <div className={styles.tabPanel}>
        <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ marginBottom: '1rem' }}
          onClick={() => { setVista('lista'); setProveedorActivo(null); }}>← Volver</button>

        {/* Cabecera proveedor */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <div>
            <h2 className={styles.h2} style={{ margin: '0 0 0.2rem' }}>🏭 {proveedorActivo.nombre}</h2>
            {proveedorActivo.contacto && <p style={{ margin: '0 0 0.1rem', fontSize: '0.82rem', color: 'var(--topo-claro)' }}>👤 {proveedorActivo.contacto}</p>}
            {proveedorActivo.telefono && <p style={{ margin: '0 0 0.1rem', fontSize: '0.82rem', color: 'var(--topo-claro)' }}>📞 <a href={`tel:${proveedorActivo.telefono}`}>{proveedorActivo.telefono}</a></p>}
            {proveedorActivo.email && <p style={{ margin: '0 0 0.1rem', fontSize: '0.82rem', color: 'var(--topo-claro)' }}>✉️ <a href={`mailto:${proveedorActivo.email}`}>{proveedorActivo.email}</a></p>}
            {proveedorActivo.direccion && <p style={{ margin: '0 0 0.1rem', fontSize: '0.82rem', color: 'var(--topo-claro)' }}>📍 {proveedorActivo.direccion}</p>}
            {proveedorActivo.notas && <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--topo)', fontStyle: 'italic' }}>"{proveedorActivo.notas}"</p>}
          </div>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => { setEditandoProveedor(proveedorActivo); setModalProveedor(true); }}>✏️ Editar</button>
        </div>

        {/* KPI total comprado */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div className={styles.kpiTarjeta} style={{ borderTop: '3px solid var(--topo)' }}>
            <span className={styles.kpiLabel}>Total comprado</span>
            <span className={styles.kpiValor}>{formatoEuro(total)}</span>
            <span className={styles.kpiSub}>{factProv.filter(f => f.tipo === 'gasto').length} facturas</span>
          </div>
          <div className={styles.kpiTarjeta} style={{ borderTop: '3px solid var(--verde)' }}>
            <span className={styles.kpiLabel}>Productos en catálogo</span>
            <span className={styles.kpiValor}>{prodProv.length}</span>
            <span className={styles.kpiSub}>materiales registrados</span>
          </div>
        </div>

        {/* Facturas del proveedor */}
        <h3 style={{ margin: '0 0 0.75rem' }}>🧾 Facturas de compra</h3>
        {factProv.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--topo-claro)', marginBottom: '1.5rem' }}>Sin facturas vinculadas. Las facturas se vinculan automáticamente por nombre del proveedor.</p>
        ) : (
          <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
            <table className={styles.tabla} style={{ width: '100%' }}>
              <thead><tr><th>Fecha</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Importe</th></tr></thead>
              <tbody>
                {factProv.map(f => (
                  <tr key={f.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{formatoFecha(f.fecha)}</td>
                    <td style={{ fontSize: '0.82rem' }}>{f.concepto || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: f.tipo === 'gasto' ? 'var(--rojo)' : 'var(--verde)', whiteSpace: 'nowrap' }}>{formatoEuro(f.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Productos de este proveedor */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>📦 Sus materiales en catálogo</h3>
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
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--fondo)', border: '1px solid var(--borde)', borderRadius: 8, padding: '0.6rem 0.85rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem' }}>{p.nombre}</p>
                  {p.descripcion && <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-claro)' }}>{p.descripcion}</p>}
                  {p.categoria && <span style={{ fontSize: '0.65rem', background: '#ede9e3', color: 'var(--topo)', padding: '1px 6px', borderRadius: 10 }}>{p.categoria}</span>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800, color: 'var(--topo)', fontSize: '0.95rem' }}>{formatoEuro(p.precio)}</p>
                  <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--topo-claro)' }}>por {p.unidad}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button className={styles.btnIcono} onClick={() => { setEditandoProducto(p); setModalProducto(true); }}>✏️</button>
                  <button className={styles.btnIcono} style={{ color: 'var(--rojo)' }} onClick={() => onBorrarProducto(p.id)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {modalProveedor && editandoProveedor && (
          <FormProveedor
            inicial={editandoProveedor}
            onGuardar={datos => { onActualizarProveedor({ ...proveedorActivo, ...datos }); setProveedorActivo(prev => prev ? { ...prev, ...datos } : prev); setModalProveedor(false); setEditandoProveedor(null); }}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <h2 className={styles.h2} style={{ margin: 0 }}>📦 Catálogo de materiales</h2>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => { setEditandoProducto(null); setModalProducto(true); }}>+ Nuevo material</button>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <input className={styles.input} style={{ flex: 1, minWidth: 160 }} placeholder="🔍 Buscar material…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <select className={styles.select} style={{ width: 160 }} value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {productosFiltrados.length === 0 ? (
          <div className={styles.vacio}>
            <div className={styles.vacioIcono}>📦</div>
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
                      {items.map(p => <ProductoFila key={p.id} p={p} prov={proveedores.find(x => x.id === p.proveedorId)} onEditar={() => { setEditandoProducto(p); setModalProducto(true); }} onBorrar={() => onBorrarProducto(p.id)} />)}
                    </div>
                  );
                })
              : productosFiltrados.map(p => <ProductoFila key={p.id} p={p} prov={proveedores.find(x => x.id === p.proveedorId)} onEditar={() => { setEditandoProducto(p); setModalProducto(true); }} onBorrar={() => onBorrarProducto(p.id)} />)
            }
            {productosFiltrados.some(p => !p.categoria) && (
              <>
                {categorias.length > 0 && <p style={{ margin: '0.75rem 0 0.3rem', fontSize: '0.72rem', fontWeight: 800, color: 'var(--topo-claro)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Sin categoría</p>}
                {productosFiltrados.filter(p => !p.categoria).map(p => <ProductoFila key={p.id} p={p} prov={proveedores.find(x => x.id === p.proveedorId)} onEditar={() => { setEditandoProducto(p); setModalProducto(true); }} onBorrar={() => onBorrarProducto(p.id)} />)}
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
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.25rem', background: '#f0ede8', borderRadius: 10, padding: '3px' }}>
          <button className={`${styles.btn} ${vista === 'lista' ? styles.btnPrimario : ''}`} style={{ fontSize: '0.82rem' }} onClick={() => setVista('lista')}>🏭 Proveedores</button>
          <button className={`${styles.btn} ${vista === 'catalogo' ? styles.btnPrimario : ''}`} style={{ fontSize: '0.82rem' }} onClick={() => setVista('catalogo')}>📦 Catálogo</button>
        </div>
        <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ marginLeft: 'auto' }} onClick={() => { setEditandoProveedor(null); setModalProveedor(true); }}>+ Proveedor</button>
      </div>

      {/* Resumen global */}
      {proveedores.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div className={styles.kpiTarjeta} style={{ borderTop: '3px solid var(--topo)' }}>
            <span className={styles.kpiLabel}>Proveedores</span>
            <span className={styles.kpiValor}>{proveedores.length}</span>
          </div>
          <div className={styles.kpiTarjeta} style={{ borderTop: '3px solid var(--rojo)' }}>
            <span className={styles.kpiLabel}>Total compras</span>
            <span className={styles.kpiValor}>{formatoEuro(proveedores.reduce((s, p) => s + totalProveedor(p), 0))}</span>
          </div>
          <div className={styles.kpiTarjeta} style={{ borderTop: '3px solid var(--ocre)' }}>
            <span className={styles.kpiLabel}>Materiales</span>
            <span className={styles.kpiValor}>{productos.length}</span>
            <span className={styles.kpiSub}>en catálogo</span>
          </div>
        </div>
      )}

      {/* Lista proveedores */}
      {proveedores.length === 0 ? (
        <div className={styles.vacio}>
          <div className={styles.vacioIcono}>🏭</div>
          <p>Sin proveedores todavía.<br />Añade el primero para empezar a controlar tus compras.</p>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => { setEditandoProveedor(null); setModalProveedor(true); }}>+ Añadir proveedor</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {proveedores.map(p => {
            const total = totalProveedor(p);
            const nFacturas = facturasDeProveedor(p).length;
            const nProductos = productosDeProveedor(p).length;
            return (
              <div key={p.id}
                style={{ background: '#fff', border: '1px solid var(--borde)', borderRadius: 10, padding: '0.85rem 1rem', cursor: 'pointer', transition: 'box-shadow 0.15s', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
                onClick={() => { setProveedorActivo(p); setVista('ficha'); }}
              >
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#4B433A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '1.2rem' }}>🏭</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 0.1rem', fontWeight: 700, fontSize: '0.92rem', color: 'var(--negro)' }}>{p.nombre}</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-claro)' }}>
                    {p.contacto ? `${p.contacto} · ` : ''}{nFacturas} factura{nFacturas !== 1 ? 's' : ''} · {nProductos} material{nProductos !== 1 ? 'es' : ''}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: '0.95rem', color: 'var(--topo)' }}>{formatoEuro(total)}</p>
                  <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--topo-claro)' }}>total comprado</p>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }} onClick={e => e.stopPropagation()}>
                  {confirmBorrar === p.id ? (
                    <>
                      <button className={`${styles.btn} ${styles.btnPeligro}`} style={{ fontSize: '0.72rem' }} onClick={() => { onBorrarProveedor(p.id); setConfirmBorrar(null); }}>Sí</button>
                      <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.72rem' }} onClick={() => setConfirmBorrar(null)}>No</button>
                    </>
                  ) : (
                    <button className={styles.btnIcono} style={{ color: 'var(--rojo)' }} onClick={() => setConfirmBorrar(p.id)}>🗑</button>
                  )}
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
          }}
          onCerrar={() => { setModalProveedor(false); setEditandoProveedor(null); }}
        />
      )}
    </div>
  );
}

/** Fila de producto en el catálogo. */
function ProductoFila({ p, prov, onEditar, onBorrar }: { p: Producto; prov?: Proveedor; onEditar: () => void; onBorrar: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', border: '1px solid var(--borde)', borderRadius: 8, padding: '0.6rem 0.85rem' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: 'var(--negro)' }}>{p.nombre}</p>
        {p.descripcion && <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-claro)' }}>{p.descripcion}</p>}
        {prov && <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: 'var(--topo-claro)' }}>🏭 {prov.nombre}</p>}
        {p.fechaPrecio && <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--topo-muy-claro, #bbb)' }}>Precio actualizado: {formatoFecha(p.fechaPrecio)}</p>}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ margin: 0, fontWeight: 800, color: 'var(--topo)', fontSize: '0.95rem' }}>{formatoEuro(p.precio)}</p>
        <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--topo-claro)' }}>por {p.unidad}</p>
      </div>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '4px' }} onClick={onEditar}>✏️</button>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '4px', color: 'var(--rojo)' }} onClick={onBorrar}>🗑</button>
      </div>
    </div>
  );
}


