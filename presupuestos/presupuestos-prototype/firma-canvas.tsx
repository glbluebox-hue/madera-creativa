import { useRef, useState, useLayoutEffect } from 'react';
import styles from './styles.module.css';

/** Props del panel de captura de firma. */
export type FirmaCanvasProps = {
  /** Se llama con la firma como PNG en base64 (`data:image/png;base64,...`) al confirmar. */
  onFirmar: (firmaDataUrl: string) => void;
  /** Cancela sin firmar. */
  onCancelar: () => void;
  /** true mientras se envía la firma al servidor (deshabilita los botones). */
  enviando?: boolean;
};

/**
 * Panel de firma a mano — un `<canvas>` simple con eventos de puntero
 * (funciona igual con dedo, lápiz óptico o ratón, sin depender de ninguna
 * librería). Deliberadamente sin más funciones (deshacer trazo a trazo,
 * grosor variable): es una firma de aceptación, no un editor de dibujo.
 */
export function FirmaCanvas({ onFirmar, onCancelar, enviando }: FirmaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dibujandoRef = useRef(false);
  const [haFirmado, setHaFirmado] = useState(false);

  /**
   * Ajusta la resolución REAL del canvas a los píxeles físicos de la
   * pantalla — corrección 24/08/2026 (reportado: "firma pixelada"). Antes
   * el canvas dibujaba siempre a 600×280 píxeles fijos y el navegador
   * estiraba ese raster para rellenar el ancho real (`width:'100%'`, casi
   * siempre bastante mayor a 600px) y la densidad real de la pantalla
   * (2x/3x en la mayoría de móviles y portátiles modernos, donde además se
   * firma más a menudo que en un monitor de escritorio) — el trazo salía
   * borroso. `useLayoutEffect` (antes de pintar, sin parpadeo) mide el
   * tamaño real en CSS y fija el buffer del canvas a `tamaño × devicePixelRatio`,
   * con el contexto escalado para poder seguir dibujando en coordenadas
   * CSS normales.
   */
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.getContext('2d')?.scale(dpr, dpr);
  }, []);

  const contexto = () => canvasRef.current?.getContext('2d') ?? null;

  const posicion = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // El contexto ya está escalado a `devicePixelRatio` (ver el efecto de
    // arriba) — las coordenadas de dibujo van en píxeles CSS normales, sin
    // ningún factor de escala adicional aquí.
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const ctx = contexto();
    if (!ctx) return;
    dibujandoRef.current = true;
    const { x, y } = posicion(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const trazar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujandoRef.current) return;
    e.preventDefault();
    const ctx = contexto();
    if (!ctx) return;
    const { x, y } = posicion(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#2b2620';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (!haFirmado) setHaFirmado(true);
  };

  const terminar = () => { dibujandoRef.current = false; };

  const borrar = () => {
    const canvas = canvasRef.current;
    const ctx = contexto();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHaFirmado(false);
  };

  const confirmar = () => {
    const canvas = canvasRef.current;
    if (!canvas || !haFirmado) return;
    onFirmar(canvas.toDataURL('image/png'));
  };

  return (
    <div>
      <p style={{ margin: '0 0 0.6rem', fontSize: '0.85rem', color: 'var(--topo-claro)' }}>
        Firma con el dedo o el ratón para aceptar el presupuesto.
      </p>
      <canvas
        ref={canvasRef}
        width={600}
        height={280}
        style={{
          width: '100%',
          height: '200px',
          touchAction: 'none',
          background: 'var(--blanco)',
          border: '2px dashed var(--borde)',
          borderRadius: '10px',
          cursor: 'crosshair',
        }}
        onPointerDown={empezar}
        onPointerMove={trazar}
        onPointerUp={terminar}
        onPointerLeave={terminar}
      />
      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.75rem' }}>
        <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={borrar} disabled={enviando} style={{ flex: 1 }}>
          Borrar
        </button>
        <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCancelar} disabled={enviando} style={{ flex: 1 }}>
          Cancelar
        </button>
        <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={confirmar} disabled={!haFirmado || enviando} style={{ flex: 2 }}>
          {enviando ? 'Enviando…' : 'Firmar y aceptar'}
        </button>
      </div>
    </div>
  );
}
