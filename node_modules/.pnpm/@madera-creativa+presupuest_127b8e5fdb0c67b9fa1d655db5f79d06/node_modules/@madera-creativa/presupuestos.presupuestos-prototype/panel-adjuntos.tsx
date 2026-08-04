import { useRef } from 'react';
import type { Adjunto } from './types.js';
import { generarId } from './mock.js';
import { formatoTamano } from './calculos.js';
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

  const subir = (files: FileList | null) => {
    if (!files) return;
    Array.from(files)
      .filter((file) => file.type === 'application/pdf' || file.type.startsWith('image/'))
      .forEach((file) => {
      const lector = new FileReader();
      lector.onload = () => {
        onAnadir({
          id: generarId(),
          nombre: file.name,
          tipo: file.type,
          tamano: file.size,
          url: String(lector.result),
        });
      };
      lector.readAsDataURL(file);
    });
  };

  const esImagen = (tipo: string) => tipo.startsWith('image/');

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitulo}>📎 Archivos del proyecto</h3>
        <button
          className={`${styles.btn} ${styles.btnPrimario}`}
          onClick={() => inputRef.current?.click()}
        >
          ⬆️ Subir PDF o imágenes
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
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⬆️</div>
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
              <button className={styles.adjuntoBorrar} onClick={() => onBorrar(a.id)} title="Borrar">✕</button>
              {esImagen(a.tipo) ? (
                <a href={a.url} target="_blank" rel="noreferrer">
                  <img src={a.url} alt={a.nombre} className={styles.adjuntoImg} />
                </a>
              ) : (
                <a href={a.url} download={a.nombre} className={styles.adjuntoFile} style={{ textDecoration: 'none' }}>
                  📄
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
