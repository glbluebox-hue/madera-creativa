import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as api from './api.js';
import type { RespuestaSeguimiento, SeguimientoPublico } from './api.js';
import styles from './styles.module.css';

const Check = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const OPCIONES_P1 = [
  'Me encaja y quiero seguir adelante.',
  'Me gusta, pero tengo algunas dudas.',
  'El precio es algo más elevado de lo que esperaba.',
  'Me gustaría cambiar algunos detalles del proyecto.',
  'Estoy valorando otras opciones.',
  'Por ahora prefiero esperar.',
  'Otro motivo.',
];

const OPCIONES_P4 = [
  'Aclarar alguna duda.',
  'Valorar otras opciones de materiales o acabados.',
  'Revisar alguna parte del proyecto.',
  'Estudiar alternativas para ajustar el presupuesto.',
  'Comentar los plazos de ejecución.',
  'Hablar personalmente.',
  'Por ahora no necesito nada.',
  'Prefiero explicarlo con mis propias palabras.',
];

const OPCIONES_P5 = [
  'Sí, me gustaría hablarlo.',
  'Sí, pero prefiero hacerlo más adelante.',
  'No, por ahora no es necesario.',
];

/** Solo el primer nombre de pila — nunca el apellido (petición explícita del usuario, 25/10/2026). */
function primerNombre(nombreCompleto: string): string {
  return nombreCompleto.trim().split(/\s+/)[0] || '';
}

const RESPUESTA_VACIA: RespuestaSeguimiento = {
  valoracion: '', loQueGusta: '', loQueNoConvence: '', ayudaNecesaria: [], quiereContacto: '', comentario: '',
};

/** Fila de opción de selección única o múltiple — mismo marcador visual que la maqueta ya aprobada. */
function OpcionCuestionario({ texto, seleccionada, casilla, onClick }: { texto: string; seleccionada: boolean; casilla?: boolean; onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={`${styles.seguimientoOpcion} ${seleccionada ? styles.seguimientoOpcionSeleccionada : ''}`}
    >
      <span className={`${styles.seguimientoMarcador} ${casilla ? styles.seguimientoMarcadorCasilla : ''}`}>
        {seleccionada ? Check : null}
      </span>
      {texto}
    </div>
  );
}

/**
 * Página pública del cuestionario de Seguimiento — sin sidebar, sin login.
 * Se abre desde el enlace que el carpintero comparte tras enviar un
 * presupuesto que el cliente no ha confirmado. Mismo patrón que
 * `portal-presupuesto.tsx`: todo el estado vive aquí, sin tocar `use-auth.ts`.
 *
 * Orden de las pantallas (reordenado 25/10/2026, a petición del usuario
 * tras probarlo en real): TODAS las preguntas de selección (1, 4, 5) van
 * antes que las dos de texto libre (lo que gusta / lo que cambiaría +
 * comentario) — observación directa del usuario: quien tiene que ESCRIBIR
 * abandona el cuestionario a medias con más frecuencia que quien solo
 * tiene que marcar una opción. Dejando lo fácil de contestar primero, se
 * recoge ese dato aunque el cliente abandone antes de llegar al texto libre.
 */
export function CuestionarioSeguimiento() {
  const { token } = useParams<{ token: string }>();
  const [estadoCarga, setEstadoCarga] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [error, setError] = useState('');
  const [datos, setDatos] = useState<SeguimientoPublico | null>(null);
  const [pantalla, setPantalla] = useState(0); // 0 bienvenida · 1 P1 · 2 P4 · 3 P5 · 4 loQueGusta · 5 loQueNoConvence+comentario · 6 cierre
  const [respuesta, setRespuesta] = useState<RespuestaSeguimiento>(RESPUESTA_VACIA);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState('');

  useEffect(() => {
    if (!token) return;
    api.obtenerSeguimientoPublico(token)
      .then((d) => {
        setDatos(d);
        if (d.respuestaPrevia) setRespuesta({ ...RESPUESTA_VACIA, ...d.respuestaPrevia });
        setEstadoCarga('listo');
      })
      .catch((err) => { setError(err instanceof Error ? err.message : 'No se pudo cargar el seguimiento'); setEstadoCarga('error'); });
  }, [token]);

  const avanza = () => setPantalla((p) => Math.min(6, p + 1));
  const retrocede = () => setPantalla((p) => Math.max(0, p - 1));

  // "Me encaja y quiero seguir adelante." → sin fricción, sin preguntar cómo ayudar (pantalla 2 se salta).
  const saltaP4 = respuesta.valoracion === OPCIONES_P1[0];
  const avanzaDesdeP1 = () => setPantalla(saltaP4 ? 3 : 2);
  const retrocedeDesdeP5 = () => setPantalla(saltaP4 ? 1 : 2);

  const toggleAyuda = useCallback((opcion: string) => {
    setRespuesta((r) => {
      const actual = r.ayudaNecesaria || [];
      const yaEsta = actual.includes(opcion);
      return { ...r, ayudaNecesaria: yaEsta ? actual.filter((o) => o !== opcion) : [...actual, opcion] };
    });
  }, []);

  const enviar = async () => {
    if (!token) return;
    setEnviando(true);
    setErrorEnvio('');
    try {
      await api.enviarRespuestaSeguimientoPublico(token, respuesta);
      setPantalla(6);
    } catch (err) {
      setErrorEnvio(err instanceof Error ? err.message : 'No se pudo enviar tu respuesta');
    } finally {
      setEnviando(false);
    }
  };

  const PUNTOS = (activo: number) => (
    <div className={styles.seguimientoPuntos}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`${styles.seguimientoPunto} ${n <= activo ? styles.seguimientoPuntoActivo : ''}`} />
      ))}
    </div>
  );

  return (
    <div className={styles.app} style={{ minHeight: '100vh', background: 'var(--fondo)', display: 'flex', justifyContent: 'center', padding: '1.25rem 1rem 3rem' }}>
      <div className={styles.seguimientoShell}>

        {estadoCarga === 'cargando' && (
          <p style={{ textAlign: 'center', color: 'var(--topo-claro)', marginTop: '3rem' }}>Cargando…</p>
        )}

        {estadoCarga === 'error' && (
          <div className={styles.panel} style={{ textAlign: 'center', marginTop: '2rem' }}>
            <p style={{ fontWeight: 700, marginBottom: '0.4rem' }}>Este enlace no está disponible</p>
            <p style={{ color: 'var(--topo-claro)', fontSize: '0.9rem' }}>{error}</p>
          </div>
        )}

        {estadoCarga === 'listo' && datos && (
          <div className={`${styles.panel} ${styles.seguimientoPanel}`} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {pantalla === 0 && (
              <>
                {datos.presupuestoTitulo && (
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--topo-claro)', textAlign: 'center' }}>
                    Presupuesto · {datos.presupuestoTitulo}
                  </p>
                )}
                <h2 style={{ margin: 0, fontSize: 'var(--sg-h2)' }}>
                  {datos.clienteNombre ? `Hola, ${primerNombre(datos.clienteNombre)}, ` : ''}¿qué te ha parecido nuestra propuesta?
                </h2>
                <p style={{ margin: 0, fontSize: 'var(--sg-texto)', lineHeight: 1.6, color: 'var(--topo-claro)' }}>
                  Hemos preparado esta propuesta para tu proyecto y nos gustaría conocer tu opinión. Queremos asegurarnos
                  de que se adapta a lo que necesitas y, si hay algo que quieras comentar, estaremos encantados de
                  escucharte. Solo te llevará un minuto.
                </p>
                <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={avanza} style={{ width: '100%', fontSize: 'var(--sg-cta-fuente)', padding: 'var(--sg-cta-padding)' }}>
                  Empezar
                </button>
              </>
            )}

            {pantalla === 1 && (
              <>
                {PUNTOS(1)}
                <h3 style={{ margin: 0, fontSize: 'var(--sg-h3)' }}>¿Cómo ves nuestro presupuesto?</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {OPCIONES_P1.map((op) => (
                    <OpcionCuestionario key={op} texto={op} seleccionada={respuesta.valoracion === op} onClick={() => setRespuesta((r) => ({ ...r, valoracion: op }))} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <button className={styles.btn} onClick={retrocede}>Atrás</button>
                  <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={avanzaDesdeP1} disabled={!respuesta.valoracion} style={{ flex: 1 }}>
                    Siguiente
                  </button>
                </div>
              </>
            )}

            {pantalla === 2 && (
              <>
                {PUNTOS(2)}
                <h3 style={{ margin: 0, fontSize: 'var(--sg-h3)' }}>Si hay algo que te impide confirmar el presupuesto, ¿podemos ayudarte de alguna manera?</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {OPCIONES_P4.map((op) => (
                    <OpcionCuestionario
                      key={op}
                      texto={op}
                      casilla
                      seleccionada={(respuesta.ayudaNecesaria || []).includes(op)}
                      onClick={() => toggleAyuda(op)}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <button className={styles.btn} onClick={retrocede}>Atrás</button>
                  <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={avanza} style={{ flex: 1 }}>Siguiente</button>
                </div>
              </>
            )}

            {pantalla === 3 && (
              <>
                {PUNTOS(3)}
                <h3 style={{ margin: 0, fontSize: 'var(--sg-h3)' }}>¿Te gustaría que nos pusiéramos en contacto contigo?</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {OPCIONES_P5.map((op) => (
                    <OpcionCuestionario key={op} texto={op} seleccionada={respuesta.quiereContacto === op} onClick={() => setRespuesta((r) => ({ ...r, quiereContacto: op }))} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <button className={styles.btn} onClick={retrocedeDesdeP5}>Atrás</button>
                  <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={avanza} style={{ flex: 1 }}>Siguiente</button>
                </div>
              </>
            )}

            {pantalla === 4 && (
              <>
                {PUNTOS(4)}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: 'var(--sg-h3)' }}>¿Qué es lo que más te ha gustado de nuestra propuesta?</h3>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--topo-claro)', background: 'var(--fondo)', borderRadius: 999, padding: '0.2em 0.7em', whiteSpace: 'nowrap' }}>Opcional</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', fontStyle: 'italic', color: 'var(--topo-muy-claro)' }}>
                  Puede ser el diseño, los materiales, la distribución, los acabados o cualquier otro detalle.
                </p>
                <textarea
                  className={styles.input}
                  style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                  rows={3}
                  value={respuesta.loQueGusta}
                  onChange={(e) => setRespuesta((r) => ({ ...r, loQueGusta: e.target.value }))}
                />
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <button className={styles.btn} onClick={retrocede}>Atrás</button>
                  <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={avanza} style={{ flex: 1 }}>Siguiente</button>
                </div>
              </>
            )}

            {pantalla === 5 && (
              <>
                {PUNTOS(5)}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: 'var(--sg-h3)' }}>¿Hay algo que cambiarías o que no termine de convencerte?</h3>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--topo-claro)', background: 'var(--fondo)', borderRadius: 999, padding: '0.2em 0.7em', whiteSpace: 'nowrap' }}>Opcional</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', fontStyle: 'italic', color: 'var(--topo-muy-claro)' }}>
                  Nos ayudará a entender mejor tus preferencias.
                </p>
                <textarea
                  className={styles.input}
                  style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                  rows={3}
                  value={respuesta.loQueNoConvence}
                  onChange={(e) => setRespuesta((r) => ({ ...r, loQueNoConvence: e.target.value }))}
                />
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.3rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Algo más que quieras contarnos</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--topo-claro)', background: 'var(--fondo)', borderRadius: 999, padding: '0.2em 0.7em', whiteSpace: 'nowrap' }}>Opcional</span>
                </div>
                <textarea
                  className={styles.input}
                  style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                  rows={2}
                  value={respuesta.comentario}
                  onChange={(e) => setRespuesta((r) => ({ ...r, comentario: e.target.value }))}
                />
                {errorEnvio && <p style={{ color: 'var(--rojo)', fontSize: '0.82rem', margin: 0 }}>{errorEnvio}</p>}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <button className={styles.btn} onClick={retrocede}>Atrás</button>
                  <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={enviar} disabled={enviando} style={{ flex: 1 }}>
                    {enviando ? 'Enviando…' : 'Enviar mi opinión'}
                  </button>
                </div>
              </>
            )}

            {pantalla === 6 && (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.6rem', alignItems: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--verde-bg)', color: 'var(--verde)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <h3 style={{ margin: 0, fontSize: 'var(--sg-h3)' }}>Muchas gracias por compartir tu opinión.</h3>
                <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--topo-claro)' }}>
                  Nos ayuda a comprender mejor lo que necesitas y a preparar propuestas cada vez mejores.
                  <br /><br />
                  Si quieres comentar algún detalle de tu proyecto, estaremos encantados de hablarlo contigo.
                </p>
                <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: 'var(--topo)' }}>¡Gracias por confiar en Madera Creativa Estudio!</p>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
