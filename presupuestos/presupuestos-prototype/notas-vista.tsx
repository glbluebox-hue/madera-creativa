import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Nota as NotaLegacy } from './types.js';
import { generarId } from './mock.js';
import { formatoFecha } from './calculos.js';
import { useDictado, BtnMicrofono } from './use-dictado.js';
import * as api from './api.js';
import {
  PRIORIDADES, ordenarPorDefecto, ordenarItemsLista, COLOR_PRIORIDAD, COLOR_PRIORIDAD_BG, ETIQUETA_PRIORIDAD,
  type NotaMC, type PrioridadNota, type TipoNota, type ItemLista,
} from './notas-modelo.js';
import styles from './styles.module.css';

const CLAVE_MIGRACION_GLOBAL = 'mc_notas_globales';

type Orden = 'defecto' | 'creado' | 'actualizado' | 'cliente';
type FiltroCliente = 'todas' | 'sin-cliente' | string;

/** Input "Nueva tarea…" + prioridad + Añadir para una lista ya guardada — estado propio para no tener que llevar un mapa `notaId -> texto` en `NotasVista`. */
function ItemListaNuevo({ onAnadir }: { onAnadir: (texto: string, prioridad: PrioridadNota) => void }) {
  const [texto, setTexto] = useState('');
  const [prioridad, setPrioridad] = useState<PrioridadNota>('media');
  const anadir = () => {
    if (!texto.trim()) return;
    onAnadir(texto.trim(), prioridad);
    setTexto('');
    setPrioridad('media');
  };
  return (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
      <input
        className={styles.input}
        style={{ fontSize: '0.85rem', flex: '1 1 160px' }}
        placeholder="Nueva tarea…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && anadir()}
      />
      <div style={{ display: 'flex', gap: '0.3rem' }}>
        {PRIORIDADES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPrioridad(p.id)}
            style={{
              padding: '0.3rem 0.6rem', borderRadius: 'var(--radio-full, 999px)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
              border: `1.5px solid ${COLOR_PRIORIDAD[p.id]}`,
              background: prioridad === p.id ? COLOR_PRIORIDAD[p.id] : 'transparent',
              color: prioridad === p.id ? 'var(--blanco)' : COLOR_PRIORIDAD[p.id],
            }}
          >
            {ETIQUETA_PRIORIDAD[p.id]}
          </button>
        ))}
      </div>
      <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.78rem' }} onClick={anadir} disabled={!texto.trim()}>Añadir</button>
    </div>
  );
}

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
  /**
   * Bug real, 26/08/2026 (mismo patrón que `dashboard.tsx`): marcar/borrar
   * un item de una lista partía de la `nota` capturada en el render de la
   * fila, no del estado más reciente — dos toques rápidos sobre la misma
   * lista podían pisarse entre sí y perder el primero. `notasRef` se
   * actualiza de forma síncrona junto a `setNotas` (`setNotasSync`) para
   * que `guardarItemsLista` siempre parta del último `items[]` conocido.
   */
  const notasRef = useRef<NotaMC[]>([]);
  const setNotasSync = useCallback((actualizar: (prev: NotaMC[]) => NotaMC[]) => {
    const siguiente = actualizar(notasRef.current);
    notasRef.current = siguiente;
    setNotas(siguiente);
  }, []);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState<'todas' | PrioridadNota>('todas');
  const [filtroCliente, setFiltroCliente] = useState<FiltroCliente>('todas');
  /**
   * Bug real, 26/08/2026: marcar una nota como hecha (desde el banner
   * "Cosas por hacer" del Inicio) la sacaba de esta lista SIN NINGÚN
   * SITIO donde volver a verla — el usuario se equivocó al tocar la
   * casilla y creyó que la nota se había borrado de verdad, cuando solo
   * cambió de `estado` en el servidor. Por defecto se sigue viendo solo
   * "Pendientes" (mismo comportamiento de antes), pero ahora hay un sitio
   * real para encontrar y restaurar las "Hechas".
   */
  const [filtroEstado, setFiltroEstado] = useState<'abiertas' | 'hechas' | 'todas'>('abiertas');
  const [orden, setOrden] = useState<Orden>('defecto');

  const [formAbierto, setFormAbierto] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  /**
   * `'lista'` (26/08/2026, petición explícita del usuario) — una nota de
   * texto libre no deja tachar cosas sueltas una a una ("comprar pincel",
   * "comprar lijas"…). Mismo patrón que "Tareas del proyecto"
   * (`tab-tareas.tsx`): `itemsNuevaLista` se arma en el formulario antes de
   * guardar, sin `contenido` — el checklist en sí es el contenido.
   */
  const [tipoNueva, setTipoNueva] = useState<TipoNota>('nota');
  const [itemsNuevaLista, setItemsNuevaLista] = useState<ItemLista[]>([]);
  const [nuevoItemTexto, setNuevoItemTexto] = useState('');
  const [nuevoItemPrioridad, setNuevoItemPrioridad] = useState<PrioridadNota>('media');
  const [prioridad, setPrioridad] = useState<PrioridadNota>('media');
  const [clienteIdNueva, setClienteIdNueva] = useState(clienteFijo?.id ?? '');
  const [guardando, setGuardando] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [tituloEdicion, setTituloEdicion] = useState('');
  const [contenidoEdicion, setContenidoEdicion] = useState('');

  // Solo una nota abierta a la vez — la lista muestra títulos, y al hacer
  // clic se despliega el contenido completo con sus acciones (editar,
  // borrar, cambiar prioridad). Cambiar de nota abierta cancela cualquier
  // edición en curso de la anterior.
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const alternarAbierta = (id: string) => {
    setAbiertaId((prev) => {
      const siguiente = prev === id ? null : id;
      if (editandoId && editandoId !== siguiente) setEditandoId(null);
      return siguiente;
    });
  };

  const cargar = useCallback(() => {
    setCargando(true);
    api.obtenerNotas()
      .then((datos) => { notasRef.current = datos; setNotas(datos); })
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
          id: generarId(), titulo: '', contenido: n.texto, tipo: 'nota', items: [], prioridad: 'media', estado: 'abierta',
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
          id: generarId(), titulo: '', contenido: n.texto, tipo: 'nota', items: [], prioridad: 'media', estado: 'abierta',
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
    () => notas.filter((n) => !clienteFijo || n.clienteId === clienteFijo.id),
    [notas, clienteFijo]
  );

  const notasFiltradas = useMemo(() => {
    let r = notasDelAmbito;
    if (filtroEstado === 'abiertas') r = r.filter((n) => n.estado === 'abierta');
    else if (filtroEstado === 'hechas') r = r.filter((n) => n.estado === 'hecha');
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
  }, [notasDelAmbito, filtroEstado, filtroPrioridad, filtroCliente, busqueda, orden, clienteFijo, nombreCliente]);

  const puedeCrear = tipoNueva === 'lista' ? itemsNuevaLista.length > 0 : !!contenido.trim();

  const anadirItemNuevaLista = () => {
    if (!nuevoItemTexto.trim()) return;
    setItemsNuevaLista((prev) => [...prev, { id: generarId(), texto: nuevoItemTexto.trim(), hecha: false, prioridad: nuevoItemPrioridad }]);
    setNuevoItemTexto('');
    setNuevoItemPrioridad('media');
  };

  const crear = async () => {
    if (!puedeCrear) return;
    setGuardando(true);
    const ahora = new Date().toISOString();
    const nueva: NotaMC = {
      id: generarId(), titulo: titulo.trim(),
      contenido: tipoNueva === 'lista' ? '' : contenido.trim(),
      tipo: tipoNueva,
      items: tipoNueva === 'lista' ? itemsNuevaLista : [],
      prioridad, estado: 'abierta',
      clienteId: clienteFijo?.id ?? clienteIdNueva, proyectoId: '', etiquetas: [],
      origen: origenVozRef.current ? 'voz' : 'texto',
      creado: ahora, actualizado: ahora,
    };
    try {
      const guardada = await api.guardarNota(nueva);
      setNotasSync((prev) => [guardada, ...prev]);
      setTitulo(''); setContenido(''); setPrioridad('media'); setClienteIdNueva(clienteFijo?.id ?? '');
      setTipoNueva('nota'); setItemsNuevaLista([]); setNuevoItemTexto('');
      origenVozRef.current = false;
      setFormAbierto(false);
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Añade/marca/borra un item dentro de una nota `'lista'` ya guardada —
   * mismo patrón que `tab-tareas.tsx` (`alternar`/`anadir`/`borrar`), pero
   * embebido en la nota en vez de en un proyecto. Recibe `notaId` (no la
   * `nota` entera) y relee siempre `notasRef.current`: si se llama dos
   * veces seguidas sobre la misma lista antes de que la primera termine de
   * guardarse, la segunda ve el cambio de la primera en vez de pisarlo.
   */
  const guardarItemsLista = async (notaId: string, transformar: (items: ItemLista[]) => ItemLista[]) => {
    const actual = notasRef.current.find((n) => n.id === notaId);
    if (!actual) return;
    const actualizada: NotaMC = { ...actual, items: transformar(actual.items), actualizado: new Date().toISOString() };
    setNotasSync((prev) => prev.map((n) => (n.id === notaId ? actualizada : n)));
    try { await api.guardarNota(actualizada); } catch { cargar(); }
  };
  const anadirItemLista = (notaId: string, texto: string, prioridadItem: PrioridadNota) => {
    if (!texto.trim()) return;
    guardarItemsLista(notaId, (items) => [...items, { id: generarId(), texto: texto.trim(), hecha: false, prioridad: prioridadItem }]);
  };
  const alternarItemLista = (notaId: string, itemId: string) =>
    guardarItemsLista(notaId, (items) => items.map((it) => (it.id === itemId ? { ...it, hecha: !it.hecha } : it)));
  const borrarItemLista = (notaId: string, itemId: string) =>
    guardarItemsLista(notaId, (items) => items.filter((it) => it.id !== itemId));
  /** Clic sobre la píldora de prioridad de un item: rota alta→media→baja→alta, sin necesitar un modo de edición aparte. */
  const CICLO_PRIORIDAD_ITEM: Record<PrioridadNota, PrioridadNota> = { alta: 'media', media: 'baja', baja: 'alta' };
  const ciclarPrioridadItem = (notaId: string, itemId: string) =>
    guardarItemsLista(notaId, (items) => items.map((it) => (it.id === itemId ? { ...it, prioridad: CICLO_PRIORIDAD_ITEM[it.prioridad] } : it)));

  const cambiarPrioridad = async (nota: NotaMC, nueva: PrioridadNota) => {
    const actualizada = { ...nota, prioridad: nueva, actualizado: new Date().toISOString() };
    setNotasSync((prev) => prev.map((n) => (n.id === nota.id ? actualizada : n)));
    try { await api.guardarNota(actualizada); } catch { cargar(); }
  };

  /** Marca hecha/pendiente — nunca borra la nota, solo cambia su `estado` (ver el filtro "Hechas" de arriba para recuperarlas). */
  const alternarEstado = async (nota: NotaMC) => {
    const actualizada: NotaMC = { ...nota, estado: nota.estado === 'abierta' ? 'hecha' : 'abierta', actualizado: new Date().toISOString() };
    setNotasSync((prev) => prev.map((n) => (n.id === nota.id ? actualizada : n)));
    try { await api.guardarNota(actualizada); } catch { cargar(); }
  };

  const borrar = async (id: string) => {
    setNotasSync((prev) => prev.filter((n) => n.id !== id));
    try { await api.borrarNota(id); } catch { cargar(); }
  };

  const iniciarEdicion = (n: NotaMC) => {
    setEditandoId(n.id);
    setTituloEdicion(n.titulo);
    setContenidoEdicion(n.contenido);
  };

  const guardarEdicion = async () => {
    const nota = notasRef.current.find((n) => n.id === editandoId);
    if (!nota || !contenidoEdicion.trim()) return;
    const actualizada = { ...nota, titulo: tituloEdicion.trim(), contenido: contenidoEdicion.trim(), actualizado: new Date().toISOString() };
    setNotasSync((prev) => prev.map((n) => (n.id === nota.id ? actualizada : n)));
    setEditandoId(null);
    try { await api.guardarNota(actualizada); } catch { cargar(); }
  };

  /** Renombra una lista — a diferencia de una nota de texto, no tiene `contenido` que editar aquí (eso son sus `items`, ver `anadirItemLista`/`alternarItemLista`/`borrarItemLista`). */
  const guardarTituloLista = async (nota: NotaMC) => {
    const actual = notasRef.current.find((n) => n.id === nota.id) ?? nota;
    const actualizada = { ...actual, titulo: tituloEdicion.trim(), actualizado: new Date().toISOString() };
    setNotasSync((prev) => prev.map((n) => (n.id === nota.id ? actualizada : n)));
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
          <button className={styles.btnCirculoOscuro} onClick={() => setFormAbierto((v) => !v)} title={formAbierto ? 'Cancelar' : 'Nueva nota'}>
            {formAbierto
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
          </button>
        </div>
      )}

      {clienteFijo && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Notas del proyecto</h3>
          <button className={styles.btnCirculoOscuro} onClick={() => setFormAbierto((v) => !v)} title={formAbierto ? 'Cancelar' : 'Nueva nota'}>
            {formAbierto
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
          </button>
        </div>
      )}

      {/* Formulario de nueva nota */}
      {formAbierto && (
        <div style={{ background: 'var(--fondo-caja)', border: '1px solid var(--borde)', borderRadius: 12, padding: '1rem', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {([
              { id: 'nota' as const, etiqueta: 'Nota' },
              { id: 'lista' as const, etiqueta: 'Lista' },
            ]).map((op) => (
              <button
                key={op.id}
                type="button"
                onClick={() => setTipoNueva(op.id)}
                style={{
                  flex: 1, padding: '0.4rem 0.8rem', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                  border: '1.5px solid var(--topo)',
                  background: tipoNueva === op.id ? 'var(--topo)' : 'transparent',
                  color: tipoNueva === op.id ? 'var(--blanco)' : 'var(--topo)',
                }}
              >
                {op.etiqueta}
              </button>
            ))}
          </div>
          {tipoNueva === 'lista' && (
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--topo-claro)' }}>
              Un checklist con casillas — "comprar pincel", "comprar lijas"… cada línea se marca por separado.
            </p>
          )}

          <input
            className={styles.input}
            placeholder={tipoNueva === 'lista' ? 'Título de la lista (ej: Compras)' : 'Título (opcional)'}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />

          {tipoNueva === 'lista' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {itemsNuevaLista.map((it) => (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <span style={{
                    fontSize: '0.62rem', fontWeight: 700, borderRadius: 'var(--radio-full, 999px)', padding: '0.1rem 0.5rem', flexShrink: 0,
                    color: COLOR_PRIORIDAD[it.prioridad], background: COLOR_PRIORIDAD_BG[it.prioridad],
                  }}>
                    {ETIQUETA_PRIORIDAD[it.prioridad]}
                  </span>
                  <span style={{ flex: 1 }}>{it.texto}</span>
                  <button
                    type="button"
                    onClick={() => setItemsNuevaLista((prev) => prev.filter((x) => x.id !== it.id))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--topo-claro)', padding: '2px 6px' }}
                    aria-label="Quitar"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <input
                  className={styles.input}
                  style={{ flex: '1 1 160px' }}
                  placeholder="Nueva tarea…"
                  value={nuevoItemTexto}
                  onChange={(e) => setNuevoItemTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); anadirItemNuevaLista(); } }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  {PRIORIDADES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setNuevoItemPrioridad(p.id)}
                      style={{
                        padding: '0.3rem 0.6rem', borderRadius: 'var(--radio-full, 999px)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                        border: `1.5px solid ${COLOR_PRIORIDAD[p.id]}`,
                        background: nuevoItemPrioridad === p.id ? COLOR_PRIORIDAD[p.id] : 'transparent',
                        color: nuevoItemPrioridad === p.id ? 'var(--blanco)' : COLOR_PRIORIDAD[p.id],
                      }}
                    >
                      {ETIQUETA_PRIORIDAD[p.id]}
                    </button>
                  ))}
                </div>
                <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} onClick={anadirItemNuevaLista} disabled={!nuevoItemTexto.trim()}>
                  Añadir
                </button>
              </div>
            </div>
          ) : (
            <>
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
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--rojo)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--rojo)', display: 'inline-block', flexShrink: 0 }} />
                  Escuchando… pulsa el micro para parar.
                </p>
              )}
              {dictadoNueva.completado && (
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--verde)', fontWeight: 600 }}>✓ Transcripción completada</p>
              )}
            </>
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
                    padding: '0.35rem 0.8rem', borderRadius: 'var(--radio-full, 999px)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                    border: `1.5px solid ${COLOR_PRIORIDAD[p.id]}`,
                    background: prioridad === p.id ? COLOR_PRIORIDAD[p.id] : 'transparent',
                    color: prioridad === p.id ? 'var(--blanco)' : COLOR_PRIORIDAD[p.id],
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

          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={crear} disabled={!puedeCrear || guardando} style={{ alignSelf: 'flex-start' }}>
            {guardando ? 'Guardando…' : 'Guardar nota'}
          </button>
        </div>
      )}

      {/* Pendientes/Hechas/Todas — en los dos modos: sin esto una nota marcada hecha no tenía dónde volver a verse. */}
      {notasDelAmbito.length > 0 && (
        <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem' }}>
          {([
            { id: 'abiertas', etiqueta: 'Pendientes' },
            { id: 'hechas', etiqueta: 'Hechas' },
            { id: 'todas', etiqueta: 'Todas' },
          ] as const).map((op) => (
            <button
              key={op.id}
              type="button"
              onClick={() => setFiltroEstado(op.id)}
              style={{
                padding: '0.3rem 0.75rem', borderRadius: 'var(--radio-full, 999px)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                border: '1.5px solid var(--topo)',
                background: filtroEstado === op.id ? 'var(--topo)' : 'transparent',
                color: filtroEstado === op.id ? 'var(--blanco)' : 'var(--topo)',
              }}
            >
              {op.etiqueta}
            </button>
          ))}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {notasFiltradas.map((n) => {
            const abierta = abiertaId === n.id;
            const esLista = n.tipo === 'lista';
            const hechosLista = esLista ? n.items.filter((it) => it.hecha).length : 0;
            const tituloMostrado = esLista
              ? (n.titulo || 'Lista sin título')
              : n.titulo || (n.contenido.length > 60 ? `${n.contenido.slice(0, 60)}…` : n.contenido) || '(nota vacía)';
            return (
              <div key={n.id} className={styles.filaLista}>
                <div
                  onClick={() => alternarAbierta(n.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.75rem 0.9rem', cursor: 'pointer' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink: 0, color: 'var(--topo-claro)', transition: 'transform 0.15s', transform: abierta ? 'rotate(90deg)' : 'none' }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  {esLista && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--topo-claro)' }}><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                  )}
                  <span style={{
                    flex: 1, minWidth: 0, fontWeight: 700, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    color: n.titulo ? 'var(--negro)' : 'var(--topo-claro)', fontStyle: n.titulo ? 'normal' : 'italic',
                    textDecoration: n.estado === 'hecha' ? 'line-through' : 'none',
                  }}>
                    {tituloMostrado}
                  </span>
                  {esLista && n.items.length > 0 && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--topo-claro)', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>({hechosLista}/{n.items.length})</span>
                  )}
                  {n.estado === 'hecha' && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--verde)', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>Hecha</span>
                  )}
                  {!clienteFijo && n.clienteId && nombreCliente(n.clienteId) && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--ocre)', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>{nombreCliente(n.clienteId)}</span>
                  )}
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, borderRadius: 'var(--radio-full, 999px)', padding: '0.15rem 0.55rem', flexShrink: 0,
                    color: COLOR_PRIORIDAD[n.prioridad], background: COLOR_PRIORIDAD_BG[n.prioridad],
                  }}>
                    {ETIQUETA_PRIORIDAD[n.prioridad]}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--topo-muy-claro)', flexShrink: 0, whiteSpace: 'nowrap' }}>{formatoFecha(n.creado)}</span>
                </div>

                {abierta && (
                  <div style={{ padding: '0.7rem 0.9rem 0.9rem', borderTop: '1px solid var(--borde-fino)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <div>
                      <span className={styles.campoLabel}>Prioridad</span>
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem' }}>
                        {PRIORIDADES.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => cambiarPrioridad(n, p.id)}
                            style={{
                              padding: '0.3rem 0.7rem', borderRadius: 'var(--radio-full, 999px)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                              border: `1.5px solid ${COLOR_PRIORIDAD[p.id]}`,
                              background: n.prioridad === p.id ? COLOR_PRIORIDAD[p.id] : 'transparent',
                              color: n.prioridad === p.id ? 'var(--blanco)' : COLOR_PRIORIDAD[p.id],
                            }}
                          >
                            {ETIQUETA_PRIORIDAD[p.id]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {editandoId === n.id ? (
                      <>
                        <input className={styles.input} placeholder="Título" value={tituloEdicion} onChange={(e) => setTituloEdicion(e.target.value)} style={{ fontSize: '0.85rem' }} autoFocus={esLista} />
                        {!esLista && (
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <textarea className={styles.input} value={contenidoEdicion + (dictadoEdicion.interino ? ` ${dictadoEdicion.interino}` : '')} onChange={(e) => setContenidoEdicion(e.target.value)} rows={4} style={{ flex: 1, resize: 'vertical' }} autoFocus />
                            <BtnMicrofono estado={dictadoEdicion.estado} onClick={dictadoEdicion.toggleDictado} />
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.78rem' }} onClick={() => (esLista ? guardarTituloLista(n) : guardarEdicion())}>Guardar</button>
                          <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem' }} onClick={() => setEditandoId(null)}>Cancelar</button>
                        </div>
                      </>
                    ) : esLista ? (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {ordenarItemsLista(n.items).map((it) => (
                            <div
                              key={it.id}
                              className={`${styles.checklistItem} ${it.hecha ? styles.checklistHecha : ''}`}
                              onClick={() => alternarItemLista(n.id, it.id)}
                            >
                              <span className={styles.checklistCheck}>{it.hecha ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> : ''}</span>
                              <span className={styles.checklistTexto} style={{ flex: 1 }}>{it.texto}</span>
                              <span
                                onClick={(e) => { e.stopPropagation(); ciclarPrioridadItem(n.id, it.id); }}
                                title="Tocar para cambiar la prioridad"
                                style={{
                                  fontSize: '0.62rem', fontWeight: 700, borderRadius: 'var(--radio-full, 999px)', padding: '0.1rem 0.5rem', flexShrink: 0, cursor: 'pointer',
                                  color: COLOR_PRIORIDAD[it.prioridad], background: COLOR_PRIORIDAD_BG[it.prioridad],
                                }}
                              >
                                {ETIQUETA_PRIORIDAD[it.prioridad]}
                              </span>
                              <button
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--topo-claro)' }}
                                onClick={(e) => { e.stopPropagation(); borrarItemLista(n.id, it.id); }}
                                aria-label="Quitar tarea"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                        <ItemListaNuevo onAnadir={(texto, prioridadItem) => anadirItemLista(n.id, texto, prioridadItem)} />
                        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            className={`${styles.btn} ${n.estado === 'hecha' ? styles.btnSecundario : styles.btnPrimario}`}
                            style={{ fontSize: '0.72rem', padding: '0.3rem 0.65rem', marginRight: 'auto' }}
                            onClick={() => alternarEstado(n)}
                          >
                            {n.estado === 'hecha' ? 'Reabrir lista' : 'Cerrar lista'}
                          </button>
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--topo-claro)', padding: '2px 6px' }} onClick={() => iniciarEdicion(n)} title="Renombrar" aria-label="Renombrar">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
                          </button>
                          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--topo-claro)', padding: '2px 6px' }} onClick={() => borrar(n.id)} title="Borrar lista" aria-label="Borrar lista">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--negro)' }}>{n.contenido}</p>
                        <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <button
                            className={`${styles.btn} ${n.estado === 'hecha' ? styles.btnSecundario : styles.btnPrimario}`}
                            style={{ fontSize: '0.72rem', padding: '0.3rem 0.65rem', marginRight: 'auto' }}
                            onClick={() => alternarEstado(n)}
                          >
                            {n.estado === 'hecha' ? 'Marcar como pendiente' : 'Marcar como hecha'}
                          </button>
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
