import { useReducer, useState, useEffect, useRef } from 'react';
import * as api from './api.js';
import type { ElementoMC } from './documento-modelo.js';
import { textoDeElementoSeleccionado, puedeAplicarPropuestaA } from './documento-contexto-ia.js';
import { reducirPanelIA, estadoInicialPanelIA, recortarConversacion, LIMITE_IMAGENES_ACTIVAS } from './panel-ia-presupuesto-estado.js';
import { validarImagenParaIA, comprimirImagen, MIME_IMAGEN_PERMITIDOS } from './procesamiento-imagenes.js';
import { leerArchivoComoBase64 } from './archivos.js';
import { generarId } from './mock.js';
import { Z_MODAL } from './z-index.js';
import styles from './styles.module.css';

/**
 * IA del Presupuesto (23/08/2026, ampliada el mismo día con conversación
 * multi-turno y con imagen activa — Fase 3, IA Visual) — panel lateral
 * propio del editor de documentos, completamente separado del Asistente IA
 * general (`asistente-ia.tsx`): interfaz distinta, capacidad de IA distinta
 * (`copiloto-presupuesto`), sin banner compartido.
 *
 * Flujo obligatorio, sin excepciones: pedir → propuesta → Aceptar/Editar/
 * Regenerar/Cancelar → solo al Aceptar se aplica al documento. A diferencia
 * de `bloqueIA` (que escribe directamente), este panel nunca toca el
 * documento hasta que el usuario pulsa "Aceptar" — ver `panel-ia-presupuesto-estado.ts`.
 *
 * Conversación: `estado.conversacion` recuerda los turnos de ESTA sesión del
 * panel (en memoria de React, nunca persistida) para que "hazla más formal"
 * refine la propuesta anterior sin repetir contexto. Al enviar, solo se
 * manda la conversación recortada (`recortarConversacion`) + el contexto
 * del documento — la conversación nunca sustituye ni amplía lo que la IA
 * tiene permiso de hacer (sigue sin herramientas, sigue sin poder escribir
 * nada por su cuenta).
 *
 * IMÁGENES ACTIVAS (Fase 3, IA Visual; ampliado a varias el 30/08/2026): el
 * usuario puede adjuntar una o más fotos (p. ej. de una cocina) que quedan
 * como `estado.imagenesActivas` — una selección persistente del panel, no
 * un campo de cada mensaje. Solo el mensaje saliente de la petición en
 * curso incluye `imagenes:[...dataUrls]` (mismo mecanismo que
 * `extraer-datos-factura`: data URL en el body, `perfilModelo:'vision'`,
 * nunca R2 ni MongoDB) — el historial de conversación nunca lleva las
 * imágenes, solo un texto y, si corresponde, la marca informativa
 * `conImagen`. Cada imagen se valida (MIME + tamaño) y se
 * comprime con el mismo pipeline que el resto de la app antes de enviarse.
 */
export type PanelIaPresupuestoProps = {
  abierto: boolean;
  onCerrar: () => void;
  /** Cliente del presupuesto, si se conoce — contexto opcional para la IA. */
  clienteId?: string;
  /** Resumen de todo lo ya escrito en el documento (`extraerContextoDocumento`, calculado por el editor). */
  contextoDocumento: string;
  /** Elemento actualmente seleccionado en el lienzo, si hay exactamente uno. */
  elementoSeleccionado?: ElementoMC;
  /** Se llama SOLO cuando el usuario pulsa "Aceptar" — el editor aplica el texto con `actualizarContenido`. */
  onAplicarPropuesta: (texto: string) => void;
};

export function PanelIaPresupuesto({ abierto, onCerrar, clienteId, contextoDocumento, elementoSeleccionado, onAplicarPropuesta }: PanelIaPresupuestoProps) {
  const [estado, dispatch] = useReducer(reducirPanelIA, estadoInicialPanelIA);
  const [peticionActual, setPeticionActual] = useState('');
  const [errorImagen, setErrorImagen] = useState('');
  const [procesandoImagen, setProcesandoImagen] = useState(false);
  const enVueloRef = useRef(false);
  const inputImagenRef = useRef<HTMLInputElement>(null);

  const textoSeleccionado = textoDeElementoSeleccionado(elementoSeleccionado);
  const puedeAplicar = puedeAplicarPropuestaA(elementoSeleccionado);

  // Ejecuta la llamada real a la IA cada vez que el reducer entra en
  // "enviando" (tanto por un envío nuevo como por "Regenerar") — única
  // función de este componente que habla con la red; el resto es estado
  // puro. La conversación previa (recortada) viaja como turnos reales de
  // chat; el contexto del documento/selección viaja aparte, en `referencias`
  // — nunca se mezclan, para que la IA distinga "lo que ya hablamos" de
  // "lo que ya está escrito en el presupuesto". La imagen (si `imagenIncluida`)
  // se añade SOLO al último mensaje, nunca al historial — evita reenviar la
  // misma data URL en cada turno.
  useEffect(() => {
    if (estado.fase !== 'enviando' || enVueloRef.current) return;
    enVueloRef.current = true;
    (async () => {
      try {
        const turnosPrevios = recortarConversacion(estado.conversacion).map((m) => ({
          role: (m.rol === 'usuario' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.texto,
        }));
        const ultimoMensaje: { role: 'user'; content: string; imagenes?: string[] } = { role: 'user', content: estado.peticion };
        if (estado.imagenIncluida && estado.imagenesActivas.length > 0) ultimoMensaje.imagenes = estado.imagenesActivas.map((img) => img.dataUrl);
        const resultado = await api.generarRespuestaIA({
          capacidad: 'copiloto-presupuesto',
          mensajes: [...turnosPrevios, ultimoMensaje],
          referencias: { clienteId, contextoDocumento, textoSeleccionado },
        });
        dispatch({ tipo: 'respuesta', texto: resultado.respuesta });
      } catch {
        dispatch({ tipo: 'error', mensaje: 'No se pudo generar la propuesta. Inténtalo de nuevo.' });
      } finally {
        enVueloRef.current = false;
      }
    })();
  }, [estado, clienteId, contextoDocumento, textoSeleccionado]);

  if (!abierto) return null;

  const enviar = () => {
    const peticion = peticionActual.trim();
    if (!peticion) return;
    dispatch({ tipo: 'enviar', peticion, elementoId: elementoSeleccionado?.id ?? null });
    setPeticionActual('');
  };

  /**
   * Petición explícita del usuario, 26/08/2026: "Aceptar" aplica el texto
   * al elemento que esté seleccionado EN ESE MOMENTO, nunca al que estaba
   * seleccionado cuando se pidió la propuesta — el usuario quiere generar
   * el texto una vez y decidir dónde pegarlo señalando con el ratón justo
   * antes de aceptar, no quedar atado al elemento original. Antes
   * (corrección 24/08/2026) se bloqueaba "Aceptar" si la selección había
   * cambiado, para evitar aplicar a un elemento equivocado por error — el
   * usuario ahora pide justo el comportamiento contrario a propósito, así
   * que la única condición que queda es que haya ALGÚN elemento de texto
   * válido seleccionado (`puedeAplicar`).
   */
  const aceptar = () => {
    if (estado.fase !== 'propuesta' || !puedeAplicar) return;
    onAplicarPropuesta(estado.texto);
    dispatch({ tipo: 'aceptado' });
  };

  // Añade una imagen más a las activas (hasta LIMITE_IMAGENES_ACTIVAS):
  // valida MIME+tamaño ANTES de intentar decodificar nada, comprime con el
  // mismo pipeline que el resto de la app (nunca se salta este paso) y solo
  // entonces la codifica a data URL. Puede llamarse varias veces seguidas
  // (una por archivo) sin pisar las imágenes ya añadidas.
  const seleccionarImagen = async (file: File) => {
    setErrorImagen('');
    const validacion = validarImagenParaIA(file);
    if (validacion.valido === false) { setErrorImagen(validacion.motivo); return; }
    setProcesandoImagen(true);
    try {
      const { blob } = await comprimirImagen(file, { forzarJpeg: true });
      const dataUrl = await leerArchivoComoBase64(blob);
      dispatch({ tipo: 'imagenSeleccionada', id: generarId(), dataUrl, nombre: file.name });
    } catch {
      setErrorImagen('No se pudo procesar la imagen. Prueba con otra.');
    } finally {
      setProcesandoImagen(false);
    }
  };

  const quitarImagen = (id: string) => {
    dispatch({ tipo: 'imagenEliminada', id });
    setErrorImagen('');
  };

  // Turnos ya resueltos (no incluyen el par pendiente de la propuesta activa,
  // que se muestra aparte con sus propios botones) — en 'propuesta' es toda
  // la conversación menos el último par; en el resto de fases, toda ella.
  const turnosResueltos = estado.fase === 'propuesta' ? estado.conversacion.slice(0, -2) : estado.conversacion;

  return (
    <div
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 360, maxWidth: '90vw',
        background: 'var(--blanco)', borderLeft: '1px solid var(--borde)', boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
        // Bug real, 26/08/2026: a la misma altura que el FAB del Asistente
        // IA general (`asistente-ia.tsx`, siempre montado en la raíz de la
        // app) — ambos usaban `Z_BARRA_FLOTANTE`, así que el FAB (montado
        // después en el árbol) pintaba encima del botón "Enviar" de este
        // panel y lo dejaba imposible de pulsar. Por encima de `Z_MODAL`
        // para ganar siempre al FAB, sin tocar la constante compartida.
        zIndex: Z_MODAL, display: 'flex', flexDirection: 'column',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1rem', borderBottom: '1px solid var(--borde)' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>✨ IA del presupuesto</h3>
        <button className={styles.btnIcono} onClick={onCerrar} aria-label="Cerrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div style={{ padding: '0.5rem 1rem', fontSize: '0.72rem', color: 'var(--topo-claro)', borderBottom: '1px solid var(--borde-fino)' }}>
        {puedeAplicar
          ? <>Al pulsar "Aceptar" se aplica al texto que tengas seleccionado EN ESE MOMENTO — puedes cambiar de selección antes de aceptar para decidir dónde va. Puedes pedir "mejora esto", "resume esto"… y seguir refinando la respuesta en la misma conversación.</>
          : <>Selecciona un elemento de texto en el documento para poder aplicar una propuesta ahí — mientras tanto puedes redactar y copiar el resultado a mano.</>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {turnosResueltos.map((m, i) => (
          <p
            key={i}
            style={{
              margin: 0, fontSize: '0.8rem', whiteSpace: 'pre-wrap',
              color: m.rol === 'usuario' ? 'var(--topo)' : 'var(--negro)',
              fontWeight: m.rol === 'usuario' ? 600 : 400,
            }}
          >
            {m.rol === 'usuario' ? 'Tú: ' : ''}{m.conImagen ? '🖼️ ' : ''}{m.texto}
          </p>
        ))}

        {(estado.fase === 'enviando' || estado.fase === 'error') && (
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo)', fontWeight: 600 }}>Tú: {estado.imagenIncluida ? '🖼️ ' : ''}{estado.peticion}</p>
        )}
        {estado.fase === 'enviando' && (
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo-claro)' }}>Pensando…</p>
        )}

        {estado.fase === 'error' && (
          <div style={{ background: 'var(--rojo-bg, #fdeceb)', border: '1px solid var(--rojo)', borderRadius: 6, padding: '0.6rem 0.75rem' }}>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--rojo)' }}>{estado.mensaje}</p>
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
              <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.75rem' }} onClick={() => dispatch({ tipo: 'regenerar' })}>Reintentar</button>
              <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.75rem' }} onClick={() => dispatch({ tipo: 'cancelar' })}>Cancelar</button>
            </div>
          </div>
        )}

        {estado.fase === 'propuesta' && (
          <>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo)', fontWeight: 600 }}>
              Tú: {estado.conversacion[estado.conversacion.length - 2]?.conImagen ? '🖼️ ' : ''}{estado.peticion}
            </p>
            <div style={{ background: 'var(--fondo-caja)', border: '1px solid var(--borde)', borderRadius: 8, padding: '0.75rem' }}>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--topo-claro)', fontWeight: 700 }}>Propuesta</p>
              {estado.editando ? (
                <textarea
                  className={styles.input}
                  style={{ width: '100%', minHeight: 100, fontFamily: 'inherit' }}
                  value={estado.texto}
                  onChange={(e) => dispatch({ tipo: 'editarTexto', texto: e.target.value })}
                  autoFocus
                />
              ) : (
                <p style={{ margin: 0, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{estado.texto}</p>
              )}

              {!puedeAplicar && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: 'var(--rojo)' }}>
                  Selecciona un elemento de texto en el documento para poder aceptar y pegar ahí esta propuesta.
                </p>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.75rem' }}>
                {estado.editando ? (
                  <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.75rem' }} onClick={() => dispatch({ tipo: 'salirEdicion' })}>Listo</button>
                ) : (
                  <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.75rem' }} onClick={() => dispatch({ tipo: 'entrarEdicion' })}>Editar</button>
                )}
                <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.75rem' }} onClick={() => dispatch({ tipo: 'regenerar' })}>Regenerar</button>
                <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.75rem' }} onClick={() => dispatch({ tipo: 'cancelar' })}>Cancelar</button>
                <button
                  className={`${styles.btn} ${styles.btnPrimario}`}
                  style={{ fontSize: '0.75rem', marginLeft: 'auto' }}
                  onClick={aceptar}
                  disabled={!puedeAplicar}
                  title={!puedeAplicar ? 'Selecciona un elemento de texto en el documento primero' : 'Se aplica al elemento seleccionado ahora mismo'}
                >
                  Aceptar
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ padding: '0.6rem 1rem 0', borderTop: '1px solid var(--borde)' }}>
        {errorImagen && (
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', color: 'var(--rojo)' }}>{errorImagen}</p>
        )}
        {estado.imagenesActivas.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            {estado.imagenesActivas.map((img) => (
              <div key={img.id} style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
                <img
                  src={img.dataUrl}
                  alt={img.nombre}
                  title={img.nombre}
                  style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--borde)' }}
                />
                <button
                  className={styles.btnIcono}
                  onClick={() => quitarImagen(img.id)}
                  aria-label={`Quitar ${img.nombre}`}
                  style={{
                    position: 'absolute', top: -6, right: -6, width: 18, height: 18, minWidth: 18, padding: 0,
                    borderRadius: '50%', background: 'var(--blanco)', border: '1px solid var(--borde)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            ))}
            {estado.imagenesActivas.length < LIMITE_IMAGENES_ACTIVAS && (
              <button
                className={styles.btnIcono}
                onClick={() => inputImagenRef.current?.click()}
                disabled={procesandoImagen}
                aria-label="Añadir otra imagen"
                title="Añadir otra imagen"
                style={{ width: 40, height: 40, borderRadius: 6, border: '1px dashed var(--borde)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            )}
          </div>
        ) : (
          <button
            className={`${styles.btn} ${styles.btnSecundario}`}
            style={{ fontSize: '0.72rem', marginBottom: '0.5rem' }}
            onClick={() => inputImagenRef.current?.click()}
            disabled={procesandoImagen}
          >
            {procesandoImagen ? 'Procesando imagen…' : '🖼️ Añadir imagen (p. ej. una foto del espacio)'}
          </button>
        )}
        <input
          ref={inputImagenRef}
          type="file"
          accept={MIME_IMAGEN_PERMITIDOS.join(',')}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            // Respeta el hueco que quede hasta el tope aunque se seleccionen
            // más archivos de golpe — el resto simplemente no se procesa.
            const hueco = LIMITE_IMAGENES_ACTIVAS - estado.imagenesActivas.length;
            files.slice(0, hueco).forEach((file) => { void seleccionarImagen(file); });
          }}
        />
      </div>

      <div style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem' }}>
        <textarea
          className={styles.input}
          style={{ flex: 1, resize: 'none', fontFamily: 'inherit' }}
          rows={2}
          placeholder='Ej. "Redacta esta partida", "Descríbeme esta cocina"…'
          value={peticionActual}
          onChange={(e) => setPeticionActual(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          disabled={estado.fase === 'enviando'}
        />
        <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ alignSelf: 'flex-end' }} onClick={enviar} disabled={!peticionActual.trim() || estado.fase === 'enviando'}>
          Enviar
        </button>
      </div>
    </div>
  );
}
