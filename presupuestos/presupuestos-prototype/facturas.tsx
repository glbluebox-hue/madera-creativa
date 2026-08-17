import { useState, useEffect } from 'react';
import type { Factura, Proveedor } from './types.js';
import type { FiltroFacturas, ResumenFacturas } from './use-facturas.js';
import { formatoEuro, formatoFecha } from './calculos.js';
import { EscanerFactura } from './escaner-factura.js';
import { Trimestres } from './trimestres.js';
import { autoCrearProveedorDeFactura } from './proveedor-utils.js';
import { useAvisoGuardado, AvisoGuardado } from './aviso-guardado.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import { VisorFactura } from './visor-factura.js';
import * as api from './api.js';
import styles from './styles.module.css';

type Vista = 'lista' | 'trimestres';

const NOMBRES_TRIMESTRE = ['1.er trimestre', '2.º trimestre', '3.er trimestre', '4.º trimestre'];
const MESES_TRIMESTRE = ['Ene – Mar', 'Abr – Jun', 'Jul – Sep', 'Oct – Dic'];

/** Trimestre (1-4) al que pertenece una fecha ISO, para decidir si una factura editada/creada sigue perteneciendo a la carpeta abierta. */
function trimestreDeFecha(fecha: string): number {
  return Math.floor(new Date(fecha).getMonth() / 3) + 1;
}

/** Props de la sección de facturas. */
export type FacturasProps = {
  /** Página de facturas cargada hasta ahora, ya filtrada por el servidor. */
  facturas: Factura[];
  /** Totales calculados en el servidor (Incremento 1.5) — correctos con independencia de la página cargada. */
  resumen: ResumenFacturas;
  filtro: FiltroFacturas;
  onFiltroChange: (f: FiltroFacturas) => void;
  hayMas: boolean;
  cargandoMas: boolean;
  onCargarMas: () => void;
  /** Solo id+nombre de todos los clientes, para resolver nombres y para el selector del escáner. */
  clientes: { id: string; nombre: string }[];
  proveedores?: Proveedor[];
  onGuardar: (f: Factura) => void;
  onBorrar: (id: string) => void;
  onCrearProveedor?: (p: Omit<Proveedor, 'id' | 'creado'>) => Proveedor;
};

/**
 * Sección principal de facturas: lista de facturas + vista trimestral Hacienda.
 */
export function Facturas({
  facturas, resumen, filtro, onFiltroChange, hayMas, cargandoMas, onCargarMas,
  clientes, proveedores = [], onGuardar, onBorrar, onCrearProveedor,
}: FacturasProps) {
  const [escaner, setEscaner] = useState(false);
  const [facturaEditar, setFacturaEditar] = useState<Factura | undefined>(undefined);
  const [vista, setVista] = useState<Vista>('lista');
  const avisoGuardado = useAvisoGuardado();
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [descargando, setDescargando] = useState(false);
  const [viendoId, setViendoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  // Carpetas por trimestre — navegación alternativa a la lista paginada:
  // al abrir una, se piden sin paginar todas las facturas (ingreso + gasto)
  // de ese trimestre concreto, igual que ya hace `Trimestres` para el año
  // completo (volumen acotado por diseño).
  const [carpetaTrimestre, setCarpetaTrimestre] = useState<number | null>(null);
  const [anioCarpetas, setAnioCarpetas] = useState(() => new Date().getFullYear());
  const [aniosDisponibles, setAniosDisponibles] = useState<number[]>([new Date().getFullYear()]);
  const [facturasTrimestre, setFacturasTrimestre] = useState<Factura[]>([]);
  const [cargandoTrimestre, setCargandoTrimestre] = useState(false);

  useEffect(() => {
    api.obtenerAniosConFacturas().then((anios) => {
      setAniosDisponibles((prev) => (anios.length ? anios : prev));
    });
  }, []);

  useEffect(() => {
    if (!carpetaTrimestre) return;
    let activo = true;
    setCargandoTrimestre(true);
    api.obtenerFacturasPorAnio(anioCarpetas, carpetaTrimestre)
      .then((items) => { if (activo) setFacturasTrimestre(items); })
      .finally(() => { if (activo) setCargandoTrimestre(false); });
    return () => { activo = false; };
  }, [carpetaTrimestre, anioCarpetas]);

  const nombreCliente = (id: string) => clientes.find((c) => c.id === id)?.nombre ?? '';

  // Fuente de datos: la carpeta de trimestre abierta (sin paginar, sin
  // filtrar por tipo en el servidor) o la página normal (ya filtrada por
  // tipo en el servidor) — el filtro de tipo y la búsqueda se aplican aquí
  // siempre en memoria, sobre el conjunto ya acotado.
  const facturasBase = carpetaTrimestre ? facturasTrimestre : facturas;
  const facturasPorTipo = carpetaTrimestre && filtro !== 'todas' ? facturasBase.filter((f) => f.tipo === filtro) : facturasBase;
  const textoBusqueda = busqueda.trim().toLowerCase();
  const facturasFiltradas = textoBusqueda
    ? facturasPorTipo.filter((f) =>
        (f.proveedor ?? '').toLowerCase().includes(textoBusqueda) ||
        (f.concepto ?? '').toLowerCase().includes(textoBusqueda))
    : facturasPorTipo;

  const abrirCarpeta = (t: number) => setCarpetaTrimestre((prev) => (prev === t ? null : t));

  /**
   * Pide la factura completa antes de abrir el editor — `f` puede venir del
   * listado paginado, que quita el campo `imagen` a propósito por peso
   * (`listarFacturas` en el backend); usarlo tal cual dejaba la
   * previsualización vacía al editar una factura ya guardada (bug
   * reportado 17/08/2026). Mismo patrón que ya usa `VisorFactura`.
   *
   * `setEscaner(true)` va DESPUÉS de tener ya la factura completa, no
   * antes: `EscanerFactura` construye su lista de páginas con un
   * `useState(() => ...)` perezoso que solo se ejecuta en el montaje
   * inicial — si el modal se monta primero (con `facturaEditar` todavía
   * vacío) y `setFacturaEditar` llega después, ese estado inicial ya se
   * calculó vacío y no se vuelve a recalcular aunque la prop cambie
   * (bug real, detectado al probarlo en el navegador: la petición al
   * servidor sí llegaba a tiempo, pero la previsualización seguía vacía).
   */
  const abrirEdicion = async (f: Factura) => {
    setViendoId(null);
    try {
      setFacturaEditar(await api.obtenerFactura(f.id));
    } catch {
      setFacturaEditar(f); // Al menos abre con lo que ya había, en vez de quedarse sin abrir nada.
    }
    setEscaner(true);
  };
  const guardarYCerrar = (f: Factura) => {
    autoCrearProveedorDeFactura(f, proveedores, onCrearProveedor);
    onGuardar(f);
    setEscaner(false);
    setFacturaEditar(undefined);
    avisoGuardado.mostrar();
    // Mantiene la carpeta abierta en sincronía sin volver a pedir datos al
    // servidor: si la factura ya pertenecía a este trimestre, se actualiza
    // in-situ; si es nueva y su fecha cae dentro, se añade; si no, se ignora.
    if (carpetaTrimestre) {
      setFacturasTrimestre((prev) => {
        const existe = prev.some((x) => x.id === f.id);
        if (existe) return prev.map((x) => (x.id === f.id ? f : x));
        const perteneceAlAnio = f.fecha.startsWith(String(anioCarpetas));
        const perteneceAlTrimestre = perteneceAlAnio && trimestreDeFecha(f.fecha) === carpetaTrimestre;
        return perteneceAlTrimestre ? [f, ...prev] : prev;
      });
    }
  };

  const borrarFactura = (id: string) => {
    onBorrar(id);
    if (carpetaTrimestre) setFacturasTrimestre((prev) => prev.filter((x) => x.id !== id));
  };

  const alternarSeleccion = (id: string) => {
    setSeleccionadas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id); else siguiente.add(id);
      return siguiente;
    });
  };

  const descargarPdf = async (id: string) => {
    setDescargando(true);
    try { await api.descargarPdfFactura(id); } finally { setDescargando(false); }
  };

  const descargarSeleccionadas = async () => {
    if (!seleccionadas.size) return;
    setDescargando(true);
    try {
      await api.descargarZipFacturas({ ids: [...seleccionadas] });
      setSeleccionadas(new Set());
    } finally {
      setDescargando(false);
    }
  };

  const descargarTodas = async () => {
    setDescargando(true);
    try {
      await api.descargarZipFacturas({
        tipo: filtro === 'todas' ? undefined : filtro,
        ...(carpetaTrimestre ? { anio: anioCarpetas, trimestre: carpetaTrimestre } : {}),
      });
    } finally { setDescargando(false); }
  };

  return (
    <div>
      <AvisoGuardado visible={avisoGuardado.visible} mensaje="Factura guardada correctamente" />
      {/* ── Cabecera ── */}
      <div className={styles.barraSeccion} style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2 className={styles.h2} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
            Facturas
          </h2>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <button
              className={`${styles.btn} ${vista === 'lista' ? styles.btnPrimario : styles.btnSecundario}`}
              onClick={() => setVista('lista')}
            >
              Lista
            </button>
            <button
              className={`${styles.btn} ${vista === 'trimestres' ? styles.btnPrimario : styles.btnSecundario}`}
              onClick={() => setVista('trimestres')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
              Trimestres
            </button>
          </div>
        </div>
        <button className={styles.btnCirculoOscuro} onClick={() => setEscaner(true)} title="Añadir factura">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </div>

      {/* ── Vista trimestral ── */}
      {vista === 'trimestres' && <Trimestres />}

      {/* ── Vista lista ── */}
      {vista === 'lista' && (
        <>
          {/* KPI — totales calculados en el servidor, correctos con independencia de cuántas páginas haya cargadas */}
          <div className={styles.kpiGrid} style={{ marginBottom: '1.75rem' }}>
            <div className={styles.kpiTarjeta}>
              <div className={styles.kpiCabecera}>
                <div className={styles.kpiIconoChipVerde} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
                </div>
                <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Ingresos</span>
              </div>
              <span className={`${styles.kpiValor} ${styles.valorVerde}`}>{formatoEuro(resumen.totalIngresos)}</span>
              <span className={styles.kpiSub}>{resumen.numIngresos} factura{resumen.numIngresos !== 1 ? 's' : ''}</span>
            </div>
            <div className={styles.kpiTarjeta}>
              <div className={styles.kpiCabecera}>
                <div className={styles.kpiIconoChipRojo} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
                </div>
                <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Gastos</span>
              </div>
              <span className={`${styles.kpiValor} ${styles.valorRojo}`}>{formatoEuro(resumen.totalGastos)}</span>
              <span className={styles.kpiSub}>{resumen.numGastos} factura{resumen.numGastos !== 1 ? 's' : ''}</span>
            </div>
            <div className={styles.kpiTarjeta}>
              <div className={styles.kpiCabecera}>
                <div className={resumen.balance >= 0 ? styles.kpiIconoChipVerde : styles.kpiIconoChipRojo} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>
                </div>
                <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Balance</span>
              </div>
              <span className={`${styles.kpiValor} ${resumen.balance >= 0 ? styles.valorVerde : styles.valorRojo}`}>{formatoEuro(resumen.balance)}</span>
              <span className={styles.kpiSub}>{resumen.numFacturas} factura{resumen.numFacturas !== 1 ? 's' : ''} en total</span>
            </div>
          </div>

          {/* Carpetas por trimestre — todas las facturas (ingreso + gasto) de ese período, de un vistazo */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className={styles.select}
              style={{ width: 100 }}
              value={anioCarpetas}
              onChange={(e) => setAnioCarpetas(Number(e.target.value))}
              aria-label="Año de las carpetas"
            >
              {(aniosDisponibles.includes(anioCarpetas) ? aniosDisponibles : [anioCarpetas, ...aniosDisponibles]).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            {NOMBRES_TRIMESTRE.map((nombre, i) => {
              const t = i + 1;
              const activa = carpetaTrimestre === t;
              return (
                <button
                  key={t}
                  className={`${styles.btn} ${activa ? styles.btnPrimario : styles.btnSecundario}`}
                  onClick={() => abrirCarpeta(t)}
                  title={`${nombre} (${MESES_TRIMESTRE[i]}) de ${anioCarpetas}`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                  T{t}
                </button>
              );
            })}
            {carpetaTrimestre && (
              <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => setCarpetaTrimestre(null)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                Ver todas
              </button>
            )}
          </div>
          {carpetaTrimestre && (
            <p style={{ margin: '-0.5rem 0 1rem', fontSize: '0.8rem', color: 'var(--topo-claro)' }}>
              {cargandoTrimestre
                ? 'Cargando…'
                : `${NOMBRES_TRIMESTRE[carpetaTrimestre - 1]} (${MESES_TRIMESTRE[carpetaTrimestre - 1]}) de ${anioCarpetas} · ${facturasTrimestre.length} factura${facturasTrimestre.length !== 1 ? 's' : ''}`}
            </p>
          )}

          {/* Filtros — resueltos en el servidor, no en memoria (o en memoria sobre la carpeta abierta) */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {(['todas', 'ingreso', 'gasto'] as const).map((f) => (
                <button
                  key={f}
                  className={`${styles.btn} ${filtro === f ? styles.btnPrimario : styles.btnSecundario}`}
                  onClick={() => onFiltroChange(f)}
                >
                  {f === 'todas' ? 'Todas' : f === 'ingreso' ? 'Ingresos' : 'Gastos'}
                </button>
              ))}
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por proveedor o concepto…"
                className={styles.input}
                style={{ minWidth: 220 }}
                aria-label="Buscar facturas por proveedor o concepto"
              />
            </div>
            {facturasBase.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {seleccionadas.size > 0 && (
                  <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={descargarSeleccionadas} disabled={descargando}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    Descargar {seleccionadas.size} seleccionada{seleccionadas.size !== 1 ? 's' : ''}
                  </button>
                )}
                <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={descargarTodas} disabled={descargando} title="Descarga un ZIP con el PDF de todas las facturas del filtro actual">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  Descargar todas
                </button>
              </div>
            )}
          </div>

          {/* Lista */}
          {cargandoTrimestre ? (
            <div className={styles.vacio}>
              <p>Cargando facturas del trimestre…</p>
            </div>
          ) : facturasBase.length === 0 ? (
            <div className={styles.vacio}>
              <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
              </div>
              <p>
                {carpetaTrimestre
                  ? `Sin facturas en ${NOMBRES_TRIMESTRE[carpetaTrimestre - 1]} de ${anioCarpetas}.`
                  : 'Aún no hay facturas. Usa el botón para escanear la primera.'}
              </p>
            </div>
          ) : facturasFiltradas.length === 0 ? (
            <div className={styles.vacio}>
              <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              </div>
              <p>Ninguna factura coincide con "{busqueda}".</p>
            </div>
          ) : (
            // Envuelta en su propio contenedor con scroll horizontal — con
            // varias columnas y hasta 4 botones de acción, una tabla de
            // facturas no cabe en el ancho de un móvil; sin este contenedor
            // (bug real encontrado en pruebas móviles) esas columnas quedaban
            // fuera de la pantalla y era imposible llegar a "Ver"/"Borrar".
            // Mismo patrón que ya usan el resto de tablas de la app
            // (`.tablaWrap` / `overflowX:'auto'`).
            <div style={{ overflowX: 'auto' }}>
            <table className={styles.tabla} style={{ width: '100%', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Proveedor / Concepto</th>
                  <th>Cliente</th>
                  <th style={{ textAlign: 'right' }}>Importe</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {facturasFiltradas.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <input type="checkbox" checked={seleccionadas.has(f.id)} onChange={() => alternarSeleccion(f.id)} aria-label={`Seleccionar factura de ${f.proveedor || f.concepto || f.fecha}`} />
                    </td>
                    <td>{formatoFecha(f.fecha)}</td>
                    <td>
                      <span
                        className={styles.estado}
                        style={{
                          background: f.tipo === 'ingreso' ? 'var(--verde-bg)' : 'var(--rojo-bg)',
                          color: f.tipo === 'ingreso' ? 'var(--verde)' : 'var(--rojo)',
                        }}
                      >
                        {f.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}
                      </span>
                    </td>
                    <td>
                      <strong>{f.proveedor || '—'}</strong>
                      {f.concepto && <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>{f.concepto}</span>}
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
                      {f.clienteId ? nombreCliente(f.clienteId) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: f.tipo === 'ingreso' ? 'var(--verde)' : 'var(--rojo)' }}>
                      {f.tipo === 'ingreso' ? '+' : '-'}{formatoEuro(f.importe)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                        {(f.tieneDocumento || f.paginas?.length || f.imagenes?.length || f.imagen || f.pdfOriginalUrl) ? (
                          <button className={styles.btnIcono} title="Ver factura" aria-label="Ver factura" onClick={() => setViendoId(f.id)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                          </button>
                        ) : null}
                        {(f.tieneDocumento || f.paginas?.length || f.imagen || f.pdfOriginalUrl) ? (
                          <button className={styles.btnIcono} title="Descargar PDF" aria-label="Descargar PDF" onClick={() => descargarPdf(f.id)} disabled={descargando}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                          </button>
                        ) : null}
                        <button className={styles.btnIcono} title="Editar factura" aria-label="Editar factura" onClick={() => abrirEdicion(f)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
                        </button>
                        <ConfirmarBorrado onConfirmar={() => borrarFactura(f.id)} titulo="Borrar factura" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {!carpetaTrimestre && hayMas && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.25rem' }}>
              <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCargarMas} disabled={cargandoMas}>
                {cargandoMas ? 'Cargando…' : 'Cargar más'}
              </button>
            </div>
          )}
        </>
      )}

      {escaner && (
        <EscanerFactura
          clientes={clientes}
          proveedores={proveedores}
          onGuardar={guardarYCerrar}
          onCerrar={() => { setEscaner(false); setFacturaEditar(undefined); }}
          facturaEditar={facturaEditar}
        />
      )}

      {viendoId && (
        <VisorFactura
          facturaId={viendoId}
          onCerrar={() => setViendoId(null)}
          onEditar={(f) => abrirEdicion(f)}
          onDescargarPdf={descargarPdf}
        />
      )}
    </div>
  );
}
