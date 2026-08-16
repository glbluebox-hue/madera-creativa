import { useState, useRef } from 'react';
import { leerArchivoComoBase64 } from './archivos.js';
import { prepararCanvas, CALIDAD_COMPRESION, DIMENSION_MAXIMA_PX } from './procesamiento-imagenes.js';
import { AjusteEsquinas } from './ajuste-esquinas.js';
import styles from './styles.module.css';

/** Modo de procesado de la imagen. */
type Modo = 'color' | 'bn' | 'mejorado';

/** Resultado del escaneado — todas las hojas capturadas, en orden, no solo la que estaba activa al pulsar "Continuar". Los datos de la factura (proveedor, importe, tipo, cliente…) se rellenan después, en el formulario de `EscanerFactura` — este paso es solo el documento. */
export type ResultadoEscaneo = {
  dataUrls: string[];
  modo: Modo;
};

/** Props del escáner de documento. */
export type EscanerDocumentoProps = {
  onConfirmar: (r: ResultadoEscaneo) => void;
  onCerrar: () => void;
};

/**
 * Aplica filtro de mejora de documento y codifica el resultado — todo sobre
 * el mismo canvas ya redimensionado, para que la imagen pase una única vez
 * por la codificación final (antes: resolución nativa + JPEG q0,93 fijos;
 * ver auditoría del Incremento 1.3). Siempre JPEG, nunca WebP (aunque el
 * navegador lo soporte): `pdf-lib` (generación real de PDF, Fase Facturas
 * Profesional) solo sabe incrustar JPEG/PNG — WebP produciría un PDF roto
 * más adelante en la cadena, sin ningún aviso hasta ese momento.
 */
async function aplicarFiltro(src: string, modo: Modo): Promise<string> {
  const { canvas } = await prepararCanvas(src);
  const ctx = canvas.getContext('2d')!;
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
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', CALIDAD_COMPRESION));
  if (!blob) throw new Error('No se pudo codificar la imagen');
  return leerArchivoComoBase64(blob);
}

/**
 * Escáner de documentos simplificado y fiable.
 * - Usa la cámara nativa del móvil.
 * - Permite subir múltiples imágenes.
 * - Aplica filtros de mejora (mejorado / B&N / color).
 * - Solo se ocupa del documento (páginas, recorte, mejora) — los datos de
 *   la factura (proveedor, importe, tipo, cliente…) se rellenan después,
 *   en un único formulario (`EscanerFactura`), no aquí duplicados.
 */
export function EscanerDocumento({ onConfirmar, onCerrar }: EscanerDocumentoProps) {
  const [paginas, setPaginas] = useState<{ id: string; original: string; procesada: string }[]>([]);
  const [paginaActiva, setPaginaActiva] = useState(0);
  const [modo, setModo] = useState<Modo>('mejorado');
  const [procesando, setProcesando] = useState(false);
  const [paso, setPaso] = useState<'captura' | 'ajuste' | 'revision'>('captura');
  // Páginas recién capturadas, en espera de que el usuario ajuste sus
  // esquinas (una a la vez) antes de aplicarles el filtro y añadirlas a
  // `paginas`.
  const [colaAjuste, setColaAjuste] = useState<{ id: string; original: string }[]>([]);
  // Entre "se cierra la cámara" y "aparece el ajuste de esquinas" hay un
  // redimensionado asíncrono (ver `agregarFuentes`) — sin este estado, la
  // pantalla volvía a mostrar brevemente (o, si algo fallaba, de forma
  // permanente y sin aviso) el paso inicial "Escanear documento", dando la
  // sensación de que la app no había hecho nada con la foto.
  const [procesandoCaptura, setProcesandoCaptura] = useState(false);
  const [errorCaptura, setErrorCaptura] = useState<string | null>(null);

  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  const uid = () => Math.random().toString(36).slice(2);

  /**
   * Añade una o más imágenes ya capturadas (data URL o, mejor, el propio
   * `File`/`Blob` sin convertir) a la cola de ajuste de esquinas. Una foto
   * real de cámara (12-48 MP, varios MB) decodificada a resolución
   * completa —y luego usada en el ajuste de esquinas y en la corrección de
   * perspectiva píxel a píxel— satura la memoria de un navegador móvil y
   * hace que la pestaña se recargue sola (visto en pruebas reales en
   * Android). Se redimensiona aquí, ANTES de mostrarla, al mismo límite
   * que ya usa el resto de la app (`DIMENSION_MAXIMA_PX`) — `prepararCanvas`
   * decodifica con `createImageBitmap` y libera la imagen a resolución
   * nativa de inmediato en cuanto se ha dibujado ya reducida, en vez de
   * esperar al recolector de basura.
   *
   * La captura usa la cámara del sistema (`capture="environment"`), no una
   * cámara en vivo dentro de la página: en pruebas reales, `getUserMedia` +
   * lectura del `<video>` por canvas resultó inestable en un dispositivo
   * concreto (Xiaomi 14T, chip MediaTek) — la app se cerraba sola al
   * capturar, con o sin restricciones de batería de MIUI — mientras que la
   * cámara del sistema, una vez corregido el ahorro de batería de MIUI para
   * esta app, funciona de forma fiable. Se mantiene el resto del flujo
   * (ajuste de esquinas, filtro, multipágina) exactamente igual.
   */
  const agregarFuentes = async (fuentes: (string | Blob)[]) => {
    setErrorCaptura(null);
    setProcesandoCaptura(true);
    try {
      const nuevas = await Promise.all(fuentes.map(async (original) => {
        const { canvas } = await prepararCanvas(original, DIMENSION_MAXIMA_PX);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', CALIDAD_COMPRESION));
        const reducida = blob ? await leerArchivoComoBase64(blob) : (typeof original === 'string' ? original : await leerArchivoComoBase64(original));
        return { id: uid(), original: reducida };
      }));
      setColaAjuste(prev => [...prev, ...nuevas]);
      setPaso('ajuste');
    } catch {
      // Nunca fallar en silencio: si el redimensionado falla (foto
      // corrupta, memoria insuficiente…) el usuario debe ver un aviso
      // claro y poder reintentar, no quedarse sin explicación en la
      // pantalla inicial.
      setErrorCaptura('No se pudo procesar la foto. Vuelve a intentarlo.');
    } finally {
      setProcesandoCaptura(false);
    }
  };

  const agregarImagenes = async (files: FileList | null) => {
    // Filtro defensivo: el `accept` del input ya limita a imágenes, pero
    // arrastrar-y-soltar puede saltárselo — un PDF aquí rompería
    // `aplicarFiltro` (intenta cargarlo como `<img>`).
    const soloImagenes = files ? Array.from(files).filter(f => f.type.startsWith('image/')) : [];
    if (!soloImagenes.length) return;
    // Los `File` se pasan tal cual — nunca se convierten antes a data URL
    // de texto, que para una foto de cámara real duplicaría en memoria
    // varios MB justo antes del paso más delicado (decodificarla).
    await agregarFuentes(soloImagenes);
  };

  /** Aplica el filtro actual a una imagen ya recortada/enderezada (o a la original si el usuario prefirió no ajustar) y la añade como página. */
  const confirmarPaginaAjustada = async (id: string, dataUrl: string) => {
    setProcesando(true);
    try {
      const procesada = await aplicarFiltro(dataUrl, modo);
      setPaginas(prev => {
        const updated = [...prev, { id, original: dataUrl, procesada }];
        setPaginaActiva(updated.length - 1);
        return updated;
      });
    } finally {
      setProcesando(false);
    }
    setColaAjuste(prev => {
      const restante = prev.slice(1);
      setPaso(restante.length ? 'ajuste' : 'revision');
      return restante;
    });
  };

  const cancelarPaginaEnCola = () => {
    setColaAjuste(prev => {
      const restante = prev.slice(1);
      setPaso(restante.length ? 'ajuste' : (paginas.length ? 'revision' : 'captura'));
      return restante;
    });
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

  /** Quita la hoja actual y vuelve directamente a la cámara para volver a capturarla — la nueva captura se añade al final; si hacía falta en la misma posición, se puede reordenar después. */
  const repetirPagina = (id: string) => {
    quitarPagina(id);
    camaraRef.current?.click();
  };

  const moverPagina = (id: string, dir: -1 | 1) => {
    setPaginas(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx < 0) return prev;
      const destino = idx + dir;
      if (destino < 0 || destino >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[destino]] = [arr[destino], arr[idx]];
      setPaginaActiva(destino);
      return arr;
    });
  };

  const confirmar = () => {
    if (!paginas.length) return;
    onConfirmar({ dataUrls: paginas.map((p) => p.procesada), modo });
  };

  const paginaActual = paginas[paginaActiva];
  const modos: { id: Modo; label: string }[] = [
    { id: 'mejorado', label: 'Mejorado' },
    { id: 'bn', label: 'B&N' },
    { id: 'color', label: 'Color' },
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
          <h2 className={styles.h2} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            Escanear documento
          </h2>
          <button className={styles.btnIcono} onClick={onCerrar} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

          {errorCaptura && (
            <div style={{ background: 'var(--rojo-bg)', border: '1px solid var(--rojo)', borderRadius: 8, padding: '0.75rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--rojo)' }}>{errorCaptura}</p>
              <button className={styles.btnIcono} onClick={() => setErrorCaptura(null)} aria-label="Cerrar aviso" style={{ color: 'var(--rojo)', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          )}

          {/* ── Procesando la foto recién capturada (redimensionado) — pantalla propia para que nunca dé la sensación de "no ha pasado nada" mientras se resuelve. ── */}
          {procesandoCaptura ? (
            <div style={{ padding: '3.5rem 0', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--topo-claro)' }}>Procesando foto…</p>
            </div>
          ) : (
          <>
          {/* ── PASO 1: CAPTURA ── */}
          {paso === 'captura' && (
            <>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)', lineHeight: 1.5 }}>
                Encuadra el documento completo y haz la foto. En la siguiente pantalla podrás ajustar las esquinas para enderezarlo.<br />
                <strong>¿La factura tiene varias hojas?</strong> No hace falta hacerlo ahora — después de la primera podrás pulsar "+ Hoja" para añadir las siguientes y guardarlas todas juntas como un único documento.
              </p>

              {/* Inputs ocultos */}
              <input ref={camaraRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
                onChange={e => agregarImagenes(e.target.files)} />
              {/* Solo imágenes — un PDF no pasa por el filtro de mejora de
                  documento (no tiene sentido aplicar contraste/B&N a un
                  PDF), así que su subida vive en el paso anterior
                  (EscanerFactura, botón "Subir"), que lo conserva tal cual. */}
              <input ref={galeriaRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                onChange={e => agregarImagenes(e.target.files)} />

              <button
                className={`${styles.btn} ${styles.btnPrimario}`}
                style={{ justifyContent: 'center', padding: '1rem', fontSize: '1rem', borderRadius: 12 }}
                onClick={() => camaraRef.current?.click()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: -3 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                Escanear con la cámara
              </button>

              <button
                className={`${styles.btn} ${styles.btnSecundario}`}
                style={{ justifyContent: 'center' }}
                onClick={() => galeriaRef.current?.click()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: -2 }}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                Elegir de galería o archivos
              </button>

              {/* Zona drop */}
              <div
                style={{ border: '2px dashed var(--borde)', borderRadius: 12, padding: '2rem', textAlign: 'center',
                  color: 'var(--topo-claro)', cursor: 'pointer', background: 'var(--fondo)' }}
                onClick={() => galeriaRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); agregarImagenes(e.dataTransfer.files); }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.4rem' }}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                </div>
                <p style={{ margin: 0, fontSize: '0.8rem' }}>Arrastra aquí la imagen</p>
              </div>
            </>
          )}

          {/* ── PASO 1.5: AJUSTE DE ESQUINAS ── */}
          {paso === 'ajuste' && colaAjuste[0] && (
            procesando ? (
              <p style={{ margin: '2rem 0', textAlign: 'center', fontSize: '0.85rem', color: 'var(--topo-claro)' }}>Enderezando documento…</p>
            ) : (
              <AjusteEsquinas
                imagenSrc={colaAjuste[0].original}
                onConfirmar={(dataUrl) => confirmarPaginaAjustada(colaAjuste[0].id, dataUrl)}
                onOmitir={() => confirmarPaginaAjustada(colaAjuste[0].id, colaAjuste[0].original)}
                onCancelar={cancelarPaginaEnCola}
              />
            )
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
                      color: 'var(--blanco)', fontSize: '0.58rem', textAlign: 'center', fontWeight: 700, padding: '1px 0' }}>{i + 1}</span>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem',
                    padding: '0.4rem 0.6rem', background: 'var(--fondo)', borderTop: '1px solid var(--borde-fino)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--topo-claro)', fontWeight: 600 }}>Hoja {paginaActiva + 1} / {paginas.length}</span>
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      <button onClick={() => moverPagina(paginaActual.id, -1)} disabled={paginaActiva === 0}
                        className={styles.btnIcono} title="Mover antes" aria-label="Mover hoja antes" style={{ opacity: paginaActiva === 0 ? 0.3 : 1 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                      </button>
                      <button onClick={() => moverPagina(paginaActual.id, 1)} disabled={paginaActiva === paginas.length - 1}
                        className={styles.btnIcono} title="Mover después" aria-label="Mover hoja después" style={{ opacity: paginaActiva === paginas.length - 1 ? 0.3 : 1 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                      </button>
                      <button onClick={() => repetirPagina(paginaActual.id)} className={styles.btnIcono}
                        title="Repetir esta hoja" aria-label="Repetir esta hoja" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                        Repetir
                      </button>
                      <button onClick={() => quitarPagina(paginaActual.id)} className={styles.btnIcono}
                        title="Quitar esta hoja" aria-label="Quitar esta hoja" style={{ color: 'var(--rojo)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        Quitar
                      </button>
                    </div>
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

              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)', lineHeight: 1.5 }}>
                A continuación podrás elegir el proveedor, el importe, si es ingreso o gasto y vincularla a un cliente.
              </p>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => { setPaginas([]); setPaso('captura'); }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><polyline points="15 18 9 12 15 6" /></svg>
                  Nueva
                </button>
                <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ flex: 2, justifyContent: 'center' }}
                  onClick={confirmar} disabled={!paginas.length}>
                  Continuar{paginas.length > 1 ? ` (${paginas.length} hojas)` : ''}
                </button>
              </div>
            </>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
