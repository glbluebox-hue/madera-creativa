import { useState, useEffect, useCallback } from 'react';
import type { Cliente, Movimiento, RegistroHoras, Adjunto, Factura, Proveedor } from './types.js';
import * as api from './api.js';
import { GaleriaFotos } from './galeria-fotos.js';
import type { FotoProyecto } from './galeria-fotos.js';
import { EscanerFactura } from './escaner-factura.js';
import { formatoEuro, formatoFecha } from './calculos.js';
import { calcularResumen } from './calculos.js';
import { TablaMovimientos } from './tabla-movimientos.js';
import { TablaHoras } from './tabla-horas.js';
import { TablaMargen } from './tabla-margen.js';
import { PanelAdjuntos } from './panel-adjuntos.js';
import { autoCrearProveedorDeFactura } from './proveedor-utils.js';
import { colorAvatar, iniciales } from './avatar-utils.js';
import { etiquetaEstado, grupoEstado } from './estado-utils.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import { TabResumen } from './tab-resumen.js';
import { TabDatos } from './tab-datos.js';
import { TabMediciones } from './tab-mediciones.js';
import { TabTareas } from './tab-tareas.js';
import { TabNotas } from './tab-notas.js';
import { TabDibujos } from './tab-dibujos.js';
import { TabPresupuestosIA } from './tab-presupuestos-ia.js';
import { TabContratos } from './tab-contratos.js';
import type { Empresa } from './use-empresa.js';
import styles from './styles.module.css';

/** Props de la ficha detallada de un cliente. */
export type FichaClienteProps = {
  /** Cliente a mostrar. */
  cliente: Cliente;
  /** Lista completa de clientes para el escáner. */
  clientes?: { id: string; nombre: string }[];
  /** Lista de proveedores para desplegable y vinculación automática. */
  proveedores?: Proveedor[];
  /** Datos de empresa — usados por el editor de presupuestos en lienzo (membrete, condiciones por defecto). */
  empresa: Empresa;
  /** Persiste cambios de empresa — usado para el clic-en-el-logo del editor de lienzo. */
  onActualizarEmpresa: (cambios: Partial<Empresa>) => void;
  /** Volver a la lista. */
  onVolver: () => void;
  /** Actualizar el cliente completo. */
  onActualizar: (cliente: Cliente) => void;
  /** Borra por completo este cliente/proyecto (con confirmación) y vuelve a la lista. */
  onBorrar?: (id: string) => void;
  /** Guardar una factura de gasto vinculada a este cliente. */
  onGuardarFactura?: (f: Factura) => void;
  /** Crear un nuevo proveedor si no existe al guardar la factura. */
  onCrearProveedor?: (p: Omit<Proveedor, 'id' | 'creado'>) => Proveedor;
};

type Pestana = 'resumen' | 'proyectos' | 'presupuestos' | 'presupuestosIA' | 'contratos' | 'facturas' | 'notas' | 'dibujos';

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'proyectos', label: 'Proyectos' },
  { id: 'presupuestos', label: 'Control de gasto' },
  { id: 'presupuestosIA', label: 'Presupuestos IA' },
  { id: 'contratos', label: 'Contratos' },
  { id: 'facturas', label: 'Facturas' },
  { id: 'notas', label: 'Notas' },
  { id: 'dibujos', label: 'Dibujos' },
];

/**
 * Ficha completa de un cliente, organizada por pestañas (Dirección
 * Creativa): Resumen, Proyectos (fotos, medidas, documentos, datos de
 * acceso), Presupuestos (ingresos/gastos/horas/margen), Facturas y Notas.
 * Ninguna función existente se ha quitado — solo se ha reorganizado.
 */
export function FichaCliente({ cliente, clientes = [], proveedores = [], empresa, onActualizarEmpresa, onVolver, onActualizar, onBorrar, onGuardarFactura, onCrearProveedor }: FichaClienteProps) {
  const [pestana, setPestana] = useState<Pestana>('resumen');
  /** Contador-disparador: cada incremento fuerza `TabDatos` a abrirse en modo edición (botón "Editar" de la cabecera, ver más abajo). */
  const [abrirEdicionDatos, setAbrirEdicionDatos] = useState(0);
  const editarDatos = () => { setPestana('proyectos'); setAbrirEdicionDatos((n) => n + 1); };
  const [escanerAbierto, setEscanerAbierto] = useState(false);
  const [facturasCliente, setFacturasCliente] = useState<Factura[]>([]);
  // Los adjuntos ya no llegan con la ficha (ver comentario en api.ts) — se
  // piden aparte para que abrir la ficha no dependa de transferir varios MB.
  const [adjuntosCliente, setAdjuntosCliente] = useState<Adjunto[]>([]);
  useEffect(() => {
    api.obtenerAdjuntosCliente(cliente.id).then(setAdjuntosCliente).catch(() => setAdjuntosCliente([]));
  }, [cliente.id]);

  /**
   * Pide sus propios gastos al servidor en vez de recibir `facturas`
   * completo por props (Incremento 1.5): con la lista general de facturas
   * paginada, ya no hay garantía de que el gasto de este proyecto esté en
   * la página cargada.
   */
  const cargarFacturasCliente = useCallback(() => {
    api.obtenerFacturasDeCliente(cliente.id)
      .then((todas) => setFacturasCliente(todas.filter((f) => f.tipo === 'gasto')))
      .catch(() => setFacturasCliente([]));
  }, [cliente.id]);

  useEffect(() => { cargarFacturasCliente(); }, [cargarFacturasCliente]);

  const totalFacturasGasto = facturasCliente.reduce((s, f) => s + f.importe, 0);
  const r = calcularResumen(cliente);

  /** Guarda la factura, vincula proveedor automáticamente si el nombre coincide con uno existente, y recarga la lista. */
  const guardarFacturaConProveedor = (f: Factura) => {
    autoCrearProveedorDeFactura(f, proveedores, onCrearProveedor);
    onGuardarFactura?.(f);
    cargarFacturasCliente();
  };

  /**
   * Movimientos, tareas, estado y presupuesto usan sus propias rutas
   * quirúrgicas (Hardening Fase 2) en vez de reenviar el cliente completo
   * — así una edición en esta ficha nunca puede pisar una escritura
   * automática (aceptar presupuesto, sincronizar factura) hecha mientras
   * esta pantalla estaba abierta con datos desactualizados. `onActualizar`
   * sigue llamándose con la respuesta fresca del servidor para refrescar
   * la lista/caché local, igual que ya hace el resto de la app.
   */
  const anadirMovimiento = (m: Movimiento) => {
    const { id: _id, facturaId: _facturaId, ...datos } = m;
    api.anadirMovimientoCliente(cliente.id, datos).then(onActualizar);
  };

  const borrarMovimiento = (id: string) =>
    api.borrarMovimientoCliente(cliente.id, id).then(onActualizar);

  const editarMovimiento = (m: Movimiento) => {
    const { id, facturaId: _facturaId, ...datos } = m;
    api.editarMovimientoCliente(cliente.id, id, datos).then(onActualizar);
  };

  const anadirHoras = (h: RegistroHoras) =>
    onActualizar({ ...cliente, horas: [...cliente.horas, h] });

  const borrarHoras = (id: string) =>
    onActualizar({ ...cliente, horas: cliente.horas.filter((x) => x.id !== id) });

  const anadirAdjunto = (a: Adjunto) => {
    const nuevos = [...adjuntosCliente, a];
    setAdjuntosCliente(nuevos);
    onActualizar({ ...cliente, adjuntos: nuevos });
  };

  const borrarAdjunto = (id: string) => {
    const nuevos = adjuntosCliente.filter((x) => x.id !== id);
    setAdjuntosCliente(nuevos);
    onActualizar({ ...cliente, adjuntos: nuevos });
  };

  const cambiarEstado = (estado: Cliente['estado']) =>
    api.cambiarEstadoCliente(cliente.id, estado).then(onActualizar);

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
      <button className={styles.volver} onClick={onVolver}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -2, marginRight: 4 }}><polyline points="15 18 9 12 15 6" /></svg>
        Volver a clientes
      </button>

      {/* Cabecera con datos del cliente */}
      <div className={styles.fichaCabecera}>
        <div className={styles.barraSeccion} style={{ marginBottom: 0 }}>
          <div className={styles.fichaIdentidad}>
            <div className={styles.clienteAvatar} style={{ width: 52, height: 52, fontSize: '1.05rem', background: colorAvatar(cliente.id), flexShrink: 0 }}>
              {iniciales(cliente.nombre)}
            </div>
            <div>
              <h2 className={styles.h2} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                {cliente.nombre}
                <span className={`${styles.pillEstado} ${grupoEstado[cliente.estado] === 'curso' ? styles.pillEstadoCurso : styles.pillEstadoFin}`}>
                  {etiquetaEstado[cliente.estado]}
                </span>
              </h2>
              <p className={styles.fichaDesde}>Cliente desde {formatoFecha(cliente.creado)}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <select
              className={styles.select}
              value={cliente.estado}
              onChange={(e) => cambiarEstado(e.target.value as Cliente['estado'])}
              title="Cambiar estado"
            >
              <option value="presupuestado">{etiquetaEstado.presupuestado}</option>
              <option value="en_curso">{etiquetaEstado.en_curso}</option>
              <option value="finalizado">{etiquetaEstado.finalizado}</option>
              <option value="rechazado">{etiquetaEstado.rechazado}</option>
            </select>
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={editarDatos}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
              Editar
            </button>
            {onBorrar && (
              <ConfirmarBorrado
                label="Eliminar"
                titulo="Eliminar este cliente y todo su proyecto"
                onConfirmar={() => onBorrar(cliente.id)}
              />
            )}
          </div>
        </div>

        <div className={styles.fichaContacto}>
          {cliente.telefono && (
            <div className={styles.fichaContactoItem}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.34 1.9.63 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.29 1.85.5 2.81.63A2 2 0 0 1 22 16.92z" /></svg>
              {cliente.telefono}
            </div>
          )}
          {cliente.email && (
            <div className={styles.fichaContactoItem}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v16H4z" /><polyline points="22 6 12 13 2 6" /></svg>
              {cliente.email}
            </div>
          )}
          {cliente.direccion && (
            <div className={styles.fichaContactoItem}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              {cliente.direccion}
            </div>
          )}
        </div>
      </div>

      {/* Pestañas */}
      <div className={styles.fichaTabs}>
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            className={`${styles.fichaTab} ${pestana === p.id ? styles.fichaTabActiva : ''}`}
            onClick={() => setPestana(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── RESUMEN ── */}
      {pestana === 'resumen' && (
        <TabResumen
          cliente={cliente}
          facturasGasto={facturasCliente}
          adjuntos={adjuntosCliente}
          totalIngresos={r.totalIngresos}
          onIrAProyecto={() => setPestana('proyectos')}
          onIrADocumentos={() => setPestana('proyectos')}
        />
      )}

      {/* ── PROYECTOS: fotos, medidas/pizarra, documentos, datos de acceso ── */}
      {pestana === 'proyectos' && (
        <div className={styles.tabPanel}>
          <GaleriaFotos
            fotos={cliente.fotos || []}
            onAnadir={(f: FotoProyecto) => onActualizar({ ...cliente, fotos: [...(cliente.fotos || []), f] })}
            onBorrar={(id: string) => onActualizar({ ...cliente, fotos: (cliente.fotos || []).filter((f) => f.id !== id) })}
          />
          <PanelAdjuntos
            adjuntos={adjuntosCliente}
            onAnadir={anadirAdjunto}
            onBorrar={borrarAdjunto}
          />
          <TabMediciones cliente={cliente} onActualizar={onActualizar} />
          <TabDatos cliente={cliente} onActualizar={onActualizar} abrirEdicion={abrirEdicionDatos} />
        </div>
      )}

      {/* ── PRESUPUESTOS: ingresos/gastos, horas, margen ── */}
      {pestana === 'presupuestos' && (
        <div className={styles.tabPanel}>
          <div className={styles.kpiGrid}>
            <div className={styles.kpiTarjeta}>
              <div className={styles.kpiCabecera}>
                <div className={styles.kpiIconoChipVerde} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
                </div>
                <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Ingresos</span>
              </div>
              <span className={`${styles.kpiValor} ${styles.valorVerde}`}>{formatoEuro(r.totalIngresos)}</span>
            </div>
            <div className={styles.kpiTarjeta}>
              <div className={styles.kpiCabecera}>
                <div className={styles.kpiIconoChipRojo} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
                </div>
                <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Gastos materiales</span>
              </div>
              <span className={`${styles.kpiValor} ${styles.valorRojo}`}>{formatoEuro(r.totalGastos)}</span>
            </div>
            <div className={styles.kpiTarjeta}>
              <div className={styles.kpiCabecera}>
                <div className={styles.kpiIconoChipAzul} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                </div>
                <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Mano de obra ({r.totalHoras} h)</span>
              </div>
              <span className={`${styles.kpiValor} ${styles.valorAzul}`}>{formatoEuro(r.costeManoObra)}</span>
            </div>
            <div className={styles.kpiTarjeta}>
              <div className={styles.kpiCabecera}>
                <div className={r.margen >= 0 ? styles.kpiIconoChipVerde : styles.kpiIconoChipRojo} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>
                </div>
                <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Margen de ganancia</span>
              </div>
              <span className={`${styles.kpiValor} ${r.margen >= 0 ? styles.valorVerde : styles.valorRojo}`}>
                {formatoEuro(r.margen)}
              </span>
              <span className={styles.kpiSub}>{r.margenPorcentaje.toFixed(1)}% sobre ingresos</span>
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
        </div>
      )}

      {/* ── FACTURAS de gasto del proyecto ── */}
      {pestana === 'facturas' && (
        <div className={styles.tabPanel}>
          <section className={styles.seccion} style={{ marginTop: 0 }}>
            <div className={styles.barraSeccion}>
              <h3 className={styles.h3} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                Facturas de gasto del proyecto
              </h3>
              {onGuardarFactura && (
                <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => setEscanerAbierto(true)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                  + Añadir factura
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
        </div>
      )}

      {/* ── NOTAS y checklist de tareas ── */}
      {pestana === 'notas' && (
        <div className={styles.tabPanel}>
          <TabTareas cliente={cliente} onActualizar={onActualizar} />
          <TabNotas cliente={cliente} onActualizar={onActualizar} />
        </div>
      )}

      {/* ── DIBUJOS: repositorio de documentación gráfica del cliente (Fase 2.2) ── */}
      {pestana === 'dibujos' && <TabDibujos cliente={cliente} />}

      {/* ── PRESUPUESTOS IA: presupuestos narrativos creados/modificados por el asistente (Fase 5) ── */}
      {pestana === 'presupuestosIA' && (
        <div className={styles.tabPanel}>
          <TabPresupuestosIA cliente={cliente} empresa={empresa} onActualizarEmpresa={onActualizarEmpresa} onActualizarCliente={onActualizar} />
        </div>
      )}

      {/* ── CONTRATOS: segundo tipo de documento del Motor Documental (Incremento 12) — mismo editor, mismo núcleo ── */}
      {pestana === 'contratos' && (
        <div className={styles.tabPanel}>
          <TabContratos cliente={cliente} empresa={empresa} onActualizarEmpresa={onActualizarEmpresa} />
        </div>
      )}

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
