import { useState } from 'react';
import styles from './styles.module.css';

// Iconos de línea por paso (Dirección Creativa) — sustituyen a los emoji anteriores.
const IconoGlobo = <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>;
const IconoCarpeta = <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>;
const IconoAjustes = <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
const IconoLlave = <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>;
const IconoOkGrande = <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><polyline points="20 6 9 17 4 12" /></svg>;

/** Props de la guía de configuración de Supabase. */
export type GuiaSupabaseProps = {
  /** URL de Supabase ya guardada (para edición). */
  urlInicial?: string;
  /** Clave anónima ya guardada (para edición). */
  claveInicial?: string;
  /** Callback al confirmar las credenciales. */
  onConfirmar: (url: string, clave: string) => void;
  /** Callback al cancelar / cerrar. */
  onCancelar: () => void;
};

const PASOS = [
  {
    numero: 1,
    titulo: 'Crea tu cuenta gratuita en Supabase',
    descripcion: 'Abre Supabase en tu navegador y pulsa "Start your project". Usa tu correo electrónico o tu cuenta de GitHub. Es completamente gratis.',
    url: 'https://supabase.com',
    urlTexto: 'Abrir Supabase →',
    imagen: IconoGlobo,
    nota: 'Supabase ofrece 500 MB de almacenamiento gratis — suficiente para años de uso.',
  },
  {
    numero: 2,
    titulo: 'Crea un proyecto nuevo',
    descripcion: 'Una vez dentro, pulsa el botón verde "New project". Ponle un nombre (por ejemplo "mi-madera"), elige una contraseña segura para la base de datos y selecciona la región "West EU (Ireland)" para mejor velocidad.',
    url: 'https://supabase.com/dashboard/projects',
    urlTexto: 'Ir a mis proyectos →',
    imagen: IconoCarpeta,
    nota: 'El proyecto tarda 1-2 minutos en crearse. Espera a que aparezca en verde.',
  },
  {
    numero: 3,
    titulo: 'Ve a la configuración del proyecto',
    descripcion: 'Dentro de tu proyecto, busca en el menú izquierdo el icono de engranaje "Project Settings" y luego haz clic en "API" en el submenú que aparece.',
    url: 'https://supabase.com/dashboard',
    urlTexto: 'Ir al dashboard →',
    imagen: IconoAjustes,
    nota: 'La sección API contiene todas las claves de conexión de tu proyecto.',
  },
  {
    numero: 4,
    titulo: 'Copia tu URL y tu clave anónima',
    descripcion: 'En la sección "Project URL" verás una dirección que empieza por "https://". Cópiala. Luego en "Project API Keys" copia la clave "anon public". Son los dos datos que necesitas.',
    url: 'https://supabase.com/dashboard',
    urlTexto: 'Ir al dashboard →',
    imagen: IconoLlave,
    nota: 'La clave "anon public" es segura para usar en apps. NO copies la "service_role".',
  },
  {
    numero: 5,
    titulo: 'Pega los datos aquí abajo',
    descripcion: 'Introduce la URL y la clave anónima en los campos de abajo. Luego pulsa "Verificar y conectar" para comprobar que todo funciona correctamente.',
    imagen: IconoOkGrande,
    nota: 'Tus datos se guardan solo en este dispositivo. Nadie más tiene acceso.',
  },
];

/**
 * Guía paso a paso para configurar Supabase como almacenamiento en la nube.
 * Incluye instrucciones ilustradas, enlaces directos y verificación de conexión.
 */
export function GuiaSupabase({ urlInicial = '', claveInicial = '', onConfirmar, onCancelar }: GuiaSupabaseProps) {
  const [pasoActual, setPasoActual] = useState(0);
  const [url, setUrl] = useState(urlInicial);
  const [clave, setClave] = useState(claveInicial);
  const [verificando, setVerificando] = useState(false);
  const [estadoVerif, setEstadoVerif] = useState<'ok' | 'error' | null>(null);
  const [errorVerif, setErrorVerif] = useState('');
  const [mostrarClave, setMostrarClave] = useState(false);

  const paso = PASOS[pasoActual];
  const esUltimoPaso = pasoActual === PASOS.length - 1;
  const esPrimerPaso = pasoActual === 0;

  const verificarConexion = async () => {
    if (!url.trim() || !clave.trim()) {
      setEstadoVerif('error');
      setErrorVerif('Introduce la URL y la clave antes de verificar.');
      return;
    }
    setVerificando(true);
    setEstadoVerif(null);
    setErrorVerif('');
    try {
      const urlLimpia = url.trim().replace(/\/$/, '');
      const res = await fetch(`${urlLimpia}/rest/v1/`, {
        headers: {
          'apikey': clave.trim(),
          'Authorization': `Bearer ${clave.trim()}`,
        },
      });
      if (res.ok || res.status === 200 || res.status === 400) {
        // 400 significa que la conexión funciona pero no hay tablas — está bien
        setEstadoVerif('ok');
      } else {
        setEstadoVerif('error');
        setErrorVerif(`Error de conexión (código ${res.status}). Revisa que la URL y la clave sean correctas.`);
      }
    } catch {
      setEstadoVerif('error');
      setErrorVerif('No se pudo conectar. Comprueba que la URL sea correcta y que tengas conexión a internet.');
    } finally {
      setVerificando(false);
    }
  };

  return (
    <div className={styles.modalFondo} onClick={onCancelar}>
      <div
        className={styles.modalCaja}
        style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className={styles.modalCabecera}>
          <h2 className={styles.h2} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>
            Configurar almacenamiento en la nube
          </h2>
          <button className={styles.btnIcono} onClick={onCancelar} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: '1.25rem' }}>

          {/* Indicador de pasos */}
          <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '1.5rem', alignItems: 'center' }}>
            {PASOS.map((p, i) => (
              <div key={p.numero} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flex: i < PASOS.length - 1 ? 1 : 'none' }}>
                <button
                  onClick={() => setPasoActual(i)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', border: 'none',
                    background: i === pasoActual ? 'var(--topo)' : i < pasoActual ? 'var(--verde)' : 'var(--borde)',
                    color: i <= pasoActual ? 'var(--blanco)' : 'var(--topo-claro)',
                    fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                    flexShrink: 0, transition: 'background 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {i < pasoActual ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> : p.numero}
                </button>
                {i < PASOS.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: i < pasoActual ? 'var(--verde)' : 'var(--borde)', borderRadius: 1 }} />
                )}
              </div>
            ))}
          </div>

          {/* Paso actual */}
          <div style={{
            background: 'var(--fondo)', border: '1px solid var(--borde)',
            borderRadius: 12, padding: '1.25rem', marginBottom: '1.25rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem', color: 'var(--topo)' }}>{paso.imagen}</div>
            <h3 style={{ margin: '0 0 0.6rem', fontSize: '1rem', color: 'var(--negro)', textAlign: 'center' }}>
              Paso {paso.numero}: {paso.titulo}
            </h3>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.88rem', color: 'var(--topo)', lineHeight: 1.6 }}>
              {paso.descripcion}
            </p>
            {paso.nota && (
              <div style={{
                background: 'var(--ocre-bg)', border: '1px solid var(--ocre)', borderRadius: 8,
                padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: 'var(--ocre)',
              }}>
                {paso.nota}
              </div>
            )}
            {paso.url && (
              <a
                href={paso.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block', marginTop: '0.75rem',
                  color: 'var(--topo)', fontWeight: 700, fontSize: '0.85rem',
                  textDecoration: 'underline',
                }}
              >
                {paso.urlTexto}
              </a>
            )}
          </div>

          {/* Formulario — solo en el último paso */}
          {esUltimoPaso && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              <label className={styles.label}>
                URL del proyecto (Project URL)
                <input
                  className={styles.input}
                  type="url"
                  placeholder="https://xxxxxxxxxxxx.supabase.co"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setEstadoVerif(null); }}
                />
              </label>
              <label className={styles.label}>
                Clave anónima (anon public)
                <div style={{ position: 'relative' }}>
                  <input
                    className={styles.input}
                    type={mostrarClave ? 'text' : 'password'}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
                    value={clave}
                    onChange={e => { setClave(e.target.value); setEstadoVerif(null); }}
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarClave(v => !v)}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--topo-claro)' }}
                  >
                    {mostrarClave ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
              </label>

              {/* Resultado de verificación */}
              {estadoVerif === 'ok' && (
                <div style={{ background: 'var(--verde-bg)', border: '1px solid var(--verde)', borderRadius: 'var(--radio)', padding: '0.6rem 0.85rem', fontSize: '0.82rem', color: 'var(--verde-dark)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  Conexión correcta — tu Supabase está listo
                </div>
              )}
              {estadoVerif === 'error' && (
                <div style={{ background: 'var(--rojo-bg)', border: '1px solid var(--rojo)', borderRadius: 'var(--radio)', padding: '0.6rem 0.85rem', fontSize: '0.82rem', color: 'var(--rojo)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                  {errorVerif}
                </div>
              )}

              {/* Botón verificar */}
              <button
                className={`${styles.btn} ${styles.btnSecundario}`}
                onClick={verificarConexion}
                disabled={verificando || !url.trim() || !clave.trim()}
              >
                {verificando ? 'Verificando…' : 'Verificar conexión'}
              </button>
            </div>
          )}

          {/* Navegación entre pasos */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
            <button
              className={`${styles.btn} ${styles.btnSecundario}`}
              onClick={esPrimerPaso ? onCancelar : () => setPasoActual(v => v - 1)}
            >
              {esPrimerPaso ? 'Cancelar' : 'Anterior'}
            </button>

            {esUltimoPaso ? (
              <button
                className={`${styles.btn} ${styles.btnPrimario}`}
                disabled={estadoVerif !== 'ok'}
                onClick={() => onConfirmar(url.trim(), clave.trim())}
              >
                Conectar y guardar
              </button>
            ) : (
              <button
                className={`${styles.btn} ${styles.btnPrimario}`}
                onClick={() => setPasoActual(v => v + 1)}
              >
                Siguiente →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
