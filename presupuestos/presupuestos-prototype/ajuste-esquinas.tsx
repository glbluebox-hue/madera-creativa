import { useRef, useState } from 'react';
import type { Punto } from './perspectiva.js';
import styles from './styles.module.css';

export type AjusteEsquinasProps = {
  /** Data URL de la imagen capturada, a resolución completa. */
  imagenSrc: string;
  /** Se llama con el data URL ya recortado y con la perspectiva corregida. */
  onConfirmar: (dataUrl: string) => void;
  /** El usuario prefiere usar la foto completa, sin recortar. */
  onOmitir: () => void;
  onCancelar: () => void;
};

const NOMBRES_ESQUINA = ['superior-izquierda', 'superior-derecha', 'inferior-derecha', 'inferior-izquierda'] as const;

/**
 * Paso de "recorte de esquinas" del escáner: el usuario arrastra las 4
 * esquinas del documento sobre la foto capturada, y al confirmar se aplica
 * `corregirPerspectiva` (`perspectiva.ts`) para enderezarlo. Sin detección
 * automática de bordes (no hay ninguna dependencia de visión por
 * computador en la app) — las esquinas parten de una posición inicial con
 * margen, y el usuario las ajusta a ojo, igual que hacen muchos escáneres
 * ligeros que no usan un modelo de detección.
 */
export function AjusteEsquinas({ imagenSrc, onConfirmar, onOmitir, onCancelar }: AjusteEsquinasProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [dimensionesNaturales, setDimensionesNaturales] = useState<{ ancho: number; alto: number } | null>(null);
  // Esquinas como fracción (0-1) del tamaño mostrado de la imagen — se
  // escalan a resolución natural solo al confirmar.
  const [esquinas, setEsquinas] = useState<[Punto, Punto, Punto, Punto]>([
    { x: 0.08, y: 0.06 }, { x: 0.92, y: 0.06 }, { x: 0.92, y: 0.94 }, { x: 0.08, y: 0.94 },
  ]);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [procesando, setProcesando] = useState(false);

  const onImagenCargada = () => {
    if (imgRef.current) {
      setDimensionesNaturales({ ancho: imgRef.current.naturalWidth, alto: imgRef.current.naturalHeight });
    }
  };

  const posicionDesdeEvento = (e: { clientX: number; clientY: number }): Punto | null => {
    const rect = contenedorRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const iniciarArrastre = (indice: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setArrastrando(indice);
  };

  const mover = (e: React.PointerEvent) => {
    if (arrastrando === null) return;
    const p = posicionDesdeEvento(e);
    if (!p) return;
    setEsquinas((prev) => {
      const siguiente = [...prev] as [Punto, Punto, Punto, Punto];
      siguiente[arrastrando] = p;
      return siguiente;
    });
  };

  const soltar = () => setArrastrando(null);

  const confirmar = async () => {
    if (!dimensionesNaturales || !imgRef.current) return;
    setProcesando(true);
    try {
      const { corregirPerspectiva, tamanoDestinoDesdeEsquinas } = await import('./perspectiva.js');
      const canvasOrigen = document.createElement('canvas');
      canvasOrigen.width = dimensionesNaturales.ancho;
      canvasOrigen.height = dimensionesNaturales.alto;
      canvasOrigen.getContext('2d')!.drawImage(imgRef.current, 0, 0);

      const esquinasNaturales = esquinas.map((p) => ({ x: p.x * dimensionesNaturales.ancho, y: p.y * dimensionesNaturales.alto })) as [Punto, Punto, Punto, Punto];
      const { ancho, alto } = tamanoDestinoDesdeEsquinas(esquinasNaturales);
      const canvasCorregido = corregirPerspectiva(canvasOrigen, esquinasNaturales, ancho, alto);
      const dataUrl = canvasCorregido.toDataURL('image/jpeg', 0.9);
      onConfirmar(dataUrl);
    } finally {
      setProcesando(false);
    }
  };

  // Líneas del cuadrilátero, en porcentaje, para dibujarlas con un SVG superpuesto.
  const puntosSvg = esquinas.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)', lineHeight: 1.5 }}>
        Arrastra las 4 esquinas para ajustarlas a los bordes del documento — la app enderezará la perspectiva automáticamente.
      </p>

      <div
        ref={contenedorRef}
        style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--borde)', touchAction: 'none', background: '#000' }}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      >
        <img ref={imgRef} src={imagenSrc} alt="Documento capturado" onLoad={onImagenCargada}
          style={{ width: '100%', maxHeight: '48dvh', objectFit: 'contain', display: 'block', userSelect: 'none' }} draggable={false} />

        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <polygon points={puntosSvg} fill="rgba(61,122,82,0.18)" stroke="var(--verde)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
        </svg>

        {esquinas.map((p, i) => (
          <div
            key={i}
            onPointerDown={iniciarArrastre(i)}
            title={`Esquina ${NOMBRES_ESQUINA[i]}`}
            style={{
              position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`,
              width: 26, height: 26, marginLeft: -13, marginTop: -13, borderRadius: '50%',
              background: 'var(--verde)', border: '3px solid var(--blanco)', boxShadow: '0 1px 6px rgba(0,0,0,0.4)',
              cursor: 'grab', touchAction: 'none',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ flex: 1, justifyContent: 'center' }} onClick={onCancelar}>
          Cancelar
        </button>
        <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ flex: 1, justifyContent: 'center' }} onClick={onOmitir}>
          Usar foto completa
        </button>
        <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ flex: 2, justifyContent: 'center' }} onClick={confirmar} disabled={procesando || !dimensionesNaturales}>
          {procesando ? 'Enderezando…' : 'Enderezar y continuar'}
        </button>
      </div>
    </div>
  );
}
