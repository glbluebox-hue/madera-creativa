import { useReducer, useState, useEffect, useRef } from 'react';
import * as api from './api.js';
import type { ElementoMC } from './documento-modelo.js';
import { textoDeElementoSeleccionado, puedeAplicarPropuestaA } from './documento-contexto-ia.js';
import { reducirPanelIA, estadoInicialPanelIA, recortarConversacion } from './panel-ia-presupuesto-estado.js';
import { Z_BARRA_FLOTANTE } from './z-index.js';
import styles from './styles.module.css';

/**
 * IA del Presupuesto (23/08/2026, ampliada el mismo día con conversación
 * multi-turno) — panel lateral propio del editor de documentos,
 * completamente separado del Asistente IA general (`asistente-ia.tsx`):
 * interfaz distinta, capacidad de IA distinta (`copiloto-presupuesto`), sin
 * banner compartido.
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
 * Preparado para la Fase 3 (imágenes): la llamada a `api.generarRespuestaIA`
 * ya acepta `imagenes` en el mensaje (mismo mecanismo que usa
 * `extraer-datos-factura`) y la capacidad `copiloto-presupuesto` ya declara
 * `perfilModelo: 'vision'` — añadir el selector de imagen en Fase 3 no
 * requiere cambiar esta llamada ni la conversación, solo añadir el campo al
 * mensaje del turno correspondiente.
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
  const enVueloRef = useRef(false);

  const textoSeleccionado = textoDeElementoSeleccionado(elementoSeleccionado);
  const puedeAplicar = puedeAplicarPropuestaA(elementoSeleccionado);

  // Ejecuta la llamada real a la IA cada vez que el reducer entra en
  // "enviando" (tanto por un envío nuevo como por "Regenerar") — única
  // función de este componente que habla con la red; el resto es estado
  // puro. La conversación previa (recortada) viaja como turnos reales de
  // chat; el contexto del documento/selección viaja aparte, en `referencias`
  // — nunca se mezclan, para que la IA distinga "lo que ya hablamos" de
  // "lo que ya está escrito en el presupuesto".
  useEffect(() => {
    if (estado.fase !== 'enviando' || enVueloRef.current) return;
    enVueloRef.current = true;
    (async () => {
      try {
        const turnosPrevios = recortarConversacion(estado.conversacion).map((m) => ({
          role: (m.rol === 'usuario' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.texto,
        }));
        const resultado = await api.generarRespuestaIA({
          capacidad: 'copiloto-presupuesto',
          mensajes: [...turnosPrevios, { role: 'user', content: estado.peticion }],
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
    dispatch({ tipo: 'enviar', peticion });
    setPeticionActual('');
  };

  const aceptar = () => {
    if (estado.fase !== 'propuesta') return;
    onAplicarPropuesta(estado.texto);
    dispatch({ tipo: 'aceptado' });
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
        zIndex: Z_BARRA_FLOTANTE, display: 'flex', flexDirection: 'column',
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
          ? <>Trabajando sobre el texto seleccionado. Puedes pedir "mejora esto", "resume esto"… y seguir refinando la respuesta en la misma conversación.</>
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
            {m.rol === 'usuario' ? 'Tú: ' : ''}{m.texto}
          </p>
        ))}

        {(estado.fase === 'enviando' || estado.fase === 'error') && (
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo)', fontWeight: 600 }}>Tú: {estado.peticion}</p>
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
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo)', fontWeight: 600 }}>Tú: {estado.peticion}</p>
            <div style={{ background: 'var(--fondo)', border: '1px solid var(--borde)', borderRadius: 8, padding: '0.75rem' }}>
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
                  title={puedeAplicar ? undefined : 'Selecciona un elemento de texto en el documento primero'}
                >
                  Aceptar
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--borde)', display: 'flex', gap: '0.5rem' }}>
        <textarea
          className={styles.input}
          style={{ flex: 1, resize: 'none', fontFamily: 'inherit' }}
          rows={2}
          placeholder='Ej. "Redacta esta partida", "Hazla más formal"…'
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
