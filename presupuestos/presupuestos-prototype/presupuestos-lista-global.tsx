import { useState, useEffect, useCallback } from 'react';
import * as api from './api.js';
import type { PresupuestoMC } from './presupuestos-modelo.js';
import type { Empresa } from './use-empresa.js';
import type { PlantillaMC } from './documento-modelo.js';
import type { Cliente } from './types.js';
import { AbrirDocumento } from './abrir-documento.js';
import { generarId } from './mock.js';
import { resolverVariables } from './documento-registro-variables.js';
import './documento-variables-iniciales.js'; // registro de variables por efecto secundario (Incremento 4).
import { formatoEuro, formatoFecha } from './calculos.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import styles from './styles.module.css';

export type PresupuestosListaGlobalProps = {
  /** Lista ligera de clientes — para el nombre en cada tarjeta. */
  clientes: { id: string; nombre: string }[];
  empresa: Empresa;
  /** Persiste cambios de empresa — usado para el clic-en-el-logo del editor. */
  onActualizarEmpresa: (cambios: Partial<Empresa>) => void;
  /** Navega a la ficha de un cliente — usado para abrir presupuestos en modo simple (esta vista no los edita directamente). */
  onAbrirCliente: (clienteId: string) => void;
  /** Crea una ficha de cliente real, sin salir de este selector — "+ Nuevo cliente" dentro de "+ Crear presupuesto". */
  onCrearCliente: (cliente: Cliente) => void;
};

/**
 * Lista global de presupuestos de todos los clientes (Fase 6 — pestaña
 * "Documentos" de la sección Presupuestos). Los de formato 'lienzo'
 * (legado) o 'documento' se abren aquí mismo a través de `AbrirDocumento`;
 * los de modo simple (creados a mano o por el asistente de IA en la ficha
 * de cliente) navegan a esa ficha — esta vista no reimplementa su edición.
 *
 * "+ Crear presupuesto" crea siempre en `formato:'documento'` — nunca en
 * `'lienzo'` (regla de transición 1, ver ARQUITECTURA-MOTOR-DOCUMENTAL.md).
 * Selector en dos pasos: cliente → en blanco o una plantilla guardada
 * (Incremento 4) — al elegir una plantilla, sus variables `{{cliente.nombre}}`
 * etc. se resuelven en el momento con los datos reales antes de abrir el
 * editor. El borrador se abre sin guardar todavía: el primer "Guardar" del
 * editor hace el alta real vía `PUT /presupuestos/:id`.
 */
export function PresupuestosListaGlobal({ clientes, empresa, onActualizarEmpresa, onAbrirCliente, onCrearCliente }: PresupuestosListaGlobalProps) {
  const [presupuestos, setPresupuestos] = useState<PresupuestoMC[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ presupuesto: PresupuestoMC; clienteId: string; clienteNombre: string } | null>(null);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [clienteElegidoId, setClienteElegidoId] = useState<string | null>(null);
  const [plantillas, setPlantillas] = useState<PlantillaMC[]>([]);
  const [nuevoClienteAbierto, setNuevoClienteAbierto] = useState(false);
  const [nombreClienteNuevo, setNombreClienteNuevo] = useState('');
  /** Enlace del Portal del cliente ya generado por presupuesto, listo para copiar — vive solo en memoria, mismo patrón que `presupuestos-vista.tsx`. */
  const [enlaces, setEnlaces] = useState<Record<string, string>>({});
  const [enlaceCopiadoId, setEnlaceCopiadoId] = useState<string | null>(null);
  const [generandoEnlaceId, setGenerandoEnlaceId] = useState<string | null>(null);
  /** "Generar con IA" dentro del selector — campo libre para describir el trabajo, ver `generarConIA`. */
  const [campoIAAbierto, setCampoIAAbierto] = useState(false);
  const [descripcionIA, setDescripcionIA] = useState('');
  const [generandoIA, setGenerandoIA] = useState(false);
  const [errorIA, setErrorIA] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    api.obtenerTodosLosPresupuestos()
      .then(setPresupuestos)
      .catch((e) => setError(String(e).replace(/^Error:\s*/, '')))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const nombreDe = (clienteId: string) => clientes.find((c) => c.id === clienteId)?.nombre ?? 'Cliente';

  const guardarDocumentoAbierto = async (p: PresupuestoMC) => {
    const guardado = await api.guardarPresupuesto(p);
    setPresupuestos((prev) => {
      const existe = prev.some((x) => x.id === guardado.id);
      return existe ? prev.map((x) => (x.id === guardado.id ? guardado : x)) : [guardado, ...prev];
    });
    setEditor({ presupuesto: guardado, clienteId: guardado.clienteId, clienteNombre: nombreDe(guardado.clienteId) });
  };

  const borrar = async (id: string) => {
    try {
      await api.borrarPresupuesto(id);
      setPresupuestos((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    }
  };

  /** Genera el enlace del Portal del cliente y lo deja listo para copiar — mismo mecanismo que `presupuestos-vista.tsx`. */
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

  /** Botón "Generar enlace" del Portal del cliente — no existía en esta lista global (solo en la de dentro de la ficha de cliente), así que un presupuesto en formato 'documento' creado aquí no tenía ninguna forma de enviarse (reporte real del usuario, 19/08/2026). Legado 'lienzo' sin vista pública, igual que en la otra lista. */
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
        <input className={styles.input} value={url} readOnly onFocus={(e) => e.target.select()} style={{ fontSize: '0.78rem', width: '160px' }} />
        <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => copiarEnlace(url, p.id)}>
          {enlaceCopiadoId === p.id ? '✓ Copiado' : 'Copiar'}
        </button>
      </div>
    );
  };

  const abrir = (p: PresupuestoMC) => {
    if (p.formato === 'lienzo' || p.formato === 'documento') {
      setEditor({ presupuesto: p, clienteId: p.clienteId, clienteNombre: nombreDe(p.clienteId) });
    } else {
      onAbrirCliente(p.clienteId);
    }
  };

  const abrirSelector = () => {
    setSelectorAbierto(true);
    setClienteElegidoId(null);
    setNuevoClienteAbierto(false);
    setNombreClienteNuevo('');
    api.obtenerPlantillas().then(setPlantillas).catch(() => setPlantillas([]));
  };

  /** "+ Nuevo cliente" del propio selector — crea la ficha real (mismo mecanismo que la sección Clientes) y continúa el flujo con ese cliente ya elegido, sin salir de "+ Crear presupuesto". */
  const crearClienteYContinuar = () => {
    const nombre = nombreClienteNuevo.trim();
    if (!nombre) return;
    const nuevo: Cliente = {
      id: generarId(), nombre, proyecto: '', telefono: '', email: '', direccion: '',
      presupuesto: 0, tarifaHora: 0, creado: new Date().toISOString().slice(0, 10), estado: 'presupuestado',
      movimientos: [], horas: [], adjuntos: [], fotos: [],
    };
    onCrearCliente(nuevo);
    setNuevoClienteAbierto(false);
    setNombreClienteNuevo('');
    setClienteElegidoId(nuevo.id);
  };

  /** Abre un borrador nuevo en `formato:'documento'` sin guardar todavía — en blanco o resuelto a partir de una plantilla. */
  const crearBorrador = (clienteId: string, plantilla?: PlantillaMC) => {
    const ahora = new Date().toISOString();
    const contenidoDocumento: Record<string, unknown> = plantilla
      ? resolverVariables(plantilla.documentoBase, {
          cliente: { nombre: nombreDe(clienteId) },
          empresa: { nombre: empresa.nombre, telefono: empresa.telefono, email: empresa.email, iban: empresa.iban },
        })
      : {};
    const borrador: PresupuestoMC = {
      id: generarId(),
      clienteId,
      titulo: plantilla ? plantilla.nombre : 'Nuevo documento',
      formato: 'documento',
      descripcion: '',
      alcance: [],
      items: [],
      contenidoLienzo: {},
      contenidoDocumento,
      condicionesPago: empresa.condicionesPagoDefecto,
      validezDias: empresa.validezDiasDefecto,
      condicionesGenerales: '',
      precioTotal: 0,
      creado: ahora,
      actualizado: ahora,
    };
    setSelectorAbierto(false);
    setClienteElegidoId(null);
    setEditor({ presupuesto: borrador, clienteId, clienteNombre: nombreDe(clienteId) });
  };

  /**
   * "Generar con IA": una sola pantalla, sin ida y vuelta de chat — el
   * propio hecho de pulsar "Generar" ya es la confirmación del usuario, así
   * que la propuesta de la herramienta (`crearPresupuestoDocumento`, permiso
   * de escritura) se confirma de inmediato en cuanto llega, sin un paso
   * intermedio visible. El presupuesto se guarda ya en Mongo al terminar
   * (igual que si lo hubiera creado el propio asistente en un chat) — se
   * abre después en el editor real para que el carpintero lo revise y
   * ajuste antes de generar el enlace, nunca se envía solo.
   */
  const generarConIA = async (clienteId: string) => {
    const descripcion = descripcionIA.trim();
    if (!descripcion) return;
    setGenerandoIA(true);
    setErrorIA(null);
    try {
      const clienteNombre = nombreDe(clienteId);
      const respuesta = await api.generarRespuestaIA({
        capacidad: 'asistente-global',
        mensajes: [{ role: 'user', content: `Crea un presupuesto para el cliente ${clienteNombre}. Descripción del trabajo: ${descripcion}` }],
        referencias: { clienteId },
      });
      const propuesta = respuesta.propuestas.find((p) => p.nombre === 'crearPresupuestoDocumento');
      if (!propuesta) throw new Error('La IA no ha podido generar el presupuesto — prueba a describir el trabajo con más detalle (partes y precios).');
      const { resultado } = await api.confirmarPropuestaIA({
        capacidad: 'asistente-global',
        nombre: propuesta.nombre,
        argumentos: propuesta.argumentos,
        toolCallId: propuesta.id,
        referencias: { clienteId },
      });
      if (resultado?.error) throw new Error(String(resultado.error));
      const lista = await api.obtenerTodosLosPresupuestos();
      const creado = lista.find((p) => p.id === resultado?.presupuestoId);
      if (!creado) throw new Error('El presupuesto se generó pero no se pudo abrir — búscalo en la lista y ábrelo desde ahí.');
      setPresupuestos(lista);
      setSelectorAbierto(false);
      setClienteElegidoId(null);
      setCampoIAAbierto(false);
      setDescripcionIA('');
      setEditor({ presupuesto: creado, clienteId, clienteNombre });
    } catch (e) {
      setErrorIA(e instanceof Error ? e.message : 'No se pudo generar el presupuesto.');
    } finally {
      setGenerandoIA(false);
    }
  };

  if (editor) {
    return (
      <AbrirDocumento
        presupuesto={editor.presupuesto}
        clienteId={editor.clienteId}
        clienteNombre={editor.clienteNombre}
        empresa={empresa}
        onGuardar={guardarDocumentoAbierto}
        onVolver={() => setEditor(null)}
        onCambiarLogoEmpresa={(logo) => onActualizarEmpresa({ logo })}
      />
    );
  }

  if (cargando) return <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>Cargando presupuestos…</p>;

  return (
    <div>
      {error && <p style={{ color: 'var(--rojo)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
          {presupuestos.length} presupuesto{presupuestos.length !== 1 ? 's' : ''} de todos los clientes.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={cargar} style={{ fontSize: '0.78rem' }}>Actualizar</button>
          <button className={styles.btnCirculoOscuro} onClick={abrirSelector} title="Crear presupuesto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>
      </div>

      {selectorAbierto && (
        <div className={styles.overlay} onClick={() => setSelectorAbierto(false)}>
          <div className={styles.modal} style={{ maxWidth: 360, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }} onClick={(e) => e.stopPropagation()}>
            {!clienteElegidoId ? (
              <>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>Elige el cliente</p>
                {nuevoClienteAbierto ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <input
                      className={styles.input} autoFocus placeholder="Nombre del cliente nuevo"
                      value={nombreClienteNuevo} onChange={(e) => setNombreClienteNuevo(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') crearClienteYContinuar(); }}
                    />
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={crearClienteYContinuar} disabled={!nombreClienteNuevo.trim()} style={{ fontSize: '0.78rem' }}>
                        Crear y continuar
                      </button>
                      <button className={styles.btn} onClick={() => { setNuevoClienteAbierto(false); setNombreClienteNuevo(''); }} style={{ fontSize: '0.78rem' }}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ textAlign: 'left', fontSize: '0.8rem' }} onClick={() => setNuevoClienteAbierto(true)}>
                    + Nuevo cliente
                  </button>
                )}
                {clientes.length > 0 && <div style={{ borderTop: '1px solid var(--borde)', margin: '0.3rem 0' }} />}
                {clientes.map((c) => (
                  <button key={c.id} className={styles.btn} style={{ textAlign: 'left', fontSize: '0.8rem' }} onClick={() => setClienteElegidoId(c.id)}>{c.nombre}</button>
                ))}
              </>
            ) : (
              <>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>{nombreDe(clienteElegidoId)} — en blanco, desde plantilla o con IA</p>

                {campoIAAbierto ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <textarea
                      className={styles.input}
                      autoFocus
                      rows={4}
                      placeholder="Describe el trabajo: partes, materiales, precios de cada parte…"
                      value={descripcionIA}
                      onChange={(e) => setDescripcionIA(e.target.value)}
                      style={{ resize: 'vertical', fontSize: '0.82rem' }}
                      disabled={generandoIA}
                    />
                    {errorIA && <p style={{ margin: 0, color: 'var(--rojo)', fontSize: '0.78rem' }}>{errorIA}</p>}
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        className={`${styles.btn} ${styles.btnPrimario}`}
                        style={{ fontSize: '0.78rem' }}
                        onClick={() => generarConIA(clienteElegidoId)}
                        disabled={generandoIA || !descripcionIA.trim()}
                      >
                        {generandoIA ? 'Generando…' : 'Generar'}
                      </button>
                      <button className={styles.btn} style={{ fontSize: '0.78rem' }} onClick={() => { setCampoIAAbierto(false); setErrorIA(null); }} disabled={generandoIA}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ textAlign: 'left', fontSize: '0.8rem' }} onClick={() => setCampoIAAbierto(true)}>
                    ✨ Generar con IA
                  </button>
                )}

                <button className={styles.btn} style={{ textAlign: 'left', fontSize: '0.8rem' }} onClick={() => crearBorrador(clienteElegidoId)}>En blanco</button>
                {plantillas.length > 0 && <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: 'var(--topo-claro)' }}>Plantillas guardadas</p>}
                {plantillas.map((pl) => (
                  <button key={pl.id} className={styles.btn} style={{ textAlign: 'left', fontSize: '0.8rem' }} onClick={() => crearBorrador(clienteElegidoId, pl)}>
                    {pl.nombre} {pl.ambito === 'corporativa' ? '· corporativa' : ''}
                  </button>
                ))}
                <button className={styles.btn} style={{ fontSize: '0.78rem', alignSelf: 'flex-start' }} onClick={() => { setClienteElegidoId(null); setCampoIAAbierto(false); setErrorIA(null); }}>← Cambiar cliente</button>
              </>
            )}
            <button className={styles.btn} style={{ fontSize: '0.78rem', alignSelf: 'flex-end' }} onClick={() => setSelectorAbierto(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {presupuestos.length === 0 ? (
        <div className={styles.vacio}>
          <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
          </div>
          <p>Todavía no hay ningún presupuesto. Créalo con «+ Crear presupuesto» o desde la ficha de un cliente.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {presupuestos.map((p) => (
            <div
              key={p.id}
              className={`${styles.filaLista} ${styles.filaListaClic}`}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
                padding: '1rem',
              }}
              onClick={() => abrir(p)}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>{p.titulo}</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
                  {nombreDe(p.clienteId)} · {p.formato === 'lienzo' ? 'Plantilla libre (legado)' : p.formato === 'documento' ? 'Documento' : 'Narrativo'} · {formatoFecha(p.creado)}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={{ fontWeight: 800, fontSize: '1.05rem', whiteSpace: 'nowrap' }}>{formatoEuro(p.precioTotal)}</span>
                <div onClick={(e) => e.stopPropagation()}>{accionEnlace(p)}</div>
                <div onClick={(e) => e.stopPropagation()}>
                  <ConfirmarBorrado onConfirmar={() => borrar(p.id)} titulo="Borrar presupuesto" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
