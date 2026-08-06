import { useState } from 'react';
import type { Factura, Proveedor } from './types.js';
import { formatoEuro, formatoFecha } from './calculos.js';
import { EscanerFactura } from './escaner-factura.js';
import { Trimestres } from './trimestres.js';
import { autoCrearProveedorDeFactura } from './proveedor-utils.js';
import styles from './styles.module.css';

type Vista = 'lista' | 'trimestres';

/** Props de la sección de facturas. */
export type FacturasProps = {
  facturas: Factura[];
  clientes: { id: string; nombre: string }[];
  proveedores?: Proveedor[];
  onGuardar: (f: Factura) => void;
  onBorrar: (id: string) => void;
  onCrearProveedor?: (p: Omit<Proveedor, 'id' | 'creado'>) => Proveedor;
};

/**
 * Sección principal de facturas: lista de facturas + vista trimestral Hacienda.
 */
export function Facturas({ facturas, clientes, proveedores = [], onGuardar, onBorrar, onCrearProveedor }: FacturasProps) {
  const [escaner, setEscaner] = useState(false);
  const [facturaEditar, setFacturaEditar] = useState<Factura | undefined>(undefined);
  const [filtro, setFiltro] = useState<'todas' | 'ingreso' | 'gasto'>('todas');
  const [confirmBorrar, setConfirmBorrar] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('lista');

  const ingresos = facturas.filter((f) => f.tipo === 'ingreso');
  const gastos = facturas.filter((f) => f.tipo === 'gasto');
  const totalIngresos = ingresos.reduce((s, f) => s + f.importe, 0);
  const totalGastos = gastos.reduce((s, f) => s + f.importe, 0);
  const balance = totalIngresos - totalGastos;

  const filtradas = facturas.filter((f) => filtro === 'todas' || f.tipo === filtro);
  const nombreCliente = (id: string) => clientes.find((c) => c.id === id)?.nombre ?? '';

  const abrirEdicion = (f: Factura) => { setFacturaEditar(f); setEscaner(true); };
  const guardarYCerrar = (f: Factura) => {
    autoCrearProveedorDeFactura(f, proveedores, onCrearProveedor);
    onGuardar(f);
    setEscaner(false);
    setFacturaEditar(undefined);
  };

  return (
    <div>
      {/* ── Cabecera ── */}
      <div className={styles.barraSeccion} style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2 className={styles.h2}>🧾 Facturas</h2>
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
              📊 Trimestres
            </button>
          </div>
        </div>
        <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => setEscaner(true)}>
          📷 + Añadir factura
        </button>
      </div>

      {/* ── Vista trimestral ── */}
      {vista === 'trimestres' && <Trimestres facturas={facturas} />}

      {/* ── Vista lista ── */}
      {vista === 'lista' && (
        <>
          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
            <div className={styles.kpiTarjeta} style={{ borderTop: '3px solid var(--verde)' }}>
              <span className={styles.kpiLabel}>Total ingresos</span>
              <span className={`${styles.kpiValor} ${styles.valorVerde}`}>{formatoEuro(totalIngresos)}</span>
              <span className={styles.kpiSub}>{ingresos.length} factura{ingresos.length !== 1 ? 's' : ''}</span>
            </div>
            <div className={styles.kpiTarjeta} style={{ borderTop: '3px solid var(--rojo)' }}>
              <span className={styles.kpiLabel}>Total gastos</span>
              <span className={`${styles.kpiValor} ${styles.valorRojo}`}>{formatoEuro(totalGastos)}</span>
              <span className={styles.kpiSub}>{gastos.length} factura{gastos.length !== 1 ? 's' : ''}</span>
            </div>
            <div className={styles.kpiTarjeta} style={{ borderTop: `3px solid ${balance >= 0 ? 'var(--verde)' : 'var(--rojo)'}` }}>
              <span className={styles.kpiLabel}>Balance</span>
              <span className={`${styles.kpiValor} ${balance >= 0 ? styles.valorVerde : styles.valorRojo}`}>{formatoEuro(balance)}</span>
              <span className={styles.kpiSub}>{facturas.length} factura{facturas.length !== 1 ? 's' : ''} en total</span>
            </div>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {(['todas', 'ingreso', 'gasto'] as const).map((f) => (
              <button
                key={f}
                className={`${styles.btn} ${filtro === f ? styles.btnPrimario : styles.btnSecundario}`}
                onClick={() => setFiltro(f)}
              >
                {f === 'todas' ? 'Todas' : f === 'ingreso' ? '💰 Ingresos' : '🧾 Gastos'}
              </button>
            ))}
          </div>

          {/* Lista */}
          {filtradas.length === 0 ? (
            <div className={styles.vacio}>
              <div className={styles.vacioIcono}>🧾</div>
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
                {filtradas.map((f) => (
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
                        {f.tipo === 'ingreso' ? '💰 Ingreso' : '🧾 Gasto'}
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
                      {confirmBorrar === f.id ? (
                        <span style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                          <button className={`${styles.btn} ${styles.btnPeligro}`} onClick={() => { onBorrar(f.id); setConfirmBorrar(null); }}>Sí</button>
                          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => setConfirmBorrar(null)}>No</button>
                        </span>
                      ) : (
                        <span style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                          <button className={styles.btnIcono} title="Editar factura" onClick={() => abrirEdicion(f)}>✏️</button>
                          <button className={styles.btnIcono} title="Borrar" onClick={() => setConfirmBorrar(f.id)}>🗑️</button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
