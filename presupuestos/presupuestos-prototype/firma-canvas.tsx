import { useRef, useState } from 'react';
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

  const contexto = () => canvasRef.current?.getContext('2d') ?? null;

  const posicion = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // El canvas se dibuja a resolución real (canvas.width/height, fijados en
    // píxeles de dispositivo) pero se muestra escalado por CSS — sin este
    // factor, el trazo no coincide con la posición real del dedo/ratón en
    // pantallas de alta densidad o cuando el canvas se encoge por CSS.
    const escalaX = canvas.width / rect.width;
    const escalaY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * escalaX, y: (e.clientY - rect.top) * escalaY };
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
