import { useState, useRef, useEffect } from 'react';
import { generarRespuestaIA, confirmarPropuestaIA, type AccionInterfazIA } from './api.js';
import styles from './asistente-ia.module.css';

type MensajeChat = { role: 'user' | 'assistant' | 'system'; content: string };

/** Una escritura propuesta por la IA, adjunta a un mensaje del chat, pendiente de confirmación explícita. */
type PropuestaChat = {
  /** Id de la llamada a herramienta tal como la propuso el modelo — necesario al confirmar, para que el servidor reconstruya una conversación válida. */
  id: string;
  nombre: string;
  argumentos: Record<string, unknown>;
  /** Conversación tal como se envió a `/ia/generar` cuando se propuso — necesaria para que la IA redacte la confirmación final con el resultado real. */
  historial: MensajeChat[];
  estado: 'pendiente' | 'confirmando' | 'confirmada' | 'error';
  errorTexto?: string;
};

/** Un mensaje del chat del asistente. */
type Mensaje = {
  id: string;
  rol: 'usuario' | 'asistente';
  texto: string;
  cargando?: boolean;
  propuesta?: PropuestaChat;
};

/** Contexto actual de la app para que el asistente sepa dónde está el usuario. */
export type ContextoApp = {
  seccionActual: string;
  clienteAbierto?: string;
};

/** Props del asistente flotante. */
export type AsistenteIAProps = {
  /** Si true, oculta el FAB flotante (el trigger lo gestiona el padre). */
  sinFab?: boolean;
  /** Permite que el padre controle si el panel está abierto. */
  abiertoProp?: boolean;
  /**
   * Se llama cada vez que el panel debería abrirse o cerrarse desde dentro
   * (FAB, botón de cerrar) — imprescindible cuando se usa `abiertoProp`: sin
   * esto, el padre nunca se entera de que hay que ABRIR el panel (antes solo
   * existía `onCerrar`, que solo cubría el cierre — el FAB no hacía nada
   * visible al pulsarlo en modo controlado).
   */
  onCambiarAbierto?: (abierto: boolean) => void;
  /** Contexto actual de la pantalla. */
  contexto: ContextoApp;
  /** Solo id+nombre de todos los clientes, para resolver a quién se refiere el asistente al navegar. */
  clientes: { id: string; nombre: string }[];
  /** Navegar a una sección. */
  onNavegar: (seccion: 'clientes' | 'presupuestos' | 'facturas' | 'notas') => void;
  /** Abrir la ficha de un cliente. */
  onAbrirCliente: (id: string) => void;
  /** Iniciar creación de cliente. */
  onCrearCliente: () => void;
};

/** Genera un ID único simple. */
const uid = () => Math.random().toString(36).slice(2);

/**
 * Asistente IA flotante de Madera Creativa.
 * Procesa lenguaje natural y ejecuta acciones dentro de la app.
 */
export function AsistenteIA({
  contexto, clientes, onNavegar, onAbrirCliente, onCrearCliente,
  sinFab, abiertoProp, onCambiarAbierto,
}: AsistenteIAProps) {
  const [abiertoInterno, setAbiertoInterno] = useState(false);
  const abierto = abiertoProp !== undefined ? abiertoProp : abiertoInterno;
  const setAbierto = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(abierto) : v;
    setAbiertoInterno(next);
    onCambiarAbierto?.(next);
  };
  const [mensajes, setMensajes] = useState<Mensaje[]>([
    {
      id: uid(),
      rol: 'asistente',
      texto: '¡Hola! Soy tu asistente de Madera Creativa. Puedo abrir clientes, buscar proyectos, decirte el beneficio del mes o cualquier cosa que necesites. ¿En qué te ayudo?',
    },
  ]);
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  // OpenAI suele responder en pocos segundos, pero una pregunta con varias
  // llamadas a herramientas encadenadas, o una red lenta, puede tardar más
  // — sin ningún aviso, esa espera se percibe como que la IA "se ha
  // quedado colgada" aunque esté trabajando de verdad. Pasados unos
  // segundos se muestra un aviso explícito de que sigue en marcha.
  const [esperaLarga, setEsperaLarga] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-scroll al último mensaje
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  // Focus al abrir
  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 100);
  }, [abierto]);

  /** Ejecuta una acción de interfaz devuelta por el núcleo de IA (`POST /ia/generar`). */
  const ejecutarAccion = (accion: AccionInterfazIA) => {
    const args = accion.argumentos;
    switch (accion.nombre) {
      case 'navegarSeccion':
        if (typeof args.seccion === 'string') onNavegar(args.seccion as any);
        break;
      case 'abrirCliente':
        if (typeof args.clienteId === 'string' && args.clienteId) {
          onAbrirCliente(args.clienteId);
        } else if (typeof args.clienteNombre === 'string' && args.clienteNombre) {
          const termino = args.clienteNombre.toLowerCase();
          const encontrado = clientes.find(c => c.nombre.toLowerCase().includes(termino));
          if (encontrado) onAbrirCliente(encontrado.id);
        }
        break;
      case 'crearCliente':
        onCrearCliente();
        break;
      case 'abrirFacturas':
        onNavegar('facturas');
        break;
      case 'buscarCliente':
        onNavegar('clientes');
        break;
    }
  };

  /** Envía un mensaje al asistente. */
  const enviar = async (texto?: string) => {
    const pregunta = (texto ?? input).trim();
    if (!pregunta || cargando) return;
    setInput('');

    const msgUsuario: Mensaje = { id: uid(), rol: 'usuario', texto: pregunta };
    const msgCargando: Mensaje = { id: uid(), rol: 'asistente', texto: '', cargando: true };

    setMensajes(prev => [...prev, msgUsuario, msgCargando]);
    setCargando(true);
    setEsperaLarga(false);
    const avisoEspera = setTimeout(() => setEsperaLarga(true), 8000);

    try {
      const historial: MensajeChat[] = [...mensajes, msgUsuario]
        .filter(m => !m.cargando)
        .slice(-10)
        .map(m => ({ role: (m.rol === 'usuario' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.texto }));

      const data = await generarRespuestaIA({ capacidad: 'asistente-global', mensajes: historial, referencias: contexto });
      const primeraPropuesta = data.propuestas[0];
      // Antes solo se comprobaba `respuesta`/`propuestas` — cuando la IA
      // resuelve la petición con una simple navegación (p. ej. "abre
      // facturas", "llévame a notas"), no genera texto ni propuesta
      // alguna, solo una acción de interfaz — y el chat mostraba "No pude
      // procesar tu solicitud" aunque SÍ la hubiera entendido y fuera a
      // hacerlo un instante después.
      const raw = data.respuesta
        || (primeraPropuesta ? 'Antes de hacerlo, confírmamelo:' : null)
        || (data.accionesInterfaz.length ? 'Hecho, un momento…' : 'No pude procesar tu solicitud.');

      setMensajes(prev => prev.map(m =>
        m.cargando
          ? {
              ...m, texto: raw, cargando: false,
              propuesta: primeraPropuesta
                ? { id: primeraPropuesta.id, nombre: primeraPropuesta.nombre, argumentos: primeraPropuesta.argumentos, historial, estado: 'pendiente' }
                : undefined,
            }
          : m
      ));

      for (const accion of data.accionesInterfaz) {
        setTimeout(() => ejecutarAccion(accion), 400);
      }
    } catch (err) {
      // Antes siempre decía "comprueba tu conexión a internet" incluso
      // cuando el problema real era que el modelo local había tardado
      // demasiado (o había fallado por otro motivo) — un mensaje engañoso
      // que no ayuda nada a diagnosticar qué ha pasado de verdad.
      const mensaje = err instanceof Error && err.message
        ? err.message
        : 'No se pudo contactar con el servicio de IA. Comprueba tu conexión.';
      setMensajes(prev => prev.map(m =>
        m.cargando ? { ...m, texto: mensaje, cargando: false } : m
      ));
    } finally {
      clearTimeout(avisoEspera);
      setEsperaLarga(false);
      setCargando(false);
    }
  };

  /** Confirma una propuesta de escritura pendiente — ejecuta la acción real y muestra la respuesta redactada por la IA con el resultado real. */
  const confirmarPropuesta = async (msgId: string) => {
    const msg = mensajes.find(m => m.id === msgId);
    if (!msg?.propuesta || msg.propuesta.estado !== 'pendiente') return;
    const propuesta = msg.propuesta;

    setMensajes(prev => prev.map(m => m.id === msgId ? { ...m, propuesta: { ...propuesta, estado: 'confirmando' } } : m));

    try {
      const { resultado, respuestaFinal } = await confirmarPropuestaIA({
        capacidad: 'asistente-global',
        nombre: propuesta.nombre,
        argumentos: propuesta.argumentos,
        mensajesPrevios: propuesta.historial,
        referencias: contexto,
        toolCallId: propuesta.id,
      });
      // Navegación determinista tras una escritura confirmada — no se deja
      // a que el modelo "decida" llamar a otra herramienta para esto (no es
      // fiable turno a turno): el usuario pidió expresamente que, al crear
      // una nota, se le lleve directamente a verla, no solo confirmársela
      // por texto en el chat.
      if (propuesta.nombre === 'crearNota') {
        setTimeout(() => onNavegar('notas'), 500);
      }
      const textoFinal = respuestaFinal?.respuesta || `Hecho. ${JSON.stringify(resultado)}`;
      setMensajes(prev => [
        ...prev.map(m => m.id === msgId ? { ...m, propuesta: { ...propuesta, estado: 'confirmada' as const } } : m),
        { id: uid(), rol: 'asistente' as const, texto: textoFinal },
      ]);
    } catch (err) {
      const errorTexto = err instanceof Error && err.message ? err.message : undefined;
      setMensajes(prev => prev.map(m => m.id === msgId ? { ...m, propuesta: { ...propuesta, estado: 'error' as const, errorTexto } } : m));
    }
  };

  /** Activa reconocimiento de voz. */
  const toggleVoz = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Tu navegador no soporta reconocimiento de voz.');
      return;
    }
    if (escuchando) {
      recognitionRef.current?.stop();
      setEscuchando(false);
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'es-ES';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setEscuchando(false);
      enviar(transcript);
    };
    rec.onerror = () => setEscuchando(false);
    rec.onend = () => setEscuchando(false);
    rec.start();
    recognitionRef.current = rec;
    setEscuchando(true);
  };

  // Sugerencias rápidas
  const sugerencias = [
    '¿Cuánto beneficio llevo este mes?',
    'Muéstrame los clientes',
    'Crea un nuevo cliente',
    '¿Qué proyectos están en curso?',
  ];

  return (
    <>
      {/* Botón flotante — solo si no usa sinFab */}
      {!sinFab && <button
        className={`${styles.fab} ${abierto ? styles.fabAbierto : ''}`}
        onClick={() => setAbierto(v => !v)}
        title="Asistente IA"
        aria-label="Abrir asistente inteligente"
      >
        {abierto ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            <circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="12" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/>
          </svg>
        )}
      </button>}

      {/* Panel del chat */}
      {abierto && (
        <div className={styles.panel}>
          {/* Cabecera */}
          <div className={styles.cabecera}>
            <div className={styles.cabeceraInfo}>
              <div className={styles.avatar}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><circle cx="9" cy="10" r="1" fill="currentColor" /><circle cx="12" cy="10" r="1" fill="currentColor" /><circle cx="15" cy="10" r="1" fill="currentColor" /></svg>
              </div>
              <div>
                <p className={styles.cabeceraTitle}>Asistente Madera</p>
                <p className={styles.cabeceraStatus}>
                  <span className={styles.dot} /> En línea
                </p>
              </div>
            </div>
            <button className={styles.btnCerrar} onClick={() => setAbierto(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Mensajes */}
          <div className={styles.mensajes}>
            {mensajes.map(m => (
              <div key={m.id} className={`${styles.msg} ${m.rol === 'usuario' ? styles.msgUsuario : styles.msgAsistente}`}>
                {m.cargando ? (
                  <>
                    <span className={styles.typing}>
                      <span /><span /><span />
                    </span>
                    {esperaLarga && (
                      <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: 'var(--topo-claro)' }}>
                        Está tardando más de lo normal, pero sigue trabajando — no se ha quedado colgada.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className={styles.msgTexto}>{m.texto}</p>
                    {m.propuesta && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {m.propuesta.estado === 'pendiente' && (
                          <button
                            onClick={() => confirmarPropuesta(m.id)}
                            style={{
                              background: 'var(--verde)', color: 'var(--blanco)', border: 'none',
                              borderRadius: 6, padding: '0.4rem 0.9rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            Confirmar
                          </button>
                        )}
                        {m.propuesta.estado === 'confirmando' && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--topo-claro)' }}>Ejecutando…</span>
                        )}
                        {m.propuesta.estado === 'confirmada' && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--verde)', fontWeight: 700 }}>✓ Confirmado</span>
                        )}
                        {m.propuesta.estado === 'error' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--rojo)' }}>
                              {m.propuesta.errorTexto || 'No se pudo confirmar. Inténtalo de nuevo.'}
                            </span>
                            <button
                              onClick={() => setMensajes(prev => prev.map(x => x.id === m.id && x.propuesta ? { ...x, propuesta: { ...x.propuesta, estado: 'pendiente', errorTexto: undefined } } : x))}
                              style={{
                                background: 'none', border: '1px solid var(--rojo)', color: 'var(--rojo)',
                                borderRadius: 6, padding: '0.25rem 0.7rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                              }}
                            >
                              Reintentar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Sugerencias rápidas — solo al inicio */}
          {mensajes.length <= 1 && (
            <div className={styles.sugerencias}>
              {sugerencias.map(s => (
                <button key={s} className={styles.sugerencia} onClick={() => enviar(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className={styles.inputArea}>
            <button
              className={`${styles.btnVoz} ${escuchando ? styles.btnVozActivo : ''}`}
              onClick={toggleVoz}
              title={escuchando ? 'Detener voz' : 'Hablar'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
            <input
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar()}
              placeholder={escuchando ? 'Escuchando...' : 'Escribe o habla...'}
              disabled={cargando}
            />
            <button
              className={styles.btnEnviar}
              onClick={() => enviar()}
              disabled={!input.trim() || cargando}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
