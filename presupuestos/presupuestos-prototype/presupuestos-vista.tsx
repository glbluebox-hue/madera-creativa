import { useState, useEffect, useCallback } from 'react';
import * as api from './api.js';
import type { PresupuestoMC, ElementoPresupuesto } from './presupuestos-modelo.js';
import type { Proyecto } from './types.js';
import type { Empresa } from './use-empresa.js';
import { AbrirDocumento } from './abrir-documento.js';
import { generarId } from './mock.js';
import { formatoEuro, formatoFecha } from './calculos.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import { CobrosPresupuesto } from './cobros-presupuesto.js';
import styles from './styles.module.css';

export type PresupuestosVistaProps = {
  clienteId: string;
  /** Proyecto/expediente al que se enlazan los presupuestos creados aquí (incremento "Cliente ≠ Proyecto", 20/08/2026). */
  proyectoId: string;
  /** Nombre del cliente — usado en el membrete del editor de lienzo. */
  clienteNombre: string;
  /** Datos de empresa — membrete y condiciones por defecto del editor de lienzo. */
  empresa: Empresa;
  /** Persiste cambios de empresa — usado para el clic-en-el-logo del editor de lienzo. */
  onActualizarEmpresa: (cambios: Partial<Empresa>) => void;
  /**
   * Se llama con el proyecto ya actualizado justo después de aceptar un
   * presupuesto (Fase 1) — el servidor es quien decide el nuevo estado, el
   * checklist de tareas y el cobro pendiente, así que se vuelve a pedir el
   * proyecto completo en vez de adivinar esos cambios aquí. Opcional: si no
   * se pasa, la aceptación funciona igual, solo que el resto de la ficha
   * (pestaña de tareas, estado del proyecto) no se refresca sola hasta
   * recargar.
   */
  onProyectoActualizado?: (proyecto: Proyecto) => void;
};

type FormularioPresupuesto = {
  titulo: string;
  descripcion: string;
  alcanceTexto: string;
  precioTotal: string;
};

const FORM_VACIO: FormularioPresupuesto = { titulo: '', descripcion: '', alcanceTexto: '', precioTotal: '' };

/**
 * Vista de los presupuestos narrativos de un cliente (Fase 5 — copiloto de
 * Presupuestos). Se pueden crear/editar a mano desde aquí, o pedírselo al
 * asistente de IA (herramientas `crearPresupuesto`/`anadirElementoPresupuesto`,
 * confirmadas por el usuario) — ambos caminos escriben en la misma
 * colección a través del mismo `guardarPresupuesto`, así que lo creado por
 * uno se puede seguir editando por el otro sin ninguna diferencia.
 */
export function PresupuestosVista({ clienteId, proyectoId, clienteNombre, empresa, onActualizarEmpresa, onProyectoActualizado }: PresupuestosVistaProps) {
  const [presupuestos, setPresupuestos] = useState<PresupuestoMC[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Presupuesto con editor en pantalla completa abierto (formato 'lienzo'
  // legado o 'documento') — null lo mantiene cerrado. Sin opción de "nuevo
  // en blanco": la creación de documentos nuevos vive fuera de esta vista
  // desde el Incremento 1 del Motor Documental (ver ARQUITECTURA-MOTOR-DOCUMENTAL.md).
  const [documentoAbierto, setDocumentoAbierto] = useState<PresupuestoMC | null>(null);

  const [formAbierto, setFormAbierto] = useState(false);
  const [form, setForm] = useState<FormularioPresupuesto>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formEdicion, setFormEdicion] = useState<FormularioPresupuesto>(FORM_VACIO);

  const [anadiendoItemA, setAnadiendoItemA] = useState<string | null>(null);
  const [itemConcepto, setItemConcepto] = useState('');
  const [itemPrecio, setItemPrecio] = useState('');

  const [aceptandoId, setAceptandoId] = useState<string | null>(null);

  const [generandoEnlaceId, setGenerandoEnlaceId] = useState<string | null>(null);
  /** Enlace ya generado por presupuesto, listo para copiar — vive solo en memoria, se pierde al recargar la página (no hace falta persistirlo: "Generar enlace" siempre se puede volver a pulsar). */
  const [enlaces, setEnlaces] = useState<Record<string, string>>({});
  const [enlaceCopiadoId, setEnlaceCopiadoId] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    api.obtenerPresupuestosDeProyecto(proyectoId)
      .then(setPresupuestos)
      .catch((e) => setError(String(e).replace(/^Error:\s*/, '')))
      .finally(() => setCargando(false));
  }, [proyectoId]);

  useEffect(() => { cargar(); }, [cargar]);

  const alcanceDesdeTexto = (texto: string): string[] =>
    texto.split('\n').map((l) => l.trim()).filter(Boolean);

  const crear = async () => {
    if (!form.titulo.trim()) return;
    setGuardando(true);
    const ahora = new Date().toISOString();
    const nuevo: PresupuestoMC = {
      id: generarId(),
      clienteId,
      proyectoId,
      titulo: form.titulo.trim(),
      formato: 'simple',
      descripcion: form.descripcion.trim(),
      alcance: alcanceDesdeTexto(form.alcanceTexto),
      items: [],
      contenidoLienzo: {},
      contenidoDocumento: {},
      condicionesPago: '',
      validezDias: 30,
      condicionesGenerales: '',
      precioTotal: Number(form.precioTotal) || 0,
      creado: ahora,
      actualizado: ahora,
    };
    try {
      const guardado = await api.guardarPresupuesto(nuevo);
      setPresupuestos((prev) => [guardado, ...prev]);
      setForm(FORM_VACIO);
      setFormAbierto(false);
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setGuardando(false);
    }
  };

  const empezarEdicion = (p: PresupuestoMC) => {
    setEditandoId(p.id);
    setFormEdicion({
      titulo: p.titulo,
      descripcion: p.descripcion,
      alcanceTexto: p.alcance.join('\n'),
      precioTotal: String(p.precioTotal),
    });
  };

  const guardarEdicion = async (p: PresupuestoMC) => {
    setGuardando(true);
    const actualizado: PresupuestoMC = {
      ...p,
      titulo: formEdicion.titulo.trim(),
      descripcion: formEdicion.descripcion.trim(),
      alcance: alcanceDesdeTexto(formEdicion.alcanceTexto),
      precioTotal: Number(formEdicion.precioTotal) || 0,
      actualizado: new Date().toISOString(),
    };
    try {
      const guardado = await api.guardarPresupuesto(actualizado);
      setPresupuestos((prev) => prev.map((x) => (x.id === guardado.id ? guardado : x)));
      setEditandoId(null);
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (id: string) => {
    try {
      await api.borrarPresupuesto(id);
      setPresupuestos((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    }
  };

  /**
   * Marca un presupuesto como aceptado (Fase 1). El servidor decide todo lo
   * que cambia en el proyecto (estado, checklist, cobro pendiente) — aquí
   * solo se refleja el nuevo estado del propio presupuesto y se vuelve a
   * pedir el proyecto completo para que el resto de la ficha (pestaña de
   * tareas, estado del proyecto) se refresque sin recargar la página.
   */
  const aceptar = async (id: string) => {
    setAceptandoId(id);
    setError(null);
    try {
      const { presupuesto: actualizado } = await api.aceptarPresupuesto(id);
      setPresupuestos((prev) => prev.map((x) => (x.id === actualizado.id ? actualizado : x)));
      if (onProyectoActualizado && proyectoId) {
        const proyectoFresco = await api.obtenerProyecto(proyectoId);
        onProyectoActualizado(proyectoFresco);
      }
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setAceptandoId(null);
    }
  };

  /**
   * Guarda la lista completa de cobros de un presupuesto (roadmap "cobros
   * pendientes") — el servidor responde con la lista ya guardada, que
   * sustituye la del estado local sin volver a pedir el presupuesto entero.
   */
  const guardarCobros = useCallback(async (presupuestoId: string, cobros: Parameters<typeof api.actualizarCobros>[1]) => {
    const actualizados = await api.actualizarCobros(presupuestoId, cobros);
    setPresupuestos((prev) => prev.map((x) => (x.id === presupuestoId ? { ...x, cobros: actualizados } : x)));
  }, []);

  /**
   * Genera el enlace del Portal del cliente y lo deja listo para copiar
   * (Sección 8). No hace falta refrescar `presupuestos` — el enlace vive
   * aparte, en su propia colección, no es un campo del presupuesto.
   */
  const generarEnlace = async (id: string) => {
    setGenerandoEnlaceId(id);
    setError(null);
    try {
      const { token } = await api.generarEnlacePresupuesto(id);
      setEnlaces((prev) => ({ ...prev, [id]: `${window.location.origin}/portal/${token}` }));
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setGenerandoEnlaceId(null);
    }
  };

  const copiarEnlace = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setEnlaceCopiadoId(id);
      setTimeout(() => setEnlaceCopiadoId((actual) => (actual === id ? null : actual)), 2000);
    } catch { /* portapapeles no disponible — el enlace ya se ve en el campo, se puede seleccionar a mano */ }
  };

  const anadirItem = async (p: PresupuestoMC) => {
    const precio = Number(itemPrecio);
    if (!itemConcepto.trim() || !Number.isFinite(precio)) return;
    setGuardando(true);
    const item: ElementoPresupuesto = { id: generarId(), concepto: itemConcepto.trim(), precio };
    const actualizado: PresupuestoMC = {
      ...p,
      items: [...p.items, item],
      precioTotal: p.precioTotal + precio,
      actualizado: new Date().toISOString(),
    };
    try {
      const guardado = await api.guardarPresupuesto(actualizado);
      setPresupuestos((prev) => prev.map((x) => (x.id === guardado.id ? guardado : x)));
      setAnadiendoItemA(null);
      setItemConcepto('');
      setItemPrecio('');
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setGuardando(false);
    }
  };

  const guardarDocumentoAbierto = async (p: PresupuestoMC) => {
    const guardado = await api.guardarPresupuesto(p);
    setPresupuestos((prev) => {
      const existe = prev.some((x) => x.id === guardado.id);
      return existe ? prev.map((x) => (x.id === guardado.id ? guardado : x)) : [guardado, ...prev];
    });
    setDocumentoAbierto(guardado);
  };

  /** Insignia "Aceptado" o botón "Marcar como aceptado", según el estado actual del presupuesto (Fase 1). */
  const accionAceptar = (p: PresupuestoMC) => {
    if (p.estado === 'aceptado') {
      return (
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
          background: 'var(--verde)', color: 'var(--blanco)', whiteSpace: 'nowrap',
        }}>
          ✓ Aceptado
        </span>
      );
    }
    return (
      <button
        className={`${styles.btn} ${styles.btnVerde}`}
        onClick={() => aceptar(p.id)}
        disabled={aceptandoId === p.id}
        title="El cliente ha dicho que sí — pone el proyecto en marcha (tareas, cobro pendiente, aviso)"
      >
        {aceptandoId === p.id ? 'Aceptando…' : 'Marcar como aceptado'}
      </button>
    );
  };

  /**
   * Botón "Generar enlace" (Portal del cliente, Sección 8) — solo para el
   * formato vigente; el legado 'lienzo' no tiene vista pública (el backend
   * lo rechazaría igualmente, pero mejor no ofrecer el botón). Una vez
   * generado, muestra el enlace en un campo de solo lectura con "Copiar" en
   * vez de intentar compartirlo automáticamente — el carpintero decide por
   * dónde enviarlo (WhatsApp, email…).
   */
  const accionEnlace = (p: PresupuestoMC) => {
    if (p.formato === 'lienzo') return null;
    const url = enlaces[p.id];
    if (!url) {
      return (
        <button
          className={`${styles.btn} ${styles.btnSecundario}`}
          onClick={() => generarEnlace(p.id)}
          disabled={generandoEnlaceId === p.id}
          title="Genera un enlace para que el cliente vea y acepte este presupuesto sin registrarse"
        >
          {generandoEnlaceId === p.id ? 'Generando…' : 'Generar enlace'}
        </button>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <input className={styles.input} value={url} readOnly onFocus={(e) => e.target.select()} style={{ fontSize: '0.78rem', width: '180px' }} />
        <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => copiarEnlace(url, p.id)}>
          {enlaceCopiadoId === p.id ? '✓ Copiado' : 'Copiar'}
        </button>
      </div>
    );
  };

  if (cargando) return <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>Cargando presupuestos…</p>;

  if (documentoAbierto) {
    return (
      <AbrirDocumento
        presupuesto={documentoAbierto}
        clienteId={clienteId}
        clienteNombre={clienteNombre}
        empresa={empresa}
        onGuardar={guardarDocumentoAbierto}
        onVolver={() => setDocumentoAbierto(null)}
        onCambiarLogoEmpresa={(logo) => onActualizarEmpresa({ logo })}
      />
    );
  }

  return (
    <div>
      {error && <p style={{ color: 'var(--rojo)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
          {presupuestos.length} presupuesto{presupuestos.length !== 1 ? 's' : ''} — a mano o pidiéndoselo al asistente de IA.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={styles.btn} onClick={cargar} style={{ fontSize: '0.78rem' }}>Actualizar</button>
          {/* "+ Crear presupuesto (plantilla)" retirado en el Incremento 1 del
              Motor Documental — la creación de documentos nuevos vuelve en el
              Incremento 2, apuntando ya al editor nuevo (ver ARQUITECTURA-MOTOR-DOCUMENTAL.md). */}
          <button className={styles.btnCirculoOscuro} onClick={() => setFormAbierto((v) => !v)} title={formAbierto ? 'Cancelar' : 'Crear presupuesto'}>
            {formAbierto
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
          </button>
        </div>
      </div>

      {formAbierto && (
        <div style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem', background: 'var(--fondo-panel)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <input
              className={styles.input}
              placeholder="Título (p. ej. Cocina en L)"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            />
            <textarea
              className={styles.textarea}
              placeholder="Descripción profesional del proyecto…"
              rows={4}
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            />
            <textarea
              className={styles.textarea}
              placeholder={'Alcance del trabajo, una línea por punto:\nMuebles altos hasta techo\nEncimera\nFregadero'}
              rows={3}
              value={form.alcanceTexto}
              onChange={(e) => setForm({ ...form, alcanceTexto: e.target.value })}
            />
            <input
              className={styles.input}
              type="number"
              placeholder="Precio total (€)"
              value={form.precioTotal}
              onChange={(e) => setForm({ ...form, precioTotal: e.target.value })}
            />
            <button
              className={`${styles.btn} ${styles.btnPrimario}`}
              onClick={crear}
              disabled={guardando || !form.titulo.trim()}
            >
              {guardando ? 'Guardando…' : 'Guardar presupuesto'}
            </button>
          </div>
        </div>
      )}

      {presupuestos.length === 0 && !formAbierto ? (
        <div className={styles.tabVacio}>
          <div className={styles.tabVacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
          </div>
          <p>Este cliente todavía no tiene ningún presupuesto. Créalo con «+ Crear presupuesto» o pídeselo al asistente de IA.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {presupuestos.map((p) => (
            <div key={p.id} className={styles.filaLista} style={{ padding: '1rem' }}>
              {p.formato === 'lienzo' || p.formato === 'documento' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>{p.titulo}</p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: 'var(--topo-muy-claro)' }}>
                        {p.formato === 'lienzo' ? 'Plantilla libre (legado)' : 'Documento'} · Creado {formatoFecha(p.creado)}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: '1.1rem', whiteSpace: 'nowrap' }}>{formatoEuro(p.precioTotal)}</span>
                      {accionAceptar(p)}
                      {accionEnlace(p)}
                      <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => setDocumentoAbierto(p)}>Abrir editor</button>
                      <ConfirmarBorrado onConfirmar={() => borrar(p.id)} titulo="Borrar presupuesto" />
                    </div>
                  </div>
                  {p.estado === 'aceptado' && p.cobros && (
                    <CobrosPresupuesto cobros={p.cobros} onGuardar={(c) => guardarCobros(p.id, c)} />
                  )}
                </>
              ) : editandoId === p.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <input
                    className={styles.input}
                    value={formEdicion.titulo}
                    onChange={(e) => setFormEdicion({ ...formEdicion, titulo: e.target.value })}
                  />
                  <textarea
                    className={styles.textarea}
                    rows={4}
                    value={formEdicion.descripcion}
                    onChange={(e) => setFormEdicion({ ...formEdicion, descripcion: e.target.value })}
                  />
                  <textarea
                    className={styles.textarea}
                    rows={3}
                    value={formEdicion.alcanceTexto}
                    onChange={(e) => setFormEdicion({ ...formEdicion, alcanceTexto: e.target.value })}
                  />
                  <input
                    className={styles.input}
                    type="number"
                    value={formEdicion.precioTotal}
                    onChange={(e) => setFormEdicion({ ...formEdicion, precioTotal: e.target.value })}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => guardarEdicion(p)} disabled={guardando}>
                      {guardando ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                    <button className={styles.btn} onClick={() => setEditandoId(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>{p.titulo}</p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: 'var(--topo-muy-claro)' }}>
                        Creado {formatoFecha(p.creado)} · id {p.id.slice(0, 8)}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '1.1rem', whiteSpace: 'nowrap' }}>{formatoEuro(p.precioTotal)}</span>
                      <button className={styles.btnIcono} title="Editar" onClick={() => empezarEdicion(p)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      <ConfirmarBorrado onConfirmar={() => borrar(p.id)} titulo="Borrar presupuesto" />
                    </div>
                  </div>

                  <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>{accionAceptar(p)}{accionEnlace(p)}</div>

                  {p.estado === 'aceptado' && p.cobros && (
                    <CobrosPresupuesto cobros={p.cobros} onGuardar={(c) => guardarCobros(p.id, c)} />
                  )}

                  {p.descripcion && (
                    <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{p.descripcion}</p>
                  )}

                  {p.alcance.length > 0 && (
                    <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.2rem', fontSize: '0.82rem' }}>
                      {p.alcance.map((linea, i) => <li key={i}>{linea}</li>)}
                    </ul>
                  )}

                  {p.items.length > 0 && (
                    <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--borde)', paddingTop: '0.5rem' }}>
                      {p.items.map((item) => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '0.2rem 0' }}>
                          <span>{item.concepto}</span>
                          <span>{formatoEuro(item.precio)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {anadiendoItemA === p.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
                      <input
                        className={styles.input}
                        placeholder="Concepto"
                        value={itemConcepto}
                        onChange={(e) => setItemConcepto(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <input
                        className={styles.input}
                        type="number"
                        placeholder="€"
                        value={itemPrecio}
                        onChange={(e) => setItemPrecio(e.target.value)}
                        style={{ width: 90 }}
                      />
                      <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => anadirItem(p)} disabled={guardando}>Añadir</button>
                      <button className={styles.btn} onClick={() => { setAnadiendoItemA(null); setItemConcepto(''); setItemPrecio(''); }}>Cancelar</button>
                    </div>
                  ) : (
                    <button
                      className={styles.btn}
                      style={{ marginTop: '0.75rem', fontSize: '0.78rem' }}
                      onClick={() => setAnadiendoItemA(p.id)}
                    >
                      + Añadir elemento
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
