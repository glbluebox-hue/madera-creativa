import { useState } from 'react';
import type { TipoAlmacenamiento, SesionActiva } from './use-auth.js';
import { GuiaSupabase } from './guia-supabase.js';
import styles from './styles.module.css';

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
            <h2 className={styles.h2}>💾 Almacenamiento de datos</h2>
            <button className={styles.btnIcono} onClick={onCerrar}>✕</button>
          </div>

          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Estado actual */}
            <div style={{
              background: esLocal ? '#faf8f5' : '#e8f5e9',
              border: `1px solid ${esLocal ? 'var(--borde)' : '#81c784'}`,
              borderRadius: 10, padding: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.8rem' }}>{esLocal ? '📱' : '☁️'}</span>
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
                  background: esLocal ? '#4B433A' : '#2e7d32', color: '#fff',
                  borderRadius: 20, padding: '2px 10px',
                }}>
                  ACTIVO
                </span>
              </div>
            </div>

            {/* Opción local */}
            <div style={{
              border: `2px solid ${esLocal ? '#4B433A' : 'var(--borde)'}`,
              borderRadius: 10, padding: '1rem', opacity: esLocal ? 1 : 0.7,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>📱</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>Solo en este dispositivo</p>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)', lineHeight: 1.5 }}>
                    Gratis, sin configurar nada. Datos disponibles solo aquí.
                  </p>
                  <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', fontSize: '0.75rem', color: 'var(--topo-claro)' }}>
                    <li>✅ Sin registro, funciona al instante</li>
                    <li>✅ Completamente privado</li>
                    <li>⚠️ Si pierdes el móvil, pierdes los datos</li>
                    <li>⚠️ No accesible desde otros dispositivos</li>
                  </ul>
                </div>
              </div>
              {esSupabase && (
                confirmCambio ? (
                  <div style={{ marginTop: '0.75rem' }}>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: 'var(--rojo)', fontWeight: 600 }}>
                      ⚠️ Los datos seguirán en Supabase. La app usará el dispositivo para los nuevos datos.
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
              border: `2px solid ${esSupabase ? '#2e7d32' : 'var(--borde)'}`,
              borderRadius: 10, padding: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>☁️</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: '0 0 0.25rem', fontWeight: 700 }}>Nube propia (Supabase)</p>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)', lineHeight: 1.5 }}>
                    Gratis hasta 500MB. Datos sincronizados en todos tus dispositivos.
                  </p>
                  <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', fontSize: '0.75rem', color: 'var(--topo-claro)' }}>
                    <li>✅ Accede desde cualquier dispositivo</li>
                    <li>✅ Copia de seguridad automática</li>
                    <li>✅ 500 MB gratis (años de uso)</li>
                    <li>ℹ️ Requiere crear cuenta gratuita en Supabase</li>
                  </ul>
                </div>
              </div>
              <button
                className={`${styles.btn} ${esSupabase ? styles.btnSecundario : styles.btnPrimario}`}
                style={{ marginTop: '0.75rem', fontSize: '0.82rem' }}
                onClick={() => setGuiaAbierta(true)}
              >
                {esSupabase ? '⚙️ Cambiar configuración Supabase' : '☁️ Configurar nube gratis'}
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
