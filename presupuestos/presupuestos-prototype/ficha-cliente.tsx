import { useState, useEffect, useCallback } from 'react';
import type { Cliente, Proyecto, Movimiento, RegistroHoras, Adjunto, Factura, Proveedor } from './types.js';
import * as api from './api.js';
import { GaleriaFotos } from './galeria-fotos.js';
import type { FotoProyecto } from './galeria-fotos.js';
import { EscanerFactura } from './escaner-factura.js';
import { formatoEuroPrivado, formatoFecha } from './calculos.js';
import { calcularResumen } from './calculos.js';
import { TablaMovimientos } from './tabla-movimientos.js';
import { TablaHoras } from './tabla-horas.js';
import { TablaMargen } from './tabla-margen.js';
import { PanelAdjuntos } from './panel-adjuntos.js';
import { autoCrearProveedorDeFactura } from './proveedor-utils.js';
import { colorAvatar, iniciales } from './avatar-utils.js';
import { etiquetaEstado, grupoEstado } from './estado-utils.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import { SolicitudResena } from './solicitud-resena.js';
import { VisorFactura } from './visor-factura.js';
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

/**
 * Props de la ficha detallada de un proyecto (incremento "Cliente ≠
 * Proyecto", 20/08/2026 — antes esta pantalla mostraba un `Cliente`
 * completo, que mezclaba identidad y datos del trabajo en el mismo
 * objeto; ahora recibe los dos por separado).
 */
export type FichaClienteProps = {
  /** Cliente (identidad) al que pertenece el proyecto. */
  cliente: Cliente;
  /** Proyecto/expediente a mostrar. */
  proyecto: Proyecto;
  /** Lista completa de clientes para el escáner. */
  clientes?: { id: string; nombre: string }[];
  /** Lista de proveedores para desplegable y vinculación automática. */
  proveedores?: Proveedor[];
  /** Datos de empresa — usados por el editor de presupuestos en lienzo (membrete, condiciones por defecto). */
  empresa: Empresa;
  /** Modo privacidad activo — oculta los importes (el interruptor vive en Inicio; ver `use-privacidad.ts`). */
  privado: boolean;
  /** Persiste cambios de empresa — usado para el clic-en-el-logo del editor de lienzo. */
  onActualizarEmpresa: (cambios: Partial<Empresa>) => void;
  /** Volver a la lista. */
  onVolver: () => void;
  /** Actualiza los datos de identidad del cliente (nombre/teléfono/email). */
  onActualizarCliente: (cliente: Cliente) => void;
  /** Actualiza los datos propios del proyecto. */
  onActualizarProyecto: (proyecto: Proyecto) => void;
  /** Borra por completo este proyecto (con confirmación) y vuelve a la lista — nunca borra al cliente ni sus otros proyectos. */
  onBorrar?: (id: string) => void;
  /** Guardar una factura de gasto vinculada a este proyecto. */
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
 * Ficha completa de un proyecto, organizada por pestañas (Dirección
 * Creativa): Resumen, Proyectos (fotos, medidas, documentos, datos de
 * acceso), Control de gasto (ingresos/gastos/horas/margen — exclusivos de
 * ESTE proyecto), Facturas y Notas. Ninguna función existente se ha
 * quitado — solo se ha reorganizado (incremento "Cliente ≠ Proyecto").
 */
export function FichaCliente({ cliente, proyecto, clientes = [], proveedores = [], empresa, privado, onActualizarEmpresa, onVolver, onActualizarCliente, onActualizarProyecto, onBorrar, onGuardarFactura, onCrearProveedor }: FichaClienteProps) {
  const [pestana, setPestana] = useState<Pestana>('resumen');
  /** Contador-disparador: cada incremento fuerza `TabDatos` a abrirse en modo edición (botón "Editar" de la cabecera, ver más abajo). */
  const [abrirEdicionDatos, setAbrirEdicionDatos] = useState(0);
  const editarDatos = () => { setPestana('proyectos'); setAbrirEdicionDatos((n) => n + 1); };
  const [escanerAbierto, setEscanerAbierto] = useState(false);
  const [facturasProyecto, setFacturasProyecto] = useState<Factura[]>([]);
  /** Factura abierta en el visor de imagen/PDF (petición del usuario, 20/08/2026 — antes esta tabla no tenía forma de ver el documento adjunto, solo sus datos). */
  const [viendoFacturaId, setViendoFacturaId] = useState<string | null>(null);
  // Los adjuntos ya no llegan con la ficha (ver comentario en api.ts) — se
  // piden aparte para que abrir la ficha no dependa de transferir varios MB.
  const [adjuntosProyecto, setAdjuntosProyecto] = useState<Adjunto[]>([]);
  useEffect(() => {
    api.obtenerAdjuntosProyecto(proyecto.id).then(setAdjuntosProyecto).catch(() => setAdjuntosProyecto([]));
  }, [proyecto.id]);

  /**
   * Pide sus propios gastos al servidor filtrando por `proyectoId` — nunca
   * por `clienteId` (incremento "Cliente ≠ Proyecto", 20/08/2026): antes
   * de este incremento mostraba TODAS las facturas del cliente, mezclando
   * las de sus distintos proyectos.
   */
  const cargarFacturasProyecto = useCallback(() => {
    api.obtenerFacturasDeProyecto(proyecto.id)
      .then((todas) => setFacturasProyecto(todas.filter((f) => f.tipo === 'gasto')))
      .catch(() => setFacturasProyecto([]));
  }, [proyecto.id]);

  useEffect(() => { cargarFacturasProyecto(); }, [cargarFacturasProyecto]);

  const totalFacturasGasto = facturasProyecto.reduce((s, f) => s + f.importe, 0);
  const r = calcularResumen(proyecto);

  /** Guarda la factura, vincula proveedor automáticamente si el nombre coincide con uno existente, y recarga la lista. */
  const guardarFacturaConProveedor = (f: Factura) => {
    autoCrearProveedorDeFactura(f, proveedores, onCrearProveedor);
    onGuardarFactura?.(f);
    cargarFacturasProyecto();
  };


  /**
   * Movimientos, tareas, estado y presupuesto usan sus propias rutas
   * quirúrgicas (Hardening Fase 2) en vez de reenviar el proyecto completo
   * — así una edición en esta ficha nunca puede pisar una escritura
   * automática (aceptar presupuesto, sincronizar factura) hecha mientras
   * esta pantalla estaba abierta con datos desactualizados.
   * `onActualizarProyecto` sigue llamándose con la respuesta fresca del
   * servidor para refrescar la lista/caché local, igual que ya hace el
   * resto de la app.
   */
  const anadirMovimiento = (m: Movimiento) => {
    const { id: _id, facturaId: _facturaId, ...datos } = m;
    api.anadirMovimientoProyecto(proyecto.id, datos).then(onActualizarProyecto);
  };

  const borrarMovimiento = (id: string) =>
    api.borrarMovimientoProyecto(proyecto.id, id).then(onActualizarProyecto);

  const editarMovimiento = (m: Movimiento) => {
    const { id, facturaId: _facturaId, ...datos } = m;
    api.editarMovimientoProyecto(proyecto.id, id, datos).then(onActualizarProyecto);
  };

  const anadirHoras = (h: RegistroHoras) =>
    onActualizarProyecto({ ...proyecto, horas: [...proyecto.horas, h] });

  const borrarHoras = (id: string) =>
    onActualizarProyecto({ ...proyecto, horas: proyecto.horas.filter((x) => x.id !== id) });

  const anadirAdjunto = (a: Adjunto) => {
    const nuevos = [...adjuntosProyecto, a];
    setAdjuntosProyecto(nuevos);
    onActualizarProyecto({ ...proyecto, adjuntos: nuevos });
  };

  const borrarAdjunto = (id: string) => {
    const nuevos = adjuntosProyecto.filter((x) => x.id !== id);
    setAdjuntosProyecto(nuevos);
    onActualizarProyecto({ ...proyecto, adjuntos: nuevos });
  };

  const cambiarEstado = (estado: Proyecto['estado']) =>
    api.cambiarEstadoProyecto(proyecto.id, estado).then(onActualizarProyecto);

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

      {/* Cabecera con datos del cliente/proyecto */}
      <div className={styles.fichaCabecera}>
        <div className={styles.barraSeccion} style={{ marginBottom: 0 }}>
          <div className={styles.fichaIdentidad}>
            <div className={styles.clienteAvatar} style={{ width: 52, height: 52, fontSize: '1.05rem', background: colorAvatar(cliente.id), flexShrink: 0 }}>
              {iniciales(cliente.nombre)}
            </div>
            <div>
              <h2 className={styles.h2} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                {cliente.nombre}
                <span className={`${styles.pillEstado} ${grupoEstado[proyecto.estado] === 'curso' ? styles.pillEstadoCurso : styles.pillEstadoFin}`}>
                  {etiquetaEstado[proyecto.estado]}
                </span>
              </h2>
              <p className={styles.fichaDesde}>{proyecto.proyecto || 'Proyecto'} · desde {formatoFecha(proyecto.creado)}</p>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem' }}>
            <select
              className={styles.select}
              value={proyecto.estado}
              onChange={(e) => cambiarEstado(e.target.value as Proyecto['estado'])}
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
            <SolicitudResena clienteId={cliente.id} />
            {onBorrar && (
              <ConfirmarBorrado
                label="Eliminar"
                titulo="Eliminar este proyecto"
                onConfirmar={() => onBorrar(proyecto.id)}
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
          {proyecto.direccion && (
            <div className={styles.fichaContactoItem}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              {proyecto.direccion}
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
          proyecto={proyecto}
          facturasGasto={facturasProyecto}
          adjuntos={adjuntosProyecto}
          totalIngresos={r.totalIngresos}
          privado={privado}
          onIrAProyecto={() => setPestana('proyectos')}
          onIrADocumentos={() => setPestana('proyectos')}
        />
      )}

      {/* ── PROYECTOS: fotos, medidas/pizarra, documentos, datos de acceso ── */}
      {pestana === 'proyectos' && (
        <div className={styles.tabPanel}>
          <GaleriaFotos
            fotos={proyecto.fotos || []}
            onAnadir={(f: FotoProyecto) => onActualizarProyecto({ ...proyecto, fotos: [...(proyecto.fotos || []), f] })}
            onBorrar={(id: string) => onActualizarProyecto({ ...proyecto, fotos: (proyecto.fotos || []).filter((f) => f.id !== id) })}
          />
          <PanelAdjuntos
            adjuntos={adjuntosProyecto}
            onAnadir={anadirAdjunto}
            onBorrar={borrarAdjunto}
          />
          <TabMediciones proyecto={proyecto} onActualizar={onActualizarProyecto} />
          <TabDatos cliente={cliente} proyecto={proyecto} onActualizarCliente={onActualizarCliente} onActualizarProyecto={onActualizarProyecto} abrirEdicion={abrirEdicionDatos} />
        </div>
      )}

      {/* ── CONTROL DE GASTO: ingresos/gastos, horas, margen — exclusivos de este proyecto ── */}
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
              <span className={`${styles.kpiValor} ${styles.valorVerde}`}>{formatoEuroPrivado(r.totalIngresos, privado)}</span>
            </div>
            <div className={styles.kpiTarjeta}>
              <div className={styles.kpiCabecera}>
                <div className={styles.kpiIconoChipRojo} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
                </div>
                <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Gastos materiales</span>
              </div>
              <span className={`${styles.kpiValor} ${styles.valorRojo}`}>{formatoEuroPrivado(r.totalGastos, privado)}</span>
            </div>
            <div className={styles.kpiTarjeta}>
              <div className={styles.kpiCabecera}>
                <div className={styles.kpiIconoChipAzul} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                </div>
                <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Mano de obra ({r.totalHoras} h)</span>
              </div>
              <span className={`${styles.kpiValor} ${styles.valorAzul}`}>{formatoEuroPrivado(r.costeManoObra, privado)}</span>
            </div>
            <div className={styles.kpiTarjeta}>
              <div className={styles.kpiCabecera}>
                <div className={r.margen >= 0 ? styles.kpiIconoChipVerde : styles.kpiIconoChipRojo} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>
                </div>
                <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Margen de ganancia</span>
              </div>
              <span className={`${styles.kpiValor} ${r.margen >= 0 ? styles.valorVerde : styles.valorRojo}`}>
                {formatoEuroPrivado(r.margen, privado)}
              </span>
              <span className={styles.kpiSub}>{r.margenPorcentaje.toFixed(1)}% sobre ingresos</span>
            </div>
          </div>

          <TablaMovimientos
            movimientos={proyecto.movimientos}
            onAnadir={anadirMovimiento}
            onBorrar={borrarMovimiento}
            onEditar={editarMovimiento}
          />

          <TablaHoras
            horas={proyecto.horas}
            tarifaHora={proyecto.tarifaHora}
            onAnadir={anadirHoras}
            onBorrar={borrarHoras}
          />

          <TablaMargen resumen={r} presupuesto={proyecto.presupuesto} privado={privado} />
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
            {facturasProyecto.length === 0 ? (
              <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem', margin: 0 }}>No hay facturas de gasto vinculadas a este proyecto.</p>
            ) : (
              <>
                {/* Sin este contenedor, en móvil la tabla no cabe y la última columna (el ojo de "Ver factura") queda fuera de la pantalla sin forma de llegar a ella — mismo fallo real ya corregido en `facturas.tsx`. */}
                <div style={{ overflowX: 'auto' }}>
                <table className={styles.tabla} style={{ width: '100%', minWidth: 420, marginBottom: '0.75rem' }}>
                  <thead><tr><th>Fecha</th><th>Proveedor / Concepto</th><th style={{ textAlign: 'right' }}>Importe</th><th /></tr></thead>
                  <tbody>
                    {facturasProyecto.map((f) => (
                      <tr key={f.id}>
                        <td>{f.fecha}</td>
                        <td><strong>{f.proveedor || '—'}</strong>{f.concepto && <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>{f.concepto}</span>}</td>
                        <td style={{ textAlign: 'right', color: 'var(--rojo)', fontWeight: 600 }}>{!privado && '-'}{formatoEuroPrivado(f.importe, privado)}</td>
                        <td style={{ textAlign: 'right' }}>
                          {(f.tieneDocumento || f.paginas?.length || f.imagenes?.length || f.imagen || f.pdfOriginalUrl) && (
                            <button className={styles.btnIcono} title="Ver factura" aria-label="Ver factura" onClick={() => setViendoFacturaId(f.id)}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <p style={{ textAlign: 'right', fontWeight: 600, color: 'var(--rojo)', fontSize: '0.9rem', margin: 0 }}>
                  Total facturas de gasto: {!privado && '-'}{formatoEuroPrivado(totalFacturasGasto, privado)}
                </p>
              </>
            )}
          </section>
        </div>
      )}

      {/* ── NOTAS y checklist de tareas ── */}
      {pestana === 'notas' && (
        <div className={styles.tabPanel}>
          <TabTareas proyecto={proyecto} onActualizar={onActualizarProyecto} />
          <TabNotas cliente={cliente} proyecto={proyecto} onActualizar={onActualizarProyecto} />
        </div>
      )}

      {/* ── DIBUJOS: repositorio de documentación gráfica del proyecto (Fase 2.2) ── */}
      {pestana === 'dibujos' && <TabDibujos proyecto={proyecto} />}

      {/* ── PRESUPUESTOS IA: presupuestos narrativos creados/modificados por el asistente (Fase 5) ── */}
      {pestana === 'presupuestosIA' && (
        <div className={styles.tabPanel}>
          <TabPresupuestosIA cliente={cliente} proyecto={proyecto} empresa={empresa} onActualizarEmpresa={onActualizarEmpresa} onActualizarProyecto={onActualizarProyecto} />
        </div>
      )}

      {/* ── CONTRATOS: segundo tipo de documento del Motor Documental (Incremento 12) — mismo editor, mismo núcleo ── */}
      {pestana === 'contratos' && (
        <div className={styles.tabPanel}>
          <TabContratos cliente={cliente} proyecto={proyecto} empresa={empresa} onActualizarEmpresa={onActualizarEmpresa} />
        </div>
      )}

      {escanerAbierto && onGuardarFactura && (
        <EscanerFactura
          clientes={clientes}
          proveedores={proveedores}
          proyectoFijo={{ id: proyecto.id, clienteId: cliente.id, nombre: proyecto.proyecto || cliente.nombre }}
          onGuardar={(f) => { guardarFacturaConProveedor({ ...f, clienteId: cliente.id, proyectoId: proyecto.id, tipo: 'gasto' }); setEscanerAbierto(false); }}
          onCerrar={() => setEscanerAbierto(false)}
        />
      )}

      {viendoFacturaId && (
        <VisorFactura
          facturaId={viendoFacturaId}
          onCerrar={() => setViendoFacturaId(null)}
          onDescargarPdf={api.descargarPdfFactura}
          privado={privado}
        />
      )}
    </div>
  );
}
