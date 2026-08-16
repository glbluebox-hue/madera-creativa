import { useState, useRef } from 'react';
import { generarId } from './mock.js';
import { EscanerDocumento } from './escaner-documento.js';
import { leerArchivoComoBase64 } from './archivos.js';
import { comprimirImagen } from './procesamiento-imagenes.js';
import { Z_MODAL } from './z-index.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import styles from './styles.module.css';

/** Una foto del proyecto acabado. */
export type FotoProyecto = {
  id: string;
  url: string;
  descripcion: string;
  fecha: string;
};

/** Props de la galería de fotos. */
export type GaleriaFotosProps = {
  fotos: FotoProyecto[];
  onAnadir: (f: FotoProyecto) => void;
  onBorrar: (id: string) => void;
};

/**
 * Galería de fotos del proyecto acabado con visor a pantalla completa.
 * Permite subir desde cámara o archivo y añadir una descripción.
 */
export function GaleriaFotos({ fotos, onAnadir, onBorrar }: GaleriaFotosProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const [visor, setVisor] = useState<FotoProyecto | null>(null);
  const [editandoDesc, setEditandoDesc] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [escanerDoc, setEscanerDoc] = useState(false);

  const subirFotos = (files: FileList | null) => {
    if (!files) return;
    Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .forEach(async (file) => {
        const { blob } = await comprimirImagen(file);
        const url = await leerArchivoComoBase64(blob);
        onAnadir({
          id: generarId(),
          url,
          descripcion: '',
          fecha: new Date().toISOString().slice(0, 10),
        });
      });
  };

  const indiceActual = visor ? fotos.findIndex((f) => f.id === visor.id) : -1;
  const irA = (delta: number) => {
    const nuevo = fotos[indiceActual + delta];
    if (nuevo) setVisor(nuevo);
  };

  return (
    <div className={styles.panel}>
      {/* Cabecera */}
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitulo} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
          Fotos del proyecto
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input ref={camaraRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} onChange={(e) => subirFotos(e.target.files)} />
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => camaraRef.current?.click()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
            Cámara
          </button>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => setEscanerDoc(true)} title="Escanear como documento">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            Documento
          </button>
          <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => subirFotos(e.target.files)} />
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => inputRef.current?.click()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            Subir
          </button>
        </div>
      </div>

      {/* Zona de arrastre si no hay fotos */}
      {fotos.length === 0 && (
        <div
          className={styles.zonaSubida}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); subirFotos(e.dataTransfer.files); }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem', color: 'var(--topo-muy-claro)' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
          </div>
          <p style={{ margin: 0 }}>Haz clic o arrastra aquí las fotos del proyecto terminado</p>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
            También puedes usar la cámara del móvil
          </p>
        </div>
      )}

      {/* Galería */}
      {fotos.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '0.75rem',
          marginTop: '1rem',
        }}>
          {fotos.map((foto) => (
            <div key={foto.id} style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', background: 'var(--fondo)', border: '1px solid var(--borde)', cursor: 'pointer' }}>
              {/* Imagen */}
              <img
                src={foto.url}
                alt={foto.descripcion || 'Foto del proyecto'}
                onClick={() => setVisor(foto)}
                style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
              />

              {/* Pie con descripción y borrar */}
              <div style={{ padding: '0.5rem 0.6rem', background: 'var(--fondo-panel)' }}>
                {editandoDesc === foto.id ? (
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <input
                      className={styles.input}
                      style={{ fontSize: '0.75rem', padding: '3px 6px', flex: 1 }}
                      value={desc}
                      autoFocus
                      placeholder="Descripción…"
                      onChange={(e) => setDesc(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onAnadir({ ...foto, descripcion: desc });
                          onBorrar(foto.id);
                          setEditandoDesc(null);
                        }
                        if (e.key === 'Escape') setEditandoDesc(null);
                      }}
                      onBlur={() => setEditandoDesc(null)}
                    />
                  </div>
                ) : (
                  <p
                    onClick={() => { setEditandoDesc(foto.id); setDesc(foto.descripcion); }}
                    style={{ margin: 0, fontSize: '0.75rem', color: foto.descripcion ? 'var(--negro)' : 'var(--topo-muy-claro)', cursor: 'text', minHeight: 18 }}
                    title="Clic para editar descripción"
                  >
                    {foto.descripcion || '+ Añadir descripción'}
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--topo-muy-claro)' }}>{foto.fecha}</span>
                  <ConfirmarBorrado onConfirmar={() => onBorrar(foto.id)} titulo="Borrar foto" />
                </div>
              </div>
            </div>
          ))}

          {/* Botón añadir más */}
          <div
            onClick={() => inputRef.current?.click()}
            style={{
              borderRadius: 6, border: '2px dashed var(--borde)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', aspectRatio: '4/3',
              cursor: 'pointer', color: 'var(--topo-muy-claro)', fontSize: '0.8rem', gap: '0.35rem',
            }}
          >
            <span style={{ fontSize: '1.75rem' }}>+</span>
            <span>Añadir foto</span>
          </div>
        </div>
      )}

      {/* Escáner de documento */}
      {escanerDoc && (
        <EscanerDocumento
          onCerrar={() => setEscanerDoc(false)}
          onConfirmar={(r) => {
            const fecha = new Date().toISOString().slice(0, 10);
            r.dataUrls.forEach((dataUrl, i) => {
              onAnadir({
                id: generarId(),
                url: dataUrl,
                descripcion: r.dataUrls.length > 1 ? `Documento (${r.modo}) — hoja ${i + 1}` : `Documento (${r.modo})`,
                fecha,
              });
            });
            setEscanerDoc(false);
          }}
        />
      )}

      {/* Visor pantalla completa */}
      {visor && (
        <div
          onClick={() => setVisor(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(10,8,6,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: Z_MODAL, padding: '1rem',
          }}
        >
          <button onClick={(e) => { e.stopPropagation(); irA(-1); }} disabled={indiceActual === 0}
            style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blanco)', cursor: 'pointer', opacity: indiceActual === 0 ? 0.3 : 1 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>

          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <img src={visor.url} alt={visor.descripcion} style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 6 }} />
            {visor.descripcion && (
              <p style={{ color: 'var(--blanco)', margin: 0, fontSize: '0.9rem', textAlign: 'center' }}>{visor.descripcion}</p>
            )}
            <p style={{ color: 'rgba(255,255,255,0.45)', margin: 0, fontSize: '0.75rem' }}>
              {indiceActual + 1} / {fotos.length} · {visor.fecha}
            </p>
          </div>

          <button onClick={(e) => { e.stopPropagation(); irA(1); }} disabled={indiceActual === fotos.length - 1}
            style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blanco)', cursor: 'pointer', opacity: indiceActual === fotos.length - 1 ? 0.3 : 1 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>

          <button onClick={() => setVisor(null)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blanco)', cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
