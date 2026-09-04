import { useState, useEffect, useCallback } from 'react';
import * as api from './api.js';
import type { PlantillaMC, DocumentoMC } from './documento-modelo.js';
import { PAGINA_A4 } from './documento-modelo.js';
import type { Empresa } from './use-empresa.js';
import type { PlanAcceso } from './planes.js';
import { EditorDocumento } from './editor-documento.js';
import { generarId } from './mock.js';
import { leerArchivoComoBase64 } from './archivos.js';
import { formatoFecha } from './calculos.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import styles from './styles.module.css';

export type PlantillasVistaProps = {
  empresa: Empresa;
  onActualizarEmpresa: (cambios: Partial<Empresa>) => void;
  /** Ver `EditorDocumentoProps.plan` (Fase 4, 05/09/2026). */
  plan?: PlanAcceso;
  /** Bypass administrativo (05/09/2026) — ver `puedeUsar()` en `planes.ts`. */
  esAdmin?: boolean;
};

/** Documento en blanco para una plantilla nueva — mismo criterio que el fallback interno de `EditorDocumento`, con la diferencia de que aquí sí se puede fijar un fondo de partida (imagen subida por el usuario) desde el momento de la creación. */
function documentoBaseVacio(fondoImagenUrl?: string): DocumentoMC {
  return {
    id: generarId(), schemaVersion: 1, documentoBaseId: null, etiquetaVersion: null, documentVersion: 1, plantillaOrigen: null,
    paginas: [{
      id: generarId(), indice: 0, nombre: '', configuracion: null,
      fondo: fondoImagenUrl ? { tipo: 'imagen', imagenUrl: fondoImagenUrl, ajuste: 'cubrir' } : null,
      encabezado: null, pie: null, numeracion: { mostrar: false, formato: 'Página {n} de {total}', posicion: 'centro' }, elementos: [],
    }],
    configuracionPorDefecto: { ancho: PAGINA_A4.ancho, alto: PAGINA_A4.alto, orientacion: 'vertical', margenes: { arriba: 40, abajo: 40, izquierda: 40, derecha: 40 } },
    fondoPorDefecto: { tipo: 'ninguno' }, encabezadoPorDefecto: null, piePorDefecto: null,
    variables: { claves: {} }, configuracionImpresion: { sangrado: 0, escala: 1 }, tema: null, estilosGuardados: [],
  };
}

/**
 * Gestión de plantillas del Motor Documental — hasta ahora una plantilla
 * solo se podía crear desde "Guardar como plantilla" dentro del editor de
 * un presupuesto, sin ningún sitio para verlas todas, renombrarlas,
 * borrarlas o volver a abrir su contenido para seguir editándolo. Esta
 * vista cubre ese hueco: lista, renombra (mismo `guardarPlantilla` que ya
 * existía, solo cambia `nombre`), borra, y abre `EditorDocumento`
 * directamente sobre `documentoBase` — el mismo editor que usa cualquier
 * presupuesto, adaptado con el `contenedor` genérico del Incremento 12.
 */
export function PlantillasVista({ empresa, onActualizarEmpresa, plan, esAdmin }: PlantillasVistaProps) {
  const [plantillas, setPlantillas] = useState<PlantillaMC[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorAbierto, setEditorAbierto] = useState<PlantillaMC | null>(null);

  const [nombreNueva, setNombreNueva] = useState('');
  const [fondoNuevaFile, setFondoNuevaFile] = useState<File | null>(null);
  const [creando, setCreando] = useState(false);

  const [nombresEditados, setNombresEditados] = useState<Record<string, string>>({});
  const [guardandoNombreDe, setGuardandoNombreDe] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    api.obtenerPlantillas()
      .then(setPlantillas)
      .catch((e) => setError(String(e).replace(/^Error:\s*/, '')))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async () => {
    if (!nombreNueva.trim()) return;
    setCreando(true);
    setError(null);
    try {
      let fondoImagenUrl: string | undefined;
      if (fondoNuevaFile) {
        const dataUrl = await leerArchivoComoBase64(fondoNuevaFile);
        const recurso = await api.subirRecurso({ nombre: fondoNuevaFile.name, tipo: 'fondo', ambito: 'usuario', etiquetas: [], dataUrl });
        fondoImagenUrl = recurso.url;
      }
      const ahora = new Date().toISOString();
      const nueva: PlantillaMC = {
        id: generarId(), nombre: nombreNueva.trim(), ambito: 'usuario',
        documentoBase: documentoBaseVacio(fondoImagenUrl),
        creadoEn: ahora, actualizadoEn: ahora,
      };
      const guardada = await api.guardarPlantilla(nueva);
      setPlantillas((prev) => [guardada, ...prev]);
      setNombreNueva('');
      setFondoNuevaFile(null);
      setEditorAbierto(guardada);
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setCreando(false);
    }
  };

  const guardarNombre = async (plantilla: PlantillaMC) => {
    const nombre = (nombresEditados[plantilla.id] ?? plantilla.nombre).trim();
    if (!nombre || nombre === plantilla.nombre) return;
    setGuardandoNombreDe(plantilla.id);
    try {
      const guardada = await api.guardarPlantilla({ ...plantilla, nombre, actualizadoEn: new Date().toISOString() });
      setPlantillas((prev) => prev.map((p) => (p.id === guardada.id ? guardada : p)));
      setNombresEditados((prev) => { const { [plantilla.id]: _omitida, ...resto } = prev; return resto; });
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setGuardandoNombreDe(null);
    }
  };

  const borrar = async (id: string) => {
    try {
      await api.borrarPlantilla(id);
      setPlantillas((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    }
  };

  const guardarContenidoEditor = async (plantilla: PlantillaMC, c: { titulo: string; contenidoDocumento: Record<string, unknown>; actualizado: string }) => {
    const guardada = await api.guardarPlantilla({ ...plantilla, nombre: c.titulo, documentoBase: c.contenidoDocumento as unknown as DocumentoMC, actualizadoEn: c.actualizado });
    setPlantillas((prev) => prev.map((p) => (p.id === guardada.id ? guardada : p)));
    setEditorAbierto(guardada);
  };

  if (editorAbierto) {
    return (
      <EditorDocumento
        contenedor={{
          id: editorAbierto.id, titulo: editorAbierto.nombre,
          contenidoDocumento: editorAbierto.documentoBase as unknown as Record<string, unknown>, creado: editorAbierto.creadoEn, actualizado: editorAbierto.actualizadoEn,
        }}
        clienteId="" clienteNombre=""
        empresa={empresa}
        esPlantilla
        onGuardar={(c) => guardarContenidoEditor(editorAbierto, c)}
        onVolver={() => setEditorAbierto(null)}
        onCambiarLogoEmpresa={(logo) => onActualizarEmpresa({ logo })}
        plan={plan}
        esAdmin={esAdmin}
      />
    );
  }

  if (cargando) return <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>Cargando plantillas…</p>;

  return (
    <div>
      {error && <p style={{ color: 'var(--rojo)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}

      <div style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem', background: 'var(--fondo-panel)' }}>
        <p style={{ margin: '0 0 0.6rem', fontWeight: 700, fontSize: '0.9rem' }}>+ Nueva plantilla</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <input
            className={styles.input}
            placeholder="Nombre de la plantilla (ej. Plantilla 1)"
            value={nombreNueva}
            onChange={(e) => setNombreNueva(e.target.value)}
          />
          <label style={{ fontSize: '0.78rem', color: 'var(--topo-claro)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Fondo de base (opcional — una foto o escaneo del papel a replicar):
            <input type="file" accept="image/*" onChange={(e) => setFondoNuevaFile(e.target.files?.[0] ?? null)} />
          </label>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={crear} disabled={creando || !nombreNueva.trim()} style={{ alignSelf: 'flex-start' }}>
            {creando ? 'Creando…' : 'Crear y abrir el editor'}
          </button>
        </div>
      </div>

      {plantillas.length === 0 ? (
        <div className={styles.vacio}>
          <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
          </div>
          <p>Todavía no hay ninguna plantilla.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {plantillas.map((p) => {
            const nombreActual = nombresEditados[p.id] ?? p.nombre;
            const hayCambioNombre = nombreActual.trim() !== p.nombre && nombreActual.trim().length > 0;
            return (
              <div key={p.id} className={styles.filaLista} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', padding: '1rem',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: '1 1 220px' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <input
                      className={styles.input}
                      value={nombreActual}
                      onChange={(e) => setNombresEditados((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      style={{ fontWeight: 700, fontSize: '0.9rem' }}
                    />
                    {hayCambioNombre && (
                      <button className={styles.btn} onClick={() => guardarNombre(p)} disabled={guardandoNombreDe === p.id} style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                        {guardandoNombreDe === p.id ? 'Guardando…' : '💾 Guardar nombre'}
                      </button>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-muy-claro)' }}>
                    {p.ambito === 'corporativa' ? 'Corporativa' : p.ambito === 'compartida' ? 'Compartida' : p.ambito === 'ia' ? 'Generada por IA' : 'Personal'} · Creada {formatoFecha(p.creadoEn)}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => setEditorAbierto(p)}>Editar contenido</button>
                  <ConfirmarBorrado onConfirmar={() => borrar(p.id)} titulo="Borrar plantilla" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
