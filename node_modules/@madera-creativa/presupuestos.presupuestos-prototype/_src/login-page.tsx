import { useState } from 'react';
import logoImg from './assets/logo.png';
import texturaVetas from './assets/textura-vetas.jpeg';
import type { TipoAlmacenamiento } from './use-auth.js';
import { GuiaSupabase } from './guia-supabase.js';
import { registrarEnServidor, loginEnServidor } from './use-registro.js';
import styles from './styles.module.css';

/** Props de la página de login / registro. */
export type LoginPageProps = {
  onLogin: (nombre: string, password: string) => { ok: boolean; error?: string };
  onLoginDirecto: (id: string, nombre: string, esAdmin: boolean) => void;
  onRegistrar: (nombre: string, password: string, almacenamiento: TipoAlmacenamiento, supabaseUrl?: string, supabaseKey?: string) => { ok: boolean; error?: string };
};

type Pantalla = 'login' | 'registro' | 'almacenamiento';

/**
 * Pantalla de inicio de sesión y registro de Madera Creativa.
 * Soporta múltiples usuarios con almacenamiento local o Supabase.
 */
export function LoginPage({ onLogin, onLoginDirecto, onRegistrar }: LoginPageProps) {
  const [pantalla, setPantalla] = useState<Pantalla>('login');

  // Login
  const [loginUsuario, setLoginUsuario] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginCargando, setLoginCargando] = useState(false);
  const [mostrarPassLogin, setMostrarPassLogin] = useState(false);
  const [mostrarAyuda, setMostrarAyuda] = useState(false);

  // Registro
  const [regNombre, setRegNombre] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regPass2, setRegPass2] = useState('');
  const [regError, setRegError] = useState('');
  const [mostrarPassReg, setMostrarPassReg] = useState(false);
  const [almacenamiento, setAlmacenamiento] = useState<TipoAlmacenamiento>('local');
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');

  const iniciarSesion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsuario.trim() || !loginPass.trim()) return;
    setLoginCargando(true);
    setLoginError('');
    // Verificar contra el servidor
    const srv = await loginEnServidor(loginUsuario.trim(), loginPass);
    if (!srv.ok) {
      if (srv.codigo === 'pendiente') {
        setLoginError('⏳ Tu cuenta está pendiente de aprobación. Recibi rás acceso en breve.');
      } else if (srv.codigo === 'suspendido') {
        setLoginError('🚫 Tu acceso ha sido suspendido. Contacta con Madera Creativa.');
      } else if (srv.codigo === 'error-red') {
        // Sin servidor — intentar login local
        const local = onLogin(loginUsuario.trim(), loginPass);
        if (!local.ok) setLoginError(local.error ?? 'Usuario o contraseña incorrectos.');
      } else {
        setLoginError(srv.error ?? 'Usuario o contraseña incorrectos.');
      }
      setLoginCargando(false);
      return;
    }
    // Login válido en servidor — establecer sesión directamente con datos del servidor
    onLoginDirecto(srv.id!, srv.nombre!, !!srv.esAdmin);
    setLoginCargando(false);
  };

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (regPass !== regPass2) { setRegError('Las contraseñas no coinciden.'); return; }
    if (almacenamiento === 'supabase' && (!supabaseUrl || !supabaseKey)) {
      setRegError('Configura tu Supabase antes de continuar.');
      return;
    }
    // Registrar en servidor primero
    const srv = await registrarEnServidor(regNombre, regPass);
    if (!srv.ok && srv.codigo !== 'error-red') {
      setRegError(srv.error ?? 'Error al registrarse.');
      return;
    }
    // Guardar localmente también
    const local = onRegistrar(regNombre, regPass, almacenamiento, supabaseUrl || undefined, supabaseKey || undefined);
    if (!local.ok) { setRegError(local.error ?? 'Error al registrarse.'); return; }
    // Si el servidor lo registró, mostrar mensaje de pendiente
    if (srv.ok) {
      setRegError('⏳ Tu cuenta está pendiente de aprobación. Recibi rás acceso en breve.');
    }
  };

  return (
    <div className={styles.loginFondo}>

      {/* Panel izquierdo — textura */}
      <div
        className={styles.loginPanel}
        style={{ backgroundImage: `url(${texturaVetas})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className={styles.loginFranjaSuperior} />
        <div className={styles.loginFranjaInferior} />
      </div>

      {/* Panel derecho — formulario */}
      <div className={styles.loginFormPanel}>
        <div className={styles.loginCaja}>

          <img src={logoImg} alt="Madera Creativa" className={styles.loginLogo} />
          <p className={styles.loginSubtitulo}>Seguimiento de clientes y proyectos</p>

          {/* Tabs login / registro */}
          <div style={{ display: 'flex', background: '#f0ede8', borderRadius: 10, padding: 3, marginBottom: '1.25rem', gap: 3 }}>
            <button
              onClick={() => { setPantalla('login'); setLoginError(''); }}
              style={{
                flex: 1, padding: '0.5rem', border: 'none', borderRadius: 8, cursor: 'pointer',
                fontWeight: 700, fontSize: '0.85rem', transition: 'all 0.15s',
                background: pantalla === 'login' ? '#4B433A' : 'transparent',
                color: pantalla === 'login' ? '#fff' : 'var(--topo)',
              }}
            >
              Entrar
            </button>
            <button
              onClick={() => { setPantalla('registro'); setRegError(''); }}
              style={{
                flex: 1, padding: '0.5rem', border: 'none', borderRadius: 8, cursor: 'pointer',
                fontWeight: 700, fontSize: '0.85rem', transition: 'all 0.15s',
                background: pantalla === 'registro' ? '#4B433A' : 'transparent',
                color: pantalla === 'registro' ? '#fff' : 'var(--topo)',
              }}
            >
              Regístrate
            </button>
          </div>

          {/* ── FORMULARIO LOGIN ── */}
          {pantalla === 'login' && (
            <form className={styles.loginForm} onSubmit={iniciarSesion} noValidate>
              <div className={styles.loginInputWrap}>
                <input
                  className={`${styles.input} ${styles.loginInputSimple}`}
                  type="text"
                  value={loginUsuario}
                  onChange={e => setLoginUsuario(e.target.value)}
                  placeholder="Usuario"
                  autoComplete="username"
                  autoFocus
                />
              </div>
              <div className={styles.loginInputWrap}>
                <input
                  className={`${styles.input} ${styles.loginInputSimple}`}
                  type={mostrarPassLogin ? 'text' : 'password'}
                  value={loginPass}
                  onChange={e => setLoginPass(e.target.value)}
                  placeholder="Contraseña"
                  autoComplete="current-password"
                />
                <button type="button" className={styles.loginOjoBtn} onClick={() => setMostrarPassLogin(v => !v)} tabIndex={-1}>
                  {mostrarPassLogin
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>

              {loginError && <div className={styles.loginError}><span>⚠️</span> {loginError}</div>}

              <button
                type="submit"
                className={`${styles.btn} ${styles.btnPrimario} ${styles.btnLoginSubmit}`}
                disabled={loginCargando || !loginUsuario.trim() || !loginPass.trim()}
              >
                {loginCargando ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}><span className={styles.loginSpinner} /> Entrando…</span> : 'Entrar'}
              </button>

              <button type="button" className={styles.loginRecuperar} onClick={() => setMostrarAyuda(v => !v)}>
                ¿Olvidaste tu contraseña?
              </button>
              {mostrarAyuda && (
                <div className={styles.loginAyuda}>
                  <p style={{ margin: '0 0 0.25rem', fontWeight: 600, fontSize: '0.8rem' }}>Recuperar acceso</p>
                  <p style={{ margin: 0 }}>
                    Escribe a{' '}
                    <a href="mailto:holamaderacreativa@gmail.com" style={{ color: 'var(--ocre)', fontWeight: 600 }}>
                      holamaderacreativa@gmail.com
                    </a>{' '}
                    y te ayudaremos enseguida.
                  </p>
                </div>
              )}
            </form>
          )}

          {/* ── FORMULARIO REGISTRO ── */}
          {pantalla === 'registro' && (
            <form className={styles.loginForm} onSubmit={registrar} noValidate>
              <div className={styles.loginInputWrap}>
                <input
                  className={`${styles.input} ${styles.loginInputSimple}`}
                  type="email"
                  value={regNombre}
                  onChange={e => setRegNombre(e.target.value)}
                  placeholder="Correo electrónico"
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <div className={styles.loginInputWrap}>
                <input
                  className={`${styles.input} ${styles.loginInputSimple}`}
                  type={mostrarPassReg ? 'text' : 'password'}
                  value={regPass}
                  onChange={e => setRegPass(e.target.value)}
                  placeholder="Contraseña (mín. 4 caracteres)"
                  autoComplete="new-password"
                />
                <button type="button" className={styles.loginOjoBtn} onClick={() => setMostrarPassReg(v => !v)} tabIndex={-1}>
                  {mostrarPassReg
                    ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
              <div className={styles.loginInputWrap}>
                <input
                  className={`${styles.input} ${styles.loginInputSimple}`}
                  type="password"
                  value={regPass2}
                  onChange={e => setRegPass2(e.target.value)}
                  placeholder="Repite la contraseña"
                  autoComplete="new-password"
                />
              </div>

              {/* Tipo de almacenamiento */}
              <div style={{ display: 'flex', gap: '0.5rem', margin: '0.25rem 0' }}>
                <button
                  type="button"
                  onClick={() => setAlmacenamiento('local')}
                  style={{
                    flex: 1, padding: '0.65rem 0.5rem', border: `2px solid ${almacenamiento === 'local' ? '#4B433A' : 'var(--borde)'}`,
                    borderRadius: 8, cursor: 'pointer', background: almacenamiento === 'local' ? '#f5f1eb' : '#fff',
                    fontWeight: almacenamiento === 'local' ? 700 : 400, fontSize: '0.8rem',
                    color: 'var(--negro)', transition: 'all 0.15s',
                  }}
                >
                  📱 Local<br />
                  <span style={{ fontSize: '0.68rem', fontWeight: 400, color: 'var(--topo-claro)' }}>Solo este dispositivo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAlmacenamiento('supabase')}
                  style={{
                    flex: 1, padding: '0.65rem 0.5rem', border: `2px solid ${almacenamiento === 'supabase' ? '#2e7d32' : 'var(--borde)'}`,
                    borderRadius: 8, cursor: 'pointer', background: almacenamiento === 'supabase' ? '#e8f5e9' : '#fff',
                    fontWeight: almacenamiento === 'supabase' ? 700 : 400, fontSize: '0.8rem',
                    color: 'var(--negro)', transition: 'all 0.15s',
                  }}
                >
                  ☁️ Nube gratis<br />
                  <span style={{ fontSize: '0.68rem', fontWeight: 400, color: 'var(--topo-claro)' }}>Supabase (500 MB)</span>
                </button>
              </div>

              {/* Botón guía Supabase */}
              {almacenamiento === 'supabase' && (
                <div style={{ background: '#e8f5e9', border: '1px solid #81c784', borderRadius: 8, padding: '0.65rem 0.85rem', fontSize: '0.82rem' }}>
                  {supabaseUrl ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#2e7d32', fontWeight: 600 }}>✅ Supabase configurado</span>
                      <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.72rem' }} onClick={() => setGuiaAbierta(true)}>Cambiar</button>
                    </div>
                  ) : (
                    <div>
                      <p style={{ margin: '0 0 0.4rem', color: '#1b5e20', fontWeight: 600 }}>Necesitas configurar tu Supabase</p>
                      <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.82rem', width: '100%', justifyContent: 'center' }} onClick={() => setGuiaAbierta(true)}>
                        ☁️ Ver guía paso a paso
                      </button>
                    </div>
                  )}
                </div>
              )}

              {regError && <div className={styles.loginError}><span>⚠️</span> {regError}</div>}

              <button
                type="submit"
                className={`${styles.btn} ${styles.btnPrimario} ${styles.btnLoginSubmit}`}
                disabled={!regNombre.trim() || !regPass.trim() || !regPass2.trim() || (almacenamiento === 'supabase' && !supabaseUrl)}
              >
                Crear cuenta y entrar
              </button>
            </form>
          )}

          <p className={styles.loginPie}>
            © {new Date().getFullYear()} Madera Creativa · Acceso privado
          </p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.62rem', color: 'var(--topo-muy-claro)', textAlign: 'center', opacity: 0.6, letterSpacing: '0.02em' }}>
            Desarrollado por Madera Creativa
          </p>
        </div>
      </div>

      {guiaAbierta && (
        <GuiaSupabase
          urlInicial={supabaseUrl}
          claveInicial={supabaseKey}
          onConfirmar={(url, clave) => { setSupabaseUrl(url); setSupabaseKey(clave); setGuiaAbierta(false); }}
          onCancelar={() => setGuiaAbierta(false)}
        />
      )}
    </div>
  );
}
