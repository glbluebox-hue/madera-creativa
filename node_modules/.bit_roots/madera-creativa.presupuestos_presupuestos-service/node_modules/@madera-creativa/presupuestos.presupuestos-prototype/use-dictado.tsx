import { useRef, useState, useCallback } from 'react';

/** Estado del dictado de voz. */
export type EstadoDictado = 'inactivo' | 'escuchando' | 'no-soportado';

/** API mínima del hook de dictado. */
export type UseDictadoResult = {
  /** Estado actual del reconocimiento. */
  estado: EstadoDictado;
  /** Inicia o detiene el dictado. */
  toggleDictado: () => void;
  /** Texto interino (lo que está reconociendo ahora, aún no confirmado). */
  interino: string;
};

/**
 * Hook de dictado por voz usando la Web Speech API.
 * Compatible con Chrome, Safari iOS 16+ y Edge.
 *
 * @param onTexto Callback que recibe cada fragmento de texto reconocido.
 */
export function useDictado(onTexto: (texto: string) => void): UseDictadoResult {
  const [estado, setEstado] = useState<EstadoDictado>(() => {
    type W = Window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const w = window as W;
    return w.SpeechRecognition || w.webkitSpeechRecognition ? 'inactivo' : 'no-soportado';
  });
  const [interino, setInterino] = useState('');
  const recRef = useRef<null | {
    start: () => void;
    stop: () => void;
    abort: () => void;
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: ((e: Event) => void) | null;
    onerror: ((e: Event) => void) | null;
    onend: (() => void) | null;
  }>(null);

  const iniciar = useCallback(() => {
    type SRCtor = new () => typeof recRef.current & object;
    type W = Window & { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
    const w = window as W;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { setEstado('no-soportado'); return; }

    const rec = new SR() as NonNullable<typeof recRef.current>;
    rec.lang = 'es-ES';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e: Event) => {
      type SRE = Event & { results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } } };
      const sre = e as SRE;
      let finalText = '';
      let interinoText = '';
      for (let i = 0; i < sre.results.length; i++) {
        const r = sre.results[i];
        if (r.isFinal) {
          finalText += r[0].transcript;
        } else {
          interinoText += r[0].transcript;
        }
      }
      if (finalText) {
        onTexto(finalText);
        setInterino('');
      } else {
        setInterino(interinoText);
      }
    };

    rec.onerror = () => { setEstado('inactivo'); setInterino(''); };
    rec.onend = () => { setEstado('inactivo'); setInterino(''); };

    recRef.current = rec;
    rec.start();
    setEstado('escuchando');
  }, [onTexto]);

  const detener = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setEstado('inactivo');
    setInterino('');
  }, []);

  const toggleDictado = useCallback(() => {
    if (estado === 'escuchando') detener();
    else iniciar();
  }, [estado, iniciar, detener]);

  return { estado, toggleDictado, interino };
}

/** Botón de micrófono reutilizable con animación de onda cuando escucha. */
export function BtnMicrofono({
  estado,
  onClick,
  style,
}: {
  estado: EstadoDictado;
  onClick: () => void;
  style?: React.CSSProperties;
}) {
  if (estado === 'no-soportado') return null;
  const activo = estado === 'escuchando';

  return (
    <button
      onClick={onClick}
      title={activo ? 'Detener dictado' : 'Dictar por voz'}
      style={{
        background: activo ? '#c0392b' : 'var(--fondo)',
        border: `1.5px solid ${activo ? '#c0392b' : 'var(--borde)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 0.15s, border-color 0.15s',
        boxShadow: activo ? '0 0 0 3px rgba(192,57,43,0.25)' : 'none',
        ...style,
      }}
    >
      {activo ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <rect x="2" y="9" width="2" height="6" rx="1">
            <animate attributeName="height" values="4;14;4" dur="0.8s" repeatCount="indefinite" begin="0s"/>
            <animate attributeName="y" values="10;5;10" dur="0.8s" repeatCount="indefinite" begin="0s"/>
          </rect>
          <rect x="6" y="6" width="2" height="12" rx="1">
            <animate attributeName="height" values="8;18;8" dur="0.8s" repeatCount="indefinite" begin="0.15s"/>
            <animate attributeName="y" values="8;3;8" dur="0.8s" repeatCount="indefinite" begin="0.15s"/>
          </rect>
          <rect x="10" y="4" width="2" height="16" rx="1">
            <animate attributeName="height" values="12;20;12" dur="0.8s" repeatCount="indefinite" begin="0.3s"/>
            <animate attributeName="y" values="6;2;6" dur="0.8s" repeatCount="indefinite" begin="0.3s"/>
          </rect>
          <rect x="14" y="6" width="2" height="12" rx="1">
            <animate attributeName="height" values="8;18;8" dur="0.8s" repeatCount="indefinite" begin="0.15s"/>
            <animate attributeName="y" values="8;3;8" dur="0.8s" repeatCount="indefinite" begin="0.15s"/>
          </rect>
          <rect x="18" y="9" width="2" height="6" rx="1">
            <animate attributeName="height" values="4;14;4" dur="0.8s" repeatCount="indefinite" begin="0s"/>
            <animate attributeName="y" values="10;5;10" dur="0.8s" repeatCount="indefinite" begin="0s"/>
          </rect>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--topo)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      )}
    </button>
  );
}
