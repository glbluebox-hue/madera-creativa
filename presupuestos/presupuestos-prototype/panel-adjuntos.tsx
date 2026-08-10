import { useRef, useState } from 'react';
import type { Adjunto } from './types.js';
import { generarId } from './mock.js';
import { formatoTamano } from './calculos.js';
import { leerArchivoComoBase64 } from './archivos.js';
import { comprimirImagen } from './procesamiento-imagenes.js';
import styles from './styles.module.css';

/** Props del panel de archivos adjuntos. */
export type PanelAdjuntosProps = {
  /** Archivos adjuntos del proyecto. */
  adjuntos: Adjunto[];
  /** Se llama al subir un nuevo adjunto. */
  onAnadir: (a: Adjunto) => void;
  /** Se llama al borrar un adjunto por id. */
  onBorrar: (id: string) => void;
};

/**
 * Panel para subir y visualizar archivos del proyecto: diseños técnicos,
 * medidas y fotos del lugar de trabajo.
 */
export function PanelAdjuntos({ adjuntos, onAnadir, onBorrar }: PanelAdjuntosProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Confirmación de borrado (Incremento 1.8): la insignia circular no tiene
  // espacio para un par Sí/No, así que el primer clic solo la "arma" (2
  // segundos para confirmar con un segundo clic) en vez de borrar directo.
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  const pedirBorrar = (id: string) => {
    if (confirmandoId === id) {
      onBorrar(id);
      setConfirmandoId(null);
      return;
    }
    setConfirmandoId(id);
    setTimeout(() => setConfirmandoId((actual) => (actual === id ? null : actual)), 3000);
  };

  const subir = (files: FileList | null) => {
    if (!files) return;
    Array.from(files)
      .filter((file) => file.type === 'application/pdf' || file.type.startsWith('image/'))
      .forEach(async (file) => {
        const esImagen = file.type.startsWith('image/');
        const { url, tamano, tipo } = esImagen
          ? await comprimirImagen(file).then(async ({ blob }) => ({ url: await leerArchivoComoBase64(blob), tamano: blob.size, tipo: blob.type }))
          : { url: await leerArchivoComoBase64(file), tamano: file.size, tipo: file.type };
        onAnadir({
          id: generarId(),
          nombre: file.name,
          tipo,
          tamano,
          url,
        });
      });
  };

  const esImagen = (tipo: string) => tipo.startsWith('image/');

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitulo} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
          Archivos del proyecto
        </h3>
        <button
          className={`${styles.btn} ${styles.btnPrimario}`}
          onClick={() => inputRef.current?.click()}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          Subir PDF o imágenes
        </button>
      </div>

      <div
        className={styles.zonaSubida}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          subir(e.dataTransfer.files);
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem', color: 'var(--topo-muy-claro)' }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
        </div>
        <p style={{ margin: 0 }}>
          Haz clic o arrastra aquí diseños técnicos, medidas o fotos del lugar (PDF o imágenes)
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className={styles.inputFile}
          onChange={(e) => subir(e.target.files)}
        />
      </div>

      {adjuntos.length > 0 && (
        <div className={styles.adjuntosGrid}>
          {adjuntos.map((a) => (
            <div key={a.id} className={styles.adjunto}>
              <button
                className={styles.adjuntoBorrar}
                onClick={() => pedirBorrar(a.id)}
                title={confirmandoId === a.id ? '¿Confirmar borrado?' : 'Borrar'}
                aria-label={confirmandoId === a.id ? '¿Confirmar borrado? Pulsa de nuevo para borrar' : 'Borrar adjunto'}
                style={confirmandoId === a.id ? { background: 'var(--rojo)', color: '#fff', borderColor: 'var(--rojo)' } : undefined}
              >
                {confirmandoId === a.id ? '✓' : '✕'}
              </button>
              {esImagen(a.tipo) ? (
                <a href={a.url} target="_blank" rel="noreferrer">
                  <img src={a.url} alt={a.nombre} className={styles.adjuntoImg} />
                </a>
              ) : (
                <a href={a.url} download={a.nombre} className={styles.adjuntoFile} style={{ textDecoration: 'none', color: 'var(--topo-muy-claro)' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                </a>
              )}
              <div className={styles.adjuntoInfo}>
                <p className={styles.adjuntoNombre} title={a.nombre}>{a.nombre}</p>
                <span className={styles.adjuntoTamano}>{formatoTamano(a.tamano)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
