import { useRef, useState, useEffect, useCallback } from 'react';
import styles from './styles.module.css';

/** Herramienta de dibujo activa. */
type Herramienta = 'lapiz' | 'linea' | 'borrador' | 'texto';

/** Un dibujo guardado en la ficha del cliente. */
export type DibujoGuardado = {
  id: string;
  nombre: string;
  dataUrl: string;
  fecha: string;
};

/** Props de la pizarra. */
export type PizarraMedidasProps = {
  dibujos?: DibujoGuardado[];
  onGuardar?: (dibujo: DibujoGuardado) => void;
};

type Anotacion = { id: string; x: number; y: number; texto: string };

// Escala referencia: 1 px CSS ≈ 0.05 cm (ajustable)
const CM_POR_PX = 0.05;
// Espaciado del grid de puntos en px CSS (se escala internamente con DPR)
const ESPACIADO_PUNTOS = 28;

/**
 * Dibuja el fondo de puntos de alta calidad usando DPR para nitidez total.
 * El ctx ya tiene el transform del DPR aplicado — dibujamos en coordenadas CSS.
 */
function dibujarFondo(ctx: CanvasRenderingContext2D, wCSS: number, hCSS: number) {
  ctx.fillStyle = '#f8f7f4';
  ctx.fillRect(0, 0, wCSS, hCSS);

  // Puntos perfectos — radio en px CSS, DPR escala via transform
  ctx.fillStyle = 'rgba(160, 148, 132, 0.7)';
  for (let x = ESPACIADO_PUNTOS; x < wCSS; x += ESPACIADO_PUNTOS) {
    for (let y = ESPACIADO_PUNTOS; y < hCSS; y += ESPACIADO_PUNTOS) {
      ctx.beginPath();
      ctx.arc(x, y, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Marca de agua mínima
  ctx.save();
  ctx.font = '500 10px -apple-system, Inter, Helvetica, sans-serif';
  ctx.fillStyle = 'rgba(150, 138, 124, 0.4)';
  ctx.textAlign = 'right';
  ctx.fillText('MADERA CREATIVA', wCSS - 14, hCSS - 12);
  ctx.restore();
}

function calcularCota(pxCSS: number, unidad: 'mm' | 'cm'): string {
  return unidad === 'cm'
    ? `${(pxCSS * CM_POR_PX).toFixed(1)} cm`
    : `${Math.round(pxCSS * CM_POR_PX * 10)} mm`;
}

/**
 * Dibuja una línea con cotas de arquitectura — flechas, líneas de extensión y medida.
 * Trabaja en coordenadas CSS (el ctx tiene el DPR transform).
 */
function dibujarLineaConCota(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  color: string, grosor: number, unidad: 'mm' | 'cm',
) {
  const dx = x2 - x1; const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 4) return;
  const ux = dx / len; const uy = dy / len;
  const pxN = -uy; const pyN = ux;

  // Línea principal
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = color; ctx.lineWidth = grosor; ctx.lineCap = 'round'; ctx.stroke();

  // Flechas
  const tam = Math.max(7, grosor * 3.5);
  const flecha = (bx: number, by: number, dX: number, dY: number) => {
    ctx.save(); ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - dX * tam + pxN * tam * 0.32, by - dY * tam + pyN * tam * 0.32);
    ctx.lineTo(bx - dX * tam - pxN * tam * 0.32, by - dY * tam - pyN * tam * 0.32);
    ctx.closePath(); ctx.fill(); ctx.restore();
  };
  flecha(x1, y1, -ux, -uy); flecha(x2, y2, ux, uy);

  // Líneas de extensión
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 0.8;
  ctx.setLineDash([3, 3]); ctx.globalAlpha = 0.45;
  const ext = 9;
  ctx.beginPath(); ctx.moveTo(x1 + pxN * ext, y1 + pyN * ext); ctx.lineTo(x1 - pxN * ext, y1 - pyN * ext); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2 + pxN * ext, y2 + pyN * ext); ctx.lineTo(x2 - pxN * ext, y2 - pyN * ext); ctx.stroke();
  ctx.restore();

  // Etiqueta de cota
  const cx = (x1 + x2) / 2; const cy = (y1 + y2) / 2;
  const angulo = Math.atan2(dy, dx);
  const texto = calcularCota(len, unidad);
  const fs = Math.max(11, grosor * 3.5);
  ctx.save(); ctx.translate(cx, cy);
  const rot = angulo > Math.PI / 2 || angulo < -Math.PI / 2 ? angulo + Math.PI : angulo;
  ctx.rotate(rot);
  ctx.font = `600 ${fs}px -apple-system, Inter, Helvetica, sans-serif`;
  const tw = ctx.measureText(texto).width; const p = 5;
  ctx.fillStyle = 'rgba(248,247,244,0.95)';
  ctx.beginPath(); ctx.roundRect(-(tw / 2) - p, -(fs / 2) - 3, tw + p * 2, fs + 6, 3); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 0.7; ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(texto, 0, 0); ctx.restore();
}

/**
 * Pizarra de medidas de alta calidad (DPR-aware).
 * - Solo interactiva en modo pantalla completa.
 * - En modo normal muestra un preview bloqueado con overlay.
 * - Calidad Retina: canvas interno escalado por window.devicePixelRatio.
 */
export function PizarraMedidas({ dibujos = [], onGuardar }: PizarraMedidasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [herramienta, setHerramienta] = useState<Herramienta>('lapiz');
  const [color, setColor] = useState('#3a342c');
  const [grosor, setGrosor] = useState(1.5);
  const [dibujando, setDibujando] = useState(false);
  const [anotaciones, setAnotaciones] = useState<Anotacion[]>([]);
  const [nuevaAnotacion, setNuevaAnotacion] = useState<{ x: number; y: number } | null>(null);
  const [textoTemp, setTextoTemp] = useState('');
  const [cotasActivas, setCotasActivas] = useState(true);
  const [unidad, setUnidad] = useState<'mm' | 'cm'>('mm');
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [nombreDibujo, setNombreDibujo] = useState('Medidas sin título');
  const [dibujoEditandoId, setDibujoEditandoId] = useState<string | null>(null);
  const [modalGuardar, setModalGuardar] = useState(false);
  const [modalDibujos, setModalDibujos] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [canvasCSS, setCanvasCSS] = useState({ w: 0, h: 0 });
  const [paletaAbierta, setPaletaAbierta] = useState(false);
  const [hojaActivaId, setHojaActivaId] = useState<string | null>(null);

  const lineaOrigen = useRef<{ x: number; y: number } | null>(null);
  const snapshotLinea = useRef<ImageData | null>(null);
  const historial = useRef<ImageData[]>([]);
  const fondoIniciado = useRef(false);
  type RecAPI = { start: () => void; stop: () => void; lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: Event) => void) | null; onerror: ((e: Event) => void) | null };
  const reconocimiento = useRef<RecAPI | null>(null);

  /**
   * Obtiene el contexto 2D ya escalado por DPR.
   * El canvas.width/height son físicos; el ctx tiene scale(DPR, DPR) aplicado
   * para que todo el código dibuje en coordenadas CSS.
   */
  const getDPRCtx = useCallback((): { ctx: CanvasRenderingContext2D; wCSS: number; hCSS: number; dpr: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const dpr = window.devicePixelRatio || 1;
    const wCSS = canvas.width / dpr;
    const hCSS = canvas.height / dpr;
    return { ctx, wCSS, hCSS, dpr };
  }, []);

  /**
   * Inicializa (o redimensiona) el canvas con DPR correcto.
   * Preserva el dibujo anterior escalándolo al nuevo tamaño.
   */
  const inicializarCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const contenedor = contenedorRef.current;
    if (!canvas || !contenedor) return;

    const rect = contenedor.getBoundingClientRect();
    const wCSS = Math.floor(rect.width) || 900;
    const hCSS = Math.floor(rect.height) || 600;
    const dpr = window.devicePixelRatio || 1;
    const wPhys = Math.round(wCSS * dpr);
    const hPhys = Math.round(hCSS * dpr);

    // Guardar imagen antes de cambiar tamaño
    let prevImg: HTMLImageElement | null = null;
    if (fondoIniciado.current && (canvas.width !== wPhys || canvas.height !== hPhys)) {
      const dataUrl = canvas.toDataURL('image/png');
      prevImg = new Image();
      prevImg.src = dataUrl;
    }

    // Ajustar canvas físico
    canvas.width = wPhys;
    canvas.height = hPhys;
    // Ajustar CSS (display size)
    canvas.style.width = `${wCSS}px`;
    canvas.style.height = `${hCSS}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Escalar el contexto para trabajar siempre en coordenadas CSS
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Dibujar fondo y restaurar dibujo previo
    dibujarFondo(ctx, wCSS, hCSS);
    if (prevImg) {
      prevImg.onload = () => {
        ctx.save();
        // Dibujar la imagen previa en coordenadas CSS sobre el fondo
        ctx.drawImage(prevImg!, 0, 0, wCSS, hCSS);
        ctx.restore();
      };
    }

    setCanvasCSS({ w: wCSS, h: hCSS });
    fondoIniciado.current = true;
    historial.current = []; // El historial se invalida al cambiar tamaño
  }, []);

  // Inicializar al montar
  useEffect(() => {
    const id = requestAnimationFrame(inicializarCanvas);
    return () => cancelAnimationFrame(id);
  }, [inicializarCanvas]);

  // Re-inicializar al entrar/salir de pantalla completa
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(inicializarCanvas); // doble raf para que el DOM se estabilice
    });
    return () => cancelAnimationFrame(id);
  }, [pantallaCompleta, inicializarCanvas]);

  // ResizeObserver — cubre giros de pantalla y splits
  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;
    let rafId = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(inicializarCanvas);
    });
    ro.observe(contenedor);
    return () => { ro.disconnect(); cancelAnimationFrame(rafId); };
  }, [inicializarCanvas]);

  // Ctrl+Z
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); deshacer(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Fullscreen API sync
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setPantallaCompleta(false); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Reconocimiento de voz
  useEffect(() => {
    type SpeechRecognitionCtor = new () => RecAPI;
    const w = window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'es-ES'; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e: Event) => {
      const sre = e as Event & { results: { length: number; [i: number]: { [j: number]: { transcript: string } } } };
      const texto = sre.results[sre.results.length - 1][0].transcript.toLowerCase().trim();
      if (texto.includes('guardar') || texto.includes('save')) ejecutarGuardar();
    };
    rec.onerror = () => {};
    reconocimiento.current = rec;
  }, []);

  const togglePantallaCompleta = () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setPantallaCompleta(true)).catch(() => setPantallaCompleta(true));
    } else {
      document.exitFullscreen().then(() => setPantallaCompleta(false)).catch(() => setPantallaCompleta(false));
    }
  };

  const guardarEstado = useCallback(() => {
    const d = getDPRCtx();
    if (!d) return;
    historial.current = [...historial.current.slice(-39), d.ctx.getImageData(0, 0, canvasRef.current!.width, canvasRef.current!.height)];
  }, [getDPRCtx]);

  const deshacer = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || historial.current.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.putImageData(historial.current[historial.current.length - 1], 0, 0);
    historial.current = historial.current.slice(0, -1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  const ejecutarGuardar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onGuardar) return;
    const d = getDPRCtx();
    if (d) {
      anotaciones.forEach(a => {
        d.ctx.font = 'bold 13px -apple-system, Inter, sans-serif';
        d.ctx.fillStyle = '#3a342c';
        d.ctx.fillText(a.texto, a.x, a.y);
      });
      setAnotaciones([]);
    }
    const dataUrl = canvas.toDataURL('image/png');
    const dibujo: DibujoGuardado = {
      id: dibujoEditandoId ?? Date.now().toString(),
      nombre: nombreDibujo,
      dataUrl,
      fecha: new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }),
    };
    onGuardar(dibujo);
    setDibujoEditandoId(dibujo.id);
    setGuardadoOk(true);
    setModalGuardar(false);
    setTimeout(() => setGuardadoOk(false), 3000);
  }, [anotaciones, nombreDibujo, dibujoEditandoId, onGuardar, getDPRCtx]);

  const cargarDibujo = (d: DibujoGuardado) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform para drawImage físico
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      historial.current = [];
    };
    img.src = d.dataUrl;
    setNombreDibujo(d.nombre);
    setDibujoEditandoId(d.id);
    setHojaActivaId(d.id);
    setModalDibujos(false);
    setAnotaciones([]);
  };

  /** Guarda la hoja actual y abre una nueva en blanco. */
  const nuevaHoja = () => {
    const canvas = canvasRef.current;
    if (canvas && onGuardar) {
      const d = getDPRCtx();
      if (d) {
        anotaciones.forEach(a => {
          d.ctx.font = 'bold 13px -apple-system, Inter, sans-serif';
          d.ctx.fillStyle = '#3a342c';
          d.ctx.fillText(a.texto, a.x, a.y);
        });
      }
      const dataUrl = canvas.toDataURL('image/png');
      const dibujoActual: DibujoGuardado = {
        id: dibujoEditandoId ?? Date.now().toString(),
        nombre: nombreDibujo || `Hoja ${dibujos.length + 1}`,
        dataUrl,
        fecha: new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }),
      };
      onGuardar(dibujoActual);
    }
    const numeroHoja = dibujos.length + 2;
    setNombreDibujo(`Hoja ${numeroHoja}`);
    setDibujoEditandoId(null);
    setHojaActivaId(null);
    setAnotaciones([]);
    historial.current = [];
    const dCtx = getDPRCtx();
    if (dCtx) dibujarFondo(dCtx.ctx, dCtx.wCSS, dCtx.hCSS);
    setGuardadoOk(false);
  };

  /**
   * Convierte coordenadas de evento (clientX/Y) a coordenadas CSS del canvas.
   */
  const getPosicion = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    // rect.width == CSS width, canvas.width == physical width — ratio == DPR
    const scaleX = rect.width / rect.width; // always 1 — we work in CSS coords
    const scaleY = rect.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const iniciarTrazo = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!pantallaCompleta) return; // Bloqueado fuera de pantalla completa
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (herramienta === 'texto') {
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      setNuevaAnotacion({ x: clientX - rect.left, y: clientY - rect.top }); setTextoTemp(''); return;
    }
    const d = getDPRCtx();
    if (!d) return;
    guardarEstado();
    const pos = getPosicion(e, canvas);
    if (herramienta === 'linea') {
      snapshotLinea.current = d.ctx.getImageData(0, 0, canvas.width, canvas.height);
      lineaOrigen.current = pos;
    } else {
      d.ctx.beginPath(); d.ctx.moveTo(pos.x, pos.y);
    }
    setDibujando(true);
  }, [pantallaCompleta, herramienta, guardarEstado, getDPRCtx]);

  const dibujar = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!dibujando || !pantallaCompleta) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const d = getDPRCtx();
    if (!d) return;
    const pos = getPosicion(e, canvas);
    if (herramienta === 'linea' && lineaOrigen.current && snapshotLinea.current) {
      const dpr = window.devicePixelRatio || 1;
      d.ctx.putImageData(snapshotLinea.current, 0, 0);
      d.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (cotasActivas) dibujarLineaConCota(d.ctx, lineaOrigen.current.x, lineaOrigen.current.y, pos.x, pos.y, color, grosor, unidad);
      else {
        d.ctx.beginPath(); d.ctx.moveTo(lineaOrigen.current.x, lineaOrigen.current.y);
        d.ctx.lineTo(pos.x, pos.y); d.ctx.strokeStyle = color; d.ctx.lineWidth = grosor; d.ctx.lineCap = 'round'; d.ctx.stroke();
      }
    } else {
      d.ctx.lineTo(pos.x, pos.y);
      d.ctx.strokeStyle = herramienta === 'borrador' ? '#f8f7f4' : color;
      d.ctx.lineWidth = herramienta === 'borrador' ? grosor * 12 : grosor;
      d.ctx.lineCap = 'round'; d.ctx.lineJoin = 'round'; d.ctx.stroke();
    }
  }, [dibujando, pantallaCompleta, herramienta, color, grosor, cotasActivas, unidad, getDPRCtx]);

  const terminarTrazo = useCallback(() => { lineaOrigen.current = null; snapshotLinea.current = null; setDibujando(false); }, []);

  const confirmarTexto = () => {
    if (!textoTemp.trim() || !nuevaAnotacion) return;
    guardarEstado();
    setAnotaciones(prev => [...prev, { id: Date.now().toString(), x: nuevaAnotacion.x, y: nuevaAnotacion.y, texto: textoTemp.trim() }]);
    setNuevaAnotacion(null); setTextoTemp('');
  };

  const limpiarCanvas = () => {
    const d = getDPRCtx();
    if (!d) return;
    guardarEstado(); dibujarFondo(d.ctx, d.wCSS, d.hCSS); setAnotaciones([]);
  };

  const descargar = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const d = getDPRCtx();
    if (d) { anotaciones.forEach(a => { d.ctx.font = 'bold 13px Inter, sans-serif'; d.ctx.fillStyle = '#3a342c'; d.ctx.fillText(a.texto, a.x, a.y); }); setAnotaciones([]); }
    const link = document.createElement('a');
    link.download = `${nombreDibujo}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const coloresPaleta = ['#3a342c', '#8b5e34', '#c0392b', '#2e7d4f', '#2c5f8a', '#8e44ad', '#c0860a', '#000000'];
  const puedeDeshacer = historial.current.length > 0;

  // Estilos pantalla completa: wrapper fijo, fondo BLANCO, 90% canvas / 10% toolbar
  const estiloWrapper = pantallaCompleta
    ? { position: 'fixed' as const, inset: 0, zIndex: 9999, background: '#ffffff', display: 'flex', flexDirection: 'column' as const, borderRadius: 0, boxShadow: 'none' }
    : {};

  const estiloToolbar = pantallaCompleta
    ? { flexShrink: 0, background: '#f5f3ef', borderRadius: 0, border: 'none', borderTop: '1px solid #e8e4de', marginBottom: 0, padding: '0.3rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'nowrap' as const, overflowX: 'auto' as const }
    : {};

  const estiloContenedor = pantallaCompleta
    ? { flex: 1, minHeight: 0, border: 'none', borderRadius: 0, background: '#f8f7f4' }
    : {};

  return (
    <div ref={wrapperRef} className={styles.panel} style={estiloWrapper}>

      {/* ── Cabecera — solo visible fuera de pantalla completa ── */}
      {!pantallaCompleta && (
        <div className={styles.panelHeader} style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h3 className={styles.panelTitulo} style={{ margin: 0 }}>📐 Hoja de medidas</h3>
            <input value={nombreDibujo} onChange={e => setNombreDibujo(e.target.value)}
              className={styles.input}
              style={{ width: 170, fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
              placeholder="Nombre del dibujo" />
            {dibujoEditandoId && <span style={{ fontSize: '0.68rem', color: 'var(--topo-muy-claro)' }}>editando</span>}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {dibujos.length > 0 && (
              <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => setModalDibujos(true)}>
                🗂 Mis dibujos ({dibujos.length})
              </button>
            )}
            {onGuardar && (
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => setModalGuardar(true)}>💾 Guardar</button>
            )}
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={descargar}>⬇ PNG</button>
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={togglePantallaCompleta} style={{ fontWeight: 600 }}>
              ⛶ Expandir para dibujar
            </button>
          </div>
        </div>
      )}

      {/* Feedback guardado */}
      {guardadoOk && (
        <div style={{ background: '#3d7a52', color: '#fff', fontSize: '0.78rem', padding: '0.35rem 1rem', textAlign: 'center', flexShrink: 0 }}>
          ✅ Dibujo guardado correctamente en la ficha
        </div>
      )}

      {/* ── Canvas — ocupa 90% en pantalla completa ── */}
      <div
        ref={contenedorRef}
        className={styles.pizarraContenedor}
        style={{
          cursor: pantallaCompleta
            ? (herramienta === 'texto' ? 'text' : herramienta === 'borrador' ? 'cell' : 'crosshair')
            : 'default',
          ...estiloContenedor,
          position: 'relative',
        }}
        onMouseDown={iniciarTrazo} onMouseMove={dibujar} onMouseUp={terminarTrazo} onMouseLeave={terminarTrazo}
        onTouchStart={iniciarTrazo} onTouchMove={dibujar} onTouchEnd={terminarTrazo}
      >
        <canvas
          ref={canvasRef}
          className={styles.pizarraCanvas}
          style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
        />

        {/* Overlay de bloqueo — solo fuera de pantalla completa */}
        {!pantallaCompleta && (
          <div
            onClick={togglePantallaCompleta}
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(248,247,244,0.0)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 10,
            }}
          >
            <div style={{
              background: 'rgba(24,20,12,0.72)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              color: '#f8f7f4',
              borderRadius: 16,
              padding: '1rem 1.75rem',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              <span style={{ fontSize: '1.5rem' }}>⛶</span>
              <span style={{ fontWeight: 600, fontSize: '0.88rem', letterSpacing: '-0.01em' }}>Expandir para dibujar</span>
              <span style={{ fontSize: '0.72rem', opacity: 0.6 }}>Toca para abrir a pantalla completa</span>
            </div>
          </div>
        )}

        {/* Anotaciones de texto */}
        {anotaciones.map(a => (
          <div key={a.id} className={styles.anotacion} style={{ left: a.x, top: a.y }}
            onDoubleClick={() => setAnotaciones(prev => prev.filter(x => x.id !== a.id))}
            title="Doble clic para borrar">{a.texto}</div>
        ))}
        {nuevaAnotacion && (
          <input autoFocus className={styles.anotacionInput} style={{ left: nuevaAnotacion.x, top: nuevaAnotacion.y }}
            value={textoTemp} onChange={e => setTextoTemp(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmarTexto(); if (e.key === 'Escape') setNuevaAnotacion(null); }}
            onBlur={confirmarTexto} placeholder="medida…" />
        )}
      </div>

      {/* ── Toolbar — 10% en pantalla completa, compacta ── */}
      <div className={styles.pizarraToolbar} style={estiloToolbar}>

        <div className={styles.pizarraHerramientas}>
          {([
            { id: 'lapiz', icono: '✏️', label: 'Lápiz libre' },
            { id: 'linea', icono: '╱', label: 'Línea + cota' },
            { id: 'texto', icono: 'T', label: 'Texto' },
            { id: 'borrador', icono: '⬜', label: 'Borrador' },
          ] as { id: Herramienta; icono: string; label: string }[]).map(h => (
            <button key={h.id} title={h.label}
              className={[styles.btnHerramienta, herramienta === h.id ? styles.btnHerramientaActivo : ''].filter(Boolean).join(' ')}
              style={pantallaCompleta ? { color: herramienta === h.id ? '#fff' : '#bbb', background: herramienta === h.id ? '#4a3828' : 'rgba(255,255,255,0.07)', borderColor: 'transparent' } : {}}
              onClick={() => setHerramienta(h.id)}>{h.icono}</button>
          ))}
        </div>

        <span style={{ width: 1, height: 22, background: pantallaCompleta ? '#d8d4ce' : 'var(--borde)', margin: '0 2px', flexShrink: 0 }} />

        <button title="Deshacer (Ctrl+Z)" disabled={!puedeDeshacer}
          className={[styles.btnHerramienta, styles.btnHerramientaDeshacer, !puedeDeshacer ? styles.btnHerramientaDesactivado : ''].filter(Boolean).join(' ')}
          style={pantallaCompleta ? { color: '#6a5a4a', background: '#ede9e3', borderColor: 'transparent' } : {}}
          onClick={deshacer}>↩</button>
        <button title="Limpiar todo"
          className={[styles.btnHerramienta, styles.btnHerramientaLimpiar].filter(Boolean).join(' ')}
          style={pantallaCompleta ? { color: '#c0392b', background: '#ede9e3', borderColor: 'transparent' } : {}}
          onClick={limpiarCanvas}>🗑</button>

        <span style={{ width: 1, height: 22, background: pantallaCompleta ? '#d8d4ce' : 'var(--borde)', margin: '0 2px', flexShrink: 0 }} />

        {/* Selector de color — pastilla que despliega paleta */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            title="Color de trazo"
            onClick={() => setPaletaAbierta(v => !v)}
            style={{ width: 28, height: 28, borderRadius: 6, background: color, border: '2px solid rgba(0,0,0,0.18)', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.15)', flexShrink: 0 }}
          />
          {paletaAbierta && (
            <div
              style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', background: '#fff', border: '1px solid #e0dbd4', borderRadius: 12, padding: '0.5rem', display: 'flex', gap: '0.35rem', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 999, flexWrap: 'wrap', width: 156 }}
            >
              {coloresPaleta.map(c => (
                <button key={c} onClick={() => { setColor(c); setPaletaAbierta(false); }}
                  style={{ width: 28, height: 28, borderRadius: 6, background: c, border: color === c ? '3px solid #3a342c' : '2px solid rgba(0,0,0,0.1)', cursor: 'pointer', transform: color === c ? 'scale(1.15)' : 'scale(1)', transition: 'transform 0.12s' }}
                />
              ))}
            </div>
          )}
        </div>

        <span style={{ width: 1, height: 22, background: pantallaCompleta ? '#d8d4ce' : 'var(--borde)', margin: '0 2px', flexShrink: 0 }} />

        <div className={styles.pizarraGrosor} style={pantallaCompleta ? { borderLeft: 'none', paddingLeft: 0 } : {}}>
          <label className={styles.campoLabel} style={pantallaCompleta ? { color: '#888', fontSize: '0.68rem' } : {}}>Grosor</label>
          <input type="range" min={0.5} max={5} step={0.5} value={grosor} onChange={e => setGrosor(Number(e.target.value))} className={styles.rangeGrosor} />
        </div>

        {/* Controles extra solo en pantalla completa */}
        {pantallaCompleta && (
          <>
            <span style={{ width: 1, height: 22, background: '#d8d4ce', margin: '0 2px', flexShrink: 0 }} />
            <button className={`${styles.btn} ${cotasActivas ? styles.btnVerde : styles.btnSecundario}`}
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem', flexShrink: 0 }}
              onClick={() => setCotasActivas(v => !v)}>📏 {cotasActivas ? 'ON' : 'OFF'}</button>
            {cotasActivas && (
              <button className={styles.btn} onClick={() => setUnidad(u => u === 'mm' ? 'cm' : 'mm')}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', background: '#ede9e3', color: '#5a4a3a', border: '1px solid #d8d4ce', borderRadius: 'var(--radio)', flexShrink: 0 }}>
                {unidad}
              </button>
            )}
            {onGuardar && (
              <button className={`${styles.btn} ${styles.btnPrimario}`}
                style={{ padding: '0.25rem 0.7rem', fontSize: '0.7rem', flexShrink: 0 }}
                onClick={() => setModalGuardar(true)}>💾 Guardar</button>
            )}
            {onGuardar && (
              <button
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem', background: 'var(--verde)', color: '#fff', border: 'none', borderRadius: 'var(--radio)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                onClick={nuevaHoja}>＋ Hoja nueva</button>
            )}
            <button style={{ marginLeft: 'auto', padding: '0.25rem 0.9rem', fontSize: '0.7rem', background: 'none', color: '#888', border: '1px solid #d8d4ce', borderRadius: 'var(--radio)', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}
              onClick={togglePantallaCompleta}>✕ Salir</button>
          </>
        )}
      </div>

      {/* ── Modal Guardar ── */}
      {modalGuardar && (
        <div className={styles.modalFondo} onClick={() => setModalGuardar(false)}>
          <div className={styles.modalCaja} style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalCabecera}>
              <h2 className={styles.h2}>💾 Guardar dibujo</h2>
              <button className={styles.btnIcono} onClick={() => setModalGuardar(false)}>✕</button>
            </div>
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label className={styles.label}>Nombre
                <input className={styles.input} value={nombreDibujo} onChange={e => setNombreDibujo(e.target.value)} placeholder="Ej: Cocina, Armario dormitorio…" />
              </label>
              {dibujoEditandoId && <p style={{ fontSize: '0.78rem', color: 'var(--topo-claro)', margin: 0 }}>Se sobrescribirá el dibujo anterior.</p>}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setModalGuardar(false)}>Cancelar</button>
                <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ flex: 2, justifyContent: 'center' }} onClick={ejecutarGuardar}>💾 Guardar en la ficha</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Mis dibujos ── */}
      {modalDibujos && (
        <div className={styles.modalFondo} onClick={() => setModalDibujos(false)}>
          <div className={styles.modalCaja} style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalCabecera}>
              <h2 className={styles.h2}>🗂 Dibujos guardados</h2>
              <button className={styles.btnIcono} onClick={() => setModalDibujos(false)}>✕</button>
            </div>
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '60vh', overflowY: 'auto' }}>
              {dibujos.map(d => (
                <div key={d.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center', border: `2px solid ${d.id === dibujoEditandoId ? 'var(--verde)' : 'var(--borde)'}`, borderRadius: 'var(--radio-md)', padding: '0.75rem', background: d.id === dibujoEditandoId ? 'var(--verde-bg)' : 'var(--blanco)' }}>
                  <img src={d.dataUrl} alt={d.nombre} style={{ width: 96, height: 64, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--borde)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', color: 'var(--negro)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nombre}</p>
                    <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--topo-muy-claro)' }}>{d.fecha}</p>
                  </div>
                  <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ flexShrink: 0 }} onClick={() => cargarDibujo(d)}>✏️ Editar</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
