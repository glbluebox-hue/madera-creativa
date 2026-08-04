import { useState } from 'react';
import styles from './styles.module.css';

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
    imagen: '🌐',
    nota: 'Supabase ofrece 500 MB de almacenamiento gratis — suficiente para años de uso.',
  },
  {
    numero: 2,
    titulo: 'Crea un proyecto nuevo',
    descripcion: 'Una vez dentro, pulsa el botón verde "New project". Ponle un nombre (por ejemplo "mi-madera"), elige una contraseña segura para la base de datos y selecciona la región "West EU (Ireland)" para mejor velocidad.',
    url: 'https://supabase.com/dashboard/projects',
    urlTexto: 'Ir a mis proyectos →',
    imagen: '🗂️',
    nota: 'El proyecto tarda 1-2 minutos en crearse. Espera a que aparezca en verde.',
  },
  {
    numero: 3,
    titulo: 'Ve a la configuración del proyecto',
    descripcion: 'Dentro de tu proyecto, busca en el menú izquierdo el icono ⚙️ "Project Settings" y luego haz clic en "API" en el submenú que aparece.',
    url: 'https://supabase.com/dashboard',
    urlTexto: 'Ir al dashboard →',
    imagen: '⚙️',
    nota: 'La sección API contiene todas las claves de conexión de tu proyecto.',
  },
  {
    numero: 4,
    titulo: 'Copia tu URL y tu clave anónima',
    descripcion: 'En la sección "Project URL" verás una dirección que empieza por "https://". Cópiala. Luego en "Project API Keys" copia la clave "anon public". Son los dos datos que necesitas.',
    url: 'https://supabase.com/dashboard',
    urlTexto: 'Ir al dashboard →',
    imagen: '🔑',
    nota: 'La clave "anon public" es segura para usar en apps. NO copies la "service_role".',
  },
  {
    numero: 5,
    titulo: 'Pega los datos aquí abajo',
    descripcion: 'Introduce la URL y la clave anónima en los campos de abajo. Luego pulsa "Verificar y conectar" para comprobar que todo funciona correctamente.',
    imagen: '✅',
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
          <h2 className={styles.h2}>☁️ Configurar almacenamiento en la nube</h2>
          <button className={styles.btnIcono} onClick={onCancelar}>✕</button>
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
                    background: i === pasoActual ? '#4B433A' : i < pasoActual ? '#7a9e7e' : '#e0dbd4',
                    color: i <= pasoActual ? '#fff' : '#9b928a',
                    fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                    flexShrink: 0, transition: 'background 0.2s',
                  }}
                >
                  {i < pasoActual ? '✓' : p.numero}
                </button>
                {i < PASOS.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: i < pasoActual ? '#7a9e7e' : '#e0dbd4', borderRadius: 1 }} />
                )}
              </div>
            ))}
          </div>

          {/* Paso actual */}
          <div style={{
            background: '#faf8f5', border: '1px solid var(--borde)',
            borderRadius: 12, padding: '1.25rem', marginBottom: '1.25rem',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem', textAlign: 'center' }}>{paso.imagen}</div>
            <h3 style={{ margin: '0 0 0.6rem', fontSize: '1rem', color: 'var(--negro)', textAlign: 'center' }}>
              Paso {paso.numero}: {paso.titulo}
            </h3>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.88rem', color: 'var(--topo)', lineHeight: 1.6 }}>
              {paso.descripcion}
            </p>
            {paso.nota && (
              <div style={{
                background: '#fff9e6', border: '1px solid #f0d060', borderRadius: 8,
                padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: '#7a6000',
              }}>
                💡 {paso.nota}
              </div>
            )}
            {paso.url && (
              <a
                href={paso.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block', marginTop: '0.75rem',
                  color: '#4B433A', fontWeight: 700, fontSize: '0.85rem',
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
                    {mostrarClave ? '🙈' : '👁️'}
                  </button>
                </div>
              </label>

              {/* Resultado de verificación */}
              {estadoVerif === 'ok' && (
                <div style={{ background: '#e8f5e9', border: '1px solid #81c784', borderRadius: 8, padding: '0.6rem 0.85rem', fontSize: '0.82rem', color: '#2e7d32', fontWeight: 600 }}>
                  ✅ Conexión correcta — tu Supabase está listo
                </div>
              )}
              {estadoVerif === 'error' && (
                <div style={{ background: '#ffebee', border: '1px solid #e57373', borderRadius: 8, padding: '0.6rem 0.85rem', fontSize: '0.82rem', color: '#c62828' }}>
                  ❌ {errorVerif}
                </div>
              )}

              {/* Botón verificar */}
              <button
                className={`${styles.btn} ${styles.btnSecundario}`}
                onClick={verificarConexion}
                disabled={verificando || !url.trim() || !clave.trim()}
              >
                {verificando ? '⏳ Verificando…' : '🔍 Verificar conexión'}
              </button>
            </div>
          )}

          {/* Navegación entre pasos */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
            <button
              className={`${styles.btn} ${styles.btnSecundario}`}
              onClick={esPrimerPaso ? onCancelar : () => setPasoActual(v => v - 1)}
            >
              {esPrimerPaso ? 'Cancelar' : '← Anterior'}
            </button>

            {esUltimoPaso ? (
              <button
                className={`${styles.btn} ${styles.btnPrimario}`}
                disabled={estadoVerif !== 'ok'}
                onClick={() => onConfirmar(url.trim(), clave.trim())}
              >
                ✅ Conectar y guardar
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
