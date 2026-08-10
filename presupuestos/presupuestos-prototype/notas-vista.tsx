import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Nota as NotaLegacy } from './types.js';
import { generarId } from './mock.js';
import { formatoFecha } from './calculos.js';
import { useDictado, BtnMicrofono } from './use-dictado.js';
import * as api from './api.js';
import { PRIORIDADES, ordenarPorDefecto, type NotaMC, type PrioridadNota } from './notas-modelo.js';
import styles from './styles.module.css';

const COLOR_PRIORIDAD: Record<PrioridadNota, string> = { alta: '#e03131', media: '#f08c00', baja: '#868e96' };
const ETIQUETA_PRIORIDAD: Record<PrioridadNota, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };

const CLAVE_MIGRACION_GLOBAL = 'mc_notas_globales';

type Orden = 'defecto' | 'creado' | 'actualizado' | 'cliente';
type FiltroCliente = 'todas' | 'sin-cliente' | string;

export type NotasVistaProps = {
  /**
   * Cuando se embebe en la ficha de un cliente: fija la asociación (sin
   * selector, no hay que volver a elegirlo — punto 7 del rediseño) y
   * limita el listado a sus notas. `notasLegacy` son las notas antiguas
   * embebidas en `cliente.notas` (formato previo, sin prioridad) — se
   * migran una sola vez al sistema nuevo y `onLegacyMigrada` limpia el
   * array antiguo para que no se vuelvan a migrar. Nada se pierde: solo
   * cambian de sitio.
   */
  clienteFijo?: { id: string; nombre: string };
  notasLegacy?: NotaLegacy[];
  onLegacyMigrada?: () => void;
  /** Lista de clientes para el selector — solo se usa en modo global. */
  clientes?: { id: string; nombre: string }[];
};

/**
 * Vista unificada de Notas (rediseño) — mismo componente para la sección
 * global (`clienteFijo` ausente) y para la pestaña "Notas" de una ficha de
 * cliente (`clienteFijo` presente). Antes eran dos sistemas separados
 * (`NotasGlobales` en localStorage, `TabNotas` embebido en el cliente sin
 * prioridad ni poder existir solo) — ahora una única entidad `NotaMC` en el
 * backend, opcionalmente asociada a un cliente.
 */
export function NotasVista({ clienteFijo, notasLegacy, onLegacyMigrada, clientes = [] }: NotasVistaProps) {
  const [notas, setNotas] = useState<NotaMC[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState<'todas' | PrioridadNota>('todas');
  const [filtroCliente, setFiltroCliente] = useState<FiltroCliente>('todas');
  const [orden, setOrden] = useState<Orden>('defecto');

  const [formAbierto, setFormAbierto] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [prioridad, setPrioridad] = useState<PrioridadNota>('media');
  const [clienteIdNueva, setClienteIdNueva] = useState(clienteFijo?.id ?? '');
  const [guardando, setGuardando] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [tituloEdicion, setTituloEdicion] = useState('');
  const [contenidoEdicion, setContenidoEdicion] = useState('');

  const cargar = useCallback(() => {
    setCargando(true);
    api.obtenerNotas()
      .then(setNotas)
      .catch((e) => setError(String(e).replace(/^Error:\s*/, '')))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Migración de notas antiguas embebidas en el cliente (formato previo,
  // sin prioridad) — una sola vez: se crean como notas nuevas asociadas a
  // este cliente y se limpia el array antiguo para no duplicar en la
  // siguiente visita.
  useEffect(() => {
    if (!clienteFijo || !notasLegacy?.length || !onLegacyMigrada) return;
    (async () => {
      for (const n of notasLegacy) {
        const nueva: NotaMC = {
          id: generarId(), titulo: '', contenido: n.texto, prioridad: 'media', estado: 'abierta',
          clienteId: clienteFijo.id, proyectoId: '', etiquetas: [], origen: 'texto',
          creado: n.fecha, actualizado: n.fecha,
        };
        await api.guardarNota(nueva).catch(() => {});
      }
      onLegacyMigrada();
      cargar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteFijo?.id]);

  // Migración de las notas globales antiguas guardadas solo en localStorage
  // de este navegador — solo aplica en modo global (sin `clienteFijo`).
  useEffect(() => {
    if (clienteFijo) return;
    (async () => {
      let previas: { id: string; fecha: string; texto: string }[] = [];
      try { previas = JSON.parse(localStorage.getItem(CLAVE_MIGRACION_GLOBAL) ?? '[]'); } catch { /* nada que migrar */ }
      if (!previas.length) return;
      for (const n of previas) {
        const nueva: NotaMC = {
          id: generarId(), titulo: '', contenido: n.texto, prioridad: 'media', estado: 'abierta',
          clienteId: '', proyectoId: '', etiquetas: [], origen: 'texto',
          creado: n.fecha, actualizado: n.fecha,
        };
        await api.guardarNota(nueva).catch(() => {});
      }
      localStorage.removeItem(CLAVE_MIGRACION_GLOBAL);
      cargar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteFijo]);

  // Si el contenido incluyó algo de dictado, la nota queda marcada con
  // origen "voz" — reservado para poder distinguirlas en la interfaz más
  // adelante (ver PDF, "posible IA para notas").
  const origenVozRef = useRef(false);
  const onDictadoNueva = useCallback((t: string) => {
    origenVozRef.current = true;
    setContenido((prev) => (prev ? prev + ' ' : '') + t.trim());
  }, []);
  const dictadoNueva = useDictado(onDictadoNueva);

  const onDictadoEdicion = useCallback((t: string) => {
    setContenidoEdicion((prev) => (prev ? prev + ' ' : '') + t.trim());
  }, []);
  const dictadoEdicion = useDictado(onDictadoEdicion);

  const nombreCliente = useCallback(
    (id: string) => (clienteFijo && clienteFijo.id === id ? clienteFijo.nombre : clientes.find((c) => c.id === id)?.nombre),
    [clientes, clienteFijo]
  );

  const notasDelAmbito = useMemo(
    () => (clienteFijo ? notas.filter((n) => n.clienteId === clienteFijo.id) : notas),
    [notas, clienteFijo]
  );

  const notasFiltradas = useMemo(() => {
    let r = notasDelAmbito;
    if (filtroPrioridad !== 'todas') r = r.filter((n) => n.prioridad === filtroPrioridad);
    if (!clienteFijo) {
      if (filtroCliente === 'sin-cliente') r = r.filter((n) => !n.clienteId);
      else if (filtroCliente !== 'todas') r = r.filter((n) => n.clienteId === filtroCliente);
    }
    const q = busqueda.trim().toLowerCase();
    if (q) {
      r = r.filter((n) =>
        n.titulo.toLowerCase().includes(q) ||
        n.contenido.toLowerCase().includes(q) ||
        (nombreCliente(n.clienteId) ?? '').toLowerCase().includes(q)
      );
    }
    if (orden === 'defecto') return ordenarPorDefecto(r);
    if (orden === 'creado') return [...r].sort((a, b) => b.creado.localeCompare(a.creado));
    if (orden === 'actualizado') return [...r].sort((a, b) => b.actualizado.localeCompare(a.actualizado));
    return [...r].sort((a, b) => (nombreCliente(a.clienteId) ?? '').localeCompare(nombreCliente(b.clienteId) ?? ''));
  }, [notasDelAmbito, filtroPrioridad, filtroCliente, busqueda, orden, clienteFijo, nombreCliente]);

  const crear = async () => {
    if (!contenido.trim()) return;
    setGuardando(true);
    const ahora = new Date().toISOString();
    const nueva: NotaMC = {
      id: generarId(), titulo: titulo.trim(), contenido: contenido.trim(), prioridad, estado: 'abierta',
      clienteId: clienteFijo?.id ?? clienteIdNueva, proyectoId: '', etiquetas: [],
      origen: origenVozRef.current ? 'voz' : 'texto',
      creado: ahora, actualizado: ahora,
    };
    try {
      const guardada = await api.guardarNota(nueva);
      setNotas((prev) => [guardada, ...prev]);
      setTitulo(''); setContenido(''); setPrioridad('media'); setClienteIdNueva(clienteFijo?.id ?? '');
      origenVozRef.current = false;
      setFormAbierto(false);
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setGuardando(false);
    }
  };

  const cambiarPrioridad = async (nota: NotaMC, nueva: PrioridadNota) => {
    const actualizada = { ...nota, prioridad: nueva, actualizado: new Date().toISOString() };
    setNotas((prev) => prev.map((n) => (n.id === nota.id ? actualizada : n)));
    try { await api.guardarNota(actualizada); } catch { cargar(); }
  };

  const borrar = async (id: string) => {
    setNotas((prev) => prev.filter((n) => n.id !== id));
    try { await api.borrarNota(id); } catch { cargar(); }
  };

  const iniciarEdicion = (n: NotaMC) => {
    setEditandoId(n.id);
    setTituloEdicion(n.titulo);
    setContenidoEdicion(n.contenido);
  };

  const guardarEdicion = async () => {
    const nota = notas.find((n) => n.id === editandoId);
    if (!nota || !contenidoEdicion.trim()) return;
    const actualizada = { ...nota, titulo: tituloEdicion.trim(), contenido: contenidoEdicion.trim(), actualizado: new Date().toISOString() };
    setNotas((prev) => prev.map((n) => (n.id === nota.id ? actualizada : n)));
    setEditandoId(null);
    try { await api.guardarNota(actualizada); } catch { cargar(); }
  };

  return (
    <div className={styles.tabPanel} style={clienteFijo ? undefined : { maxWidth: 760, margin: '0 auto' }}>
      {!clienteFijo && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.1rem' }}>
          <h2 className={styles.h2} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            Notas
          </h2>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => setFormAbierto((v) => !v)}>
            {formAbierto ? 'Cancelar' : '+ Nueva nota'}
          </button>
        </div>
      )}

      {clienteFijo && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Notas del proyecto</h3>
          <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.8rem' }} onClick={() => setFormAbierto((v) => !v)}>
            {formAbierto ? 'Cancelar' : '+ Nueva nota'}
          </button>
        </div>
      )}

      {/* Formulario de nueva nota */}
      {formAbierto && (
        <div style={{ background: 'var(--fondo)', border: '1px solid var(--borde)', borderRadius: 12, padding: '1rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <input
            className={styles.input}
            placeholder="Título (opcional)"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <textarea
              className={styles.input}
              placeholder={dictadoNueva.estado === 'escuchando' ? 'Escuchando…' : 'Escribe o dicta la nota…'}
              value={contenido + (dictadoNueva.interino ? ` ${dictadoNueva.interino}` : '')}
              onChange={(e) => setContenido(e.target.value)}
              rows={3}
              style={{ flex: 1, resize: 'vertical' }}
              autoFocus
            />
            <BtnMicrofono estado={dictadoNueva.estado} onClick={dictadoNueva.toggleDictado} />
          </div>
          {dictadoNueva.estado === 'escuchando' && (
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#c0392b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c0392b', display: 'inline-block', flexShrink: 0 }} />
              Escuchando… pulsa el micro para parar.
            </p>
          )}
          {dictadoNueva.completado && (
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#2f9e44', fontWeight: 600 }}>✓ Transcripción completada</p>
          )}

          <div>
            <span className={styles.campoLabel}>Prioridad</span>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem' }}>
              {PRIORIDADES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPrioridad(p.id)}
                  style={{
                    padding: '0.35rem 0.8rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                    border: `1.5px solid ${COLOR_PRIORIDAD[p.id]}`,
                    background: prioridad === p.id ? COLOR_PRIORIDAD[p.id] : 'transparent',
                    color: prioridad === p.id ? '#fff' : COLOR_PRIORIDAD[p.id],
                  }}
                >
                  {ETIQUETA_PRIORIDAD[p.id]}
                </button>
              ))}
            </div>
          </div>

          {!clienteFijo && clientes.length > 0 && (
            <label className={styles.campo}>
              <span className={styles.campoLabel}>¿Asociar a un cliente? (opcional)</span>
              <select className={styles.select} value={clienteIdNueva} onChange={(e) => setClienteIdNueva(e.target.value)}>
                <option value="">No asociar</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
          )}
          {clienteFijo && (
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--topo-claro)' }}>
              Se guardará asociada a <strong>{clienteFijo.nombre}</strong>.
            </p>
          )}

          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={crear} disabled={!contenido.trim() || guardando} style={{ alignSelf: 'flex-start' }}>
            {guardando ? 'Guardando…' : 'Guardar nota'}
          </button>
        </div>
      )}

      {/* Búsqueda y filtros — solo en modo global tiene sentido el juego completo */}
      {!clienteFijo && notasDelAmbito.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
          <div className={styles.clientesBusqueda} style={{ width: 200 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input style={{ fontSize: '0.82rem' }} placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <select className={styles.select} style={{ width: 130, fontSize: '0.8rem' }} value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value as any)}>
            <option value="todas">Toda prioridad</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
          {clientes.length > 0 && (
            <select className={styles.select} style={{ width: 170, fontSize: '0.8rem' }} value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
              <option value="todas">Todos los clientes</option>
              <option value="sin-cliente">Sin cliente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
          <select className={styles.select} style={{ width: 170, fontSize: '0.8rem' }} value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
            <option value="defecto">Prioridad primero</option>
            <option value="creado">Más recientes primero</option>
            <option value="actualizado">Modificadas recientemente</option>
            <option value="cliente">Por cliente</option>
          </select>
        </div>
      )}

      {error && <div className={styles.loginError} style={{ marginBottom: '1rem' }}>{error}</div>}

      {cargando ? (
        <p className={styles.dashboardVacio}>Cargando notas…</p>
      ) : notasFiltradas.length === 0 ? (
        <div className={styles.tabVacio}>
          <div className={styles.tabVacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
          </div>
          <p>{busqueda || filtroPrioridad !== 'todas' ? 'Sin notas que coincidan.' : 'Sin notas todavía. Pulsa "+ Nueva nota" y escribe o dicta.'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: clienteFijo ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {notasFiltradas.map((n) => (
            <div key={n.id} style={{
              background: 'var(--blanco)', border: '1px solid var(--borde)', borderRadius: 10,
              borderLeft: `4px solid ${COLOR_PRIORIDAD[n.prioridad]}`,
              padding: '0.85rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              display: 'flex', flexDirection: 'column', gap: '0.4rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  {n.titulo && <strong style={{ fontSize: '0.9rem' }}>{n.titulo}</strong>}
                  <span style={{ fontSize: '0.65rem', color: 'var(--topo-claro)', fontWeight: 600 }}>{formatoFecha(n.creado)}</span>
                </div>
                <select
                  value={n.prioridad}
                  onChange={(e) => cambiarPrioridad(n, e.target.value as PrioridadNota)}
                  title="Cambiar prioridad"
                  style={{
                    fontSize: '0.68rem', fontWeight: 700, borderRadius: 12, padding: '0.15rem 0.5rem',
                    border: `1.5px solid ${COLOR_PRIORIDAD[n.prioridad]}`, color: COLOR_PRIORIDAD[n.prioridad], background: 'transparent',
                  }}
                >
                  {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{ETIQUETA_PRIORIDAD[p.id]}</option>)}
                </select>
              </div>

              {!clienteFijo && n.clienteId && nombreCliente(n.clienteId) && (
                <span style={{ fontSize: '0.7rem', color: 'var(--ocre)', fontWeight: 600 }}>
                  Cliente: {nombreCliente(n.clienteId)}
                </span>
              )}

              {editandoId === n.id ? (
                <>
                  <input className={styles.input} placeholder="Título" value={tituloEdicion} onChange={(e) => setTituloEdicion(e.target.value)} style={{ fontSize: '0.85rem' }} />
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <textarea className={styles.input} value={contenidoEdicion + (dictadoEdicion.interino ? ` ${dictadoEdicion.interino}` : '')} onChange={(e) => setContenidoEdicion(e.target.value)} rows={3} style={{ flex: 1, resize: 'vertical' }} autoFocus />
                    <BtnMicrofono estado={dictadoEdicion.estado} onClick={dictadoEdicion.toggleDictado} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.78rem' }} onClick={guardarEdicion}>Guardar</button>
                    <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem' }} onClick={() => setEditandoId(null)}>Cancelar</button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--negro)' }}>{n.contenido}</p>
                  <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--topo-claro)', padding: '2px 6px' }} onClick={() => iniciarEdicion(n)} title="Editar" aria-label="Editar">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
                    </button>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--topo-claro)', padding: '2px 6px' }} onClick={() => borrar(n.id)} title="Borrar" aria-label="Borrar">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
