import { useState } from 'react';
import type { Cliente, Movimiento, RegistroHoras, Adjunto, Factura, Proveedor } from './types.js';
import { GaleriaFotos } from './galeria-fotos.js';
import type { FotoProyecto } from './galeria-fotos.js';
import { EscanerFactura } from './escaner-factura.js';
import { formatoEuro } from './calculos.js';
import { calcularResumen } from './calculos.js';
import { TablaMovimientos } from './tabla-movimientos.js';
import { TablaHoras } from './tabla-horas.js';
import { TablaMargen } from './tabla-margen.js';
import { PanelAdjuntos } from './panel-adjuntos.js';
import { PizarraMedidas, type DibujoGuardado } from './pizarra-medidas.js';
import { autoCrearProveedorDeFactura } from './proveedor-utils.js';
import styles from './styles.module.css';

/** Props de la ficha detallada de un cliente. */
export type FichaClienteProps = {
  /** Cliente a mostrar. */
  cliente: Cliente;
  /** Lista completa de clientes para el escáner. */
  clientes?: { id: string; nombre: string }[];
  /** Lista de proveedores para desplegable y vinculación automática. */
  proveedores?: Proveedor[];
  /** Volver a la lista. */
  onVolver: () => void;
  /** Actualizar el cliente completo. */
  onActualizar: (cliente: Cliente) => void;
  /** Guardar una factura de gasto vinculada a este cliente. */
  onGuardarFactura?: (f: Factura) => void;
  /** Facturas de gasto vinculadas a este cliente. */
  facturas?: Factura[];
  /** Crear un nuevo proveedor si no existe al guardar la factura. */
  onCrearProveedor?: (p: Omit<Proveedor, 'id' | 'creado'>) => Proveedor;
};

const etiquetaEstado: Record<Cliente['estado'], string> = {
  rechazado: 'No aceptado',
  presupuestado: 'Presupuestado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
};

/**
 * Ficha completa de un cliente: datos de contacto, resumen de margen,
 * tablas de gastos/ingresos y horas, archivos adjuntos y hoja de medidas.
 */
export function FichaCliente({ cliente, clientes = [], proveedores = [], onVolver, onActualizar, onGuardarFactura, facturas = [], onCrearProveedor }: FichaClienteProps) {
  const [escanerAbierto, setEscanerAbierto] = useState(false);
  const facturasCliente = facturas.filter((f) => f.clienteId === cliente.id && f.tipo === 'gasto');
  const totalFacturasGasto = facturasCliente.reduce((s, f) => s + f.importe, 0);
  const r = calcularResumen(cliente);

  /** Guarda la factura y vincula proveedor automáticamente si el nombre coincide con uno existente. */
  const guardarFacturaConProveedor = (f: Factura) => {
    autoCrearProveedorDeFactura(f, proveedores, onCrearProveedor);
    onGuardarFactura?.(f);
  };

  const anadirMovimiento = (m: Movimiento) =>
    onActualizar({ ...cliente, movimientos: [...cliente.movimientos, m] });

  const borrarMovimiento = (id: string) =>
    onActualizar({ ...cliente, movimientos: cliente.movimientos.filter((x) => x.id !== id) });

  const editarMovimiento = (m: Movimiento) =>
    onActualizar({ ...cliente, movimientos: cliente.movimientos.map((x) => x.id === m.id ? m : x) });

  const anadirHoras = (h: RegistroHoras) =>
    onActualizar({ ...cliente, horas: [...cliente.horas, h] });

  const borrarHoras = (id: string) =>
    onActualizar({ ...cliente, horas: cliente.horas.filter((x) => x.id !== id) });

  const anadirAdjunto = (a: Adjunto) =>
    onActualizar({ ...cliente, adjuntos: [...cliente.adjuntos, a] });

  const borrarAdjunto = (id: string) =>
    onActualizar({ ...cliente, adjuntos: cliente.adjuntos.filter((x) => x.id !== id) });

  const cambiarEstado = (estado: Cliente['estado']) =>
    onActualizar({ ...cliente, estado });

  /** Guarda (o actualiza, si ya existía) un dibujo de la pizarra de medidas en la ficha del cliente. */
  const guardarDibujo = (dibujo: DibujoGuardado) => {
    const previos = cliente.dibujos ?? [];
    const idx = previos.findIndex((d) => d.id === dibujo.id);
    const nuevos = idx >= 0 ? previos.map((d, i) => (i === idx ? dibujo : d)) : [...previos, dibujo];
    onActualizar({ ...cliente, dibujos: nuevos });
  };

  return (
    <div>
      {/* Barra volver móvil — tipo iOS */}
      <div className={styles.barraVolver}>
        <button className={styles.barraVolverBtn} onClick={onVolver}>
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
          Clientes
        </button>
        <p className={styles.barraVolverTitulo}>{cliente.nombre}</p>
        <div style={{ width: 64, flexShrink: 0 }} />{/* espaciador para centrar el título */}
      </div>
      {/* Botón volver desktop */}
      <button className={styles.volver} onClick={onVolver}>← Volver a clientes</button>

      {/* Cabecera con datos del cliente */}
      <div className={styles.fichaCabecera}>
        <div className={styles.barraSeccion} style={{ marginBottom: 0 }}>
          <div>
            <h2 className={styles.h2}>{cliente.nombre}</h2>
            <p className={styles.tarjetaProyecto}>{cliente.proyecto || 'Sin proyecto definido'}</p>
          </div>
          <select
            className={styles.select}
            value={cliente.estado}
            onChange={(e) => cambiarEstado(e.target.value as Cliente['estado'])}
          >
            <option value="presupuestado">{etiquetaEstado.presupuestado}</option>
            <option value="en_curso">{etiquetaEstado.en_curso}</option>
            <option value="finalizado">{etiquetaEstado.finalizado}</option>
            <option value="rechazado">{etiquetaEstado.rechazado}</option>
          </select>
        </div>
        <div className={styles.fichaInfoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Teléfono</span>
            <span className={styles.infoValor}>{cliente.telefono || '—'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Email</span>
            <span className={styles.infoValor}>{cliente.email || '—'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Dirección del trabajo</span>
            <span className={styles.infoValor}>{cliente.direccion || '—'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Presupuesto acordado</span>
            <span className={styles.infoValor}>{formatoEuro(cliente.presupuesto)}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Tarifa por hora</span>
            <span className={styles.infoValor}>{formatoEuro(cliente.tarifaHora)}</span>
          </div>
        </div>
      </div>

      {/* Resumen de margen */}
      <div className={styles.resumenGrid}>
        <div className={`${styles.resumenCard} ${styles.ingreso}`}>
          <p className={styles.resumenLabel}>Ingresos</p>
          <p className={`${styles.resumenValor} ${styles.valorVerde}`}>{formatoEuro(r.totalIngresos)}</p>
        </div>
        <div className={`${styles.resumenCard} ${styles.gasto}`}>
          <p className={styles.resumenLabel}>Gastos materiales</p>
          <p className={`${styles.resumenValor} ${styles.valorRojo}`}>{formatoEuro(r.totalGastos)}</p>
        </div>
        <div className={`${styles.resumenCard} ${styles.horas}`}>
          <p className={styles.resumenLabel}>Mano de obra ({r.totalHoras} h)</p>
          <p className={`${styles.resumenValor} ${styles.valorAzul}`}>{formatoEuro(r.costeManoObra)}</p>
        </div>
        <div className={styles.resumenCard}>
          <p className={styles.resumenLabel}>Margen de ganancia</p>
          <p className={`${styles.resumenValor} ${r.margen >= 0 ? styles.valorVerde : styles.valorRojo}`}>
            {formatoEuro(r.margen)}
          </p>
          <span className={styles.tarjetaProyecto}>
            {r.margenPorcentaje.toFixed(1)}% sobre ingresos
          </span>
        </div>
      </div>

      <TablaMovimientos
        movimientos={cliente.movimientos}
        onAnadir={anadirMovimiento}
        onBorrar={borrarMovimiento}
        onEditar={editarMovimiento}
      />

      <TablaHoras
        horas={cliente.horas}
        tarifaHora={cliente.tarifaHora}
        onAnadir={anadirHoras}
        onBorrar={borrarHoras}
      />

      <TablaMargen resumen={r} presupuesto={cliente.presupuesto} />

      <PanelAdjuntos
        adjuntos={cliente.adjuntos}
        onAnadir={anadirAdjunto}
        onBorrar={borrarAdjunto}
      />

      <PizarraMedidas dibujos={cliente.dibujos ?? []} onGuardar={guardarDibujo} />

      {/* Galería de fotos del proyecto acabado */}
      <GaleriaFotos
        fotos={cliente.fotos || []}
        onAnadir={(f: FotoProyecto) => onActualizar({ ...cliente, fotos: [...(cliente.fotos || []), f] })}
        onBorrar={(id: string) => onActualizar({ ...cliente, fotos: (cliente.fotos || []).filter((f) => f.id !== id) })}
      />

      {/* Facturas de gasto del proyecto */}
      <section className={styles.seccion}>
        <div className={styles.barraSeccion}>
          <h3 className={styles.h3}>🧾 Facturas de gasto del proyecto</h3>
          {onGuardarFactura && (
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => setEscanerAbierto(true)}>
              📷 + Añadir factura
            </button>
          )}
        </div>
        {facturasCliente.length === 0 ? (
          <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem', margin: 0 }}>No hay facturas de gasto vinculadas a este proyecto.</p>
        ) : (
          <>
            <table className={styles.tabla} style={{ width: '100%', marginBottom: '0.75rem' }}>
              <thead><tr><th>Fecha</th><th>Proveedor / Concepto</th><th style={{ textAlign: 'right' }}>Importe</th></tr></thead>
              <tbody>
                {facturasCliente.map((f) => (
                  <tr key={f.id}>
                    <td>{f.fecha}</td>
                    <td><strong>{f.proveedor || '—'}</strong>{f.concepto && <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>{f.concepto}</span>}</td>
                    <td style={{ textAlign: 'right', color: 'var(--rojo)', fontWeight: 600 }}>-{formatoEuro(f.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ textAlign: 'right', fontWeight: 600, color: 'var(--rojo)', fontSize: '0.9rem', margin: 0 }}>
              Total facturas de gasto: -{formatoEuro(totalFacturasGasto)}
            </p>
          </>
        )}
      </section>

      {escanerAbierto && onGuardarFactura && (
        <EscanerFactura
          clientes={clientes}
          proveedores={proveedores}
          onGuardar={(f) => { guardarFacturaConProveedor({ ...f, clienteId: cliente.id, tipo: 'gasto' }); setEscanerAbierto(false); }}
          onCerrar={() => setEscanerAbierto(false)}
        />
      )}
    </div>
  );
}
