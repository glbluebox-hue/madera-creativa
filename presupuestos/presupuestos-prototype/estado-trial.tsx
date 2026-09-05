import { useState } from 'react';
import { canjearCodigoAcceso, type EstadoAcceso } from './api.js';
import styles from './styles.module.css';

/**
 * Prueba gratuita de 60 días (05/09/2026) — todo lo relacionado con
 * mostrar el estado del trial vive en un único archivo: el banner
 * persistente mientras está activo, y la pantalla de bloqueo cuando
 * termina. Nunca muestra el valor técnico crudo del plan ("NONE"/"PRO")
 * al usuario — siempre un texto comercial (`ETIQUETA_PLAN_COMERCIAL`).
 *
 * IMPORTANTE (regla explícita del encargo): esta pantalla NUNCA simula un
 * pago real. Los tres planes se muestran a título informativo, con un
 * botón deshabilitado ("Próximamente") — nada que parezca una compra
 * completada. La integración de pago real queda para una fase posterior.
 */

const PLANES_COMERCIALES_INFO = [
  { nombre: 'BASIC', precio: '19 €/mes' },
  { nombre: 'PRO', precio: '39 €/mes' },
  { nombre: 'PREMIUM', precio: '59 €/mes' },
] as const;

/** Días completos que quedan hasta `expiraEn` (0 si ya ha pasado o es hoy) — nunca negativo. */
function diasRestantes(expiraEn: string | null): number {
  if (!expiraEn) return 0;
  const ms = new Date(expiraEn).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** A partir de qué número de días restantes el banner pasa a estilo de aviso — mismo umbral usado como ejemplo en el encargo ("te quedan 5 días"). */
const UMBRAL_AVISO_DIAS = 5;

/**
 * Banner persistente mientras el trial está activo — deliberadamente
 * pequeño y no intrusivo (nunca un modal), visible en cualquier pantalla
 * de la app. No se renderiza nada si la cuenta no está en prueba
 * gratuita activa (ni para un plan de pago real, ni para admin, ni una
 * vez terminado — eso lo cubre `PantallaTrialTerminado`).
 */
export function BannerTrial({ estadoAcceso }: { estadoAcceso: EstadoAcceso | null }) {
  if (!estadoAcceso || estadoAcceso.tipoAcceso !== 'trial' || estadoAcceso.plan === 'NONE') return null;
  const dias = diasRestantes(estadoAcceso.expiraEn);
  const esAviso = dias <= UMBRAL_AVISO_DIAS;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
        padding: '0.45rem 1rem', fontSize: '0.78rem', fontWeight: 600, textAlign: 'center',
        background: esAviso ? 'var(--ocre-bg)' : 'var(--verde-bg)',
        color: esAviso ? 'var(--ocre)' : 'var(--verde)',
        borderBottom: '1px solid var(--borde)',
      }}
    >
      {esAviso ? (
        <span>Tu prueba gratuita termina en {dias} {dias === 1 ? 'día' : 'días'}.</span>
      ) : (
        <span>Prueba gratuita · Basic + Pro · Te quedan {dias} días</span>
      )}
    </div>
  );
}

/**
 * Pantalla de bloqueo tras terminar el trial (Opción 3 de la auditoría —
 * el backend ya es quien de verdad bloquea cualquier ruta de negocio;
 * esto solo explica por qué y ofrece cómo recuperar el acceso). Se
 * muestra tanto si `GET /auth/yo` ya confirma el trial terminado como si
 * cualquier llamada a la API responde 403 `sin_plan_activo` mientras el
 * usuario seguía viendo la app con datos en memoria desactualizados.
 */
export function PantallaTrialTerminado({ onCerrarSesion, onIrAPerfil }: { onCerrarSesion: () => void; onIrAPerfil: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const canjear = async () => {
    if (!codigo.trim()) return;
    setEnviando(true);
    setError('');
    setMensaje('');
    const resultado = await canjearCodigoAcceso(codigo.trim());
    setEnviando(false);
    if (resultado.ok === false) { setError(resultado.error); return; }
    setMensaje('Código aplicado — recarga la página para seguir usando Madera Creativa Estudio.');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--fondo)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto',
    }}>
      <div style={{ maxWidth: 640, width: '100%', display: 'flex', flexDirection: 'column', gap: '1.25rem', textAlign: 'center' }}>
        <div>
          <h1 className={styles.h2} style={{ marginBottom: '0.4rem' }}>Tu prueba gratuita ha terminado.</h1>
          <p style={{ margin: 0, color: 'var(--topo-claro)', fontSize: '0.92rem' }}>
            Elige un plan para continuar utilizando Madera Creativa Estudio.
          </p>
        </div>

        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--verde)', fontWeight: 600 }}>
          Tranquilo: tus clientes, proyectos, presupuestos, facturas y documentos siguen guardados tal cual los dejaste. No se ha borrado nada.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.8rem' }}>
          {PLANES_COMERCIALES_INFO.map((p) => (
            <div key={p.nombre} style={{ border: '1px solid var(--borde)', borderRadius: 'var(--radio-md, 10px)', padding: '1rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--fondo-panel)' }}>
              <strong style={{ fontSize: '0.95rem' }}>{p.nombre}</strong>
              <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>{p.precio}</span>
              <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.76rem' }} disabled title="La contratación online estará disponible muy pronto">
                Próximamente
              </button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--borde)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--topo-claro)' }}>¿Tienes un código de acceso?</p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <input
              className={styles.input}
              style={{ maxWidth: 220 }}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Código de acceso"
              autoCapitalize="characters"
            />
            <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} onClick={canjear} disabled={enviando || !codigo.trim()}>
              {enviando ? 'Comprobando…' : 'Aplicar código'}
            </button>
          </div>
          {mensaje && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--verde)' }}>{mensaje}</p>}
          {error && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--rojo)' }}>{error}</p>}
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
          <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} onClick={onIrAPerfil}>Mi perfil</button>
          <button type="button" className={styles.btnIcono} onClick={onCerrarSesion}>Cerrar sesión</button>
        </div>
      </div>
    </div>
  );
}
