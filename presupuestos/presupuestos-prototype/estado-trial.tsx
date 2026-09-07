import { useState } from 'react';
import { canjearCodigoAcceso, elegirPlan, type EstadoAcceso } from './api.js';
import { PaginaPlanes } from './pagina-planes.js';
import styles from './styles.module.css';

/**
 * Prueba gratuita de 60 días (05/09/2026, refinado el mismo día en la
 * implementación de la experiencia comercial completa) — todo lo
 * relacionado con mostrar el estado del trial vive en un único archivo:
 * el banner persistente mientras está activo, y la pantalla de bloqueo
 * cuando termina. Nunca muestra el valor técnico crudo del plan
 * ("NONE"/"PRO") al usuario — siempre un texto comercial.
 *
 * El detalle de los tres planes YA NO vive aquí duplicado: se embebe
 * directamente `<PaginaPlanes>` (mismo componente que abre el banner y
 * "Mi perfil"), única fuente de verdad de nombres/precios/funciones
 * (`planes.ts`). Esta pantalla ya es a pantalla completa, así que se usa
 * tal cual, sin chrome de modal adicional.
 */

/** Días completos que quedan hasta `expiraEn` (0 si ya ha pasado o es hoy) — nunca negativo. */
function diasRestantes(expiraEn: string | null): number {
  if (!expiraEn) return 0;
  const ms = new Date(expiraEn).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Nivel de aviso del banner (corrección tras la auditoría final,
 * 05/09/2026) — cumple el requisito original del encargo (§6): UN ÚNICO
 * componente con estados progresivos según los días restantes, nunca
 * varios componentes ni contadores en tiempo real. Los 5 umbrales son
 * exactamente los pedidos: más de 10 días (calmo), 10 días (primer
 * aviso), 5 días (aviso más visible), 3 días (aviso importante) y 1 día
 * (aviso final).
 *
 * Los colores reutilizan el mismo significado semántico que ya usa el
 * resto de la app (verde=normal, ocre=aviso, rojo=urgente — ver
 * `dashboard.tsx`/`panel-admin.tsx`/`inteligencia-precios-vista.tsx`),
 * nunca un color nuevo. El quinto matiz (para diferenciar aviso1/aviso2 y
 * aviso3/final dentro del mismo color) se consigue reforzando el grosor
 * del borde y el peso de la tipografía — mismo patrón "tinte suave / más
 * énfasis" que ya usa la app en estados de confirmación (p. ej. el borde
 * sólido de `confirmar-borrado.tsx`), nunca un color inventado ni un
 * relleno sólido llamativo (se mantiene el tono "profesional, tranquilo,
 * nunca agresivo" pedido explícitamente).
 */
type NivelAvisoTrial = 'calmo' | 'aviso1' | 'aviso2' | 'aviso3' | 'final';

function nivelAvisoTrial(dias: number): NivelAvisoTrial {
  if (dias > 10) return 'calmo';
  if (dias > 5) return 'aviso1';   // 6–10 días: primer aviso
  if (dias > 3) return 'aviso2';   // 4–5 días: aviso más visible
  if (dias > 1) return 'aviso3';   // 2–3 días: aviso importante
  return 'final';                  // 0–1 día: aviso final
}

const ESTILO_NIVEL_AVISO: Record<NivelAvisoTrial, { fondo: string; color: string; borde: string; peso: number }> = {
  calmo: { fondo: 'var(--verde-bg)', color: 'var(--verde)', borde: '1px solid var(--borde)', peso: 600 },
  aviso1: { fondo: 'var(--ocre-bg)', color: 'var(--ocre)', borde: '1px solid var(--borde)', peso: 600 },
  aviso2: { fondo: 'var(--ocre-bg)', color: 'var(--ocre)', borde: '2px solid var(--ocre)', peso: 600 },
  aviso3: { fondo: 'var(--rojo-bg)', color: 'var(--rojo)', borde: '2px solid var(--rojo)', peso: 600 },
  final: { fondo: 'var(--rojo-bg)', color: 'var(--rojo)', borde: '3px solid var(--rojo)', peso: 800 },
};

/** Texto del banner por nivel — la proximidad del final se comunica con matices, nunca con alarmismo. */
function mensajeNivelAviso(nivel: NivelAvisoTrial, dias: number): string {
  switch (nivel) {
    case 'calmo':
      return `Tu prueba de Madera Creativa Estudio continúa durante ${dias} días · Basic + Pro incluidos.`;
    case 'aviso1':
      return `Tu prueba de Madera Creativa Estudio termina en ${dias} días. Cuando quieras, puedes ver los planes disponibles.`;
    case 'aviso2':
      return `Tu prueba termina en ${dias} días — echa un vistazo a los planes para no perder el acceso.`;
    case 'aviso3':
      return `Tu prueba termina en ${dias} días — elige un plan pronto para seguir trabajando sin interrupciones.`;
    case 'final':
      return dias <= 0
        ? 'Tu prueba termina hoy. Elige un plan para no perder el acceso a tus datos.'
        : 'Tu prueba termina mañana. Elige un plan para no perder el acceso a tus datos.';
  }
}

/**
 * Banner persistente mientras el trial está activo — deliberadamente
 * pequeño y no intrusivo (nunca un modal), visible en cualquier pantalla
 * de la app. No se renderiza nada si la cuenta no está en prueba
 * gratuita activa (ni para un plan de pago real, ni para admin, ni una
 * vez terminado — eso lo cubre `PantallaTrialTerminado`).
 */
export function BannerTrial({ estadoAcceso, onVerPlanes }: { estadoAcceso: EstadoAcceso | null; onVerPlanes: () => void }) {
  if (!estadoAcceso || estadoAcceso.tipoAcceso !== 'trial' || estadoAcceso.plan === 'NONE') return null;
  const dias = diasRestantes(estadoAcceso.expiraEn);
  const nivel = nivelAvisoTrial(dias);
  const estilo = ESTILO_NIVEL_AVISO[nivel];

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.7rem', flexWrap: 'wrap',
        padding: '0.45rem 1rem', fontSize: '0.78rem', fontWeight: estilo.peso, textAlign: 'center',
        background: estilo.fondo, color: estilo.color, borderBottom: estilo.borde,
      }}
    >
      <span>{mensajeNivelAviso(nivel, dias)}</span>
      <button
        type="button"
        onClick={onVerPlanes}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          font: 'inherit', fontWeight: 800, color: 'inherit', textDecoration: 'underline',
        }}
      >
        Ver planes
      </button>
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
 *
 * `className={styles.app}` en el contenedor raíz (corrección 08/09/2026):
 * es un `return` que sustituye toda la app, sin ningún ancestro con esa
 * clase — sin ella, esta pantalla no heredaba ni la fuente Inter ni los
 * tokens de color (ambos declarados dentro de `.app`), y se veía con la
 * fuente serif por defecto del navegador.
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
    <div className={styles.app} style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--fondo)',
      display: 'flex', justifyContent: 'center', padding: '2rem 1.5rem', overflowY: 'auto',
    }}>
      <div style={{ maxWidth: 900, width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 className={styles.h2} style={{ marginBottom: '0.4rem' }}>Tu prueba gratuita ha terminado.</h1>
          <p style={{ margin: 0, color: 'var(--topo-claro)', fontSize: '0.92rem' }}>
            Elige un plan para seguir utilizando Madera Creativa Estudio.
          </p>
        </div>

        <p style={{ margin: '0 auto', maxWidth: 560, textAlign: 'center', fontSize: '0.82rem', color: 'var(--verde)', fontWeight: 600 }}>
          Tranquilo: tus clientes, proyectos, presupuestos, facturas y documentos siguen guardados tal cual los dejaste. No se ha borrado nada.
        </p>

        {/*
          Guarda la elección de verdad (08/09/2026, `/auth/elegir-plan`),
          aunque aquí no desbloquea nada por sí sola (el acceso tras el
          trial sigue exigiendo el código/pago real, ver más abajo) — es
          la misma señal comercial que la pantalla obligatoria de después
          de verificar el email, por si el usuario no llegó a elegir
          entonces o cambia de opinión ahora. Sin manejo de error propio
          aquí: un fallo de red no debe bloquear esta pantalla, ya crítica
          de por sí (el usuario se ha quedado sin acceso).
        */}
        <PaginaPlanes onElegir={(plan, periodo) => { elegirPlan(plan, periodo); }} />

        <div style={{ borderTop: '1px solid var(--borde)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', textAlign: 'center' }}>
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
