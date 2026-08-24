import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { EstadoMotorTutorial, PasoTutorial } from './tutorial-motor.js';
import { Z_TUTORIAL } from './z-index.js';
import styles from './tutorial-overlay.module.css';

export type TutorialOverlayProps = {
  estado: EstadoMotorTutorial;
  onAvanzar: () => void;
  onRetroceder: () => void;
  onCerrar: () => void;
  onObjetivoLocalizado: () => void;
  onAccionDetectada: () => void;
  /** Sección actual de la app (mismo valor que `Seccion` en `presupuestos-prototype.tsx`) — para comparar contra `seccionRequerida` de cada paso. */
  seccionActual: string;
  /** Navega a otra sección — reutiliza la navegación ya existente (`cambiarSeccion`); este componente nunca crea un sistema paralelo. */
  onNavegar: (seccion: string) => void;
  /** true si el cajón lateral móvil ya está abierto. */
  menuMovilAbierto: boolean;
  /** Abre el cajón lateral móvil — reutiliza el estado ya existente en `presupuestos-prototype.tsx`. */
  onAbrirMenuMovil: () => void;
};

const MARGEN_FOCO_PX = 6;
const INTERVALO_SONDEO_MS = 150;
const ANCHO_GLOBO_PX = 320;
const MARGEN_GLOBO_PX = 12;

/**
 * Única pieza del sistema de tutoriales con permiso para tocar el DOM
 * (Fase 1, 24/08/2026) — el motor (`tutorial-motor.ts`) decide QUÉ paso
 * toca; este componente decide DÓNDE está el elemento real y CÓMO se ve.
 *
 * Localiza el objetivo por `[data-tutorial-id]` — nunca por posición fija
 * ni por clase CSS (las clases de CSS Modules llevan hash y pueden cambiar
 * en cualquier build; una coordenada X/Y se rompe con el primer cambio de
 * diseño). Si el elemento cambia de sitio (resize, scroll, apertura del
 * menú móvil) el foco y el globo se recalculan solos.
 */
export function TutorialOverlay({
  estado, onAvanzar, onRetroceder, onCerrar, onObjetivoLocalizado, onAccionDetectada,
  seccionActual, onNavegar, menuMovilAbierto, onAbrirMenuMovil,
}: TutorialOverlayProps) {
  const paso: PasoTutorial | null = estado.fase === 'localizando' || estado.fase === 'mostrandoPaso' ? estado.definicion.pasos[estado.pasoIndice] : null;

  // Elemento real encontrado — se guarda como ESTADO (no como ref) a
  // propósito: si el motor sigue en el mismo paso pero el nodo DOM se
  // remonta (ej. la app reconstruye ese trozo del árbol), necesitamos que
  // el efecto del listener de clic reaccione al cambio, no solo el de
  // localización — una ref no dispara ningún re-render/re-efecto por sí sola.
  const [elemento, setElemento] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Navegar a la sección correcta / abrir el menú móvil ANTES de intentar
  // localizar el elemento — reutiliza la navegación ya existente de la
  // app; este componente nunca decide "a dónde ir" por su cuenta, solo lee
  // el dato del paso y llama a lo que ya existe.
  useEffect(() => {
    if (!paso) return;
    if (paso.seccionRequerida && paso.seccionRequerida !== seccionActual) { onNavegar(paso.seccionRequerida); return; }
    if (paso.requiereMenuMovil && !menuMovilAbierto) onAbrirMenuMovil();
  }, [paso, seccionActual, menuMovilAbierto, onNavegar, onAbrirMenuMovil]);

  // Sondeo del elemento objetivo — "objetivo que todavía no existe" +
  // "reintento cuando aparece" se resuelven aquí, no en el motor: se
  // reintenta cada `INTERVALO_SONDEO_MS` mientras el paso siga activo
  // (tanto localizando como ya mostrado, para tolerar que desaparezca y
  // vuelva a aparecer, p. ej. una pestaña que se cierra y se reabre).
  // Un `MutationObserver` sería más "elegante" pero un sondeo corto es más
  // simple y de sobra suficiente para Fase 1 (no sobrecomplicar).
  useEffect(() => {
    if (!paso || (estado.fase !== 'localizando' && estado.fase !== 'mostrandoPaso')) {
      setElemento(null);
      setRect(null);
      return;
    }
    let vivo = true;
    const intentar = () => {
      if (!vivo) return;
      const el = document.querySelector<HTMLElement>(`[data-tutorial-id="${paso.targetId}"]`);
      setElemento((actual) => (actual === el ? actual : el));
      setRect(el ? el.getBoundingClientRect() : null);
      if (el && estado.fase === 'localizando') onObjetivoLocalizado();
    };
    intentar();
    const id = window.setInterval(intentar, INTERVALO_SONDEO_MS);
    return () => { vivo = false; window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.fase, paso?.id]);

  // Recoloca el foco/globo en resize/scroll mientras el paso ya está mostrado — el sondeo de arriba ya cubre la reposición "espontánea" cada 150ms, esto la hace instantánea ante esos dos gestos concretos.
  useEffect(() => {
    if (estado.fase !== 'mostrandoPaso' || !elemento) return;
    const recalcular = () => setRect(elemento.getBoundingClientRect());
    window.addEventListener('resize', recalcular);
    window.addEventListener('scroll', recalcular, true);
    return () => {
      window.removeEventListener('resize', recalcular);
      window.removeEventListener('scroll', recalcular, true);
    };
  }, [estado.fase, elemento]);

  // Paso interactivo: escucha el clic real sobre el elemento SIN
  // interceptarlo — nunca `preventDefault`/`stopPropagation`. La app
  // ejecuta su comportamiento normal; este listener solo se entera en
  // paralelo, nunca sustituye ni duplica la acción real.
  useEffect(() => {
    if (estado.fase !== 'mostrandoPaso' || !paso || paso.tipo !== 'interactivo' || !elemento) return;
    const alPulsar = () => onAccionDetectada();
    elemento.addEventListener('click', alPulsar);
    return () => elemento.removeEventListener('click', alPulsar);
  }, [estado.fase, paso, elemento, onAccionDetectada]);

  if (estado.fase === 'inactivo') return null;

  if (estado.fase === 'completado') {
    return (
      <div className={styles.veloCompletado} style={{ zIndex: Z_TUTORIAL }}>
        <div className={styles.globo} style={{ position: 'relative', width: ANCHO_GLOBO_PX }}>
          <p className={styles.globoTitulo}>¡Tutorial completado!</p>
          <p className={styles.globoTexto}>Puedes repetirlo cuando quieras desde el Centro de ayuda.</p>
          <div className={styles.globoBotones}>
            <span />
            <button className={styles.btnPrimario} onClick={onCerrar}>Cerrar</button>
          </div>
        </div>
      </div>
    );
  }

  // Localizando todavía (el objetivo no ha aparecido en el DOM) — Fase 1
  // no muestra ningún indicador de carga a propósito, ver informe de
  // riesgos; simplemente no hay nada que pintar hasta que `rect` exista.
  if (!paso || !rect) return null;

  const primerPaso = estado.pasoIndice === 0;
  const ultimoPaso = estado.pasoIndice === estado.definicion.pasos.length - 1;

  return (
    <div className={styles.raiz} style={{ zIndex: Z_TUTORIAL }} role="dialog" aria-label={`Tutorial: ${paso.titulo}`}>
      <div className={styles.velo} style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top - MARGEN_FOCO_PX) }} />
      <div className={styles.velo} style={{ top: rect.bottom + MARGEN_FOCO_PX, left: 0, right: 0, bottom: 0 }} />
      <div className={styles.velo} style={{ top: rect.top - MARGEN_FOCO_PX, left: 0, width: Math.max(0, rect.left - MARGEN_FOCO_PX), height: rect.height + MARGEN_FOCO_PX * 2 }} />
      <div className={styles.velo} style={{ top: rect.top - MARGEN_FOCO_PX, left: rect.right + MARGEN_FOCO_PX, right: 0, height: rect.height + MARGEN_FOCO_PX * 2 }} />
      <div
        className={styles.foco}
        style={{ top: rect.top - MARGEN_FOCO_PX, left: rect.left - MARGEN_FOCO_PX, width: rect.width + MARGEN_FOCO_PX * 2, height: rect.height + MARGEN_FOCO_PX * 2 }}
      />
      <div className={styles.globo} style={posicionGlobo(rect, paso.posicion)}>
        <p className={styles.globoTitulo}>{paso.titulo}</p>
        <p className={styles.globoTexto}>{paso.texto}</p>
        {paso.tipo === 'interactivo' && <p className={styles.globoPista}>👉 Pulsa el elemento señalado para continuar.</p>}
        <div className={styles.globoBotones}>
          <button className={styles.btnTexto} onClick={onCerrar}>Omitir tutorial</button>
          <div className={styles.globoBotonesDerecha}>
            {!primerPaso && <button className={styles.btnSecundario} onClick={onRetroceder}>Atrás</button>}
            {paso.tipo === 'informativo' && (
              <button className={styles.btnPrimario} onClick={onAvanzar}>{ultimoPaso ? 'Finalizar' : 'Siguiente'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Altura estimada del globo — no se mide el DOM real (todavía no existe en el primer render), basta una estimación holgada para decidir si un lado tiene sitio de verdad. */
const ALTURA_ESTIMADA_GLOBO_PX = 220;

/**
 * Posición del globo relativa al objetivo — corrección 24/08/2026 (bug
 * real, reportado con captura: el globo tapaba el propio botón que había
 * que pulsar en un paso interactivo, impidiendo continuar el tutorial).
 *
 * Causa: el código anterior SIEMPRE colocaba el globo en el lado
 * preferido y solo recortaba (`Math.min`/`Math.max`) para no salirse de
 * la ventana — si la ventana era demasiado estrecha para que el globo
 * cupiera entero en ese lado, el recorte lo empujaba de vuelta ENCIMA del
 * propio elemento señalado en vez de moverlo a otro lado. Ahora se
 * calcula el espacio real disponible en los 4 lados y, si el lado
 * preferido no tiene sitio de sobra, se elige el que más espacio tenga —
 * el globo nunca se superpone al objetivo, así que el elemento real
 * siempre queda pulsable.
 */
function posicionGlobo(rect: DOMRect, ladoPreferido: PasoTutorial['posicion']): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const espacio = {
    izquierda: rect.left,
    derecha: vw - rect.right,
    arriba: rect.top,
    abajo: vh - rect.bottom,
  };
  const necesarioHorizontal = ANCHO_GLOBO_PX + MARGEN_GLOBO_PX + 8;
  const necesarioVertical = ALTURA_ESTIMADA_GLOBO_PX + MARGEN_GLOBO_PX + 8;
  const cabe = {
    izquierda: espacio.izquierda >= necesarioHorizontal,
    derecha: espacio.derecha >= necesarioHorizontal,
    arriba: espacio.arriba >= necesarioVertical,
    abajo: espacio.abajo >= necesarioVertical,
  };

  let lado = ladoPreferido ?? 'abajo';
  if (!cabe[lado]) {
    // El lado pedido no tiene sitio de sobra — se elige el que más espacio real tenga, nunca se fuerza uno que taparía el objetivo.
    lado = (Object.keys(espacio) as (keyof typeof espacio)[]).sort((a, b) => espacio[b] - espacio[a])[0];
  }

  const centradoX = Math.min(Math.max(8, rect.left + rect.width / 2 - ANCHO_GLOBO_PX / 2), vw - ANCHO_GLOBO_PX - 8);
  const topAlturaLimite = vh - ALTURA_ESTIMADA_GLOBO_PX - 8;
  switch (lado) {
    case 'derecha':
      return { top: Math.max(8, Math.min(rect.top, topAlturaLimite)), left: rect.right + MARGEN_GLOBO_PX, width: ANCHO_GLOBO_PX };
    case 'izquierda':
      return { top: Math.max(8, Math.min(rect.top, topAlturaLimite)), left: rect.left - ANCHO_GLOBO_PX - MARGEN_GLOBO_PX, width: ANCHO_GLOBO_PX };
    case 'arriba':
      return { top: rect.top - MARGEN_GLOBO_PX, left: centradoX, width: ANCHO_GLOBO_PX, transform: 'translateY(-100%)' };
    case 'abajo':
    default:
      return { top: rect.bottom + MARGEN_GLOBO_PX, left: centradoX, width: ANCHO_GLOBO_PX };
  }
}
