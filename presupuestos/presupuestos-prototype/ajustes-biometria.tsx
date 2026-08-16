import { useState, useEffect, useCallback } from 'react';
import { formatoFecha } from './calculos.js';
import {
  soportaWebAuthn,
  hayAutenticadorDePlataforma,
  registrarAccesoBiometrico,
  listarCredencialesBiometricas,
  borrarCredencialBiometrica,
} from './use-biometria.js';
import type { CredencialBiometrica } from './use-biometria.js';
import styles from './styles.module.css';

/** Props del panel de ajustes de acceso biométrico. */
export type AjustesBiometriaProps = {
  onCerrar: () => void;
};

const IconoHuella = ({ s = 18 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 11c0 3.5-1 6.5-2.5 9" /><path d="M8.5 21a25 25 0 0 0 1.8-4.5" />
    <path d="M15 3.5a9 9 0 0 1 5 8c0 2 -0.5 3.5 -1 5" /><path d="M12 3a9 9 0 0 0-9 9c0 1.5 0 2.5 0.3 4" />
    <path d="M6 21a13 13 0 0 0 1.8-4" /><path d="M9 3.5A9 9 0 0 1 21 12c0 0.8 0 1.5-0.1 2" />
    <path d="M12 7a5 5 0 0 1 5 5c0 1.2-0.1 2.4-0.4 3.5" /><path d="M12 7a5 5 0 0 0-5 5c0 1.5-0.2 3-0.7 4.5" />
  </svg>
);
const IconoDispositivo = ({ s = 18 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12" y2="18" /></svg>;
const IconoAviso = ({ s = 12 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="var(--ocre)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></svg>;
const IconoBasura = ({ s = 13 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;

/** Sugiere una etiqueta a partir del dispositivo actual — solo un punto de partida, el usuario puede cambiarla. */
function sugerirNombreDispositivo(): string {
  const ua = navigator.userAgent || '';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'PC Windows';
  return 'Este dispositivo';
}

type Disponibilidad = 'comprobando' | 'si' | 'no';

/**
 * Panel de ajustes de acceso biométrico: activar/desactivar el login con el
 * autenticador seguro del dispositivo (huella, Face ID, Windows Hello, PIN
 * del sistema) y gestionar los dispositivos ya registrados. Nunca pide, ve
 * ni guarda un dato biométrico — solo habla con `navigator.credentials` a
 * través de `use-biometria.ts`.
 */
export function AjustesBiometria({ onCerrar }: AjustesBiometriaProps) {
  const soportado = soportaWebAuthn();
  const [disponible, setDisponible] = useState<Disponibilidad>('comprobando');
  const [credenciales, setCredenciales] = useState<CredencialBiometrica[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [nombreNuevo, setNombreNuevo] = useState(sugerirNombreDispositivo);
  const [registrando, setRegistrando] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setCredenciales(await listarCredencialesBiometricas());
    } catch {
      setError('No se pudieron cargar tus dispositivos con acceso biométrico.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!soportado) { setDisponible('no'); return; }
    hayAutenticadorDePlataforma().then((si) => setDisponible(si ? 'si' : 'no'));
  }, [soportado]);

  const activar = async () => {
    setRegistrando(true);
    setError('');
    const resultado = await registrarAccesoBiometrico(nombreNuevo);
    setRegistrando(false);
    if (!resultado.ok) { setError(resultado.error); return; }
    setNombreNuevo(sugerirNombreDispositivo());
    await cargar();
  };

  const borrar = async (id: string) => {
    try {
      await borrarCredencialBiometrica(id);
      setCredenciales((prev) => (prev ?? []).filter((c) => c.id !== id));
    } catch {
      setError('No se pudo quitar el dispositivo.');
    } finally {
      setConfirmarBorrado(null);
    }
  };

  const activo = (credenciales?.length ?? 0) > 0;

  return (
    <div className={styles.modalFondo} onClick={onCerrar}>
      <div className={styles.modalCaja} style={{ maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalCabecera}>
          <h2 className={styles.h2} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <IconoHuella />
            Acceso biométrico
          </h2>
          <button className={styles.btnIcono} onClick={onCerrar} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Estado actual */}
          <div style={{
            background: activo ? 'var(--verde-bg)' : 'var(--fondo)',
            border: `1px solid ${activo ? 'var(--verde)' : 'var(--borde)'}`,
            borderRadius: 'var(--radio-md)', padding: '1rem',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
          }}>
            <span style={{ color: 'var(--topo)' }}><IconoHuella /></span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>
                {activo ? 'Acceso biométrico activado' : 'Acceso biométrico desactivado'}
              </p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
                {activo
                  ? `${credenciales!.length} dispositivo${credenciales!.length > 1 ? 's' : ''} registrado${credenciales!.length > 1 ? 's' : ''}.`
                  : 'Entra con tu huella, Face ID, Windows Hello o el PIN de tu dispositivo, en vez de la contraseña.'}
              </p>
            </div>
            <span style={{
              fontSize: '0.7rem', fontWeight: 700,
              background: activo ? 'var(--verde)' : 'var(--topo)', color: 'var(--blanco)',
              borderRadius: 20, padding: '2px 10px', flexShrink: 0,
            }}>
              {activo ? 'ACTIVADO' : 'DESACTIVADO'}
            </span>
          </div>

          {/* Sin soporte del navegador/dispositivo */}
          {!soportado && (
            <div style={{ background: 'var(--ocre-bg)', border: '1px solid var(--ocre)', borderRadius: 'var(--radio)', padding: '0.85rem', fontSize: '0.82rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <IconoAviso s={16} />
              <span>Este navegador no admite acceso biométrico (WebAuthn). Puedes seguir entrando con tu usuario y contraseña con normalidad.</span>
            </div>
          )}
          {soportado && disponible === 'no' && (
            <div style={{ background: 'var(--ocre-bg)', border: '1px solid var(--ocre)', borderRadius: 'var(--radio)', padding: '0.85rem', fontSize: '0.82rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <IconoAviso s={16} />
              <span>Este dispositivo no tiene configurado un autenticador seguro (huella, Face ID, Windows Hello o PIN). Configúralo en los ajustes del dispositivo para poder activarlo aquí. Mientras tanto, sigue funcionando tu contraseña.</span>
            </div>
          )}

          {error && <div className={styles.loginError}>{error}</div>}

          {/* Lista de dispositivos registrados */}
          {cargando ? (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--topo-claro)', fontSize: '0.85rem' }}>Cargando…</div>
          ) : (credenciales?.length ?? 0) > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--topo-claro)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                Dispositivos registrados
              </p>
              {credenciales!.map((c) => (
                <div key={c.id} style={{
                  border: '1px solid var(--borde)', borderRadius: 10, padding: '0.7rem 0.85rem',
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                }}>
                  <span style={{ color: 'var(--topo)' }}><IconoDispositivo s={16} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombreDispositivo}</p>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--topo-claro)' }}>
                      Añadido {formatoFecha(c.creadoEn)}{c.ultimoUso ? ` · Usado por última vez ${formatoFecha(c.ultimoUso)}` : ' · Sin usar todavía'}
                    </p>
                  </div>
                  {confirmarBorrado === c.id ? (
                    <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                      <button className={`${styles.btn} ${styles.btnPeligro}`} style={{ fontSize: '0.72rem' }} onClick={() => borrar(c.id)}>Sí, quitar</button>
                      <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.72rem' }} onClick={() => setConfirmarBorrado(null)}>Cancelar</button>
                    </div>
                  ) : (
                    <button className={styles.btnIcono} style={{ color: 'var(--rojo)', flexShrink: 0 }} title="Quitar dispositivo" aria-label="Quitar dispositivo" onClick={() => setConfirmarBorrado(c.id)}>
                      <IconoBasura />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Añadir/activar este dispositivo */}
          {soportado && disponible === 'si' && (
            <div style={{ border: '2px solid var(--borde)', borderRadius: 10, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.88rem' }}>
                {activo ? 'Añadir este dispositivo' : 'Activar en este dispositivo'}
              </p>
              <input
                className={styles.input}
                type="text"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                placeholder="Nombre de este dispositivo"
                maxLength={80}
                disabled={registrando}
              />
              <button
                className={`${styles.btn} ${styles.btnPrimario}`}
                onClick={activar}
                disabled={registrando || !nombreNuevo.trim()}
              >
                {registrando
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}><span className={styles.loginSpinner} /> Esperando a tu autenticador…</span>
                  : <>Registrar {nombreNuevo.trim() || 'este dispositivo'}</>}
              </button>
            </div>
          )}

          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cerrar</button>

          <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--topo-claro)', textAlign: 'center' }}>
            Tu contraseña siempre sigue funcionando, actives o no el acceso biométrico.
          </p>
        </div>
      </div>
    </div>
  );
}
