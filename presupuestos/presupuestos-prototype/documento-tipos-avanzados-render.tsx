import { useRef, useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { registrarTipoRender, type RenderElementoProps, type PanelPropiedadesProps } from './documento-registro-tipos-render.js';
import editorStyles from './editor-documento.module.css';

/**
 * Adaptadores de render de los cinco tipos avanzados del Incremento 7
 * (Tabla, Firma, Código QR, Dibujo, Bloque IA) — completan los trece
 * tipos de la arquitectura. Registrados por efecto secundario, importado
 * una sola vez desde `editor-documento.tsx`, mismo patrón que
 * `documento-tipos-iniciales-render.tsx`.
 */

// ── Tabla ────────────────────────────────────────────────────────────────────────

type EstiloTabla = { colorBorde?: string; anchoBorde?: number; colorFondoCabecera?: string; colorTextoCabecera?: string; fontSize?: number };

function RenderTabla({ elemento, onCambiarContenido, editando }: RenderElementoProps) {
  const celdasGuardadas = (elemento.contenido.celdas as string[][]) ?? [['', ''], ['', '']];
  const encabezadoFila = (elemento.contenido.encabezadoFila as boolean) ?? true;
  const estilo = elemento.estilo as EstiloTabla;

  // Estado local mientras se escribe — igual que el texto (que confirma en
  // el blur, no en cada tecla), para no crear un paso de deshacer por cada
  // carácter tecleado en una celda. Se resincroniza si el contenido cambia
  // por fuera (ej. al entrar en modo edición de nuevo).
  const [celdasLocal, setCeldasLocal] = useState(celdasGuardadas);
  useEffect(() => { if (!editando) setCeldasLocal(celdasGuardadas); }, [editando, celdasGuardadas]);
  const celdas = editando ? celdasLocal : celdasGuardadas;

  const cambiarCeldaLocal = (fila: number, col: number, valor: string) => {
    const nuevas = celdasLocal.map((f) => [...f]);
    nuevas[fila][col] = valor;
    setCeldasLocal(nuevas);
  };
  const confirmarCeldas = () => onCambiarContenido({ celdas: celdasLocal });

  return (
    <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', fontSize: estilo.fontSize ?? 13 }}>
      <tbody>
        {celdas.map((fila, i) => (
          <tr key={i}>
            {fila.map((valor, j) => {
              const esCabecera = encabezadoFila && i === 0;
              return (
                <td
                  key={j}
                  style={{
                    border: `${estilo.anchoBorde ?? 1}px solid ${estilo.colorBorde ?? '#e5e0d8'}`,
                    padding: '0.3rem 0.5rem',
                    background: esCabecera ? (estilo.colorFondoCabecera ?? '#f5ede0') : 'transparent',
                    color: esCabecera ? (estilo.colorTextoCabecera ?? '#18140f') : 'inherit',
                    fontWeight: esCabecera ? 700 : 400,
                  }}
                >
                  {editando
                    ? <input
                        value={valor}
                        onChange={(e) => cambiarCeldaLocal(i, j, e.target.value)}
                        onBlur={confirmarCeldas}
                        style={{ border: 'none', width: '100%', background: 'transparent', font: 'inherit', color: 'inherit' }}
                      />
                    : valor}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PanelTabla({ elemento, onCambiarContenido }: PanelPropiedadesProps) {
  const filas = (elemento.contenido.filas as number) ?? 2;
  const columnas = (elemento.contenido.columnas as number) ?? 2;
  const celdas = (elemento.contenido.celdas as string[][]) ?? [];

  const redimensionarTabla = (nuevasFilas: number, nuevasColumnas: number) => {
    const nuevas: string[][] = [];
    for (let i = 0; i < nuevasFilas; i++) {
      const fila: string[] = [];
      for (let j = 0; j < nuevasColumnas; j++) fila.push(celdas[i]?.[j] ?? '');
      nuevas.push(fila);
    }
    onCambiarContenido({ filas: nuevasFilas, columnas: nuevasColumnas, celdas: nuevas });
  };

  return (
    <div className={editorStyles.panelSeccion}>
      <div className={editorStyles.panelFila}>
        <label className={editorStyles.panelCampo}>Filas<input type="number" min={1} max={20} value={filas} onChange={(e) => { if (e.target.value.trim() === '') return; const v = Number(e.target.value); if (Number.isFinite(v) && v >= 1) redimensionarTabla(v, columnas); }} /></label>
        <label className={editorStyles.panelCampo}>Columnas<input type="number" min={1} max={10} value={columnas} onChange={(e) => { if (e.target.value.trim() === '') return; const v = Number(e.target.value); if (Number.isFinite(v) && v >= 1) redimensionarTabla(filas, v); }} /></label>
      </div>
      <label className={editorStyles.panelCampo}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input type="checkbox" checked={(elemento.contenido.encabezadoFila as boolean) ?? true} onChange={(e) => onCambiarContenido({ encabezadoFila: e.target.checked })} />
          Primera fila como cabecera
        </span>
      </label>
      <p className={editorStyles.panelNota}>Doble clic en la tabla para editar el texto de cada celda.</p>
    </div>
  );
}

registrarTipoRender({
  tipo: 'tabla', etiqueta: 'Tabla', insertableDesdeBarra: true, editableEnLienzo: true,
  tamanoInicial: { ancho: 300, alto: 100 },
  crearContenidoInicial: () => ({ filas: 2, columnas: 2, celdas: [['', ''], ['', '']], encabezadoFila: true }),
  crearEstiloInicial: () => ({ colorBorde: '#e5e0d8', anchoBorde: 1, colorFondoCabecera: '#f5ede0', colorTextoCabecera: '#18140f', fontSize: 13 }),
  crearPropiedadesIniciales: () => ({}),
  Render: RenderTabla, PanelPropiedades: PanelTabla,
});

// ── Firma ────────────────────────────────────────────────────────────────────────

function RenderFirma({ elemento }: RenderElementoProps) {
  const url = elemento.contenido.url as string;
  const nombreFirmante = elemento.contenido.nombreFirmante as string;
  const estilo = elemento.estilo as { colorLinea?: string };
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', borderBottom: `1px solid ${estilo.colorLinea ?? '#51483f'}` }}>
        {url && <img src={url} alt="Firma" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
      </div>
      {nombreFirmante && <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', textAlign: 'center', color: 'var(--topo-claro)' }}>{nombreFirmante}</p>}
    </div>
  );
}

function CapturaFirma({ onCapturar }: { onCapturar: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);

  const posicion = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const iniciar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dibujando.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = posicion(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  };
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    const { x, y } = posicion(e);
    if (ctx) { ctx.lineTo(x, y); ctx.stroke(); }
  };
  const terminar = () => { dibujando.current = false; };
  const limpiar = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  const guardar = () => {
    const canvas = canvasRef.current;
    if (canvas) onCapturar(canvas.toDataURL('image/png'));
  };

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) { ctx.strokeStyle = '#18140f'; ctx.lineWidth = 2; ctx.lineCap = 'round'; }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <canvas
        ref={canvasRef} width={280} height={140}
        style={{ border: '1px solid var(--borde)', borderRadius: 6, touchAction: 'none', background: '#fff' }}
        onPointerDown={iniciar} onPointerMove={mover} onPointerUp={terminar} onPointerLeave={terminar}
      />
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" className={editorStyles.btnPanel} onClick={limpiar}>Borrar</button>
        <button type="button" className={editorStyles.btnPanel} onClick={guardar}>Guardar firma</button>
      </div>
    </div>
  );
}

function PanelFirma({ elemento, onCambiarContenido, onSustituirArchivo }: PanelPropiedadesProps) {
  return (
    <div className={editorStyles.panelSeccion}>
      <label className={editorStyles.panelCampo}>
        Nombre del firmante
        <input type="text" value={(elemento.contenido.nombreFirmante as string) ?? ''} onChange={(e) => onCambiarContenido({ nombreFirmante: e.target.value })} />
      </label>
      <p className={editorStyles.panelTituloSeccion} style={{ margin: '0.4rem 0 0' }}>Dibujar firma</p>
      <CapturaFirma onCapturar={(dataUrl) => onSustituirArchivo?.(dataUrlAFile(dataUrl, 'firma.png'))} />
    </div>
  );
}

function dataUrlAFile(dataUrl: string, nombre: string): File {
  const coincide = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const mime = coincide?.[1] ?? 'image/png';
  const binario = atob(coincide?.[2] ?? '');
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new File([bytes], nombre, { type: mime });
}

registrarTipoRender({
  tipo: 'firma', etiqueta: 'Firma', insertableDesdeBarra: true, editableEnLienzo: false,
  tamanoInicial: { ancho: 220, alto: 90 },
  crearContenidoInicial: () => ({ url: '', nombreFirmante: '', fecha: null }),
  crearEstiloInicial: () => ({ colorLinea: '#51483f' }),
  crearPropiedadesIniciales: () => ({}),
  Render: RenderFirma, PanelPropiedades: PanelFirma,
});

// ── Código QR ────────────────────────────────────────────────────────────────────

function RenderCodigoQR({ elemento }: RenderElementoProps) {
  const valor = (elemento.contenido.valor as string) ?? '';
  const estilo = elemento.estilo as { colorPrimario?: string; colorFondo?: string };
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!valor) { setDataUrl(null); return; }
    let activo = true;
    QRCode.toDataURL(valor, { color: { dark: estilo.colorPrimario ?? '#18140f', light: estilo.colorFondo ?? '#ffffff' }, margin: 1 })
      .then((url) => { if (activo) setDataUrl(url); })
      .catch(() => { if (activo) setDataUrl(null); });
    return () => { activo = false; };
  }, [valor, estilo.colorPrimario, estilo.colorFondo]);

  if (!valor) return <div className={editorStyles.marcadorVacio}>Código QR</div>;
  return dataUrl
    ? <img src={dataUrl} alt="Código QR" style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }} />
    : <div className={editorStyles.marcadorVacio}>Generando…</div>;
}

function PanelCodigoQR({ elemento, onCambiarContenido, onCambiarEstilo }: PanelPropiedadesProps) {
  const estilo = elemento.estilo as { colorPrimario?: string; colorFondo?: string };
  return (
    <div className={editorStyles.panelSeccion}>
      <label className={editorStyles.panelCampo}>
        Texto o URL a codificar
        <input type="text" value={(elemento.contenido.valor as string) ?? ''} onChange={(e) => onCambiarContenido({ valor: e.target.value })} placeholder="https://…" />
      </label>
      <div className={editorStyles.panelFila}>
        <label className={editorStyles.panelCampo}>Color<input type="color" value={estilo.colorPrimario ?? '#18140f'} onChange={(e) => onCambiarEstilo({ colorPrimario: e.target.value })} /></label>
        <label className={editorStyles.panelCampo}>Fondo<input type="color" value={estilo.colorFondo ?? '#ffffff'} onChange={(e) => onCambiarEstilo({ colorFondo: e.target.value })} /></label>
      </div>
    </div>
  );
}

registrarTipoRender({
  tipo: 'codigoQR', etiqueta: 'Código QR', insertableDesdeBarra: true, editableEnLienzo: false,
  tamanoInicial: { ancho: 120, alto: 120 },
  crearContenidoInicial: () => ({ valor: '' }),
  crearEstiloInicial: () => ({ colorPrimario: '#18140f', colorFondo: '#ffffff' }),
  crearPropiedadesIniciales: () => ({}),
  Render: RenderCodigoQR, PanelPropiedades: PanelCodigoQR,
});

// ── Dibujo ───────────────────────────────────────────────────────────────────────

function RenderDibujo({ elemento }: RenderElementoProps) {
  const url = elemento.contenido.url as string;
  return url
    ? <img src={url} alt="Dibujo" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
    : <div className={editorStyles.marcadorVacio}>Dibujo</div>;
}

function PanelDibujo({ onSustituirArchivo }: PanelPropiedadesProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={editorStyles.panelSeccion}>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onSustituirArchivo?.(f); e.target.value = ''; }} />
      <button type="button" className={editorStyles.btnPanel} onClick={() => inputRef.current?.click()}>Subir imagen del dibujo</button>
      <p className={editorStyles.panelNota}>Para dibujar desde cero, usa la Pizarra de medición y luego sube aquí la captura.</p>
    </div>
  );
}

registrarTipoRender({
  tipo: 'dibujo', etiqueta: 'Dibujo', insertableDesdeBarra: true, editableEnLienzo: false,
  tamanoInicial: { ancho: 240, alto: 180 },
  crearContenidoInicial: () => ({ url: '', escenaExcalidraw: null }),
  crearEstiloInicial: () => ({}),
  crearPropiedadesIniciales: () => ({}),
  Render: RenderDibujo, PanelPropiedades: PanelDibujo,
});

// ── Bloque IA ────────────────────────────────────────────────────────────────────

type EstiloBloqueIA = { fontFamily?: string; fontSize?: number; color?: string };

function RenderBloqueIA({ elemento }: RenderElementoProps) {
  const estado = (elemento.contenido.estado as string) ?? 'vacio';
  const texto = (elemento.contenido.textoGenerado as string) ?? '';
  const estilo = elemento.estilo as EstiloBloqueIA;
  if (estado === 'generando') return <div className={editorStyles.marcadorVacio}>Generando…</div>;
  if (estado === 'generado' && texto) {
    return <div style={{ width: '100%', height: '100%', overflow: 'hidden', fontFamily: estilo.fontFamily ?? 'Arial', fontSize: estilo.fontSize ?? 14, color: estilo.color ?? '#18140f', whiteSpace: 'pre-wrap' }}>{texto}</div>;
  }
  return <div className={editorStyles.marcadorVacio}>Bloque IA — sin generar todavía</div>;
}

function PanelBloqueIA({ elemento, onCambiarContenido, onGenerarConIA, errorGenerarConIA }: PanelPropiedadesProps) {
  const instrucciones = (elemento.contenido.instrucciones as string) ?? '';
  const estado = (elemento.contenido.estado as string) ?? 'vacio';
  const generando = estado === 'generando';
  return (
    <div className={editorStyles.panelSeccion}>
      <label className={editorStyles.panelCampo}>
        Instrucciones para la IA
        <textarea
          value={instrucciones}
          onChange={(e) => onCambiarContenido({ instrucciones: e.target.value })}
          rows={4}
          placeholder="Ej. Redacta una descripción profesional de una cocina en L con acabado mate…"
          disabled={generando}
        />
      </label>
      <button
        className={editorStyles.btnPanel}
        disabled={!instrucciones.trim() || generando}
        onClick={() => onGenerarConIA?.(instrucciones.trim())}
      >
        {generando ? 'Generando…' : '✨ Generar con IA'}
      </button>
      {errorGenerarConIA && <p className={editorStyles.panelNota}>{errorGenerarConIA}</p>}
    </div>
  );
}

registrarTipoRender({
  tipo: 'bloqueIA', etiqueta: 'Bloque IA', insertableDesdeBarra: true, editableEnLienzo: false,
  tamanoInicial: { ancho: 280, alto: 100 },
  crearContenidoInicial: () => ({ instrucciones: '', textoGenerado: '', estado: 'vacio' }),
  crearEstiloInicial: () => ({ fontFamily: 'Arial', fontSize: 14, color: '#18140f' }),
  crearPropiedadesIniciales: () => ({}),
  Render: RenderBloqueIA, PanelPropiedades: PanelBloqueIA,
});
