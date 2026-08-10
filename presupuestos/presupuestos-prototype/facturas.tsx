import { useState } from 'react';
import type { Factura, Proveedor } from './types.js';
import type { FiltroFacturas, ResumenFacturas } from './use-facturas.js';
import { formatoEuro, formatoFecha } from './calculos.js';
import { EscanerFactura } from './escaner-factura.js';
import { Trimestres } from './trimestres.js';
import { autoCrearProveedorDeFactura } from './proveedor-utils.js';
import { useAvisoGuardado, AvisoGuardado } from './aviso-guardado.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import styles from './styles.module.css';

type Vista = 'lista' | 'trimestres';

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

  const nombreCliente = (id: string) => clientes.find((c) => c.id === id)?.nombre ?? '';

  const abrirEdicion = (f: Factura) => { setFacturaEditar(f); setEscaner(true); };
  const guardarYCerrar = (f: Factura) => {
    autoCrearProveedorDeFactura(f, proveedores, onCrearProveedor);
    onGuardar(f);
    setEscaner(false);
    setFacturaEditar(undefined);
    avisoGuardado.mostrar();
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
        <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => setEscaner(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
          + Añadir factura
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

          {/* Filtros — resueltos en el servidor, no en memoria */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {(['todas', 'ingreso', 'gasto'] as const).map((f) => (
              <button
                key={f}
                className={`${styles.btn} ${filtro === f ? styles.btnPrimario : styles.btnSecundario}`}
                onClick={() => onFiltroChange(f)}
              >
                {f === 'todas' ? 'Todas' : f === 'ingreso' ? 'Ingresos' : 'Gastos'}
              </button>
            ))}
          </div>

          {/* Lista */}
          {facturas.length === 0 ? (
            <div className={styles.vacio}>
              <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
              </div>
              <p>Aún no hay facturas. Usa el botón para escanear la primera.</p>
            </div>
          ) : (
            <table className={styles.tabla} style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Proveedor / Concepto</th>
                  <th>Cliente</th>
                  <th style={{ textAlign: 'right' }}>Importe</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((f) => (
                  <tr key={f.id}>
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
                        <button className={styles.btnIcono} title="Editar factura" aria-label="Editar factura" onClick={() => abrirEdicion(f)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
                        </button>
                        <ConfirmarBorrado onConfirmar={() => onBorrar(f.id)} titulo="Borrar factura" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {hayMas && (
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
    </div>
  );
}
