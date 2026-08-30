import { useState } from 'react';
import type { Modelo3D } from './types.js';
import { formatoFecha } from './calculos.js';
import { formatoTamano } from './modelo-3d-archivo.js';
import { VisorModelo3D } from './visor-modelo-3d.js';
import { BotonSubirModelo3D } from './boton-subir-modelo-3d.js';
import styles from './styles.module.css';

/** Punto de entrada oficial de SketchUp for Web (help.sketchup.com) — pide iniciar sesión con Trimble ID si hace falta; no hay una URL oficial que abra un proyecto/archivo concreto sin pasar por ahí primero. */
const URL_SKETCHUP = 'https://app.sketchup.com';

export type TarjetaModelo3DProps = {
  modelo3D: Modelo3D;
  subiendo: boolean;
  desasociando: boolean;
  onReemplazar: (file: File) => void;
  onEliminar: () => void;
};

/**
 * Tarjeta del dibujo 3D ya subido (Fase "Diseño 3D", 30/08/2026) — solo
 * se renderiza cuando HAY un modelo; el enlace "Ver en SketchUp" vive
 * únicamente aquí, al lado del propio dibujo, porque sin un modelo
 * asociado no tiene sentido ofrecerlo.
 */
export function TarjetaModelo3D({ modelo3D, subiendo, desasociando, onReemplazar, onEliminar }: TarjetaModelo3DProps) {
  const [visorAbierto, setVisorAbierto] = useState(false);

  return (
    <div style={{ marginTop: '1rem', display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.7rem 0.8rem', borderRadius: 8, background: 'var(--fondo-caja)' }}>
      <div
        onClick={() => setVisorAbierto(true)}
        title="Visualizar en 3D"
        style={{ width: 72, height: 72, flexShrink: 0, cursor: 'pointer', borderRadius: 6, overflow: 'hidden' }}
      >
        {modelo3D.url && <VisorModelo3D src={modelo3D.url} nombreArchivo={modelo3D.nombreArchivo} />}
      </div>

      <div style={{ flex: 1, minWidth: 160 }}>
        <strong style={{ display: 'block', fontSize: '0.88rem' }}>{modelo3D.nombreArchivo}</strong>
        <span style={{ fontSize: '0.74rem', color: 'var(--topo-claro)' }}>
          .{modelo3D.formato || 'glb'}
          {typeof modelo3D.tamano === 'number' && ` · ${formatoTamano(modelo3D.tamano)}`}
          {' · actualizado '}{formatoFecha(modelo3D.actualizado)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.78rem' }} onClick={() => setVisorAbierto(true)}>
          Visualizar en 3D
        </button>
        {modelo3D.url && (
          <a href={modelo3D.url} download={modelo3D.nombreArchivo} className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem', textDecoration: 'none' }}>
            Descargar modelo
          </a>
        )}
        <BotonSubirModelo3D subiendo={subiendo} onArchivo={onReemplazar} reemplazar />
        <button type="button" onClick={onEliminar} disabled={desasociando} style={{ background: 'none', border: 'none', color: 'var(--rojo)', cursor: 'pointer', fontSize: '0.76rem' }}>
          {desasociando ? 'Eliminando…' : 'Eliminar'}
        </button>
        {/* "Ver en SketchUp" — solo aparece aquí, junto al dibujo, porque solo tiene sentido cuando hay un modelo que abrir. */}
        <a
          href={URL_SKETCHUP}
          target="_blank"
          rel="noopener noreferrer"
          className={`${styles.btn} ${styles.btnSecundario}`}
          style={{ fontSize: '0.78rem', textDecoration: 'none' }}
        >
          🟢 Ver en SketchUp ↗
        </a>
      </div>

      {visorAbierto && modelo3D.url && (
        <div className={styles.overlay} onClick={() => setVisorAbierto(false)}>
          <div className={styles.modal} style={{ maxWidth: 900, width: '92vw', height: '80vh', padding: '1rem', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h2 className={styles.modalTitulo} style={{ margin: 0 }}>{modelo3D.nombreArchivo}</h2>
              <button type="button" className={styles.btn} onClick={() => setVisorAbierto(false)}>Cerrar</button>
            </div>
            <div style={{ flex: 1 }}>
              <VisorModelo3D src={modelo3D.url} nombreArchivo={modelo3D.nombreArchivo} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
