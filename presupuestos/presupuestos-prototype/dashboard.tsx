import { useState, useEffect, useRef, type ReactNode } from 'react';
import type { Factura } from './types.js';
import type { ResumenFacturas } from './use-facturas.js';
import type { PresupuestoMC } from './presupuestos-modelo.js';
import type { ProyectoResumen } from './api.js';
import { calcularMetricas } from './dashboard-calculos.js';
import { formatoEuroPrivado, VALOR_OCULTO, formatoFecha } from './calculos.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import { obtenerTodosLosPresupuestos, obtenerNotas, guardarNota } from './api.js';
import { generarId } from './mock.js';
import { PRIORIDADES, ordenarItemsLista, type NotaMC, type PrioridadNota } from './notas-modelo.js';
import styles from './styles.module.css';

const COLOR_PRIORIDAD_TAREA: Record<PrioridadNota, string> = { alta: 'var(--rojo)', media: 'var(--ocre)', baja: 'var(--topo-claro)' };
const COLOR_PRIORIDAD_TAREA_BG: Record<PrioridadNota, string> = { alta: 'var(--rojo-bg)', media: 'var(--ocre-bg)', baja: 'var(--topo-tinte)' };
const ETIQUETA_PRIORIDAD_TAREA: Record<PrioridadNota, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };

/** Props del panel principal (dashboard). */
export type DashboardProps = {
  /** Nombre para el saludo. */
  nombre: string;
  /** Lista de proyectos (ya cargados), con el nombre de su cliente resuelto. */
  proyectos: ProyectoResumen[];
  /** Facturas más recientes primero (ya vienen así del servidor). */
  facturas: Factura[];
  /** Totales ya resueltos por el servidor sobre toda la colección de facturas. */
  resumen: ResumenFacturas;
  /** Modo privacidad activo — oculta los importes (Inicio es donde vive el interruptor; ver `use-privacidad.ts`). */
  privado: boolean;
  /** Activa/desactiva el modo privacidad. */
  onAlternarPrivacidad: () => void;
  /** Abre la ficha de un proyecto. */
  onAbrir: (id: string) => void;
  /** Borra una factura (Actividad reciente). */
  onBorrarFactura: (id: string) => void;
  /** Cambia la fecha de montaje/medición de un proyecto (Próximos montajes y mediciones). Rechaza si el guardado falla — `guardarRecordatorio` lo espera para no cerrar el formulario como si hubiera ido bien. */
  onActualizarRecordatorio: (proyectoId: string, cambios: { fechaMontaje?: string; fechaMedicion?: string }) => Promise<void>;
  /** Va a la sección Notas (enlace "ver más" del banner "Cosas por hacer"). */
  onIrANotas: () => void;
};

const ICONOS: Record<string, ReactNode> = {
  ingreso: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>,
  gasto: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>,
  balance: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>,
  presupuestos: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
  montaje: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><rect x="2" y="7" width="20" height="14" rx="2" /></svg>,
  medicion: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /></svg>,
};

/** Una tarjeta KPI del panel principal. */
function Kpi({
  icono, color, etiqueta, valor, sub,
}: { icono: keyof typeof ICONOS; color: 'verde' | 'rojo' | 'topo'; etiqueta: string; valor: string; sub: string }) {
  return (
    <div className={styles.kpiTarjeta}>
      <div className={styles.kpiCabecera}>
        <div className={`${styles.kpiIconoChip} ${styles['kpiIconoChip' + color[0].toUpperCase() + color.slice(1)]}`}>{ICONOS[icono]}</div>
        <span className={styles.kpiLabel}>{etiqueta}</span>
      </div>
      <span className={styles.kpiValor}>{valor}</span>
      <span className={styles.kpiSub}>{sub}</span>
    </div>
  );
}

/**
 * Panel principal: resumen visual del negocio (ingresos, gastos, balance,
 * presupuestos en curso), actividad reciente sobre facturas reales (con
 * borrado directo), y próximos montajes/mediciones a partir de las fechas
 * reales de cada cliente (con alta y borrado directo). Sin datos
 * inventados: lo que no hay todavía se muestra vacío, no relleno con
 * ejemplos (Dirección Creativa).
 */
/** Un elemento de "Actividad reciente": una factura o un presupuesto recién aceptado. */
type ItemActividad =
  | { tipo: 'factura'; fecha: string; factura: Factura }
  | { tipo: 'presupuestoAceptado'; fecha: string; presupuesto: PresupuestoMC };

export function Dashboard({ nombre, proyectos, facturas, resumen, privado, onAlternarPrivacidad, onAbrir, onBorrarFactura, onActualizarRecordatorio, onIrANotas }: DashboardProps) {
  const m = calcularMetricas(proyectos);
  const primerNombre = (nombre || '').split(' ')[0];

  /**
   * "Cosas por hacer" (26/08/2026, rediseñado el mismo día a petición
   * explícita del usuario) — antes cada tarea era su propia `NotaMC`
   * (texto libre con prioridad); el usuario pidió en su lugar un checklist
   * de verdad, con líneas sueltas que se tachan una a una ("comprar
   * pincel", "comprar lijas"…), igual que "Tareas del proyecto"
   * (`tab-tareas.tsx`). Ahora es UNA sola nota `tipo: 'lista'` sin
   * `clienteId` (la misma que se puede crear/editar desde la sección
   * Notas — ver `notas-vista.tsx`), y esta pantalla solo pinta y modifica
   * sus `items`. Sin prioridad por ítem: el modelo de referencia
   * (`Tarea`) tampoco la tiene.
   */
  const [listaCosas, setListaCosas] = useState<NotaMC | null>(null);
  /**
   * Bug real, 26/08/2026: cada acción (marcar, borrar, añadir, editar)
   * partía de `listaCosas` capturado por closure para construir el nuevo
   * `items[]` a guardar. Al hacer dos acciones seguidas rápido (marcar dos
   * tareas casi a la vez, por ejemplo) la segunda llamada todavía veía el
   * `listaCosas` de ANTES de que la primera terminara de guardarse, así
   * que su guardado (que sobreescribe la nota entera) pisaba el cambio de
   * la primera — la tarea "no se quedaba guardada". Mismo patrón exacto
   * que el bug de subir varias fotos a la vez (`galeria-fotos.tsx`). Fix:
   * un ref que se actualiza de forma SÍNCRONA en cuanto se decide el
   * siguiente estado, para que la siguiente acción — aunque se dispare
   * antes de que la anterior haya terminado de guardarse — siempre parta
   * del último `items[]` conocido, no de uno ya desactualizado.
   */
  const listaRef = useRef<NotaMC | null>(null);
  const [cargandoTareas, setCargandoTareas] = useState(true);
  useEffect(() => {
    obtenerNotas()
      .then((todas) => {
        const encontrada = todas.find((n) => n.tipo === 'lista' && !n.clienteId) ?? null;
        listaRef.current = encontrada;
        setListaCosas(encontrada);
      })
      .catch(() => setListaCosas(null))
      .finally(() => setCargandoTareas(false));
  }, []);

  const [agregandoTarea, setAgregandoTarea] = useState(false);
  const [nuevaTarea, setNuevaTarea] = useState('');
  const [nuevaTareaPrioridad, setNuevaTareaPrioridad] = useState<PrioridadNota>('media');
  const [guardandoTarea, setGuardandoTarea] = useState(false);

  /** Guarda la lista completa (crea la nota `'lista'` la primera vez que hace falta). */
  const guardarLista = async (items: NotaMC['items']) => {
    const ahora = new Date().toISOString();
    const base = listaRef.current;
    const actualizada: NotaMC = base
      ? { ...base, items, actualizado: ahora }
      : {
        id: generarId(), titulo: 'Cosas por hacer', contenido: '', tipo: 'lista', items,
        prioridad: 'media', estado: 'abierta', clienteId: '', proyectoId: '', etiquetas: [],
        origen: 'texto', creado: ahora, actualizado: ahora,
      };
    listaRef.current = actualizada;
    setListaCosas(actualizada);
    try {
      const guardada = await guardarNota(actualizada);
      listaRef.current = guardada;
      setListaCosas(guardada);
    } catch {
      listaRef.current = base;
      setListaCosas(base);
    }
  };

  const crearTarea = async () => {
    if (!nuevaTarea.trim()) return;
    setGuardandoTarea(true);
    await guardarLista([...(listaRef.current?.items ?? []), { id: generarId(), texto: nuevaTarea.trim(), hecha: false, prioridad: nuevaTareaPrioridad }]);
    setNuevaTarea('');
    setNuevaTareaPrioridad('media');
    setAgregandoTarea(false);
    setGuardandoTarea(false);
  };

  /** Marca/desmarca una tarea — nunca la quita de la vista, solo tacha el texto y rellena la casilla. */
  const alternarTarea = (itemId: string) => {
    if (!listaRef.current) return;
    guardarLista(listaRef.current.items.map((it) => (it.id === itemId ? { ...it, hecha: !it.hecha } : it)));
  };

  /** Borra de verdad una tarea (papelera) — el único modo de que salga de la vista, ahora que marcar/desmarcar ya no la quita. */
  const borrarTarea = (itemId: string) => {
    if (!listaRef.current) return;
    guardarLista(listaRef.current.items.filter((it) => it.id !== itemId));
  };

  const cambiarPrioridadTarea = (itemId: string, prioridad: PrioridadNota) => {
    if (!listaRef.current) return;
    guardarLista(listaRef.current.items.map((it) => (it.id === itemId ? { ...it, prioridad } : it)));
  };

  const [editandoTareaId, setEditandoTareaId] = useState<string | null>(null);
  const [textoEdicionTarea, setTextoEdicionTarea] = useState('');

  const iniciarEdicionTarea = (itemId: string, textoActual: string) => {
    setEditandoTareaId(itemId);
    setTextoEdicionTarea(textoActual);
  };

  const guardarEdicionTarea = () => {
    if (!listaRef.current || !textoEdicionTarea.trim()) return;
    guardarLista(listaRef.current.items.map((it) => (it.id === editandoTareaId ? { ...it, texto: textoEdicionTarea.trim() } : it)));
    setEditandoTareaId(null);
  };

  /**
   * "Registrar la actividad correspondiente" (Fase 1, detalle pendiente) —
   * no hace falta ningún registro nuevo: la fecha de aceptación ya vive en
   * `Presupuesto.actualizado` desde que se acepta (ver `aceptarPresupuesto`
   * en el backend). Solo faltaba traerla aquí y mezclarla con las facturas
   * en el mismo panel que ya existía, reutilizando `obtenerTodosLosPresupuestos`
   * (ya usado por la sección global de Documentos) — sin colección ni ruta
   * nuevas.
   */
  const [presupuestosAceptados, setPresupuestosAceptados] = useState<PresupuestoMC[]>([]);
  useEffect(() => {
    obtenerTodosLosPresupuestos()
      .then((todos) => setPresupuestosAceptados(todos.filter((p) => p.estado === 'aceptado')))
      .catch(() => setPresupuestosAceptados([]));
  }, []);

  const actividad: ItemActividad[] = [
    ...facturas.map((f): ItemActividad => ({ tipo: 'factura', fecha: f.fecha, factura: f })),
    ...presupuestosAceptados.map((p): ItemActividad => ({ tipo: 'presupuestoAceptado', fecha: p.actualizado, presupuesto: p })),
  ]
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, 4);

  const [agregando, setAgregando] = useState(false);
  const [nuevoClienteId, setNuevoClienteId] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState<'montaje' | 'medicion'>('montaje');
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [guardandoRecordatorio, setGuardandoRecordatorio] = useState(false);
  const [errorRecordatorio, setErrorRecordatorio] = useState<string | null>(null);

  /**
   * Bug real, 26/08/2026 (mismo patrón que fotos y tareas): esto no
   * esperaba la respuesta ni comprobaba si fallaba — cerraba el formulario
   * y limpiaba los campos igual, así que un guardado fallido se veía
   * exactamente igual que uno correcto, y el montaje/medición nunca
   * llegaba a aparecer en la lista.
   */
  const guardarRecordatorio = async () => {
    if (!nuevoClienteId || !nuevaFecha) return;
    setGuardandoRecordatorio(true);
    setErrorRecordatorio(null);
    try {
      await onActualizarRecordatorio(nuevoClienteId, nuevoTipo === 'montaje' ? { fechaMontaje: nuevaFecha } : { fechaMedicion: nuevaFecha });
      setAgregando(false);
      setNuevoClienteId('');
      setNuevaFecha('');
    } catch (e) {
      setErrorRecordatorio(String(e).replace(/^Error:\s*/, '') || 'No se pudo guardar. Vuelve a intentarlo.');
    } finally {
      setGuardandoRecordatorio(false);
    }
  };

  const borrarRecordatorio = (proyecto: ProyectoResumen, tipo: 'montaje' | 'medicion') => {
    onActualizarRecordatorio(proyecto.id, tipo === 'montaje' ? { fechaMontaje: '' } : { fechaMedicion: '' });
  };

  return (
    <div className={styles.dashboard}>
      <div className={styles.dashboardTop} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <h2 className={styles.h2}>¡Buenas {horaDelDia()}, {primerNombre}!</h2>
          <p className={styles.dashboardSub}>Aquí tienes un resumen de tu actividad</p>
        </div>
        <button
          type="button"
          className={styles.btnIcono}
          onClick={onAlternarPrivacidad}
          title={privado ? 'Mostrar las cifras' : 'Ocultar las cifras (modo privacidad)'}
          style={{ flexShrink: 0 }}
        >
          {privado
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
        </button>
      </div>

      <div className={styles.kpiGrid}>
        <Kpi icono="ingreso" color="verde" etiqueta="Ingresos" valor={formatoEuroPrivado(resumen.totalIngresos, privado)} sub={`${resumen.numIngresos} facturas`} />
        <Kpi icono="gasto" color="rojo" etiqueta="Gastos" valor={formatoEuroPrivado(resumen.totalGastos, privado)} sub={`${resumen.numGastos} facturas`} />
        <Kpi icono="balance" color={resumen.balance >= 0 ? 'verde' : 'rojo'} etiqueta="Balance" valor={formatoEuroPrivado(resumen.balance, privado)} sub={`${resumen.numFacturas} facturas`} />
        <Kpi icono="presupuestos" color="topo" etiqueta="Presupuestos" valor={privado ? VALOR_OCULTO : String(m.presupuestosPendientes + m.enCurso)} sub={m.enCurso > 0 ? `${m.enCurso} en curso` : `${m.presupuestosPendientes} pendientes`} />
      </div>

      <div className={styles.panel} style={{ marginBottom: '0.9rem' }}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitulo}>Cosas por hacer</h3>
          <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.72rem', padding: '0.35rem 0.65rem' }} onClick={() => setAgregandoTarea((v) => !v)}>
            {agregandoTarea ? 'Cancelar' : '+ Añadir'}
          </button>
        </div>

        {agregandoTarea && (
          <div className={styles.formInline} style={{ marginTop: 0, marginBottom: '1rem' }}>
            <div className={styles.campo} style={{ flex: 1 }}>
              <label className={styles.campoLabel}>Tarea</label>
              <input
                className={styles.input}
                value={nuevaTarea}
                onChange={(e) => setNuevaTarea(e.target.value)}
                placeholder="Ej: comprar pinceles, hacer presupuesto de…"
                onKeyDown={(e) => { if (e.key === 'Enter') crearTarea(); }}
                autoFocus
              />
            </div>
            <div className={styles.campo}>
              <label className={styles.campoLabel}>Prioridad</label>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {PRIORIDADES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setNuevaTareaPrioridad(p.id)}
                    style={{
                      padding: '0.35rem 0.7rem', borderRadius: 'var(--radio-full, 999px)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                      border: `1.5px solid ${COLOR_PRIORIDAD_TAREA[p.id]}`,
                      background: nuevaTareaPrioridad === p.id ? COLOR_PRIORIDAD_TAREA[p.id] : 'transparent',
                      color: nuevaTareaPrioridad === p.id ? 'var(--blanco)' : COLOR_PRIORIDAD_TAREA[p.id],
                    }}
                  >
                    {ETIQUETA_PRIORIDAD_TAREA[p.id]}
                  </button>
                ))}
              </div>
            </div>
            <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={crearTarea} disabled={!nuevaTarea.trim() || guardandoTarea}>
              {guardandoTarea ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}

        {cargandoTareas ? (
          <p className={styles.dashboardVacio}>Cargando…</p>
        ) : !listaCosas || listaCosas.items.length === 0 ? (
          <p className={styles.dashboardVacio}>Todo al día — no tienes tareas pendientes.</p>
        ) : (
          (() => {
            const ordenados = ordenarItemsLista(listaCosas.items);
            return (
              <>
                {ordenados.slice(0, 5).map((it) => {
                  if (editandoTareaId === it.id) {
                    return (
                      <div key={it.id} className={styles.actividadItem} style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                          className={styles.input}
                          style={{ flex: 1, fontSize: '0.85rem', minWidth: 140 }}
                          value={textoEdicionTarea}
                          onChange={(e) => setTextoEdicionTarea(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicionTarea(); if (e.key === 'Escape') setEditandoTareaId(null); }}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          {PRIORIDADES.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => cambiarPrioridadTarea(it.id, p.id)}
                              style={{
                                padding: '0.3rem 0.6rem', borderRadius: 'var(--radio-full, 999px)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                                border: `1.5px solid ${COLOR_PRIORIDAD_TAREA[p.id]}`,
                                background: it.prioridad === p.id ? COLOR_PRIORIDAD_TAREA[p.id] : 'transparent',
                                color: it.prioridad === p.id ? 'var(--blanco)' : COLOR_PRIORIDAD_TAREA[p.id],
                              }}
                            >
                              {ETIQUETA_PRIORIDAD_TAREA[p.id]}
                            </button>
                          ))}
                        </div>
                        <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.72rem', padding: '0.35rem 0.65rem', flexShrink: 0 }} onClick={guardarEdicionTarea} disabled={!textoEdicionTarea.trim()}>
                          Guardar
                        </button>
                        <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.72rem', padding: '0.35rem 0.65rem', flexShrink: 0 }} onClick={() => setEditandoTareaId(null)}>
                          Cancelar
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div key={it.id} className={styles.actividadItem}>
                      <button
                        type="button"
                        onClick={() => alternarTarea(it.id)}
                        title={it.hecha ? 'Marcar como pendiente' : 'Marcar como hecha'}
                        aria-label={it.hecha ? 'Marcar como pendiente' : 'Marcar como hecha'}
                        style={{
                          width: 22, height: 22, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', padding: 0,
                          border: `2px solid ${COLOR_PRIORIDAD_TAREA[it.prioridad]}`,
                          background: it.hecha ? COLOR_PRIORIDAD_TAREA[it.prioridad] : 'none',
                          color: it.hecha ? 'var(--blanco)' : COLOR_PRIORIDAD_TAREA[it.prioridad],
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {it.hecha && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        )}
                      </button>
                      <div
                        className={styles.actividadCuerpo}
                        style={{ cursor: 'pointer', opacity: it.hecha ? 0.6 : 1 }}
                        onClick={() => iniciarEdicionTarea(it.id, it.texto)}
                      >
                        <span className={styles.actividadTitulo} style={it.hecha ? { textDecoration: 'line-through' } : undefined}>{it.texto}</span>
                      </div>
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 700, borderRadius: 'var(--radio-full, 999px)', padding: '0.15rem 0.55rem', flexShrink: 0,
                        color: COLOR_PRIORIDAD_TAREA[it.prioridad], background: COLOR_PRIORIDAD_TAREA_BG[it.prioridad],
                      }}>
                        {ETIQUETA_PRIORIDAD_TAREA[it.prioridad]}
                      </span>
                      <button
                        type="button"
                        onClick={() => iniciarEdicionTarea(it.id, it.texto)}
                        aria-label="Editar tarea"
                        style={{
                          width: 30, height: 30, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', padding: 0,
                          border: '1.5px solid var(--borde)', background: 'none', color: 'var(--topo-claro)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
                      </button>
                      <ConfirmarBorrado titulo="Borrar tarea" onConfirmar={() => borrarTarea(it.id)} />
                    </div>
                  );
                })}
                {ordenados.length > 5 && (
                  <button
                    type="button"
                    onClick={onIrANotas}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--topo)', fontSize: '0.78rem', fontWeight: 600, padding: '0.6rem 0 0' }}
                  >
                    Ver {ordenados.length - 5} más en Notas →
                  </button>
                )}
              </>
            );
          })()
        )}
      </div>

      <div className={styles.dashboardCols}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitulo}>Actividad reciente</h3>
          </div>
          {actividad.length === 0 ? (
            <p className={styles.dashboardVacio}>Todavía no hay actividad registrada.</p>
          ) : (
            actividad.map((item) => item.tipo === 'factura' ? (
              <div key={`f-${item.factura.id}`} className={styles.actividadItem}>
                <div className={`${styles.kpiIconoChip} ${item.factura.tipo === 'ingreso' ? styles.kpiIconoChipVerde : styles.kpiIconoChipRojo}`} style={{ width: 34, height: 34 }}>
                  {ICONOS[item.factura.tipo]}
                </div>
                <div className={styles.actividadCuerpo}>
                  <span className={styles.actividadTitulo}>{item.factura.concepto}</span>
                  <span className={styles.actividadSub}>{item.factura.proveedor}</span>
                </div>
                <div className={styles.actividadDerecha} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span className={styles.actividadFecha}>{formatoFecha(item.factura.fecha)}</span>
                    <span className={item.factura.tipo === 'ingreso' ? styles.valorVerde : styles.valorRojo}>
                      {item.factura.tipo === 'gasto' && !privado ? '-' : ''}{formatoEuroPrivado(item.factura.importe, privado)}
                    </span>
                  </div>
                  <ConfirmarBorrado titulo="Borrar factura" onConfirmar={() => onBorrarFactura(item.factura.id)} />
                </div>
              </div>
            ) : (
              <div key={`p-${item.presupuesto.id}`} className={styles.actividadItem} onClick={() => onAbrir(item.presupuesto.proyectoId || item.presupuesto.clienteId)} style={{ cursor: 'pointer' }}>
                <div className={styles.kpiIconoChipTopo} style={{ width: 34, height: 34 }}>
                  {ICONOS.presupuestos}
                </div>
                <div className={styles.actividadCuerpo}>
                  <span className={styles.actividadTitulo}>Presupuesto aceptado</span>
                  <span className={styles.actividadSub}>{proyectos.find((p) => p.id === (item.presupuesto.proyectoId || item.presupuesto.clienteId))?.nombre || item.presupuesto.titulo}</span>
                </div>
                <div className={styles.actividadDerecha} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span className={styles.actividadFecha}>{formatoFecha(item.presupuesto.actualizado)}</span>
                    <span className={styles.valorVerde}>{formatoEuroPrivado(item.presupuesto.precioTotal, privado)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h3 className={styles.panelTitulo}>Próximos montajes y mediciones</h3>
            <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.72rem', padding: '0.35rem 0.65rem' }} onClick={() => setAgregando((v) => !v)}>
              {agregando ? 'Cancelar' : '+ Añadir'}
            </button>
          </div>

          {agregando && (
            <div className={styles.formInline} style={{ marginTop: 0, marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div className={styles.campo}>
                <label className={styles.campoLabel}>Proyecto</label>
                <select className={styles.select} value={nuevoClienteId} onChange={(e) => setNuevoClienteId(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.proyecto ? ` — ${p.proyecto}` : ''}</option>)}
                </select>
              </div>
              <div className={styles.campo}>
                <label className={styles.campoLabel}>Tipo</label>
                <select className={styles.select} value={nuevoTipo} onChange={(e) => setNuevoTipo(e.target.value as 'montaje' | 'medicion')}>
                  <option value="montaje">Montaje</option>
                  <option value="medicion">Medición</option>
                </select>
              </div>
              <div className={styles.campo}>
                <label className={styles.campoLabel}>Fecha</label>
                <input className={styles.input} type="date" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} />
              </div>
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardarRecordatorio} disabled={!nuevoClienteId || !nuevaFecha || guardandoRecordatorio}>
                {guardandoRecordatorio ? 'Guardando…' : 'Guardar'}
              </button>
              {errorRecordatorio && (
                <div className={styles.loginError} style={{ flexBasis: '100%' }}>{errorRecordatorio}</div>
              )}
            </div>
          )}

          {m.proximos.length === 0 ? (
            <p className={styles.dashboardVacio}>No hay montajes ni mediciones programadas.</p>
          ) : (
            m.proximos.map((p, i) => (
              <div key={i} className={styles.actividadItem}>
                <div className={styles.kpiIconoChip} style={{ width: 34, height: 34, cursor: 'pointer' }} onClick={() => onAbrir(p.proyecto.id)}>{ICONOS[p.tipo]}</div>
                <div className={styles.actividadCuerpo} style={{ cursor: 'pointer' }} onClick={() => onAbrir(p.proyecto.id)}>
                  <span className={styles.actividadTitulo}>{p.proyecto.nombre}</span>
                  <span className={styles.actividadSub}>{p.tipo === 'montaje' ? 'Montaje' : 'Medición'} — {p.proyecto.proyecto || 'Sin proyecto'}</span>
                </div>
                <div className={styles.actividadDerecha} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                  <span className={styles.actividadFecha}>{formatoFecha(p.fecha)}</span>
                  <ConfirmarBorrado titulo="Quitar recordatorio" onConfirmar={() => borrarRecordatorio(p.proyecto, p.tipo)} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** Saludo según la hora del día. */
function horaDelDia(): string {
  const h = new Date().getHours();
  if (h < 12) return 'días';
  if (h < 20) return 'tardes';
  return 'noches';
}
