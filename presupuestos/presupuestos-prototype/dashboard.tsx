import { useState, useEffect, type ReactNode } from 'react';
import type { Factura } from './types.js';
import type { ResumenFacturas } from './use-facturas.js';
import type { PresupuestoMC } from './presupuestos-modelo.js';
import type { ProyectoResumen } from './api.js';
import { calcularMetricas } from './dashboard-calculos.js';
import { formatoEuroPrivado, VALOR_OCULTO, formatoFecha } from './calculos.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import { obtenerTodosLosPresupuestos, obtenerNotas, guardarNota, borrarNota } from './api.js';
import { generarId } from './mock.js';
import { PRIORIDADES, ordenarPorDefecto, type NotaMC, type PrioridadNota } from './notas-modelo.js';
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
  /** Cambia la fecha de montaje/medición de un proyecto (Próximos montajes y mediciones). */
  onActualizarRecordatorio: (proyectoId: string, cambios: { fechaMontaje?: string; fechaMedicion?: string }) => void;
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
   * "Cosas por hacer" (26/08/2026) — reutiliza el sistema de Notas ya
   * existente (`NotaMC`, con `estado`/`prioridad` ya en el modelo pero sin
   * ninguna interfaz que los usara), pero solo las SIN cliente (`clienteId`
   * vacío): las que se añaden aquí mismo, no las notas de la ficha de un
   * cliente concreto — checklist de negocio, no un cajón de todo.
   *
   * Diseño corregido, 26/08/2026 (bug real reportado por el usuario): la
   * primera versión quitaba una tarea de la vista al marcarla hecha (o la
   * dejaba fuera del recorte de 5 al "despuntarla"), y el usuario la vivió
   * como un borrado real — tocó el check sin querer y la tarea "desapareció"
   * tanto de aquí como de Notas. Ahora es un checklist de verdad, igual que
   * "Tareas del proyecto" (`tab-tareas.tsx`, mismo patrón que ya conocía el
   * usuario): el orden es SIEMPRE por prioridad (`ordenarPorDefecto`, que no
   * mira `estado`), así que marcar/desmarcar nunca reordena ni saca nada de
   * la vista — solo tacha el texto y rellena la casilla. Solo se borra de
   * verdad con el icono de papelera.
   */
  const [tareas, setTareas] = useState<NotaMC[]>([]);
  const [cargandoTareas, setCargandoTareas] = useState(true);
  useEffect(() => {
    obtenerNotas()
      .then((todas) => setTareas(ordenarPorDefecto(todas.filter((n) => !n.clienteId))))
      .catch(() => setTareas([]))
      .finally(() => setCargandoTareas(false));
  }, []);

  const [agregandoTarea, setAgregandoTarea] = useState(false);
  const [nuevaTarea, setNuevaTarea] = useState('');
  const [nuevaTareaPrioridad, setNuevaTareaPrioridad] = useState<PrioridadNota>('media');
  const [guardandoTarea, setGuardandoTarea] = useState(false);

  const crearTarea = async () => {
    if (!nuevaTarea.trim()) return;
    setGuardandoTarea(true);
    const ahora = new Date().toISOString();
    const nueva: NotaMC = {
      id: generarId(), titulo: '', contenido: nuevaTarea.trim(), prioridad: nuevaTareaPrioridad, estado: 'abierta',
      clienteId: '', proyectoId: '', etiquetas: [], origen: 'texto', creado: ahora, actualizado: ahora,
    };
    try {
      const guardada = await guardarNota(nueva);
      setTareas((prev) => ordenarPorDefecto([guardada, ...prev]));
      setNuevaTarea('');
      setNuevaTareaPrioridad('media');
      setAgregandoTarea(false);
    } catch {
      // Sin toast de error aquí: la tarea sigue en el formulario, se puede reintentar.
    } finally {
      setGuardandoTarea(false);
    }
  };

  /** Marca/desmarca una tarea — nunca la quita de la vista ni la reordena (`ordenarPorDefecto` no mira `estado`), solo tacha el texto y rellena la casilla. */
  const alternarTarea = async (nota: NotaMC) => {
    const actualizada: NotaMC = { ...nota, estado: nota.estado === 'abierta' ? 'hecha' : 'abierta', actualizado: new Date().toISOString() };
    setTareas((prev) => prev.map((n) => (n.id === nota.id ? actualizada : n)));
    try {
      await guardarNota(actualizada);
    } catch {
      // El guardado falló: revertimos el cambio en pantalla.
      setTareas((prev) => prev.map((n) => (n.id === nota.id ? nota : n)));
    }
  };

  /** Borra de verdad una tarea (papelera) — el único modo de que salga de la vista, ahora que marcar/desmarcar ya no la quita. */
  const borrarTarea = async (nota: NotaMC) => {
    setTareas((prev) => prev.filter((n) => n.id !== nota.id));
    try {
      await borrarNota(nota.id);
    } catch {
      setTareas((prev) => ordenarPorDefecto([...prev, nota]));
    }
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

  const guardarRecordatorio = () => {
    if (!nuevoClienteId || !nuevaFecha) return;
    onActualizarRecordatorio(nuevoClienteId, nuevoTipo === 'montaje' ? { fechaMontaje: nuevaFecha } : { fechaMedicion: nuevaFecha });
    setAgregando(false);
    setNuevoClienteId('');
    setNuevaFecha('');
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
        ) : tareas.length === 0 ? (
          <p className={styles.dashboardVacio}>Todo al día — no tienes tareas pendientes.</p>
        ) : (
          <>
            {tareas.slice(0, 5).map((t) => {
              const hecha = t.estado === 'hecha';
              return (
                <div key={t.id} className={styles.actividadItem}>
                  <button
                    type="button"
                    onClick={() => alternarTarea(t)}
                    title={hecha ? 'Marcar como pendiente' : 'Marcar como hecha'}
                    aria-label={hecha ? 'Marcar como pendiente' : 'Marcar como hecha'}
                    style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', padding: 0,
                      border: `2px solid ${COLOR_PRIORIDAD_TAREA[t.prioridad]}`,
                      background: hecha ? COLOR_PRIORIDAD_TAREA[t.prioridad] : 'none',
                      color: hecha ? 'var(--blanco)' : COLOR_PRIORIDAD_TAREA[t.prioridad],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => { if (!hecha) { e.currentTarget.style.background = COLOR_PRIORIDAD_TAREA[t.prioridad]; e.currentTarget.style.color = 'var(--blanco)'; } }}
                    onMouseLeave={(e) => { if (!hecha) { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = COLOR_PRIORIDAD_TAREA[t.prioridad]; } }}
                  >
                    {hecha && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                  </button>
                  <div className={styles.actividadCuerpo} style={{ cursor: 'pointer', opacity: hecha ? 0.6 : 1 }} onClick={() => alternarTarea(t)}>
                    <span className={styles.actividadTitulo} style={hecha ? { textDecoration: 'line-through' } : undefined}>{t.titulo || t.contenido}</span>
                    {t.titulo && <span className={styles.actividadSub} style={hecha ? { textDecoration: 'line-through' } : undefined}>{t.contenido}</span>}
                  </div>
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, borderRadius: 'var(--radio-full, 999px)', padding: '0.15rem 0.55rem', flexShrink: 0,
                    color: COLOR_PRIORIDAD_TAREA[t.prioridad], background: COLOR_PRIORIDAD_TAREA_BG[t.prioridad],
                  }}>
                    {ETIQUETA_PRIORIDAD_TAREA[t.prioridad]}
                  </span>
                  <ConfirmarBorrado titulo="Borrar tarea" onConfirmar={() => borrarTarea(t)} />
                </div>
              );
            })}
            {tareas.length > 5 && (
              <button
                type="button"
                onClick={onIrANotas}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--topo)', fontSize: '0.78rem', fontWeight: 600, padding: '0.6rem 0 0' }}
              >
                Ver {tareas.length - 5} más en Notas →
              </button>
            )}
          </>
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
            <div className={styles.formInline} style={{ marginTop: 0, marginBottom: '1rem' }}>
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
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardarRecordatorio} disabled={!nuevoClienteId || !nuevaFecha}>
                Guardar
              </button>
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
