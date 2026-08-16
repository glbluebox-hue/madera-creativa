import { useRef, useState } from 'react';
import type { Perfil } from './use-perfil.js';
import { leerArchivoComoBase64 } from './archivos.js';
import { comprimirImagen } from './procesamiento-imagenes.js';
import { cambiarAcceso } from './api.js';
import styles from './styles.module.css';

/**
 * Lado largo máximo para la foto de perfil — se muestra siempre en un
 * círculo pequeño (72px aquí, más pequeño aún en la barra lateral), así
 * que no hace falta la resolución de una foto de galería
 * (`DIMENSION_MAXIMA_PX` = 1600 en `procesamiento-imagenes.ts`). Una foto
 * de cámara sin comprimir (12-48 MP) tal cual sale del selector de
 * archivos de una tablet/móvil podía no llegar a guardarse nunca — el
 * `PUT /perfil` fallaba (probablemente por tamaño) y el error se perdía en
 * silencio, así que en la interfaz parecía guardado hasta la siguiente
 * recarga (reportado por el usuario probando en tablet, 15/08/2026).
 */
const DIMENSION_MAXIMA_FOTO_PERFIL = 400;

/** Props del modal "Mi perfil". */
export type AjustesPerfilProps = {
  /** Datos actuales del perfil. */
  perfil: Perfil;
  /** Nombre de acceso (login) — se usa como reserva mientras no haya nombre para mostrar. */
  nombreAcceso: string;
  /** Guarda los cambios del perfil en el servidor. Devuelve si el guardado tuvo éxito. */
  onGuardar: (cambios: Partial<Perfil>) => Promise<boolean>;
  /**
   * Se llama tras cambiar el usuario y/o contraseña de acceso con éxito —
   * el llamante debe actualizar la sesión igual que en un login normal
   * (`loginDirecto` de `use-auth.ts`), porque el usuario de acceso puede
   * haber cambiado y el servidor ya ha emitido una sesión nueva.
   */
  onCambioAcceso: (id: string, nombre: string, esAdmin: boolean) => void;
  /** Cierra el modal. */
  onCerrar: () => void;
};

/**
 * Modal "Mi perfil": nombre para mostrar (barra lateral, saludo de Inicio)
 * y foto de perfil — independientes del usuario/contraseña de acceso, que
 * no se tocan aquí. Mismo patrón de subida de imagen que el logo de
 * empresa (`ajustes-empresa.tsx`): se guarda como data URL, sin pasar por
 * el servicio de almacenamiento de archivos.
 */
export function AjustesPerfil({ perfil, nombreAcceso, onGuardar, onCambioAcceso, onCerrar }: AjustesPerfilProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nombreMostrar, setNombreMostrar] = useState(perfil.nombreMostrar);
  const [foto, setFoto] = useState(perfil.foto);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  // Usuario y contraseña de acceso — sección aparte, plegada por defecto:
  // es una acción sensible (cambia cómo entras a la app) y no debe
  // confundirse con "nombre para mostrar" (sin ningún riesgo).
  const [mostrarAcceso, setMostrarAcceso] = useState(false);
  const [passwordActual, setPasswordActual] = useState('');
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordNuevaConfirmar, setPasswordNuevaConfirmar] = useState('');
  const [errorAcceso, setErrorAcceso] = useState('');
  const [exitoAcceso, setExitoAcceso] = useState('');
  const [guardandoAcceso, setGuardandoAcceso] = useState(false);

  const subirFoto = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setErrorGuardar('');
    setSubiendoFoto(true);
    try {
      // Redimensiona/comprime antes de codificar — mismo patrón que
      // `galeria-fotos.tsx`. Sin este paso, una foto de cámara real (varios
      // MB) es lo que hacía que "Guardar" fallara de forma silenciosa.
      const { blob } = await comprimirImagen(file, { maxDim: DIMENSION_MAXIMA_FOTO_PERFIL });
      setFoto(await leerArchivoComoBase64(blob));
    } catch {
      setErrorGuardar('No se pudo procesar esa imagen. Prueba con otra foto.');
    } finally {
      setSubiendoFoto(false);
    }
  };

  const guardar = async () => {
    setErrorGuardar('');
    setGuardandoPerfil(true);
    const ok = await onGuardar({ nombreMostrar: nombreMostrar.trim(), foto });
    setGuardandoPerfil(false);
    if (!ok) { setErrorGuardar('No se pudo guardar. Comprueba tu conexión e inténtalo de nuevo.'); return; }
    onCerrar();
  };

  const nombreNuevoLimpio = nombreNuevo.trim();
  const hayCambioAcceso = !!nombreNuevoLimpio || !!passwordNueva;
  const puedeGuardarAcceso =
    passwordActual.trim() &&
    hayCambioAcceso &&
    (!passwordNueva || (passwordNueva.length >= 8 && passwordNueva === passwordNuevaConfirmar));

  const guardarAcceso = async () => {
    setErrorAcceso('');
    setExitoAcceso('');
    setGuardandoAcceso(true);
    const resultado = await cambiarAcceso({
      passwordActual,
      nombreNuevo: nombreNuevoLimpio || undefined,
      passwordNueva: passwordNueva || undefined,
    });
    setGuardandoAcceso(false);
    if (!resultado.ok) { setErrorAcceso(resultado.error); return; }
    onCambioAcceso(resultado.id, resultado.nombre, resultado.esAdmin);
    setPasswordActual(''); setNombreNuevo(''); setPasswordNueva(''); setPasswordNuevaConfirmar('');
    setExitoAcceso('Acceso actualizado. Ya puedes usar los nuevos datos la próxima vez que entres.');
  };

  const inicial = (nombreMostrar.trim() || nombreAcceso || '?').trim().charAt(0).toUpperCase();

  return (
    <div className={styles.modalFondo} onClick={onCerrar}>
      <div className={styles.modalCaja} style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalCabecera}>
          <h2 className={styles.h2} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            Mi perfil
          </h2>
          <button className={styles.btnIcono} onClick={onCerrar} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
              background: 'var(--topo)', color: 'var(--blanco)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.6rem', fontWeight: 700, border: '1px solid var(--borde)',
            }}>
              {foto ? <img src={foto} alt="Foto de perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : inicial}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <button className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.82rem' }} onClick={() => inputRef.current?.click()} disabled={subiendoFoto}>
                {subiendoFoto ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span className={styles.loginSpinner} /> Procesando…</span> : foto ? 'Cambiar foto' : 'Subir foto'}
              </button>
              {foto && !subiendoFoto && (
                <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.82rem' }} onClick={() => setFoto('')}>
                  Quitar foto
                </button>
              )}
              <input ref={inputRef} type="file" accept="image/*" className={styles.inputFile} onChange={(e) => subirFoto(e.target.files)} />
            </div>
          </div>

          {errorGuardar && <div className={styles.loginError}>{errorGuardar}</div>}

          <label className={styles.campoLabel} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            Nombre para mostrar
            <input
              className={styles.input}
              value={nombreMostrar}
              onChange={(e) => setNombreMostrar(e.target.value)}
              placeholder={nombreAcceso}
              maxLength={200}
            />
          </label>
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-claro)' }}>
            Es solo el nombre que se ve en la app (barra lateral, saludo de Inicio) — tu usuario de acceso ({nombreAcceso}) no cambia.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar} disabled={guardandoPerfil}>Cancelar</button>
            <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar} disabled={guardandoPerfil || subiendoFoto}>
              {guardandoPerfil ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span className={styles.loginSpinner} /> Guardando…</span> : 'Guardar'}
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--borde)', margin: '0.25rem 0' }} />

          {!mostrarAcceso ? (
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => setMostrarAcceso(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -2, marginRight: 4 }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              Cambiar usuario o contraseña de acceso
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem' }}>Usuario y contraseña de acceso</p>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--topo-claro)' }}>
                Esto es distinto del nombre para mostrar de arriba: es con lo que entras a la app. Pide tu contraseña actual para confirmar que eres tú.
              </p>

              <label className={styles.campoLabel} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                Contraseña actual
                <input className={styles.input} type="password" autoComplete="current-password" value={passwordActual} onChange={(e) => setPasswordActual(e.target.value)} />
              </label>
              <label className={styles.campoLabel} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                Nuevo usuario (opcional)
                <input className={styles.input} value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} placeholder={nombreAcceso} autoComplete="username" />
              </label>
              <label className={styles.campoLabel} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                Contraseña nueva (opcional, mín. 8 caracteres)
                <input className={styles.input} type="password" autoComplete="new-password" value={passwordNueva} onChange={(e) => setPasswordNueva(e.target.value)} />
              </label>
              {passwordNueva && (
                <label className={styles.campoLabel} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  Repite la contraseña nueva
                  <input className={styles.input} type="password" autoComplete="new-password" value={passwordNuevaConfirmar} onChange={(e) => setPasswordNuevaConfirmar(e.target.value)} />
                  {passwordNueva.length < 8 && <span style={{ fontSize: '0.7rem', color: 'var(--ocre)' }}>Al menos 8 caracteres.</span>}
                  {passwordNuevaConfirmar && passwordNueva !== passwordNuevaConfirmar && <span style={{ fontSize: '0.7rem', color: 'var(--rojo)' }}>No coinciden.</span>}
                </label>
              )}

              {errorAcceso && <div className={styles.loginError}>{errorAcceso}</div>}
              {exitoAcceso && <div style={{ fontSize: '0.78rem', color: 'var(--verde-dark)', background: 'var(--verde-bg)', border: '1px solid var(--verde)', borderRadius: 'var(--radio)', padding: '0.5rem 0.75rem' }}>{exitoAcceso}</div>}

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={`${styles.btn} ${styles.btnSecundario}`}
                  onClick={() => { setMostrarAcceso(false); setErrorAcceso(''); setExitoAcceso(''); setPasswordActual(''); setNombreNuevo(''); setPasswordNueva(''); setPasswordNuevaConfirmar(''); }}
                >
                  Cancelar
                </button>
                <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardarAcceso} disabled={!puedeGuardarAcceso || guardandoAcceso}>
                  {guardandoAcceso ? 'Guardando…' : 'Guardar acceso'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
