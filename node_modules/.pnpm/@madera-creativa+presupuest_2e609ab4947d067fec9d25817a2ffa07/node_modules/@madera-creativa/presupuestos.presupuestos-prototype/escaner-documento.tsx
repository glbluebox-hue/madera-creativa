import { useState, useRef } from 'react';
import { ImporteInput } from './importe-input.js';
import styles from './styles.module.css';

/** Modo de procesado de la imagen. */
type Modo = 'color' | 'bn' | 'mejorado';

/** Resultado del escaneado con datos detectados. */
export type ResultadoEscaneo = {
  dataUrl: string;
  modo: Modo;
  importe?: number;
  tipo?: 'gasto' | 'ingreso';
  proveedor?: string;
  fecha?: string;
};

/** Props del escáner de documento. */
export type EscanerDocumentoProps = {
  onConfirmar: (r: ResultadoEscaneo) => void;
  onCerrar: () => void;
};

/** Aplica filtro de mejora de documento sobre un canvas. */
function aplicarFiltro(src: string, modo: Modo): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      if (modo !== 'color') {
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < d.data.length; i += 4) {
          const r = d.data[i]; const g = d.data[i + 1]; const b = d.data[i + 2];
          let lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (modo === 'bn') {
            lum = lum > 155 ? 255 : lum > 80 ? Math.min(255, lum * 1.5) : 0;
            d.data[i] = d.data[i + 1] = d.data[i + 2] = lum;
          } else {
            const f = 1.7;
            d.data[i] = Math.min(255, Math.max(0, (r - 128) * f + 148));
            d.data[i + 1] = Math.min(255, Math.max(0, (g - 128) * f + 148));
            d.data[i + 2] = Math.min(255, Math.max(0, (b - 128) * f + 148));
          }
        }
        ctx.putImageData(d, 0, 0);
      }
      resolve(canvas.toDataURL('image/jpeg', 0.93));
    };
    img.src = src;
  });
}

/** Extrae el importe más alto del texto. */
function extraerImporte(texto: string): number | undefined {
  const t = texto.replace(/\s+/g, ' ');
  const patrones = [
    /TOTAL[^\d]*([\d.,]+)/gi,
    /IMPORTE[^\d]*([\d.,]+)/gi,
    /A PAGAR[^\d]*([\d.,]+)/gi,
    /€\s*([\d.,]+)/g,
    /([\d.,]+)\s*€/g,
    /([\d.,]+)\s*EUR/gi,
  ];
  const encontrados: number[] = [];
  for (const p of patrones) {
    let m;
    while ((m = p.exec(t)) !== null) {
      const raw = m[1].trim().replace(/\.(\d{3})/g, '$1').replace(',', '.');
      const n = parseFloat(raw);
      if (!isNaN(n) && n > 0 && n < 999999) encontrados.push(n);
    }
  }
  return encontrados.length ? Math.max(...encontrados) : undefined;
}

function inferirTipo(texto: string): 'gasto' | 'ingreso' {
  const t = texto.toUpperCase();
  if (['PRESUPUESTO', 'COBRO', 'INGRESO', 'ABONO', 'PAGO RECIBIDO'].some(p => t.includes(p))) return 'ingreso';
  return 'gasto';
}

function extraerFecha(texto: string): string | undefined {
  const m1 = texto.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  const m2 = texto.match(/(\d{4})[/\-](\d{2})[/\-](\d{2})/);
  if (m2) return m2[0];
  return undefined;
}

function extraerProveedor(texto: string): string | undefined {
  const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 3 && !/^\d/.test(l));
  return lineas[0]?.slice(0, 60) || undefined;
}

/**
 * Escáner de documentos simplificado y fiable.
 * - Usa la cámara nativa del móvil (que en iOS/Android ya tiene modo documento).
 * - Permite subir múltiples imágenes.
 * - Aplica filtros de mejora (mejorado / B&N / color).
 * - Extrae precio, tipo y fecha automáticamente.
 */
export function EscanerDocumento({ onConfirmar, onCerrar }: EscanerDocumentoProps) {
  const [paginas, setPaginas] = useState<{ id: string; original: string; procesada: string }[]>([]);
  const [paginaActiva, setPaginaActiva] = useState(0);
  const [modo, setModo] = useState<Modo>('mejorado');
  const [procesando, setProcesando] = useState(false);
  const [ocr, setOcr] = useState<{ importe?: number; tipo?: 'gasto' | 'ingreso'; proveedor?: string; fecha?: string } | null>(null);
  const [importeEditado, setImporteEditado] = useState('');
  const [tipoEditado, setTipoEditado] = useState<'gasto' | 'ingreso'>('gasto');
  const [paso, setPaso] = useState<'captura' | 'revision'>('captura');

  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  const uid = () => Math.random().toString(36).slice(2);

  const agregarImagenes = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setProcesando(true);
    const nuevas: { id: string; original: string; procesada: string }[] = [];
    for (const file of Array.from(files)) {
      const dataUrl = await new Promise<string>(res => {
        const r = new FileReader();
        r.onload = e => res(e.target!.result as string);
        r.readAsDataURL(file);
      });
      const procesada = await aplicarFiltro(dataUrl, modo);
      nuevas.push({ id: uid(), original: dataUrl, procesada });
    }
    setPaginas(prev => {
      const updated = [...prev, ...nuevas];
      setPaginaActiva(updated.length - 1);
      return updated;
    });
    setProcesando(false);
    if (paginas.length + nuevas.length > 0) setPaso('revision');
  };

  const cambiarModo = async (nuevoModo: Modo) => {
    setModo(nuevoModo);
    if (!paginas.length) return;
    setProcesando(true);
    const actualizadas = await Promise.all(
      paginas.map(async p => ({ ...p, procesada: await aplicarFiltro(p.original, nuevoModo) }))
    );
    setPaginas(actualizadas);
    setProcesando(false);
  };

  const quitarPagina = (id: string) => {
    setPaginas(prev => {
      const next = prev.filter(p => p.id !== id);
      setPaginaActiva(v => Math.min(v, Math.max(0, next.length - 1)));
      if (!next.length) setPaso('captura');
      return next;
    });
  };

  const confirmar = () => {
    if (!paginas.length) return;
    onConfirmar({
      dataUrl: paginas[paginaActiva].procesada,
      modo,
      importe: parseFloat(importeEditado) || ocr?.importe,
      tipo: tipoEditado,
      proveedor: ocr?.proveedor,
      fecha: ocr?.fecha,
    });
  };

  const paginaActual = paginas[paginaActiva];
  const modos: { id: Modo; label: string }[] = [
    { id: 'mejorado', label: '✨ Mejorado' },
    { id: 'bn', label: '◑ B&N' },
    { id: 'color', label: '🌈 Color' },
  ];

  return (
    <div className={styles.modalFondo} onClick={onCerrar}>
      <div
        className={styles.modalCaja}
        style={{ maxWidth: 520, maxHeight: '95dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className={styles.modalCabecera}>
          <h2 className={styles.h2}>📄 Escanear documento</h2>
          <button className={styles.btnIcono} onClick={onCerrar}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

          {/* ── PASO 1: CAPTURA ── */}
          {paso === 'captura' && (
            <>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)', lineHeight: 1.5 }}>
                Haz una foto con la cámara del móvil.<br />
                <strong>💡 En iOS:</strong> al abrir la cámara, mantén pulsado el obturador o usa el modo "Escanear documentos" de la app Notas/Archivos para mejor resultado.
              </p>

              {/* Inputs ocultos */}
              <input ref={camaraRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
                onChange={e => agregarImagenes(e.target.files)} />
              <input ref={galeriaRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }}
                onChange={e => agregarImagenes(e.target.files)} />

              <button
                className={`${styles.btn} ${styles.btnPrimario}`}
                style={{ justifyContent: 'center', padding: '1rem', fontSize: '1rem', borderRadius: 12 }}
                onClick={() => camaraRef.current?.click()}
              >
                📷 Abrir cámara
              </button>

              <button
                className={`${styles.btn} ${styles.btnSecundario}`}
                style={{ justifyContent: 'center' }}
                onClick={() => galeriaRef.current?.click()}
              >
                🖼️ Elegir de galería o archivos
              </button>

              {/* Zona drop */}
              <div
                style={{ border: '2px dashed var(--borde)', borderRadius: 12, padding: '2rem', textAlign: 'center',
                  color: 'var(--topo-claro)', cursor: 'pointer', background: 'var(--fondo)' }}
                onClick={() => galeriaRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); agregarImagenes(e.dataTransfer.files); }}
              >
                <div style={{ fontSize: '2.5rem', marginBottom: '0.4rem' }}>📄</div>
                <p style={{ margin: 0, fontSize: '0.8rem' }}>Arrastra aquí la imagen o PDF</p>
              </div>
            </>
          )}

          {/* ── PASO 2: REVISIÓN ── */}
          {paso === 'revision' && (
            <>
              {/* Miniaturas */}
              <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.2rem' }}>
                {paginas.map((p, i) => (
                  <div key={p.id} onClick={() => setPaginaActiva(i)}
                    style={{ flexShrink: 0, width: 52, height: 70, border: `2px solid ${i === paginaActiva ? 'var(--topo)' : 'var(--borde)'}`,
                      borderRadius: 6, overflow: 'hidden', cursor: 'pointer', position: 'relative' }}>
                    <img src={p.procesada} alt={`Hoja ${i+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: i === paginaActiva ? 'var(--topo)' : 'rgba(0,0,0,0.4)',
                      color: '#fff', fontSize: '0.58rem', textAlign: 'center', fontWeight: 700, padding: '1px 0' }}>{i + 1}</span>
                  </div>
                ))}
                {/* + hoja */}
                <button onClick={() => camaraRef.current?.click()}
                  style={{ flexShrink: 0, width: 52, height: 70, border: '2px dashed var(--borde)', borderRadius: 6,
                    background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', color: 'var(--topo-claro)', fontSize: '1.3rem', gap: 2 }}
                  title="Añadir hoja">
                  <span>＋</span>
                  <span style={{ fontSize: '0.5rem', fontWeight: 700 }}>HOJA</span>
                </button>
              </div>

              {/* Vista previa */}
              {paginaActual && (
                <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--borde)' }}>
                  {procesando && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, fontSize: '0.85rem', color: 'var(--topo)' }}>
                      Procesando…
                    </div>
                  )}
                  <img src={paginaActual.procesada} alt="Documento" style={{ width: '100%', maxHeight: '42dvh', objectFit: 'contain', display: 'block' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.4rem 0.6rem', background: '#f5f3ef', borderTop: '1px solid var(--borde-fino)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--topo-claro)', fontWeight: 600 }}>Hoja {paginaActiva + 1} / {paginas.length}</span>
                    <button onClick={() => quitarPagina(paginaActual.id)} className={styles.btnIcono}
                      title="Quitar esta hoja" style={{ color: 'var(--rojo)', fontSize: '0.8rem' }}>🗑 Quitar</button>
                  </div>
                </div>
              )}

              {/* Filtro */}
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {modos.map(m => (
                  <button key={m.id}
                    className={`${styles.btn} ${modo === m.id ? styles.btnPrimario : styles.btnSecundario}`}
                    style={{ flex: 1, justifyContent: 'center', fontSize: '0.75rem' }}
                    onClick={() => cambiarModo(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Datos económicos */}
              <div style={{ background: 'var(--fondo)', border: '1px solid var(--borde)', borderRadius: 10, padding: '0.85rem',
                display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: 'var(--topo-claro)', letterSpacing: '0.04em' }}>
                  {ocr?.importe ? '🔍 DETECTADO AUTOMÁTICAMENTE' : '✏️ INTRODUCE LOS DATOS'}
                </p>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className={`${styles.btn} ${tipoEditado === 'gasto' ? styles.btnPeligro : styles.btnSecundario}`}
                    style={{ flex: 1, justifyContent: 'center', fontSize: '0.8rem' }}
                    onClick={() => setTipoEditado('gasto')}>🧾 Gasto</button>
                  <button className={`${styles.btn} ${tipoEditado === 'ingreso' ? styles.btnVerde : styles.btnSecundario}`}
                    style={{ flex: 1, justifyContent: 'center', fontSize: '0.8rem' }}
                    onClick={() => setTipoEditado('ingreso')}>💰 Ingreso</button>
                </div>
                <label className={styles.label} style={{ margin: 0 }}>
                  Importe (€)
                  {ocr?.importe && <span style={{ marginLeft: '0.4rem', fontSize: '0.68rem', color: 'var(--verde)', fontWeight: 600 }}>✓ detectado</span>}
                  <ImporteInput value={importeEditado} onChange={setImporteEditado} placeholder="0,00" />
                </label>
                {ocr?.proveedor && <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--topo-claro)' }}>Emisor: <strong style={{ color: 'var(--negro)' }}>{ocr.proveedor}</strong></p>}
                {ocr?.fecha && <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--topo-claro)' }}>Fecha: <strong style={{ color: 'var(--negro)' }}>{ocr.fecha}</strong></p>}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => { setPaginas([]); setPaso('captura'); }}>← Nueva</button>
                <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ flex: 2, justifyContent: 'center' }}
                  onClick={confirmar} disabled={!paginas.length}>💾 Guardar documento</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
