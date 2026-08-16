import { useState } from 'react';
import type { TipoAlmacenamiento, SesionActiva } from './use-auth.js';
import { GuiaSupabase } from './guia-supabase.js';
import styles from './styles.module.css';

// Iconos de línea (Dirección Creativa) — sustituyen a los emoji anteriores.
const IconoMovil = ({ s = 22 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12" y2="18" /></svg>;
const IconoNube = ({ s = 22 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>;
const IconoOk = ({ s = 12 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="var(--verde)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>;
const IconoAviso = ({ s = 12 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="var(--ocre)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></svg>;
const IconoInfo = ({ s = 12 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="var(--azul)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="8" /></svg>;

/** Props del panel de ajustes de almacenamiento. */
export type AjustesAlmacenamientoProps = {
  sesion: SesionActiva;
  onActualizar: (tipo: TipoAlmacenamiento, url?: string, clave?: string) => void;
  onCerrar: () => void;
};

/**
 * Panel de ajustes de almacenamiento: permite cambiar entre local y Supabase,
 * ver el estado actual y migrar datos entre ambos modos.
 */
export function AjustesAlmacenamiento({ sesion, onActualizar, onCerrar }: AjustesAlmacenamientoProps) {
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  const [confirmCambio, setConfirmCambio] = useState(false);

  const esLocal = sesion.almacenamiento === 'local';
  const esSupabase = sesion.almacenamiento === 'supabase';

  const cambiarALocal = () => {
    onActualizar('local');
    setConfirmCambio(false);
  };

  return (
    <>
      <div className={styles.modalFondo} onClick={onCerrar}>
        <div className={styles.modalCaja} style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
          <div className={styles.modalCabecera}>
            <h2 className={styles.h2} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
              Almacenamiento de datos
            </h2>
            <button className={styles.btnIcono} onClick={onCerrar} aria-label="Cerrar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Estado actual */}
            <div style={{
              background: esLocal ? 'var(--fondo)' : 'var(--verde-bg)',
              border: `1px solid ${esLocal ? 'var(--borde)' : 'var(--verde)'}`,
              borderRadius: 'var(--radio-md)', padding: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: 'var(--topo)' }}>{esLocal ? <IconoMovil /> : <IconoNube />}</span>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>
                    {esLocal ? 'Almacenamiento local' : 'Almacenamiento en la nube'}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
                    {esLocal
                      ? 'Los datos se guardan solo en este dispositivo.'
                      : `Conectado a Supabase · ${sesion.supabaseUrl?.replace('https://', '').split('.')[0] ?? '—'}`}
                  </p>
                </div>
                <span style={{
                  marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700,
                  background: esLocal ? 'var(--topo)' : 'var(--verde)', color: 'var(--blanco)',
                  borderRadius: 20, padding: '2px 10px',
                }}>
                  ACTIVO
                </span>
              </div>
            </div>

            {/* Opción local */}
            <div style={{
              border: `2px solid ${esLocal ? 'var(--topo)' : 'var(--borde)'}`,
              borderRadius: 10, padding: '1rem', opacity: esLocal ? 1 : 0.7,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <span style={{ color: 'var(--topo)' }}><IconoMovil s={18} /></span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>Solo en este dispositivo</p>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)', lineHeight: 1.5 }}>
                    Gratis, sin configurar nada. Datos disponibles solo aquí.
                  </p>
                  <ul style={{ margin: '0.4rem 0 0', paddingLeft: 0, listStyle: 'none', fontSize: '0.75rem', color: 'var(--topo-claro)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><IconoOk /> Sin registro, funciona al instante</li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><IconoOk /> Completamente privado</li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><IconoAviso /> Si pierdes el móvil, pierdes los datos</li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><IconoAviso /> No accesible desde otros dispositivos</li>
                  </ul>
                </div>
              </div>
              {esSupabase && (
                confirmCambio ? (
                  <div style={{ marginTop: '0.75rem' }}>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--rojo)', fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                      <IconoAviso />
                      Los datos seguirán en Supabase. La app usará el dispositivo para los nuevos datos.
                    </p>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className={`${styles.btn} ${styles.btnPeligro}`} style={{ fontSize: '0.78rem' }} onClick={cambiarALocal}>Sí, cambiar a local</button>
                      <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.78rem' }} onClick={() => setConfirmCambio(false)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button className={`${styles.btn} ${styles.btnSecundario}`} style={{ marginTop: '0.75rem', fontSize: '0.82rem' }} onClick={() => setConfirmCambio(true)}>
                    Cambiar a local
                  </button>
                )
              )}
            </div>

            {/* Opción nube */}
            <div style={{
              border: `2px solid ${esSupabase ? 'var(--verde)' : 'var(--borde)'}`,
              borderRadius: 10, padding: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <span style={{ color: 'var(--topo)' }}><IconoNube s={18} /></span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>Nube propia (Supabase)</p>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)', lineHeight: 1.5 }}>
                    Gratis hasta 500MB. Datos sincronizados en todos tus dispositivos.
                  </p>
                  <ul style={{ margin: '0.4rem 0 0', paddingLeft: 0, listStyle: 'none', fontSize: '0.75rem', color: 'var(--topo-claro)', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><IconoOk /> Accede desde cualquier dispositivo</li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><IconoOk /> Copia de seguridad automática</li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><IconoOk /> 500 MB gratis (años de uso)</li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><IconoInfo /> Requiere crear cuenta gratuita en Supabase</li>
                  </ul>
                </div>
              </div>
              <button
                className={`${styles.btn} ${esSupabase ? styles.btnSecundario : styles.btnPrimario}`}
                style={{ marginTop: '0.75rem', fontSize: '0.82rem' }}
                onClick={() => setGuiaAbierta(true)}
              >
                {esSupabase ? 'Cambiar configuración Supabase' : 'Configurar nube gratis'}
              </button>
            </div>

            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cerrar</button>
          </div>
        </div>
      </div>

      {guiaAbierta && (
        <GuiaSupabase
          urlInicial={sesion.supabaseUrl}
          claveInicial={sesion.supabaseKey}
          onConfirmar={(url, clave) => {
            onActualizar('supabase', url, clave);
            setGuiaAbierta(false);
          }}
          onCancelar={() => setGuiaAbierta(false)}
        />
      )}
    </>
  );
}
