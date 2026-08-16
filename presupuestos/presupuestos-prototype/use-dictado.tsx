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
  /**
   * `true` brevemente justo después de detener el dictado, si se transcribió
   * algo — para mostrar "Transcripción completada" (se apaga solo).
   */
  completado: boolean;
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
  const [completado, setCompletado] = useState(false);
  const huboTextoRef = useRef(false);
  // `true` mientras el usuario quiere seguir dictando (pulsó "Hablar" y no
  // ha pulsado "Detener" todavía) — independiente de que la sesión nativa
  // de reconocimiento en curso siga viva o no, ver `iniciarSesion`.
  const siguiendoRef = useRef(false);
  // Freno de seguridad: si una sesión termina casi al instante (sin nada
  // que reconocer) muchas veces seguidas, encadenar la siguiente sin
  // límite podría convertirse en un bucle muy rápido reiniciando el
  // reconocimiento sin parar — no debería pasar en uso normal (una pausa
  // real sin hablar tarda segundos en expirar, no milisegundos), pero es
  // una red de seguridad barata contra un comportamiento inesperado del
  // navegador. Un silencio normal entre frases reinicia el contador.
  const sesionesRapidasSeguidasRef = useRef(0);
  const inicioSesionRef = useRef(0);
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

  /**
   * Arranca UNA sesión de reconocimiento con `continuous: false` — la
   * misma configuración que ya usa el asistente IA de la app (nunca ha
   * tenido este problema) y que la propia especificación documenta como la
   * forma fiable de leer resultados: con `continuous:false`, la sesión
   * termina sola tras la primera frase reconocida, así que `results` nunca
   * llega a acumular más de un resultado — no hay ninguna lista creciente
   * que interpretar ni ningún índice que pueda fallar.
   *
   * Antes se usaba `continuous:true` con una sola sesión larga, leyendo
   * `resultIndex` para saber qué resultados eran nuevos — funcionaba en
   * las pruebas de escritorio, pero en un móvil real ese dato no venía
   * bien y el texto se multiplicaba ("vamos vamos vamos a vamos a
   * hacer..."). Encadenar sesiones cortas, en vez de intentar leer bien
   * una sesión larga, elimina el problema de raíz en vez de intentar
   * adivinar el comportamiento de cada navegador/dispositivo.
   *
   * Para que el usuario siga sintiendo que "habla todo lo que quiera sin
   * soltar", cada sesión que termina sola (pausa natural al respirar,
   * fin de frase) arranca automáticamente la siguiente mientras
   * `siguiendoRef` siga activo — solo se detiene overtly cuando el
   * usuario pulsa "Detener".
   */
  const iniciarSesion = useCallback(() => {
    type SRCtor = new () => typeof recRef.current & object;
    type W = Window & { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
    const w = window as W;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { setEstado('no-soportado'); return; }

    inicioSesionRef.current = Date.now();

    const rec = new SR() as NonNullable<typeof recRef.current>;
    rec.lang = 'es-ES';
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = (e: Event) => {
      type SRE = Event & {
        results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } };
      };
      const sre = e as SRE;
      let interinoText = '';
      for (let i = 0; i < sre.results.length; i++) {
        const r = sre.results[i];
        if (r.isFinal) {
          onTexto(r[0].transcript);
          huboTextoRef.current = true;
        } else {
          interinoText += r[0].transcript;
        }
      }
      setInterino(interinoText);
    };

    rec.onend = () => {
      const duracionMs = Date.now() - inicioSesionRef.current;
      sesionesRapidasSeguidasRef.current = duracionMs < 250 ? sesionesRapidasSeguidasRef.current + 1 : 0;

      if (siguiendoRef.current && sesionesRapidasSeguidasRef.current < 5) {
        // El usuario sigue queriendo dictar — la sesión solo terminó por
        // el límite natural de `continuous:false`, se encadena otra.
        iniciarSesion();
        return;
      }
      siguiendoRef.current = false;
      setEstado('inactivo');
      setInterino('');
      if (huboTextoRef.current) {
        setCompletado(true);
        setTimeout(() => setCompletado(false), 2000);
      }
    };
    rec.onerror = (e: Event) => {
      // "no-speech" (silencio prolongado) no es un fallo real — solo
      // termina esta sesión concreta; `onend` se dispara igualmente
      // después y decide si encadenar otra o parar del todo.
      const error = (e as Event & { error?: string }).error;
      if (error === 'no-speech' || error === 'aborted') return;
      siguiendoRef.current = false;
    };

    recRef.current = rec;
    rec.start();
  }, [onTexto]);

  const iniciar = useCallback(() => {
    huboTextoRef.current = false;
    sesionesRapidasSeguidasRef.current = 0;
    setCompletado(false);
    siguiendoRef.current = true;
    setEstado('escuchando');
    iniciarSesion();
  }, [iniciarSesion]);

  const detener = useCallback(() => {
    siguiendoRef.current = false;
    recRef.current?.stop();
    recRef.current = null;
    setEstado('inactivo');
    setInterino('');
  }, []);

  const toggleDictado = useCallback(() => {
    if (estado === 'escuchando') detener();
    else iniciar();
  }, [estado, iniciar, detener]);

  return { estado, toggleDictado, interino, completado };
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
      title={activo ? 'Detener' : 'Hablar'}
      style={{
        background: activo ? 'var(--rojo)' : 'var(--fondo)',
        border: `1.5px solid ${activo ? 'var(--rojo)' : 'var(--borde)'}`,
        borderRadius: 'var(--radio)',
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
