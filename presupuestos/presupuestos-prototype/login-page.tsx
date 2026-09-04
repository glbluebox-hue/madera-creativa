import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import logoImg from './assets/logo.png';
import loginMadera from './assets/login-madera.jpg';
import loginHojas from './assets/login-hojas.jpg';
import { registrarEnServidor, loginEnServidor, solicitarRecuperacion, restablecerPassword, verificarEmail } from './use-registro.js';
import { soportaWebAuthn, iniciarSesionBiometrica } from './use-biometria.js';
import type { PlanAcceso } from './planes.js';
import styles from './styles.module.css';

/** Props de la página de login / registro. */
export type LoginPageProps = {
  onLogin: (nombre: string, password: string) => { ok: boolean; error?: string };
  onLoginDirecto: (id: string, nombre: string, esAdmin: boolean, plan?: PlanAcceso) => void;
  onRegistrar: (nombre: string, password: string) => { ok: boolean; error?: string };
};

type Pantalla = 'login' | 'registro';

const IconoUsuario = ({ s = 18 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
);
const IconoCandado = ({ s = 18 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
);
const IconoCorreo = ({ s = 18 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></svg>
);
const IconoHuella = ({ s = 18 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 11c0 3.5-1 6.5-2.5 9" /><path d="M8.5 21a25 25 0 0 0 1.8-4.5" />
    <path d="M15 3.5a9 9 0 0 1 5 8c0 2-0.5 3.5-1 5" /><path d="M12 3a9 9 0 0 0-9 9c0 1.5 0 2.5 0.3 4" />
    <path d="M6 21a13 13 0 0 0 1.8-4" /><path d="M9 3.5A9 9 0 0 1 21 12c0 0.8 0 1.5-0.1 2" />
    <path d="M12 7a5 5 0 0 1 5 5c0 1.2-0.1 2.4-0.4 3.5" /><path d="M12 7a5 5 0 0 0-5 5c0 1.5-0.2 3-0.7 4.5" />
  </svg>
);

/**
 * Código de invitación en la URL (`?codigo=XXXX`, generado desde el Panel
 * de administración — ver `copiarEnlaceInvitacion` en `panel-admin.tsx`).
 * Un único de-uso al cargar, igual que `accion=clientes` en
 * `presupuestos-prototype.tsx` — nunca algo persistente.
 */
function codigoInvitacionDeLaUrl(): string {
  return new URLSearchParams(window.location.search).get('codigo') ?? '';
}

/** Token del enlace de recuperación de contraseña (`?recuperar=…`, enviado por email desde `/auth/solicitar-recuperacion`) — mismo patrón de un solo uso al cargar. */
function tokenRecuperacionDeLaUrl(): string {
  return new URLSearchParams(window.location.search).get('recuperar') ?? '';
}

/** Token del enlace de verificación de email (`?verificar=…`, enviado por email desde `/auth/registrar`) — mismo patrón de un solo uso al cargar. */
function tokenVerificacionDeLaUrl(): string {
  return new URLSearchParams(window.location.search).get('verificar') ?? '';
}

/** Pantalla de inicio de sesión y registro de Madera Creativa. */
export function LoginPage({ onLogin, onLoginDirecto, onRegistrar }: LoginPageProps) {
  const [pantalla, setPantalla] = useState<Pantalla>(() => (codigoInvitacionDeLaUrl() ? 'registro' : 'login'));

  // Login
  const [loginUsuario, setLoginUsuario] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginCargando, setLoginCargando] = useState(false);
  const [mostrarPassLogin, setMostrarPassLogin] = useState(false);
  const [mostrarAyuda, setMostrarAyuda] = useState(false);

  // Acceso biométrico (WebAuthn/passkeys) — alternativa a la contraseña,
  // nunca la sustituye. `soportaWebAuthn()` es una comprobación síncrona
  // del navegador: no hace falta esperar a saber si el dispositivo tiene
  // realmente un autenticador configurado para mostrar el botón — si no lo
  // tiene, la propia ceremonia lo dirá con un mensaje claro.
  const soportaBiometria = soportaWebAuthn();
  const [bioCargando, setBioCargando] = useState(false);
  const [bioError, setBioError] = useState('');

  // "¿Olvidaste tu contraseña?" — pedir el enlace por email.
  const [recuperarEmail, setRecuperarEmail] = useState('');
  const [recuperarEnviando, setRecuperarEnviando] = useState(false);
  const [recuperarEnviado, setRecuperarEnviado] = useState(false);
  const [recuperarError, setRecuperarError] = useState('');

  const pedirRecuperacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recuperarEmail.trim()) return;
    setRecuperarError('');
    setRecuperarEnviando(true);
    const r = await solicitarRecuperacion(recuperarEmail.trim());
    setRecuperarEnviando(false);
    if (!r.ok) { setRecuperarError(r.error ?? 'No se pudo procesar la solicitud.'); return; }
    setRecuperarEnviado(true);
  };

  // Pantalla de "restablecer contraseña" — reemplaza login/registro por
  // completo cuando se llega con `?recuperar=<token>` desde el email.
  const [tokenRecuperacion] = useState(tokenRecuperacionDeLaUrl);
  const [nuevaPass1, setNuevaPass1] = useState('');
  const [nuevaPass2, setNuevaPass2] = useState('');
  const [restableciendo, setRestableciendo] = useState(false);
  const [restablecerError, setRestablecerError] = useState('');
  const [restablecido, setRestablecido] = useState(false);

  const restablecer = async (e: React.FormEvent) => {
    e.preventDefault();
    setRestablecerError('');
    if (nuevaPass1.length < 8) { setRestablecerError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (nuevaPass1 !== nuevaPass2) { setRestablecerError('Las dos contraseñas no coinciden.'); return; }
    setRestableciendo(true);
    const r = await restablecerPassword(tokenRecuperacion, nuevaPass1);
    setRestableciendo(false);
    if (!r.ok) { setRestablecerError(r.error ?? 'No se pudo restablecer la contraseña.'); return; }
    setRestablecido(true);
  };

  // Pantalla de "verificar email" (04/09/2026) — reemplaza login/registro
  // por completo cuando se llega con `?verificar=<token>` desde el email,
  // mismo patrón que `tokenRecuperacion` arriba. Se verifica sola al
  // cargar la página (no hace falta que el usuario rellene nada, a
  // diferencia de restablecer contraseña).
  const [tokenVerificacion] = useState(tokenVerificacionDeLaUrl);
  const [verificando, setVerificando] = useState(true);
  const [verificado, setVerificado] = useState(false);
  const [verificarError, setVerificarError] = useState('');

  useEffect(() => {
    if (!tokenVerificacion) return;
    let cancelado = false;
    verificarEmail(tokenVerificacion).then((r) => {
      if (cancelado) return;
      setVerificando(false);
      if (r.ok) setVerificado(true);
      else setVerificarError(r.error ?? 'No se pudo verificar el email.');
    });
    return () => { cancelado = true; };
  }, [tokenVerificacion]);

  // Registro
  const [regNombre, setRegNombre] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regPass2, setRegPass2] = useState('');
  const [regError, setRegError] = useState('');
  const [mostrarPassReg, setMostrarPassReg] = useState(false);
  const [regCargando, setRegCargando] = useState(false);
  // Se muestra tras un registro correcto — la cuenta ya no puede entrar sin
  // verificar el email, así que ya no tiene sentido intentar el login
  // automático que había antes (solo funcionaba con código promocional).
  const [regVerificacionEnviada, setRegVerificacionEnviada] = useState(false);
  const [regAvisoCodigo, setRegAvisoCodigo] = useState('');

  // "¿Tienes un código de acceso?" — colapsado por defecto, para no alargar
  // el formulario a quien no tiene uno (la mayoría de altas normales). Ya
  // abierto y relleno si se llegó con un enlace de invitación (`?codigo=`).
  const [mostrarCampoCodigo, setMostrarCampoCodigo] = useState(() => !!codigoInvitacionDeLaUrl());
  const [regCodigo, setRegCodigo] = useState(codigoInvitacionDeLaUrl);

  const iniciarSesion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsuario.trim() || !loginPass.trim()) return;
    setLoginCargando(true);
    setLoginError('');
    // Verificar contra el servidor
    const srv = await loginEnServidor(loginUsuario.trim(), loginPass);
    if (!srv.ok) {
      if (srv.codigo === 'pendiente') {
        setLoginError('Tu cuenta está pendiente de aprobación. Recibirás acceso en breve.');
      } else if (srv.codigo === 'suspendido') {
        setLoginError('Tu acceso ha sido suspendido. Contacta con Madera Creativa.');
      } else if (srv.codigo === 'email-no-verificado') {
        setLoginError(srv.error ?? 'Verifica tu email para poder entrar. Revisa la bandeja de entrada (y spam) del email con el que te registraste.');
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
    onLoginDirecto(srv.id!, srv.nombre!, !!srv.esAdmin, srv.plan);
    setLoginCargando(false);
  };

  const entrarConBiometria = async () => {
    setBioCargando(true);
    setBioError('');
    const resultado = await iniciarSesionBiometrica();
    setBioCargando(false);
    if (resultado.ok === false) { setBioError(resultado.error); return; }
    onLoginDirecto(resultado.id, resultado.nombre, resultado.esAdmin, resultado.plan);
  };

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (regPass !== regPass2) { setRegError('Las contraseñas no coinciden.'); return; }
    setRegCargando(true);
    // Registrar en servidor primero
    const srv = await registrarEnServidor(regNombre, regPass, regCodigo.trim() || undefined);
    if (!srv.ok && srv.codigo !== 'error-red') {
      setRegError(srv.error ?? 'Error al registrarse.');
      setRegCargando(false);
      return;
    }
    // Guardar localmente también
    const local = onRegistrar(regNombre, regPass);
    if (!local.ok) { setRegError(local.error ?? 'Error al registrarse.'); setRegCargando(false); return; }

    setRegCargando(false);
    if (srv.ok) {
      // La cuenta queda activa de inmediato en el servidor, pero no se
      // puede entrar hasta verificar el email (con o sin código) — ya no
      // tiene sentido intentar iniciar sesión aquí, siempre fallaría con
      // 'email-no-verificado'.
      if (srv.avisoCodigo) setRegAvisoCodigo(srv.avisoCodigo);
      setRegVerificacionEnviada(true);
    }
  };

  return (
    <div className={`${styles.app} ${styles.loginFondo}`}>

      {/* Panel izquierdo — corte de madera real, recortado de la imagen de
          referencia. En vez de superponer una forma de color por encima
          para "tapar" el sobrante (lo que producía el efecto de recorte
          pegado y una sombra falsa), la propia foto se recorta con una
          máscara CSS que sigue la curva real medida píxel a píxel sobre
          esa misma foto — así el `drop-shadow` que se aplica en el CSS
          sigue automáticamente el contorno orgánico exacto de la madera,
          en vez de proyectar la sombra de un rectángulo. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <mask id="maderaMask" maskContentUnits="objectBoundingBox" maskUnits="objectBoundingBox">
            <path
              transform="scale(0.0018182 0.000650618)"
              d="M0,0 L512,0 L514,8 L510,16 L502,24 L504,32 L496,40 L492,48 L488,56 L484,64 L480,72 L476,80 L476,88 L470,96 L468,104 L462,112 L462,120 L460,128 L456,136 L450,144 L448,152 L442,160 L438,168 L432,176 L430,184 L430,192 L424,200 L420,208 L414,216 L408,224 L406,232 L398,240 L394,248 L392,256 L386,264 L380,272 L376,280 L370,288 L372,296 L364,304 L360,312 L358,320 L354,328 L350,336 L346,344 L346,352 L342,360 L344,368 L342,376 L344,384 L340,392 L340,400 L342,408 L342,416 L342,424 L342,432 L340,440 L342,448 L344,456 L344,464 L346,472 L346,480 L346,488 L348,496 L348,504 L348,512 L350,520 L350,528 L350,536 L352,544 L354,552 L356,560 L358,568 L358,576 L356,584 L358,592 L362,600 L366,608 L366,616 L368,624 L370,632 L370,640 L370,648 L376,656 L378,664 L380,672 L382,680 L388,688 L388,696 L392,704 L392,712 L396,720 L398,728 L398,736 L404,744 L406,752 L408,760 L408,768 L412,776 L414,784 L420,792 L420,800 L422,808 L426,816 L428,824 L428,832 L428,840 L430,848 L430,856 L432,864 L434,872 L436,880 L436,888 L438,896 L442,904 L442,912 L444,920 L444,928 L444,936 L444,944 L444,952 L444,960 L440,968 L440,976 L440,984 L436,992 L436,1000 L434,1008 L434,1016 L432,1024 L432,1032 L428,1040 L430,1048 L432,1056 L428,1064 L426,1072 L428,1080 L424,1088 L420,1096 L418,1104 L418,1112 L418,1120 L416,1128 L412,1136 L412,1144 L410,1152 L406,1160 L406,1168 L406,1176 L404,1184 L402,1192 L398,1200 L400,1208 L396,1216 L392,1224 L394,1232 L392,1240 L392,1248 L390,1256 L390,1264 L388,1272 L392,1280 L392,1288 L396,1296 L398,1304 L404,1312 L402,1320 L408,1328 L412,1336 L414,1344 L418,1352 L420,1360 L422,1368 L426,1376 L430,1384 L432,1392 L436,1400 L442,1408 L448,1416 L446,1424 L452,1432 L454,1440 L468,1448 L474,1456 L476,1464 L482,1472 L486,1480 L486,1488 L500,1496 L504,1504 L506,1512 L514,1520 L528,1528 L526,1536 L0,1537 Z"
              fill="#fff"
            />
          </mask>
        </defs>
      </svg>
      <div className={styles.loginPanelSombra}>
        <div
          className={styles.loginPanel}
          style={{ backgroundImage: `url(${loginMadera})` }}
        />
      </div>

      {/* Panel derecho — formulario */}
      <div className={styles.loginFormPanel}>
        {/* Sombra de hojas — recorte fotográfico real de la propia imagen de
            referencia (assets/login-hojas.jpg: x460-1023, y0-300 del
            original), no una forma dibujada. Esa franja concreta está
            garantizada libre de texto de interfaz (el logo empieza en
            y=316 en la referencia), así que es 100% foto, cero
            improvisación. */}
        <img src={loginHojas} alt="" className={styles.loginHojas} />
        <div className={styles.loginHojasVelo} aria-hidden="true" />

        <div className={styles.loginCaja}>

          <img src={logoImg} alt="Madera Creativa" className={styles.loginLogo} />
          <hr className={styles.loginDivisor} />
          <p className={styles.loginSubtitulo}>Seguimiento de clientes<br />y proyectos</p>

          {!tokenRecuperacion && !tokenVerificacion && (
          <>
          {/* Tabs login / registro */}
          <div className={styles.loginTabsRow}>
            <button
              type="button"
              className={`${styles.loginTab} ${pantalla === 'login' ? styles.loginTabActiva : ''}`}
              onClick={() => { setPantalla('login'); setLoginError(''); }}
            >
              Entrar
            </button>
            <button
              type="button"
              className={`${styles.loginTab} ${pantalla === 'registro' ? styles.loginTabActiva : ''}`}
              onClick={() => { setPantalla('registro'); setRegError(''); }}
            >
              Regístrate
            </button>
          </div>

          {/* ── FORMULARIO LOGIN ── */}
          {pantalla === 'login' && (
            <form className={styles.loginForm} onSubmit={iniciarSesion} noValidate>
              <div className={styles.loginInputWrap}>
                <span className={styles.loginIconoBadge}><IconoUsuario /></span>
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
                <span className={styles.loginIconoBadge}><IconoCandado /></span>
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

              {loginError && <div className={styles.loginError}><span style={{ display: 'inline-flex' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></svg></span> {loginError}</div>}

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="submit"
                  className={`${styles.btn} ${styles.btnPrimario} ${styles.btnLoginSubmit}`}
                  style={{ flex: 1, width: 'auto' }}
                  disabled={loginCargando || !loginUsuario.trim() || !loginPass.trim()}
                >
                  {loginCargando ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}><span className={styles.loginSpinner} /> Entrando…</span> : 'Entrar'}
                </button>

                {/* ── Acceso biométrico — solo el icono, sin caja ni fondo, mismo flujo WebAuthn de siempre ── */}
                {soportaBiometria && (
                  <button
                    type="button"
                    style={{
                      flex: '0 0 auto', width: 56,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'none', border: 'none', padding: 0, margin: 0,
                      color: 'var(--negro)', cursor: 'pointer',
                    }}
                    onClick={entrarConBiometria}
                    disabled={bioCargando}
                    title="Entrar con huella"
                    aria-label="Entrar con huella"
                  >
                    {bioCargando
                      ? <span className={styles.loginSpinner} style={{ width: 18, height: 18 }} />
                      : <IconoHuella s={24} />}
                  </button>
                )}
              </div>
              {bioError && <div className={styles.loginError} style={{ marginTop: '0.5rem' }}><span style={{ display: 'inline-flex' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></svg></span> {bioError}</div>}

              <button type="button" className={styles.loginRecuperar} onClick={() => { setMostrarAyuda(v => !v); setRecuperarEnviado(false); setRecuperarError(''); }}>
                ¿Olvidaste tu contraseña?
              </button>
              {mostrarAyuda && (
                <div className={styles.loginAyuda}>
                  {recuperarEnviado ? (
                    <p style={{ margin: 0 }}>
                      Si ese email tiene una cuenta, te hemos mandado un enlace para poner una contraseña nueva — revisa tu correo (y la carpeta de spam, por si acaso).
                    </p>
                  ) : (
                    <>
                      <p style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.8rem' }}>Recuperar acceso</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <input
                          className={styles.input}
                          style={{ flex: '1 1 160px', minWidth: 0, fontSize: '0.85rem' }}
                          type="email"
                          value={recuperarEmail}
                          onChange={(e) => setRecuperarEmail(e.target.value)}
                          placeholder="Tu correo electrónico"
                          autoComplete="email"
                        />
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnPrimario}`}
                          style={{ fontSize: '0.8rem', flexShrink: 0 }}
                          disabled={recuperarEnviando || !recuperarEmail.trim()}
                          onClick={pedirRecuperacion}
                        >
                          {recuperarEnviando ? 'Enviando…' : 'Enviar'}
                        </button>
                      </div>
                      {recuperarError && <p style={{ margin: '0.5rem 0 0', fontSize: '0.78rem', color: 'var(--rojo)' }}>{recuperarError}</p>}
                    </>
                  )}
                </div>
              )}
            </form>
          )}

          {/* ── FORMULARIO REGISTRO ── */}
          {pantalla === 'registro' && (
            regVerificacionEnviada ? (
              <div className={styles.loginForm}>
                {regAvisoCodigo && (
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--rojo)' }}>{regAvisoCodigo}</p>
                )}
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--topo)' }}>
                  Cuenta creada. Te hemos enviado un email a <strong>{regNombre}</strong> para verificarla —
                  revisa tu bandeja de entrada (y la carpeta de spam, por si acaso) y pulsa el enlace.
                  Hasta que lo verifiques no podrás iniciar sesión.
                </p>
              </div>
            ) : (
            <form className={styles.loginForm} onSubmit={registrar} noValidate>
              <div className={styles.loginInputWrap}>
                <span className={styles.loginIconoBadge}><IconoCorreo /></span>
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
                <span className={styles.loginIconoBadge}><IconoCandado /></span>
                <input
                  className={`${styles.input} ${styles.loginInputSimple}`}
                  type={mostrarPassReg ? 'text' : 'password'}
                  value={regPass}
                  onChange={e => setRegPass(e.target.value)}
                  placeholder="Contraseña (mín. 8 caracteres)"
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
                <span className={styles.loginIconoBadge}><IconoCandado /></span>
                <input
                  className={`${styles.input} ${styles.loginInputSimple}`}
                  type="password"
                  value={regPass2}
                  onChange={e => setRegPass2(e.target.value)}
                  placeholder="Repite la contraseña"
                  autoComplete="new-password"
                />
              </div>

              {/* "¿Tienes un código de acceso?" — colapsado por defecto, un enlace pequeño en vez de un campo más en el formulario. */}
              {mostrarCampoCodigo ? (
                <div className={styles.loginInputWrap}>
                  <span className={styles.loginIconoBadge}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41L13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
                  </span>
                  <input
                    className={`${styles.input} ${styles.loginInputSimple}`}
                    type="text"
                    value={regCodigo}
                    onChange={e => setRegCodigo(e.target.value)}
                    placeholder="Código de acceso (opcional)"
                    autoCapitalize="characters"
                  />
                </div>
              ) : (
                <button type="button" className={styles.loginRecuperar} style={{ textAlign: 'left' }} onClick={() => setMostrarCampoCodigo(true)}>
                  ¿Tienes un código de acceso?
                </button>
              )}

              {regError && <div className={styles.loginError}><span style={{ display: 'inline-flex' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></svg></span> {regError}</div>}

              <button
                type="submit"
                className={`${styles.btn} ${styles.btnPrimario} ${styles.btnLoginSubmit}`}
                disabled={regCargando || !regNombre.trim() || !regPass.trim() || !regPass2.trim()}
              >
                {regCargando ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}><span className={styles.loginSpinner} /> Creando cuenta…</span> : 'Crear cuenta'}
              </button>
            </form>
            )
          )}
          </>
          )}

          {/* ── RESTABLECER CONTRASEÑA (llegado desde el enlace del email) ── */}
          {tokenRecuperacion && (
            restablecido ? (
              <div className={styles.loginForm}>
                <p style={{ margin: '0 0 1rem', fontSize: '0.88rem', color: 'var(--topo)' }}>
                  Contraseña actualizada. Ya puedes entrar con ella.
                </p>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimario} ${styles.btnLoginSubmit}`}
                  onClick={() => { window.location.href = window.location.pathname; }}
                >
                  Ir a entrar
                </button>
              </div>
            ) : (
              <form className={styles.loginForm} onSubmit={restablecer} noValidate>
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--topo)' }}>
                  Escribe tu nueva contraseña.
                </p>
                <div className={styles.loginInputWrap}>
                  <span className={styles.loginIconoBadge}><IconoCandado /></span>
                  <input
                    className={`${styles.input} ${styles.loginInputSimple}`}
                    type="password"
                    value={nuevaPass1}
                    onChange={(e) => setNuevaPass1(e.target.value)}
                    placeholder="Contraseña nueva"
                    autoComplete="new-password"
                    autoFocus
                  />
                </div>
                <div className={styles.loginInputWrap}>
                  <span className={styles.loginIconoBadge}><IconoCandado /></span>
                  <input
                    className={`${styles.input} ${styles.loginInputSimple}`}
                    type="password"
                    value={nuevaPass2}
                    onChange={(e) => setNuevaPass2(e.target.value)}
                    placeholder="Repite la contraseña"
                    autoComplete="new-password"
                  />
                </div>
                {restablecerError && <div className={styles.loginError}>{restablecerError}</div>}
                <button
                  type="submit"
                  className={`${styles.btn} ${styles.btnPrimario} ${styles.btnLoginSubmit}`}
                  disabled={restableciendo || !nuevaPass1 || !nuevaPass2}
                >
                  {restableciendo ? 'Guardando…' : 'Guardar contraseña nueva'}
                </button>
              </form>
            )
          )}

          {/* ── VERIFICAR EMAIL (llegado desde el enlace del email de registro) ── */}
          {tokenVerificacion && (
            <div className={styles.loginForm}>
              {verificando ? (
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--topo)' }}>Verificando tu email…</p>
              ) : verificado ? (
                <>
                  <p style={{ margin: '0 0 1rem', fontSize: '0.88rem', color: 'var(--topo)' }}>
                    Email verificado. Ya puedes entrar.
                  </p>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnPrimario} ${styles.btnLoginSubmit}`}
                    onClick={() => { window.location.href = window.location.pathname; }}
                  >
                    Ir a entrar
                  </button>
                </>
              ) : (
                <div className={styles.loginError}>{verificarError}</div>
              )}
            </div>
          )}

          <div className={styles.loginDivisorPunto} />
          <p className={styles.loginPie}>
            © {new Date().getFullYear()} Madera Creativa · Acceso privado
          </p>
          <p className={styles.loginPiePequeno}>
            Desarrollado por Madera Creativa
          </p>
          <Link to="/privacidad" className={styles.loginPiePequeno} style={{ display: 'block', marginTop: '0.15rem' }}>
            Política de privacidad
          </Link>
        </div>
      </div>
    </div>
  );
}
