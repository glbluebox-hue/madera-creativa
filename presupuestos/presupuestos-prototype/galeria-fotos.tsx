import { useState, useRef } from 'react';
import { generarId } from './mock.js';
import { EscanerDocumento } from './escaner-documento.js';
import { leerArchivoComoBase64 } from './archivos.js';
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
  const [confirmBorrar, setConfirmBorrar] = useState<string | null>(null);
  const [editandoDesc, setEditandoDesc] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [escanerDoc, setEscanerDoc] = useState(false);

  const subirFotos = (files: FileList | null) => {
    if (!files) return;
    Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .forEach((file) => {
        leerArchivoComoBase64(file).then((url) => {
          onAnadir({
            id: generarId(),
            url,
            descripcion: '',
            fecha: new Date().toISOString().slice(0, 10),
          });
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
        <h3 className={styles.panelTitulo}>📸 Fotos del proyecto acabado</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input ref={camaraRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }} onChange={(e) => subirFotos(e.target.files)} />
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => camaraRef.current?.click()}>
            📷 Cámara
          </button>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => setEscanerDoc(true)} title="Escanear como documento">
            📄 Documento
          </button>
          <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => subirFotos(e.target.files)} />
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => inputRef.current?.click()}>
            ⬆️ Subir
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
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📸</div>
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
                  {confirmBorrar === foto.id ? (
                    <span style={{ display: 'flex', gap: '0.2rem' }}>
                      <button className={`${styles.btn} ${styles.btnPeligro}`} style={{ fontSize: '0.65rem', padding: '2px 6px' }} onClick={() => { onBorrar(foto.id); setConfirmBorrar(null); }}>Sí</button>
                      <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.65rem', padding: '2px 6px' }} onClick={() => setConfirmBorrar(null)}>No</button>
                    </span>
                  ) : (
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--topo-muy-claro)', padding: 0 }} onClick={() => setConfirmBorrar(foto.id)}>🗑️</button>
                  )}
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
            onAnadir({
              id: generarId(),
              url: r.dataUrl,
              descripcion: `Documento (${r.modo})`,
              fecha: new Date().toISOString().slice(0, 10),
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
            zIndex: 300, padding: '1rem',
          }}
        >
          <button onClick={(e) => { e.stopPropagation(); irA(-1); }} disabled={indiceActual === 0}
            style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 44, height: 44, fontSize: '1.2rem', color: '#fff', cursor: 'pointer', opacity: indiceActual === 0 ? 0.3 : 1 }}>
            ‹
          </button>

          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <img src={visor.url} alt={visor.descripcion} style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 6 }} />
            {visor.descripcion && (
              <p style={{ color: '#fff', margin: 0, fontSize: '0.9rem', textAlign: 'center' }}>{visor.descripcion}</p>
            )}
            <p style={{ color: 'rgba(255,255,255,0.45)', margin: 0, fontSize: '0.75rem' }}>
              {indiceActual + 1} / {fotos.length} · {visor.fecha}
            </p>
          </div>

          <button onClick={(e) => { e.stopPropagation(); irA(1); }} disabled={indiceActual === fotos.length - 1}
            style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 44, height: 44, fontSize: '1.2rem', color: '#fff', cursor: 'pointer', opacity: indiceActual === fotos.length - 1 ? 0.3 : 1 }}>
            ›
          </button>

          <button onClick={() => setVisor(null)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: '1rem', color: '#fff', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
