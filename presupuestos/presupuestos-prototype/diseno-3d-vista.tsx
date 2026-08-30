import { useRef, useState } from 'react';
import * as api from './api.js';
import type { Modelo3D, Proyecto } from './types.js';
import { formatoFecha } from './calculos.js';
import { leerArchivoComoBase64 } from './archivos.js';
import { validarModelo3D, formatoTamano, EXTENSION_MODELO_3D_PERMITIDA } from './modelo-3d-archivo.js';
import { VisorModelo3D } from './visor-modelo-3d.js';
import styles from './styles.module.css';

export type Diseno3DVistaProps = {
  proyectoId: string;
  modelo3D: Modelo3D | null | undefined;
  onActualizarProyecto: (proyecto: Proyecto) => void;
};

/** Punto de entrada oficial de SketchUp for Web (help.sketchup.com) — pide iniciar sesión con Trimble ID si hace falta; no hay una URL oficial que abra un proyecto/archivo concreto sin pasar por ahí primero. */
const URL_SKETCHUP = 'https://app.sketchup.com';

/**
 * Diseño 3D (30/08/2026) — subida manual de un modelo `.glb`, visor
 * propio (`visor-modelo-3d.tsx`) y un enlace externo a SketchUp/Trimble
 * (el usuario inicia sesión ahí mismo; Madera Creativa nunca gestiona esa
 * autenticación). La integración por OAuth con Trimble Connect
 * (`trimble-rutas.ts`, backend) queda aparcada en espera de credenciales
 * oficiales — el día que se retome, aquí es donde iría un botón
 * "Conectar con Trimble Connect" adicional, sin tocar nada de lo de abajo.
 */
export function Diseno3DVista({ proyectoId, modelo3D, onActualizarProyecto }: Diseno3DVistaProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [desasociando, setDesasociando] = useState(false);
  const [visorAbierto, setVisorAbierto] = useState(false);
  const [error, setError] = useState('');

  const subirArchivo = async (file: File) => {
    setError('');
    const validacion = validarModelo3D(file);
    if (validacion.valido === false) { setError(validacion.motivo); return; }

    setSubiendo(true);
    try {
      const url = await leerArchivoComoBase64(file);
      const proyectoActualizado = await api.subirModelo3DArchivo(proyectoId, { nombreArchivo: file.name, url });
      onActualizarProyecto(proyectoActualizado);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el modelo 3D.');
    } finally {
      setSubiendo(false);
    }
  };

  const eliminar = async () => {
    setDesasociando(true);
    setError('');
    try {
      onActualizarProyecto(await api.quitarModelo3D(proyectoId));
    } catch {
      setError('No se pudo eliminar el modelo — inténtalo de nuevo.');
    } finally {
      setDesasociando(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <h3 className={styles.h3}>🧊 Diseño 3D</h3>

      {!modelo3D ? (
        <div style={{ padding: '0.7rem 0.8rem', borderRadius: 8, border: '1px dashed var(--borde)' }}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.84rem', color: 'var(--topo-claro)' }}>
            Este proyecto todavía no tiene ningún modelo 3D. Sube un archivo .{EXTENSION_MODELO_3D_PERMITIDA} para verlo aquí.
          </p>
          <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => inputRef.current?.click()} disabled={subiendo}>
            {subiendo ? 'Subiendo…' : `+ Subir modelo 3D (.${EXTENSION_MODELO_3D_PERMITIDA})`}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.7rem 0.8rem', borderRadius: 8, background: 'var(--fondo-caja)' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <strong style={{ display: 'block', fontSize: '0.88rem' }}>{modelo3D.nombreArchivo}</strong>
            <span style={{ fontSize: '0.74rem', color: 'var(--topo-claro)' }}>
              .{modelo3D.formato || EXTENSION_MODELO_3D_PERMITIDA}
              {typeof modelo3D.tamano === 'number' && ` · ${formatoTamano(modelo3D.tamano)}`}
              {' · actualizado '}{formatoFecha(modelo3D.actualizado)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.78rem' }} onClick={() => setVisorAbierto(true)}>
              Visualizar en 3D
            </button>
            {modelo3D.url && (
              <a href={modelo3D.url} download={modelo3D.nombreArchivo} className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem', textDecoration: 'none' }}>
                Descargar modelo
              </a>
            )}
            <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem' }} onClick={() => inputRef.current?.click()} disabled={subiendo}>
              {subiendo ? 'Subiendo…' : 'Reemplazar'}
            </button>
            <button type="button" onClick={eliminar} disabled={desasociando} style={{ background: 'none', border: 'none', color: 'var(--rojo)', cursor: 'pointer', fontSize: '0.76rem' }}>
              {desasociando ? 'Eliminando…' : 'Eliminar'}
            </button>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".glb,model/gltf-binary"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void subirArchivo(file);
        }}
      />

      {error && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--rojo)' }}>{error}</p>}

      {/* Enlace externo — SketchUp/Trimble gestiona su propio login, Madera Creativa no interviene ni almacena nada de esa sesión. */}
      <a
        href={URL_SKETCHUP}
        target="_blank"
        rel="noopener noreferrer"
        className={`${styles.btn} ${styles.btnSecundario}`}
        style={{ fontSize: '0.78rem', alignSelf: 'flex-start', textDecoration: 'none' }}
      >
        🟢 Visualizar en SketchUp ↗
      </a>

      {visorAbierto && modelo3D?.url && (
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
