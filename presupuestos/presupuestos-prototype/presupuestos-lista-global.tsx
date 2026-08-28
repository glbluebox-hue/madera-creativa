import { useState, useEffect, useCallback } from 'react';
import * as api from './api.js';
import type { PresupuestoMC } from './presupuestos-modelo.js';
import type { Empresa } from './use-empresa.js';
import type { PlantillaMC } from './documento-modelo.js';
import { crearDocumentoVacio } from './documento-modelo.js';
import type { Proyecto } from './types.js';
import { AbrirDocumento } from './abrir-documento.js';
import { generarId } from './mock.js';
import { resolverVariables } from './documento-registro-variables.js';
import './documento-variables-iniciales.js'; // registro de variables por efecto secundario (Incremento 4).
import { autoRellenarDatosCliente, type DatosClienteAutoRelleno } from './presupuestos-datos-cliente.js';
import { formatoEuro, formatoFecha } from './calculos.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import { AnalisisPrecioPresupuesto } from './analisis-precio-presupuesto.js';
import styles from './styles.module.css';

export type PresupuestosListaGlobalProps = {
  /** Lista ligera de clientes — para el nombre en cada tarjeta. */
  clientes: { id: string; nombre: string }[];
  empresa: Empresa;
  /** Persiste cambios de empresa — usado para el clic-en-el-logo del editor. */
  onActualizarEmpresa: (cambios: Partial<Empresa>) => void;
  /** Navega a la ficha de un cliente — usado para abrir presupuestos en modo simple (esta vista no los edita directamente). */
  onAbrirCliente: (clienteId: string) => void;
  /** Crea un cliente y su primer proyecto reales, sin salir de este selector — "+ Nuevo cliente" dentro de "+ Crear presupuesto". */
  onCrearProyecto: (proyecto: Proyecto) => void;
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
 * editor. El borrador se guarda de inmediato en el backend (`crearBorrador`)
 * antes de abrir el editor — desde la Fase A (autoguardado, 23/08/2026) ya
 * no basta con abrirlo solo en memoria, ver el comentario de `crearBorrador`.
 */
export function PresupuestosListaGlobal({ clientes, empresa, onActualizarEmpresa, onAbrirCliente, onCrearProyecto }: PresupuestosListaGlobalProps) {
  const [presupuestos, setPresupuestos] = useState<PresupuestoMC[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creandoBorrador, setCreandoBorrador] = useState(false);
  const [editor, setEditor] = useState<{ presupuesto: PresupuestoMC; clienteId: string; clienteNombre: string } | null>(null);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [clienteElegidoId, setClienteElegidoId] = useState<string | null>(null);
  const [plantillas, setPlantillas] = useState<PlantillaMC[]>([]);
  /**
   * Selector de proyecto opcional (24/08/2026) — para que el bloque de
   * datos del cliente pueda rellenar la dirección de la obra, que vive en
   * el Proyecto, no en el Cliente (incremento "Cliente ≠ Proyecto"). Se
   * recarga cada vez que cambia el cliente elegido; `null` = "ninguno
   * elegido todavía" y también el valor por defecto si el cliente no
   * tiene ningún proyecto.
   */
  const [proyectosCliente, setProyectosCliente] = useState<{ id: string; proyecto: string }[]>([]);
  const [proyectoElegidoId, setProyectoElegidoId] = useState<string | null>(null);
  const [nuevoClienteAbierto, setNuevoClienteAbierto] = useState(false);
  const [nombreClienteNuevo, setNombreClienteNuevo] = useState('');
  /** Enlace del Portal del cliente ya generado por presupuesto, listo para copiar — vive solo en memoria, mismo patrón que `presupuestos-vista.tsx`. */
  const [enlaces, setEnlaces] = useState<Record<string, string>>({});
  const [enlaceCopiadoId, setEnlaceCopiadoId] = useState<string | null>(null);
  const [generandoEnlaceId, setGenerandoEnlaceId] = useState<string | null>(null);
  /**
   * Bug real, 26/08/2026: `enlaces` (arriba) solo vive en memoria de React —
   * recargar la página lo pierde, así que el botón volvía a mostrar
   * "Generar enlace" aunque ya hubiera uno activo enviado a un cliente real.
   * Un segundo clic revocaba ese enlace en silencio (`crearEnlacePresupuesto`
   * revoca cualquier anterior). Ahora `p.enlaceActivoExpiraEn` (servidor,
   * sobrevive a un refresco) avisa antes de generar uno nuevo — este estado
   * es solo el "¿seguro?" de esa confirmación.
   */
  const [confirmandoRegenerarId, setConfirmandoRegenerarId] = useState<string | null>(null);
  /** "Generar con IA" dentro del selector — campo libre para describir el trabajo, ver `generarConIA`. */
  const [campoIAAbierto, setCampoIAAbierto] = useState(false);
  const [descripcionIA, setDescripcionIA] = useState('');
  /** Plantilla real elegida para que la IA la rellene, en vez de generar el documento desde cero — `null` = diseño automático (comportamiento anterior). */
  const [plantillaIAId, setPlantillaIAId] = useState<string | null>(null);
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

  useEffect(() => {
    setProyectoElegidoId(null);
    if (!clienteElegidoId) { setProyectosCliente([]); return; }
    api.obtenerProyectosDeCliente(clienteElegidoId).then(setProyectosCliente).catch(() => setProyectosCliente([]));
  }, [clienteElegidoId]);

  const nombreDe = (clienteId: string) => clientes.find((c) => c.id === clienteId)?.nombre ?? 'Cliente';

  const guardarDocumentoAbierto = async (p: PresupuestoMC) => {
    const guardado = await api.guardarPresupuesto(p);
    setPresupuestos((prev) => {
      const existe = prev.some((x) => x.id === guardado.id);
      return existe ? prev.map((x) => (x.id === guardado.id ? guardado : x)) : [guardado, ...prev];
    });
    setEditor({ presupuesto: guardado, clienteId: guardado.clienteId, clienteNombre: nombreDe(guardado.clienteId) });
  };

  /**
   * Reasigna el presupuesto abierto a otro cliente — antes solo se podía
   * elegir el cliente al crear el presupuesto, sin forma de cambiarlo
   * después (pedido real, 25/08/2026). Reutiliza el mismo `guardarPresupuesto`
   * que ya usa el guardado normal, con `clienteId` distinto. También limpia
   * `proyectoId`: un presupuesto vinculado a un proyecto concreto del
   * cliente ANTERIOR no puede seguir apuntando a ese mismo proyecto tras
   * cambiar de cliente (el nuevo cliente no lo tiene) — queda "sin
   * proyecto concreto", igual que uno creado desde el asistente global.
   */
  const cambiarClienteDelPresupuesto = async (nuevoClienteId: string) => {
    if (!editor) return;
    await guardarDocumentoAbierto({ ...editor.presupuesto, clienteId: nuevoClienteId, proyectoId: '' });
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
      // Ya existe un enlace activo en el servidor (sobrevive a un refresco,
      // a diferencia de `enlaces`/`url` de arriba) pero no tenemos el token
      // en claro para mostrarlo — generar uno nuevo lo revocaría. Avisar
      // antes en vez de dejar que un segundo clic lo rompa en silencio.
      if (p.enlaceActivoExpiraEn && confirmandoRegenerarId !== p.id) {
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--topo-claro)' }}>
              Ya hay un enlace activo (caduca el {formatoFecha(p.enlaceActivoExpiraEn)})
            </span>
            <button
              className={`${styles.btn} ${styles.btnSecundario}`}
              style={{ fontSize: '0.75rem' }}
              onClick={() => setConfirmandoRegenerarId(p.id)}
              title="El enlace ya generado no se puede volver a mostrar, pero sigue funcionando si lo tienes guardado"
            >
              Generar uno nuevo
            </button>
          </div>
        );
      }
      if (confirmandoRegenerarId === p.id) {
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--rojo)', fontWeight: 600 }}>
              Esto invalida el enlace anterior — si ya se lo enviaste a un cliente, dejará de funcionarle.
            </span>
            <button
              className={`${styles.btn} ${styles.btnPeligro}`}
              style={{ fontSize: '0.75rem' }}
              onClick={() => { setConfirmandoRegenerarId(null); generarEnlace(p.id); }}
            >
              Generar de todas formas
            </button>
            <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.75rem' }} onClick={() => setConfirmandoRegenerarId(null)}>
              Cancelar
            </button>
          </div>
        );
      }
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        <input
          className={styles.input}
          value={url}
          readOnly
          onFocus={(e) => e.target.select()}
          style={{ fontSize: '0.78rem', flex: '1 1 140px', minWidth: 0, boxSizing: 'border-box' }}
        />
        <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ flexShrink: 0 }} onClick={() => copiarEnlace(url, p.id)}>
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

  /** "+ Nuevo cliente" del propio selector — crea el cliente y un primer proyecto reales (mismo mecanismo que la sección Clientes) y continúa el flujo con ese cliente ya elegido, sin salir de "+ Crear presupuesto". */
  const crearClienteYContinuar = async () => {
    const nombre = nombreClienteNuevo.trim();
    if (!nombre) return;
    const cliente = await api.crearCliente({ nombre });
    const proyecto = await api.crearProyecto({ clienteId: cliente.id });
    onCrearProyecto(proyecto);
    setNuevoClienteAbierto(false);
    setNombreClienteNuevo('');
    setClienteElegidoId(cliente.id);
  };

  /**
   * Crea un presupuesto nuevo en `formato:'documento'` — en blanco o resuelto
   * a partir de una plantilla — y lo persiste de inmediato en el backend
   * antes de abrir el editor (mismo patrón que `plantillas-vista.tsx`).
   *
   * Antes de la Fase A (autoguardado, 23/08/2026) el borrador se abría solo
   * en memoria y el primer "Guardar" manual del editor hacía el alta real —
   * funcionaba porque el usuario tarde o temprano pulsaba Guardar. Con
   * autoguardado, `useAutoguardado` asume que "lo que había al montar el
   * editor ya está guardado" (una suposición correcta al REABRIR un
   * documento existente, falsa para uno recién creado en memoria) — si las
   * ediciones del usuario no llegaban a cambiar `documento` de referencia,
   * el estado se quedaba en `'guardado'` desde el principio y "← Volver"
   * salía sin haber guardado nada en absoluto: el presupuesto nunca había
   * existido en Mongo (bug real reportado 24/08/2026, con plantilla
   * elegida al crear presupuesto — el flujo más usado de la aplicación).
   * Guardarlo aquí, antes de abrir el editor, hace que siempre arranque
   * sobre un documento que ya existe de verdad — el autoguardado funciona
   * igual que al reabrir cualquier otro presupuesto.
   *
   * Datos del cliente (24/08/2026): antes solo se pasaba el `nombre` (de
   * la lista ligera `clientes`, sin teléfono/DNI) a `resolverVariables`, y
   * ninguna plantilla tenía forma de mostrar esos datos igualmente — se
   * pide aquí el cliente completo (`api.obtenerCliente`) y, si se eligió
   * un proyecto en el selector, también su dirección (`api.obtenerProyecto`,
   * la dirección vive en el Proyecto, no en el Cliente, desde el
   * incremento "Cliente ≠ Proyecto").
   */
  const crearBorrador = async (clienteId: string, plantilla?: PlantillaMC) => {
    const ahora = new Date().toISOString();
    setCreandoBorrador(true);
    setError(null);
    try {
      const [clienteCompleto, proyectoCompleto] = await Promise.all([
        api.obtenerCliente(clienteId),
        proyectoElegidoId ? api.obtenerProyecto(proyectoElegidoId) : Promise.resolve(null),
      ]);
      const contexto = {
        cliente: {
          nombre: clienteCompleto.nombre,
          telefono: clienteCompleto.telefono,
          email: clienteCompleto.email,
          direccion: proyectoCompleto?.direccion ?? '',
          dni: clienteCompleto.dni ?? '',
        },
        empresa: { nombre: empresa.nombre, telefono: empresa.telefono, email: empresa.email, iban: empresa.iban },
      };
      const documentoResuelto = plantilla ? resolverVariables(plantilla.documentoBase, contexto) : crearDocumentoVacio(generarId);
      const datosAutoRelleno: DatosClienteAutoRelleno = {
        nombre: clienteCompleto.nombre,
        direccion: proyectoCompleto?.direccion ?? '',
        telefono: clienteCompleto.telefono,
        dni: clienteCompleto.dni ?? '',
        fecha: formatoFecha(new Date()),
      };
      // Primero intenta rellenar etiquetas "Nombre:/Dirección:/Teléfono:/DNI:"
      // ya presentes en el documento; si no encuentra ninguna (típico de un
      // presupuesto en blanco), añade el bloque de reserva — ver
      // `presupuestos-datos-cliente.ts` para el porqué de la separación.
      const documentoFinal = autoRellenarDatosCliente(documentoResuelto, datosAutoRelleno);
      const contenidoDocumento = documentoFinal as unknown as Record<string, unknown>;
      const borrador: PresupuestoMC = {
        id: generarId(),
        clienteId,
        proyectoId: proyectoElegidoId ?? undefined,
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
      const guardado = await api.guardarPresupuesto(borrador);
      setPresupuestos((prev) => [guardado, ...prev]);
      setSelectorAbierto(false);
      setClienteElegidoId(null);
      setEditor({ presupuesto: guardado, clienteId, clienteNombre: nombreDe(clienteId) });
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setCreandoBorrador(false);
    }
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
        mensajes: [{
          role: 'user',
          content:
            `Crea un presupuesto CON MEMBRETE (usa siempre la herramienta crearPresupuestoDocumento, nunca crearPresupuesto) ` +
            `para el cliente ${clienteNombre}. Si el trabajo es una sola partida con un único precio, créala igualmente ` +
            `como una única sección — nunca uses crearPresupuesto en esta pantalla. Descripción del trabajo: ${descripcion}`,
        }],
        referencias: { clienteId },
      });
      const propuesta = respuesta.propuestas.find((p) => p.nombre === 'crearPresupuestoDocumento');
      if (!propuesta) {
        const otraPropuesta = respuesta.propuestas.find((p) => p.nombre === 'crearPresupuesto');
        throw new Error(
          otraPropuesta
            ? 'La IA generó un presupuesto de texto plano en vez de uno con membrete — vuelve a intentarlo, o créalo desde el asistente general si prefieres el formato simple.'
            : 'La IA no ha podido generar el presupuesto — prueba a describir el trabajo con más detalle (partes y precios).'
        );
      }
      // La plantilla elegida se añade aquí, después de que la IA proponga sus
      // argumentos — nunca se le pide al modelo que la decida o la recuerde,
      // es una elección determinista de la propia pantalla.
      const argumentos = plantillaIAId ? { ...propuesta.argumentos, plantillaId: plantillaIAId } : propuesta.argumentos;
      const { resultado } = await api.confirmarPropuestaIA({
        capacidad: 'asistente-global',
        nombre: propuesta.nombre,
        argumentos,
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
      setPlantillaIAId(null);
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
        clientesDisponibles={clientes}
        onCambiarCliente={cambiarClienteDelPresupuesto}
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
          <button className={styles.btnCirculoOscuro} onClick={abrirSelector} title="Crear presupuesto" data-tutorial-id="crear-presupuesto-btn">
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
                  <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ textAlign: 'left', fontSize: '0.8rem' }} onClick={() => setNuevoClienteAbierto(true)} data-tutorial-id="presupuesto-selector-cliente">
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

                {proyectosCliente.length > 0 && (
                  <label style={{ fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    Proyecto (opcional — rellena la dirección de la obra)
                    <select
                      className={styles.input}
                      value={proyectoElegidoId ?? ''}
                      onChange={(e) => setProyectoElegidoId(e.target.value || null)}
                      style={{ fontSize: '0.82rem' }}
                    >
                      <option value="">Ninguno</option>
                      {proyectosCliente.map((pr) => (
                        <option key={pr.id} value={pr.id}>{pr.proyecto || 'Proyecto sin nombre'}</option>
                      ))}
                    </select>
                  </label>
                )}

                {campoIAAbierto ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {plantillas.length > 0 && (
                      <label style={{ fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        Plantilla a rellenar
                        <select
                          className={styles.input}
                          value={plantillaIAId ?? ''}
                          onChange={(e) => setPlantillaIAId(e.target.value || null)}
                          disabled={generandoIA}
                          style={{ fontSize: '0.82rem' }}
                        >
                          <option value="">Diseño automático (sin plantilla)</option>
                          {plantillas.map((pl) => (
                            <option key={pl.id} value={pl.id}>{pl.nombre}{pl.ambito === 'corporativa' ? ' · corporativa' : ''}</option>
                          ))}
                        </select>
                      </label>
                    )}
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

                <button className={styles.btn} style={{ textAlign: 'left', fontSize: '0.8rem' }} onClick={() => crearBorrador(clienteElegidoId)} disabled={creandoBorrador}>
                  {creandoBorrador ? 'Creando…' : 'En blanco'}
                </button>
                {plantillas.length > 0 && <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: 'var(--topo-claro)' }}>Plantillas guardadas</p>}
                {plantillas.map((pl) => (
                  <button key={pl.id} className={styles.btn} style={{ textAlign: 'left', fontSize: '0.8rem' }} onClick={() => crearBorrador(clienteElegidoId, pl)} disabled={creandoBorrador}>
                    {creandoBorrador ? 'Creando…' : `${pl.nombre}${pl.ambito === 'corporativa' ? ' · corporativa' : ''}`}
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
              style={{ padding: '1rem' }}
            >
              <div
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
                  flexWrap: 'wrap', cursor: 'pointer',
                }}
                onClick={() => abrir(p)}
              >
                <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>{p.titulo}</p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
                    {nombreDe(p.clienteId)} · {p.formato === 'lienzo' ? 'Plantilla libre (legado)' : p.formato === 'documento' ? 'Documento' : 'Narrativo'} · {formatoFecha(p.creado)}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0 }}>
                  <span style={{ fontWeight: 800, fontSize: '1.05rem', whiteSpace: 'nowrap' }}>{formatoEuro(p.precioTotal)}</span>
                  <div onClick={(e) => e.stopPropagation()}>{accionEnlace(p)}</div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <ConfirmarBorrado onConfirmar={() => borrar(p.id)} titulo="Borrar presupuesto" />
                  </div>
                </div>
              </div>
              {/* Solo el snapshot ya congelado (presupuestos aceptados con datos
                  suficientes) — esta lista mezcla TODOS los clientes, así que
                  mostrar "Datos insuficientes" en cada borrador sería ruido
                  (Inteligencia de Precios, Fase 1: "no dashboard sobrecargado"). */}
              {p.analisisPrecio && (
                <div onClick={(e) => e.stopPropagation()}>
                  <AnalisisPrecioPresupuesto analisis={p.analisisPrecio} esSnapshot />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
