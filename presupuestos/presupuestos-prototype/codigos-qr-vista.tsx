import { useState, useEffect, useRef } from 'react';
import * as api from './api.js';
import { generarId } from './mock.js';
import { leerArchivoComoBase64 } from './archivos.js';
import { comprimirImagen } from './procesamiento-imagenes.js';
import type { CodigoQRMC } from './codigos-qr-modelo.js';
import { Z_MODAL } from './z-index.js';
import { urlImagenFiable } from './imagen-fallback.js';
import { ConfirmarBorrado } from './confirmar-borrado.js';
import styles from './styles.module.css';

/**
 * Sección propia del menú lateral (19/08/2026) — códigos QR ya diseñados
 * por el usuario (ej. un cartel "escanéame y déjanos tu reseña en
 * Google"), no generados por la app. Se suben como imagen, con un nombre,
 * y se pueden abrir a pantalla completa para que el cliente los escanee
 * directamente desde el móvil/tablet del carpintero.
 */
export function CodigosQRVista() {
  const [codigos, setCodigos] = useState<CodigoQRMC[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [visor, setVisor] = useState<CodigoQRMC | null>(null);
  const [nombrePendiente, setNombrePendiente] = useState<{ file: File } | null>(null);
  const [nombre, setNombre] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Edición de un código QR ya guardado — renombrar y, opcionalmente,
  // sustituir la imagen por otra (petición del usuario, 19/08/2026).
  const [editando, setEditando] = useState<CodigoQRMC | null>(null);
  const [nombreEdicion, setNombreEdicion] = useState('');
  const [archivoNuevoEdicion, setArchivoNuevoEdicion] = useState<File | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const inputEdicionRef = useRef<HTMLInputElement>(null);

  const cargar = () => {
    setCargando(true);
    api.obtenerCodigosQR()
      .then(setCodigos)
      .catch((e) => setError(String(e).replace(/^Error:\s*/, '')))
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargar(); }, []);

  const elegirArchivo = (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setNombrePendiente({ file });
    setNombre('');
  };

  const confirmarSubida = async () => {
    if (!nombrePendiente || !nombre.trim()) return;
    setSubiendo(true);
    setError(null);
    try {
      const { blob } = await comprimirImagen(nombrePendiente.file, { maxDim: 1600, calidad: 0.9 });
      const dataUrl = await leerArchivoComoBase64(blob);
      const recurso = await api.subirRecurso({ nombre: nombre.trim(), tipo: 'otro', ambito: 'usuario', etiquetas: ['codigo-qr'], dataUrl });
      const guardado = await api.guardarCodigoQR({ id: generarId(), nombre: nombre.trim(), imagenUrl: recurso.url, creado: new Date().toISOString() });
      setCodigos((prev) => [guardado, ...prev]);
      setNombrePendiente(null);
      setNombre('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el código QR.');
    } finally {
      setSubiendo(false);
    }
  };

  const abrirEdicion = (c: CodigoQRMC) => {
    setEditando(c);
    setNombreEdicion(c.nombre);
    setArchivoNuevoEdicion(null);
  };

  const guardarEdicion = async () => {
    if (!editando || !nombreEdicion.trim()) return;
    setGuardandoEdicion(true);
    setError(null);
    try {
      let imagenUrl = editando.imagenUrl;
      if (archivoNuevoEdicion) {
        const { blob } = await comprimirImagen(archivoNuevoEdicion, { maxDim: 1600, calidad: 0.9 });
        const dataUrl = await leerArchivoComoBase64(blob);
        const recurso = await api.subirRecurso({ nombre: nombreEdicion.trim(), tipo: 'otro', ambito: 'usuario', etiquetas: ['codigo-qr'], dataUrl });
        imagenUrl = recurso.url;
      }
      const guardado = await api.guardarCodigoQR({ ...editando, nombre: nombreEdicion.trim(), imagenUrl });
      setCodigos((prev) => prev.map((c) => (c.id === guardado.id ? guardado : c)));
      setEditando(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el código QR.');
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const borrar = async (id: string) => {
    try {
      await api.borrarCodigoQR(id);
      setCodigos((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar el código QR.');
    }
  };

  if (cargando) return <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>Cargando…</p>;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitulo} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><line x1="14" y1="14" x2="14" y2="21" /><line x1="21" y1="14" x2="21" y2="21" /><line x1="14" y1="17.5" x2="21" y2="17.5" /></svg>
          Códigos QR
        </h3>
        <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { elegirArchivo(e.target.files); e.target.value = ''; }} />
        <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => inputRef.current?.click()}>
          + Subir código QR
        </button>
      </div>

      {error && <p style={{ color: 'var(--rojo)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>{error}</p>}

      {codigos.length === 0 ? (
        <div className={styles.zonaSubida} onClick={() => inputRef.current?.click()}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem', color: 'var(--topo-muy-claro)' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
          </div>
          <p style={{ margin: 0 }}>Sube tu primer código QR (reseñas de Google, redes sociales…)</p>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
            Puedes tener todos los que quieras — se abren a pantalla completa para que el cliente los escanee.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
          {codigos.map((c) => (
            <div key={c.id} style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', background: 'var(--fondo)', border: '1px solid var(--borde)', cursor: 'pointer' }}>
              <img
                src={urlImagenFiable(c.imagenUrl)}
                alt={c.nombre}
                onClick={() => setVisor(c)}
                style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }}
              />
              <div style={{ padding: '0.5rem 0.6rem', background: 'var(--fondo-panel)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</span>
                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                  <button
                    className={styles.btnIcono}
                    title="Editar código QR"
                    aria-label="Editar código QR"
                    onClick={(e) => { e.stopPropagation(); abrirEdicion(c); }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                  </button>
                  <ConfirmarBorrado onConfirmar={() => borrar(c.id)} titulo="Borrar código QR" />
                </div>
              </div>
            </div>
          ))}
          <div
            onClick={() => inputRef.current?.click()}
            style={{
              borderRadius: 6, border: '2px dashed var(--borde)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', aspectRatio: '1/1',
              cursor: 'pointer', color: 'var(--topo-muy-claro)', fontSize: '0.8rem', gap: '0.35rem',
            }}
          >
            <span style={{ fontSize: '1.75rem' }}>+</span>
            <span>Añadir código QR</span>
          </div>
        </div>
      )}

      {/* Pedir nombre tras elegir archivo, antes de subir */}
      {nombrePendiente && (
        <div className={styles.overlay} onClick={() => !subiendo && setNombrePendiente(null)}>
          <div className={styles.modal} style={{ maxWidth: 360, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>Ponle un nombre a este código QR</p>
            <input
              className={styles.input}
              autoFocus
              placeholder="Ej. Reseñas de Google"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmarSubida(); }}
              disabled={subiendo}
            />
            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
              <button className={styles.btn} onClick={() => setNombrePendiente(null)} disabled={subiendo} style={{ fontSize: '0.8rem' }}>Cancelar</button>
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={confirmarSubida} disabled={subiendo || !nombre.trim()} style={{ fontSize: '0.8rem' }}>
                {subiendo ? 'Subiendo…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Editar un código QR ya guardado — renombrar y, opcionalmente, sustituir la imagen */}
      {editando && (
        <div className={styles.overlay} onClick={() => !guardandoEdicion && setEditando(null)}>
          <div className={styles.modal} style={{ maxWidth: 360, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>Editar código QR</p>

            <img
              src={urlImagenFiable(archivoNuevoEdicion ? URL.createObjectURL(archivoNuevoEdicion) : editando.imagenUrl)}
              alt={nombreEdicion}
              style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 6, background: 'var(--fondo)' }}
            />

            <input
              ref={inputEdicionRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setArchivoNuevoEdicion(f); e.target.value = ''; }}
            />
            <button className={styles.btn} onClick={() => inputEdicionRef.current?.click()} disabled={guardandoEdicion} style={{ fontSize: '0.8rem' }}>
              {archivoNuevoEdicion ? 'Imagen nueva elegida — cambiar otra vez' : 'Sustituir la imagen'}
            </button>

            <input
              className={styles.input}
              autoFocus
              placeholder="Nombre"
              value={nombreEdicion}
              onChange={(e) => setNombreEdicion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicion(); }}
              disabled={guardandoEdicion}
            />
            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
              <button className={styles.btn} onClick={() => setEditando(null)} disabled={guardandoEdicion} style={{ fontSize: '0.8rem' }}>Cancelar</button>
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardarEdicion} disabled={guardandoEdicion || !nombreEdicion.trim()} style={{ fontSize: '0.8rem' }}>
                {guardandoEdicion ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visor a pantalla completa */}
      {visor && (
        <div
          onClick={() => setVisor(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,8,6,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: Z_MODAL, padding: '1rem' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <img src={urlImagenFiable(visor.imagenUrl)} alt={visor.nombre} style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: 6 }} />
            <p style={{ color: 'var(--blanco)', margin: 0, fontSize: '0.9rem', textAlign: 'center' }}>{visor.nombre}</p>
          </div>
        </div>
      )}
    </div>
  );
}
