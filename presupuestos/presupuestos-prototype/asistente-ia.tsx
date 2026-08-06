import { useState, useRef, useEffect } from 'react';
import type { Cliente } from './types.js';
import { fetchConAuth } from './api.js';
import styles from './asistente-ia.module.css';

/** Un mensaje del chat del asistente. */
type Mensaje = {
  id: string;
  rol: 'usuario' | 'asistente';
  texto: string;
  cargando?: boolean;
};

/** Acción parseable que el asistente puede devolver. */
type Accion = {
  action: string;
  seccion?: string;
  clienteId?: string;
  clienteNombre?: string;
  termino?: string;
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
  /** Callback cuando el usuario cierra el panel desde dentro. */
  onCerrar?: () => void;
  /** Contexto actual de la pantalla. */
  contexto: ContextoApp;
  /** Lista de clientes disponibles para navegación. */
  clientes: Cliente[];
  /** Navegar a una sección. */
  onNavegar: (seccion: 'clientes' | 'presupuestos' | 'facturas') => void;
  /** Abrir la ficha de un cliente. */
  onAbrirCliente: (id: string) => void;
  /** Iniciar creación de cliente. */
  onCrearCliente: () => void;
};

/** Genera un ID único simple. */
const uid = () => Math.random().toString(36).slice(2);

/** Extrae la acción JSON del texto de respuesta del asistente. */
function parsearAccion(texto: string): { texto: string; accion: Accion | null } {
  const match = texto.match(/<accion>([\s\S]*?)<\/accion>/);
  if (!match) return { texto, accion: null };
  try {
    const accion = JSON.parse(match[1].trim());
    const textoLimpio = texto.replace(/<accion>[\s\S]*?<\/accion>/, '').trim();
    return { texto: textoLimpio, accion };
  } catch {
    return { texto, accion: null };
  }
}

/**
 * Asistente IA flotante de Madera Creativa.
 * Procesa lenguaje natural y ejecuta acciones dentro de la app.
 */
export function AsistenteIA({
  contexto, clientes, onNavegar, onAbrirCliente, onCrearCliente,
  sinFab, abiertoProp, onCerrar,
}: AsistenteIAProps) {
  const [abiertoInterno, setAbiertoInterno] = useState(false);
  const abierto = abiertoProp !== undefined ? abiertoProp : abiertoInterno;
  const setAbierto = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(abierto) : v;
    setAbiertoInterno(next);
    if (!next) onCerrar?.();
  };
  const [mensajes, setMensajes] = useState<Mensaje[]>([
    {
      id: uid(),
      rol: 'asistente',
      texto: '¡Hola! Soy tu asistente de Madera Creativa 🪚 Puedo abrir clientes, buscar proyectos, decirte el beneficio del mes o cualquier cosa que necesites. ¿En qué te ayudo?',
    },
  ]);
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
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

  /** Ejecuta la acción devuelta por el asistente. */
  const ejecutarAccion = (accion: Accion) => {
    switch (accion.action) {
      case 'navegarSeccion':
        if (accion.seccion) onNavegar(accion.seccion as any);
        break;
      case 'abrirCliente':
        if (accion.clienteId) {
          onAbrirCliente(accion.clienteId);
        } else if (accion.clienteNombre) {
          const encontrado = clientes.find(c =>
            c.nombre.toLowerCase().includes((accion.clienteNombre || '').toLowerCase())
          );
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

    try {
      const historial = [...mensajes, msgUsuario]
        .filter(m => !m.cargando)
        .slice(-10)
        .map(m => ({ role: m.rol === 'usuario' ? 'user' : 'assistant', content: m.texto }));

      const res = await fetchConAuth('/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajes: historial, contexto }),
      });

      const data = await res.json();
      const raw = data.respuesta || 'No pude procesar tu solicitud.';
      const { texto: textoLimpio, accion } = parsearAccion(raw);

      setMensajes(prev => prev.map(m =>
        m.cargando ? { ...m, texto: textoLimpio || raw, cargando: false } : m
      ));

      if (accion) {
        setTimeout(() => ejecutarAccion(accion), 400);
      }
    } catch {
      setMensajes(prev => prev.map(m =>
        m.cargando ? { ...m, texto: 'Error de conexión. Comprueba tu conexión a internet.', cargando: false } : m
      ));
    } finally {
      setCargando(false);
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
              <div className={styles.avatar}>🪚</div>
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
                  <span className={styles.typing}>
                    <span /><span /><span />
                  </span>
                ) : (
                  <p className={styles.msgTexto}>{m.texto}</p>
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
              placeholder={escuchando ? '🎙️ Escuchando...' : 'Escribe o habla...'}
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
