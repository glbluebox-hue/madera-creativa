import { useEffect, useRef, useState } from 'react';
import { connect, getConnectEmbedUrl } from 'trimble-connect-workspace-api';
import type { WorkspaceAPI } from 'trimble-connect-workspace-api';
import * as api from './api.js';
import type { Modelo3D, Proyecto } from './types.js';
import { formatoFecha } from './calculos.js';
import { esArchivoSeleccionado, esProyectoSeleccionado, archivoAModelo3D } from './diseno-3d.js';
import styles from './styles.module.css';

export type Diseno3DVistaProps = {
  proyectoId: string;
  modelo3D: Modelo3D | null | undefined;
  onActualizarProyecto: (proyecto: Proyecto) => void;
};

type EstadoConexion = 'comprobando' | 'no_conectado' | 'conectado';
type Panel = null | 'elegir_proyecto' | 'elegir_archivo' | 'visor';

/**
 * Diseño 3D (Fase SketchUp/Trimble Connect, 30/08/2026) — el archivo
 * `.skp` vive siempre en Trimble Connect, nunca en Madera Creativa; este
 * componente solo guarda la asociación e incrusta los componentes
 * OFICIALES de Trimble (`trimble-connect-workspace-api`, iframe) para
 * elegir y ver el archivo — nunca reconstruye su interfaz ni adivina una
 * URL de SketchUp por su cuenta. "Visualizar en SketchUp" abre el mismo
 * panel embebido de Trimble; el propio botón "Edit in SketchUp" de
 * Trimble (ya integrado en su interfaz) abre SketchUp for Web con el
 * modelo cargado — no existe (documentación oficial verificada,
 * 30/08/2026) ninguna forma de abrir SketchUp Desktop directamente desde
 * una web externa.
 */
export function Diseno3DVista({ proyectoId, modelo3D, onActualizarProyecto }: Diseno3DVistaProps) {
  const [estadoConexion, setEstadoConexion] = useState<EstadoConexion>('comprobando');
  const [conectando, setConectando] = useState(false);
  const [error, setError] = useState('');

  const [panel, setPanel] = useState<Panel>(null);
  const [proyectoTrimbleId, setProyectoTrimbleId] = useState<string | null>(null);
  const [cargandoPanel, setCargandoPanel] = useState(false);
  const [asociando, setAsociando] = useState(false);
  const [desasociando, setDesasociando] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const workspaceRef = useRef<WorkspaceAPI | null>(null);

  useEffect(() => {
    api.trimbleEstado()
      .then((r) => setEstadoConexion(r.conectado ? 'conectado' : 'no_conectado'))
      .catch(() => setEstadoConexion('no_conectado'));
  }, []);

  const conectarConSketchUp = async () => {
    setConectando(true);
    setError('');
    try {
      const url = await api.trimbleUrlConectar();
      window.location.href = url; // navegación completa a id.trimble.com — nunca un formulario propio
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la conexión con SketchUp.');
      setConectando(false);
    }
  };

  /** Conecta el iframe ya renderizado al Workspace API de Trimble y le pasa el access token — mismo paso previo para elegir proyecto, elegir archivo o ver el modelo. */
  const iniciarPanel = async (siguiente: Panel) => {
    setCargandoPanel(true);
    setError('');
    try {
      const accessToken = await api.trimbleTokenEmbed();
      if (!iframeRef.current) throw new Error('No se pudo preparar la ventana de SketchUp.');
      const ws = await connect(iframeRef.current, (event, data) => manejarEvento(event, data));
      workspaceRef.current = ws;
      await ws.embed.setTokens({ accessToken });

      if (siguiente === 'elegir_proyecto') {
        await ws.embed.initProjectList({});
      } else if (siguiente === 'elegir_archivo' && proyectoTrimbleId) {
        await ws.embed.initFileExplorer({ projectId: proyectoTrimbleId });
      } else if (siguiente === 'visor' && modelo3D) {
        await ws.embed.init3DViewer({ projectId: modelo3D.trimbleProjectId, modelId: modelo3D.trimbleFileId });
      }
      setPanel(siguiente);
    } catch (err) {
      if (err instanceof api.ErrorConexionTrimbleCaducada) {
        setEstadoConexion('no_conectado');
        setError('Tu conexión con SketchUp ha caducado — vuelve a conectarla.');
      } else {
        setError('No se pudo abrir el panel de SketchUp. Comprueba tu conexión e inténtalo de nuevo.');
      }
    } finally {
      setCargandoPanel(false);
    }
  };

  /** Eventos del iframe embebido (selección de proyecto/archivo) — ver `embed.onAction` en la documentación de `trimble-connect-workspace-api`. */
  const manejarEvento = (event: string, data: unknown) => {
    if (event !== 'embed.onAction') return;
    const seleccion = (data as { data?: unknown })?.data;

    if (panel === 'elegir_proyecto' && esProyectoSeleccionado(seleccion)) {
      setProyectoTrimbleId(seleccion.id);
      void iniciarPanel('elegir_archivo');
      return;
    }

    if (panel === 'elegir_archivo' && esArchivoSeleccionado(seleccion) && proyectoTrimbleId) {
      void asociar(archivoAModelo3D(seleccion, proyectoTrimbleId));
    }
  };

  const asociar = async (datos: api.DatosModelo3D) => {
    setAsociando(true);
    setError('');
    try {
      const proyectoActualizado = await api.asociarModelo3D(proyectoId, datos);
      onActualizarProyecto(proyectoActualizado);
      cerrarPanel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo asociar el modelo 3D.');
    } finally {
      setAsociando(false);
    }
  };

  const desasociar = async () => {
    setDesasociando(true);
    setError('');
    try {
      onActualizarProyecto(await api.quitarModelo3D(proyectoId));
    } catch {
      setError('No se pudo desasociar el modelo — inténtalo de nuevo.');
    } finally {
      setDesasociando(false);
    }
  };

  const cerrarPanel = () => {
    setPanel(null);
    setProyectoTrimbleId(null);
    workspaceRef.current = null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <h3 className={styles.h3}>🧊 Diseño 3D</h3>

      {estadoConexion === 'comprobando' && (
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>Comprobando tu conexión con SketchUp…</p>
      )}

      {estadoConexion === 'no_conectado' && (
        <div style={{ padding: '0.7rem 0.8rem', borderRadius: 8, background: 'var(--fondo-caja)' }}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.84rem' }}>
            Conecta tu cuenta de SketchUp/Trimble para asociar modelos 3D a tus proyectos — solo hace falta una vez.
          </p>
          <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} onClick={conectarConSketchUp} disabled={conectando}>
            {conectando ? 'Conectando…' : '🔗 Conectar con SketchUp'}
          </button>
        </div>
      )}

      {estadoConexion === 'conectado' && !modelo3D && (
        <div style={{ padding: '0.7rem 0.8rem', borderRadius: 8, border: '1px dashed var(--borde)' }}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.84rem', color: 'var(--topo-claro)' }}>
            Este proyecto todavía no tiene ningún modelo 3D asociado.
          </p>
          <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => iniciarPanel('elegir_proyecto')} disabled={cargandoPanel}>
            {cargandoPanel ? 'Abriendo SketchUp…' : '+ Asociar modelo de SketchUp'}
          </button>
        </div>
      )}

      {estadoConexion === 'conectado' && modelo3D && (
        <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.7rem 0.8rem', borderRadius: 8, background: 'var(--fondo-caja)' }}>
          {modelo3D.thumbnailUrl && (
            <img src={modelo3D.thumbnailUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 160 }}>
            <strong style={{ display: 'block', fontSize: '0.88rem' }}>{modelo3D.nombreArchivo}</strong>
            <span style={{ fontSize: '0.74rem', color: 'var(--topo-claro)' }}>
              Versión {modelo3D.version} · actualizado {formatoFecha(modelo3D.actualizado)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem' }} onClick={() => iniciarPanel('visor')} disabled={cargandoPanel}>
              Visualizar modelo 3D
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.78rem' }} onClick={() => iniciarPanel('visor')} disabled={cargandoPanel}>
              {cargandoPanel ? 'Abriendo…' : '🟢 Visualizar en SketchUp'}
            </button>
            <button type="button" onClick={desasociar} disabled={desasociando} style={{ background: 'none', border: 'none', color: 'var(--topo-claro)', cursor: 'pointer', fontSize: '0.76rem' }}>
              {desasociando ? 'Quitando…' : 'Quitar asociación'}
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--rojo)' }}>{error}</p>}

      {panel && (
        <div className={styles.overlay} onClick={cerrarPanel}>
          <div className={styles.modal} style={{ maxWidth: 900, width: '92vw', padding: '1rem', height: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h2 className={styles.modalTitulo} style={{ margin: 0 }}>
                {panel === 'elegir_proyecto' && 'Elige el proyecto de Trimble Connect'}
                {panel === 'elegir_archivo' && 'Elige el archivo .skp'}
                {panel === 'visor' && (modelo3D?.nombreArchivo || 'Modelo 3D')}
              </h2>
              <button type="button" className={styles.btn} onClick={cerrarPanel}>Cerrar</button>
            </div>
            {panel === 'visor' && (
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.76rem', color: 'var(--topo-claro)' }}>
                Usa el botón "Edit in SketchUp" de Trimble Connect, dentro de este panel, para abrirlo en SketchUp for Web.
              </p>
            )}
            {asociando && <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem' }}>Asociando modelo…</p>}
            <iframe
              ref={iframeRef}
              src={getConnectEmbedUrl('prod')}
              title="Trimble Connect"
              style={{ flex: 1, border: 'none', borderRadius: 8 }}
              allow="clipboard-write"
            />
          </div>
        </div>
      )}
    </div>
  );
}
