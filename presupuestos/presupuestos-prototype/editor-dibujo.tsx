import { Fragment, useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Excalidraw, exportToBlob, viewportCoordsToSceneCoords, CaptureUpdateAction } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI, AppState } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';
import type { Dibujo } from './types.js';
import { generarId } from './mock.js';
import { SelectorDestinoGuardado, type DestinoDibujo } from './selector-destino-guardado.js';
import {
  iniciarCotaEnCurso, actualizarCotaEnCurso, sincronizarCotas, calibrarDesdeCota, calibrarPorRectangulo, regenerarEtiquetasCotas, ajustarLongitudCotaEnEscena, convertirDesdeMm, convertirAMm,
  construirMarcadoresCalibracion, IDS_MARCADORES_CALIBRACION, ID_LINEA_CALIBRACION,
  type Cota, type EscalaDibujo, type OrientacionCota, type PuntoEscena, type UnidadVisualizacion,
} from './cota-modelo.js';
import { puntosCandidatosSnap, buscarSnap, umbralSnapEscena, construirResaltoSnap } from './medicion-snapping.js';
import type { HerramientaId } from './editor-dibujo-tipos.js';
import { IDIOMAS, EXCALIDRAW_LANG_CODE, TEXTOS, type Idioma, type IdGrosor } from './editor-dibujo-idiomas.js';
import { puedeUsar, PRO_O_SUPERIOR, type PlanAcceso } from './planes.js';
import styles from './styles.module.css';

/** Props del editor de dibujo (Fase 2.1, destino de guardado en Fase 2.2). */
export type EditorDibujoProps = {
  /** Dibujo a editar — `null` para empezar uno nuevo en blanco. */
  dibujo: Dibujo | null;
  /**
   * Cliente al que asociar un dibujo nuevo — cuando se abre desde la ficha
   * de un cliente ya se conoce y no hace falta preguntar. Si se omite y el
   * dibujo tampoco tiene cliente propio, al pulsar Guardar se muestra el
   * selector "¿Dónde quieres guardar este dibujo?" (necesita `clientes`).
   */
  clienteId?: string;
  /** Carpeta del cliente en la que crear un dibujo nuevo (ficha de cliente, dentro de una carpeta ya abierta). */
  carpetaId?: string;
  /**
   * Proyecto al que asociar un dibujo nuevo (Fase 1, 04/09/2026) — cuando el
   * editor se abre desde dentro de la ficha de un proyecto (`tab-dibujos.tsx`)
   * ya se conoce y se rellena aquí, igual que `clienteId`. Ausente cuando el
   * dibujo se crea desde la bandeja general sin proyecto — se queda vacío,
   * tal como hoy.
   */
  proyectoId?: string;
  /**
   * Plan de la sesión actual (Fase 2.5, 04/09/2026) — las herramientas de
   * imagen y cota exigen PRO+; el dibujo/anotación básico sigue disponible
   * en BASIC. NOTA: a diferencia del resto de gates de esta fase, aquí NO
   * hay todavía una comprobación equivalente en el backend al guardar
   * (queda como decisión pendiente de la especificación técnica) — este es
   * hoy el único punto de protección real para esta función concreta.
   */
  plan?: PlanAcceso;
  /** Bypass administrativo (05/09/2026) — ver `puedeUsar()` en `planes.ts`. */
  esAdmin?: boolean;
  /** Lista ligera de clientes — solo se usa si hace falta mostrar el selector de destino. */
  clientes?: { id: string; nombre: string }[];
  onGuardar: (d: Dibujo) => Promise<void>;
  onVolver: () => void;
};

// Las etiquetas (`label`) de herramientas/orientaciones/grosores viven en
// `editor-dibujo-idiomas.ts`, indexadas por `id` — estos arrays solo fijan
// el orden y el icono, que no cambian con el idioma.
const HERRAMIENTAS: { id: HerramientaId; icono: import('react').ReactNode }[] = [
  { id: 'selection', icono: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51z" /></svg> },
  { id: 'rectangle', icono: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="1.5" /></svg> },
  { id: 'diamond', icono: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l10 10-10 10L2 12z" /></svg> },
  { id: 'ellipse', icono: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /></svg> },
  { id: 'freedraw', icono: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></svg> },
  { id: 'line', icono: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="19" y1="5" x2="5" y2="19" /></svg> },
  { id: 'arrow', icono: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="19" x2="19" y2="5" /><polyline points="9 5 19 5 19 15" /></svg> },
  { id: 'text', icono: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg> },
  { id: 'image', icono: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg> },
  { id: 'eraser', icono: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20H9L4 15a2 2 0 0 1 0-2.83l8-8a2 2 0 0 1 2.83 0l5 5a2 2 0 0 1 0 2.83z" /><line x1="6" y1="11" x2="14" y2="19" /></svg> },
  { id: 'cota', icono: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="7" x2="4" y2="17" /><line x1="20" y1="7" x2="20" y2="17" /><line x1="4" y1="12" x2="20" y2="12" /><polyline points="8 8 4 12 8 16" /><polyline points="16 8 20 12 16 16" /></svg> },
];

const ORIENTACIONES_COTA: { id: OrientacionCota; icono: import('react').ReactNode }[] = [
  { id: 'alineada', icono: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="19" x2="19" y2="5" /></svg> },
  { id: 'horizontal', icono: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="20" y2="12" /></svg> },
  { id: 'vertical', icono: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="4" x2="12" y2="20" /></svg> },
];

/** Colores reales (hex) — a diferencia de tldraw, Excalidraw acepta hex directo, no una paleta de nombres fijos. */
const COLORES = ['#1e1e1e', '#868e96', '#1971c2', '#2f9e44', '#e03131', '#e8590c', '#f08c00', '#7048e8'] as const;

// `currentItemStrokeWidth` acepta cualquier número — los 3 valores previos
// (1/2/4) eran solo la costumbre visual de Excalidraw, no un límite técnico.
// Se añaden 3 opciones más finas que "Fino" a petición explícita del
// usuario; se mantienen 1/2/4 sin tocar para no cambiar el aspecto de nada
// ya dibujado con esos valores.
const GROSORES: { id: IdGrosor; valor: number }[] = [
  { id: 'extraFino', valor: 0.25 },
  { id: 'ultraFino', valor: 0.5 },
  { id: 'muyFino', valor: 0.75 },
  { id: 'fino', valor: 1 },
  { id: 'medio', valor: 2 },
  { id: 'grueso', valor: 4 },
];

/**
 * Envía un evento de teclado sintético al contenedor de Excalidraw —
 * Excalidraw no expone `undo()`/`redo()`/zoom como métodos públicos de su
 * API imperativa, pero sí responde a sus propios atajos de teclado
 * internamente; despachar el mismo evento que pulsaría un usuario pasa por
 * el mismo camino de código real, sin depender de una API no documentada.
 *
 * El listener de Excalidraw está en su propio `<div class="excalidraw">`
 * (con `tabIndex`), no en `document` ni en `window` — comprobado en vivo:
 * despachar en `document` no hacía nada (así estaba antes, con Deshacer
 * roto sin que ningún aviso lo delatara); despachar en el contenedor real
 * sí funciona. Sin caché del elemento: se busca en cada pulsación porque el
 * coste es insignificante frente a la claridad de no guardar una referencia
 * que podría quedar obsoleta si Excalidraw remonta su contenedor.
 */
function atajoTeclado(key: string, opts: { ctrl?: boolean; shift?: boolean } = {}) {
  const contenedor = document.querySelector<HTMLElement>(`.${styles.editorDibujoLienzo} .excalidraw`) ?? document;
  contenedor.dispatchEvent(new KeyboardEvent('keydown', {
    key, code: key === '=' ? 'Equal' : key === '-' ? 'Minus' : undefined,
    ctrlKey: !!opts.ctrl, metaKey: !!opts.ctrl, shiftKey: !!opts.shift, bubbles: true, cancelable: true,
  }));
}

/**
 * Editor de dibujo profesional (Fase 2.1) — motor Excalidraw (licencia MIT,
 * uso comercial libre, sin marca de agua — decisión tomada tras descubrir
 * que tldraw exige licencia comercial de pago en producción). La interfaz
 * nativa de Excalidraw se oculta por CSS (ver `.editorDibujoLienzo :global`
 * en styles.module.css); toda la interfaz visible es propia, con el Design
 * System de la aplicación, controlada vía la API imperativa de Excalidraw.
 */
export function EditorDibujo({ dibujo, clienteId, carpetaId, proyectoId, plan, esAdmin, clientes, onGuardar, onVolver }: EditorDibujoProps) {
  const tienePlanAvanzado = puedeUsar(plan, PRO_O_SUPERIOR, esAdmin);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const raizRef = useRef<HTMLDivElement | null>(null);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  // La barra de herramientas se puede cerrar del todo (no solo encoger)
  // para recuperar el máximo espacio de dibujo — se abre, se elige la
  // herramienta/color/grosor que haga falta, y se cierra; la herramienta
  // activa no cambia por ocultar la barra.
  const [herramientasAbiertas, setHerramientasAbiertas] = useState(true);
  // La barra lateral tiene `overflow-y: auto` (ver `.editorDibujoHerramientas`
  // en CSS) porque en pantallas bajas no caben las 11 herramientas + deshacer
  // + rehacer + grosor sin cortar nada — pero en táctil el scrollbar nativo
  // no se ve (a diferencia de un ratón), así que no hay ninguna pista de que
  // se puede bajar más: la Goma quedaba fuera de la vista y parecía no
  // existir (reportado por el usuario en tablet). Este aviso hace visible
  // que hay más herramientas por debajo.
  const toolbarRef = useRef<HTMLElement>(null);
  const [toolbarDesbordaAbajo, setToolbarDesbordaAbajo] = useState(false);
  const [nombre, setNombre] = useState(dibujo?.nombre ?? 'Dibujo sin título');
  const [herramienta, setHerramienta] = useState<HerramientaId>('freedraw');
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) { setToolbarDesbordaAbajo(false); return; }
    const actualizar = () => setToolbarDesbordaAbajo(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    actualizar();
    el.addEventListener('scroll', actualizar);
    const observer = new ResizeObserver(actualizar);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', actualizar);
      observer.disconnect();
    };
  }, [herramientasAbiertas, herramienta]);
  const [colorActivo, setColorActivo] = useState<string>(COLORES[0]);
  // "Extra fino" es el grosor por defecto (a petición explícita del
  // usuario) — se busca por id, no por índice, para que reordenar
  // `GROSORES` no cambie el valor inicial sin querer.
  const [grosorActivo, setGrosorActivo] = useState<number>(GROSORES.find((g) => g.id === 'muyFino')!.valor);
  const [idioma, setIdioma] = useState<Idioma>('es');
  const t = TEXTOS[idioma];
  const colorActivoRef = useRef(colorActivo);
  colorActivoRef.current = colorActivo;
  const grosorActivoRef = useRef(grosorActivo);
  grosorActivoRef.current = grosorActivo;
  const [paletaAbierta, setPaletaAbierta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [mostrarSelectorDestino, setMostrarSelectorDestino] = useState(false);

  // Sistema de cotas (Fase 2.3) — las cotas son entidades propias del
  // dibujo, no solo flechas con texto; viven junto a `elements`/`files`
  // dentro de `contenido`, ver cota-modelo.ts.
  const [cotas, setCotas] = useState<readonly Cota[]>(() => ((dibujo?.contenido as any)?.cotas as Cota[]) ?? []);
  const [escala, setEscala] = useState<EscalaDibujo>(() => ((dibujo?.contenido as any)?.escala as EscalaDibujo) ?? null);
  // Unidad en la que se muestran las medidas — libre de cambiar en cualquier
  // momento una vez calibrado, sin volver a calibrar (ver cota-modelo.ts).
  const [unidadVisualizacion, setUnidadVisualizacion] = useState<UnidadVisualizacion>(
    () => ((dibujo?.contenido as any)?.unidadVisualizacion as UnidadVisualizacion) ?? 'cm'
  );
  // Ancla común para cualquier panel flotante que deba colocarse "justo
  // debajo de la cabecera" (calibración, edición de longitud) — la
  // cabecera puede ocupar una o dos líneas según el ancho de pantalla (pasa
  // a varias líneas en móvil), así que un valor fijo de posición dejaba el
  // panel encima de la propia cabecera en pantallas estrechas. Se mide la
  // altura real cada vez que se abre un panel.
  const headerRef = useRef<HTMLElement | null>(null);
  const posicionBajoCabecera = () => (headerRef.current?.getBoundingClientRect().bottom ?? 52) + 8;

  const [calibracionAbierta, setCalibracionAbierta] = useState(false);
  const [calibracionTop, setCalibracionTop] = useState(60);
  const [calibracionCotaId, setCalibracionCotaId] = useState<string | null>(null);
  const [calibracionValor, setCalibracionValor] = useState('');
  const [calibracionUnidad, setCalibracionUnidad] = useState<UnidadVisualizacion>('cm');

  // Calibración por rectángulo (corrige la perspectiva de la foto) — a
  // petición explícita del usuario: una sola cota de referencia solo es
  // exacta en su propia orientación/profundidad; marcando las 4 esquinas
  // (ya distorsionadas por la perspectiva) de un rectángulo real conocido
  // se puede corregir esa distorsión para toda esa zona de la foto (ver
  // `calibrarPorRectangulo` en cota-modelo.ts).
  const [modoCalibracion, setModoCalibracion] = useState<'cota' | 'rectangulo'>('cota');
  const [esquinasRectangulo, setEsquinasRectangulo] = useState<PuntoEscena[]>([]);
  const esquinasRectanguloRef = useRef(esquinasRectangulo);
  esquinasRectanguloRef.current = esquinasRectangulo;
  const [anchoRectangulo, setAnchoRectangulo] = useState('');
  const [altoRectangulo, setAltoRectangulo] = useState('');
  const [unidadRectangulo, setUnidadRectangulo] = useState<UnidadVisualizacion>('cm');

  // Edición numérica de la longitud de una cota — se abre sola al terminar
  // de crearla arrastrando, o al seleccionarla con la herramienta
  // Seleccionar (ver `handleChangeEscena`). Sin calibrar, escribir un valor
  // aquí calibra el dibujo entero a partir de esta cota (mismo mecanismo
  // que el panel de calibración); ya calibrado, solo mueve el extremo de
  // esta cota para que mida exactamente lo escrito.
  const [cotaSeleccionadaId, setCotaSeleccionadaId] = useState<string | null>(null);
  const cotaSeleccionadaIdRef = useRef<string | null>(null);
  cotaSeleccionadaIdRef.current = cotaSeleccionadaId;
  const [edicionTop, setEdicionTop] = useState(60);
  const [edicionValor, setEdicionValor] = useState('');
  const [edicionUnidad, setEdicionUnidad] = useState<UnidadVisualizacion>('cm');
  const herramientaRef = useRef<HerramientaId>('freedraw');
  const [orientacionCota, setOrientacionCota] = useState<OrientacionCota>('alineada');
  const orientacionCotaRef = useRef(orientacionCota);
  orientacionCotaRef.current = orientacionCota;
  const cotasRef = useRef(cotas);
  cotasRef.current = cotas;
  const escalaRef = useRef(escala);
  escalaRef.current = escala;
  const unidadVisualizacionRef = useRef(unidadVisualizacion);
  unidadVisualizacionRef.current = unidadVisualizacion;
  herramientaRef.current = herramienta;
  // Solo cambia al empezar/terminar un arrastre (no en cada fotograma) — es
  // seguro como estado de React porque no dispara un re-render por cada
  // movimiento del cursor; la posición en vivo se gestiona toda por refs y
  // `requestAnimationFrame` dentro del efecto de más abajo, sin pasar por
  // el ciclo de renderizado de React.
  const [arrastrandoCota, setArrastrandoCota] = useState(false);
  // Mientras hay un arrastre de cota en curso, `handleChangeEscena` no debe
  // ejecutar `sincronizarCotas`: la flecha "en curso" ya tiene el
  // `customData.cotaId` definitivo antes de que `cotasRef` lo conozca (eso
  // solo ocurre tras el `setCotas` final y su re-render), así que
  // `sincronizarCotas` la vería como "cota desconocida" y la reconstruiría
  // por su cuenta, compitiendo con el propio bucle de arrastre.
  const arrastrandoCotaRef = useRef(false);

  // Ya se sabe dónde archivar el dibujo (viene de contexto o ya tenía
  // cliente propio) — sin eso, y sin una lista de clientes con la que
  // preguntar, se guarda igual como temporal (comportamiento de la Fase 2.1).
  const necesitaPreguntarDestino = !dibujo?.clienteId && !clienteId && !!clientes?.length;

  const handleApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    // Excalidraw invoca este callback antes de que su componente interno
    // termine de montarse — llamar a la API síncronamente aquí dispara un
    // "setState en componente no montado" y dentro del propio Excalidraw
    // la herramienta activa nunca cambia. Diferirlo al siguiente tick lo evita.
    setTimeout(() => {
      api.setActiveTool({ type: 'freedraw' });
      // Sin esto, Excalidraw dibuja con su propio grosor/color por defecto
      // hasta que el usuario toque el selector una vez — nuestra barra ya
      // muestra "Muy fino" como activo desde el principio, así que lo que
      // se dibuja debe coincidir desde el primer trazo, no solo visualmente.
      api.updateScene({ appState: { currentItemStrokeColor: colorActivoRef.current, currentItemStrokeWidth: grosorActivoRef.current } });
    }, 0);
  }, []);

  /** "Imagen" y "Cota" exigen PRO+ (Fase 2.5, 04/09/2026) — comprobado aquí, en el propio punto de entrada, no solo visualmente en el botón. */
  const HERRAMIENTAS_PRO: HerramientaId[] = ['image', 'cota'];
  const seleccionarHerramienta = (id: HerramientaId) => {
    if (HERRAMIENTAS_PRO.includes(id) && !tienePlanAvanzado) return;
    setHerramienta(id);
    setCotaSeleccionadaId(null);
    // "Cota" no es una herramienta de Excalidraw — mientras esté activa,
    // dejamos el motor en "selection" (inerte para nuestros fines) y
    // capturamos los clics nosotros mismos (ver el efecto más abajo). Así
    // ninguna herramienta nativa se ve afectada por Cota, ni al revés.
    apiRef.current?.setActiveTool({ type: id === 'cota' ? 'selection' : id });
  };

  const elegirColor = (c: string) => {
    setColorActivo(c);
    apiRef.current?.updateScene({ appState: { currentItemStrokeColor: c } });
    setPaletaAbierta(false);
  };

  const elegirGrosor = (g: number) => {
    setGrosorActivo(g);
    apiRef.current?.updateScene({ appState: { currentItemStrokeWidth: g } });
  };

  // Cambiar mm/cm/m no recalibra nada — solo reconstruye la etiqueta de
  // texto de cada cota ya dibujada (misma geometría, mismos ids).
  const cambiarUnidadVisualizacion = (u: UnidadVisualizacion) => {
    setUnidadVisualizacion(u);
    const api = apiRef.current;
    if (!api) return;
    const elementos = regenerarEtiquetasCotas(api.getSceneElements(), cotasRef.current, u);
    if (elementos !== api.getSceneElements()) api.updateScene({ elements: elementos });
  };

  // Calibra el dibujo a partir de una cota ya dibujada cuya medida real se
  // conoce — único mecanismo de calibración (ver cota-modelo.ts). Tras
  // calibrar, `handleChangeEscena` recalcula el resto de cotas solas (la
  // comparación `cambioEscala` de `sincronizarCotas` ya cubre ese caso).
  const confirmarCalibracion = (cotaReferenciaId: string, valorReal: number, unidadReal: UnidadVisualizacion) => {
    const cotaReferencia = cotasRef.current.find((c) => c.id === cotaReferenciaId);
    const api = apiRef.current;
    if (!cotaReferencia || !(valorReal > 0) || !api) return;
    const nuevaEscala = calibrarDesdeCota(cotaReferencia, valorReal, unidadReal);
    // La unidad elegida aquí pasa a ser la unidad por defecto de TODO el
    // dibujo (antes solo se aplicaba a esta calibración puntual y se
    // olvidaba en la siguiente selección de cota — fallo real reportado:
    // "pongo milímetros... no hay manera de cambiarlo, vuelve a cm").
    setUnidadVisualizacion(unidadReal);
    // `setEscala` por sí solo no recalcula nada: `sincronizarCotas` solo se
    // ejecuta en el `onChange` de Excalidraw, que no se dispara por un
    // cambio de estado de React. Se fuerza aquí mismo, una vez, reutilizando
    // la misma detección de "cambió la escala" que ya usa el arrastre de un
    // extremo — así las cotas ya dibujadas pasan de "u" a la medida real
    // en el mismo instante en que se calibra, no en el siguiente cambio.
    const resultado = sincronizarCotas(api.getSceneElements(), cotasRef.current, nuevaEscala, unidadReal);
    setCotas(resultado.cotas);
    // Cierra el panel de edición por cota de forma directa e inmediata
    // (`setCotaSeleccionadaId(null)`, un cambio de estado de React normal
    // que no depende de que Excalidraw dispare ningún evento). El primer
    // intento de arreglo forzaba además la deselección en el propio
    // `appState` de Excalidraw junto con el cambio de `elements` — se
    // retira: no hacía falta para cerrar el panel (eso ya lo resuelve
    // `setCotaSeleccionadaId`) y es sospechoso de estar detrás del nuevo
    // fallo reportado (la cota desaparece al reabrir su edición).
    if (resultado.elementos) api.updateScene({ elements: resultado.elementos });
    setEscala(nuevaEscala);
    setCalibracionAbierta(false);
    setCotaSeleccionadaId(null);
  };

  // Quita los marcadores temporales de la escena (sin dejarlos en el
  // historial de deshacer: no son parte del dibujo, solo una guía visual
  // mientras se calibra).
  const borrarMarcadoresRectangulo = () => {
    const api = apiRef.current;
    if (!api) return;
    const idsFuera = new Set<string>([...IDS_MARCADORES_CALIBRACION, ID_LINEA_CALIBRACION]);
    const elementos = api.getSceneElements();
    if (!elementos.some((e) => idsFuera.has(e.id))) return;
    api.updateScene({
      elements: elementos.filter((e) => !idsFuera.has(e.id)) as ExcalidrawElement[],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  };

  // Captura las 4 esquinas del rectángulo de referencia mientras el panel
  // de calibración está en modo "Rectángulo": cada toque en el lienzo
  // añade un punto (con su marcador visual) hasta llegar a 4. Igual que la
  // creación de una cota, se intercepta el `pointerdown` en fase de
  // captura para que Excalidraw no lo procese como una selección/arrastre
  // suyo mientras se marcan las esquinas.
  useEffect(() => {
    if (!calibracionAbierta || modoCalibracion !== 'rectangulo' || esquinasRectangulo.length >= 4) return;
    const contenedor = document.querySelector<HTMLElement>(`.${styles.editorDibujoLienzo}`);
    const canvas = contenedor?.querySelector<HTMLCanvasElement>('canvas.interactive');
    const api = apiRef.current;
    if (!canvas || !api) return;

    api.setActiveTool({ type: 'selection' });

    const manejarPulsar = (e: PointerEvent) => {
      e.preventDefault();
      // `stopImmediatePropagation`, no solo `stopPropagation`: hay otros
      // interceptores propios en este mismo `canvas` (crear cota, seleccionar
      // una cota cerca de un toque) que también escuchan `pointerdown` en
      // fase de captura — `stopPropagation` no les impide procesar el MISMO
      // evento, solo evita que suba a otros elementos. Sin esto, un toque
      // aquí podía disparar TAMBIÉN el otro interceptor (p. ej. seleccionar
      // una cota ya existente cerca del punto tocado), interfiriendo con la
      // captura de la esquina — reportado por el usuario: recalibrar con un
      // rectángulo dejaba de marcar los puntos.
      e.stopImmediatePropagation();
      const rect = canvas!.getBoundingClientRect();
      const appState = api.getAppState();
      const punto = viewportCoordsToSceneCoords(
        { clientX: e.clientX, clientY: e.clientY },
        { zoom: appState.zoom, offsetLeft: rect.left, offsetTop: rect.top, scrollX: appState.scrollX, scrollY: appState.scrollY }
      );
      const siguientes = [...esquinasRectanguloRef.current, punto];
      setEsquinasRectangulo(siguientes);
      const base = api.getSceneElements().filter((el) => ![...IDS_MARCADORES_CALIBRACION, ID_LINEA_CALIBRACION].includes(el.id));
      api.updateScene({
        elements: [...base, ...construirMarcadoresCalibracion(siguientes)] as ExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    };

    canvas.addEventListener('pointerdown', manejarPulsar, { capture: true });
    return () => canvas.removeEventListener('pointerdown', manejarPulsar, { capture: true });
  }, [calibracionAbierta, modoCalibracion, esquinasRectangulo.length]);

  // Calibra corrigiendo la perspectiva a partir de las 4 esquinas marcadas
  // (ver el efecto de captura más abajo) y el ancho/alto reales del
  // rectángulo — mismo patrón que `confirmarCalibracion` (fuerza
  // `sincronizarCotas` una vez, en el mismo instante).
  const confirmarCalibracionRectangulo = (anchoReal: number, altoReal: number, unidadReal: UnidadVisualizacion) => {
    const api = apiRef.current;
    if (esquinasRectanguloRef.current.length !== 4 || !(anchoReal > 0) || !(altoReal > 0) || !api) return;
    const [a, b, c, d] = esquinasRectanguloRef.current;
    const nuevaEscala = calibrarPorRectangulo(
      [a, b, c, d],
      convertirAMm(anchoReal, unidadReal),
      convertirAMm(altoReal, unidadReal)
    );
    setUnidadVisualizacion(unidadReal);
    borrarMarcadoresRectangulo();
    const resultado = sincronizarCotas(api.getSceneElements(), cotasRef.current, nuevaEscala, unidadReal);
    setCotas(resultado.cotas);
    if (resultado.elementos) api.updateScene({ elements: resultado.elementos });
    setEscala(nuevaEscala);
    setCalibracionAbierta(false);
    setEsquinasRectangulo([]);
    setAnchoRectangulo('');
    setAltoRectangulo('');
  };

  // Quita la calibración por completo y vuelve el dibujo a "sin calibrar" —
  // a petición explícita del usuario: no había forma de deshacer una
  // calibración ya hecha para empezar de cero con otra referencia distinta.
  // Mismo patrón que calibrar: fuerza `sincronizarCotas` una vez para que
  // las cotas ya dibujadas vuelvan a mostrarse en unidades internas ("u")
  // en el mismo instante, no en el siguiente cambio.
  const quitarCalibracion = () => {
    const api = apiRef.current;
    if (!api) return;
    const resultado = sincronizarCotas(api.getSceneElements(), cotasRef.current, null, unidadVisualizacionRef.current);
    setCotas(resultado.cotas);
    if (resultado.elementos) api.updateScene({ elements: resultado.elementos });
    setEscala(null);
    borrarMarcadoresRectangulo();
    setEsquinasRectangulo([]);
    setAnchoRectangulo('');
    setAltoRectangulo('');
    setCalibracionValor('');
  };

  // Confirma el número escrito a mano para la cota seleccionada. Sin
  // calibrar, escribir un valor exacto ES la calibración (misma acción que
  // el panel de la insignia, solo que más directa: se dispara sobre la
  // propia cota en vez de tener que abrir el panel aparte). Ya calibrado,
  // solo mueve el extremo de esta cota — el resto del dibujo no se toca.
  const confirmarEdicionLongitud = () => {
    const api = apiRef.current;
    const valor = Number(edicionValor);
    if (!api || !cotaSeleccionadaId || !(valor > 0)) return;
    if (!escalaRef.current) {
      confirmarCalibracion(cotaSeleccionadaId, valor, edicionUnidad);
      return;
    }
    const cota = cotasRef.current.find((c) => c.id === cotaSeleccionadaId);
    if (!cota) return;
    // Misma unidad elegida aquí = unidad por defecto de todo el dibujo a
    // partir de ahora (ver nota igual en `confirmarCalibracion`).
    setUnidadVisualizacion(edicionUnidad);
    const resultado = ajustarLongitudCotaEnEscena(
      api.getSceneElements(), cota, valor, edicionUnidad, escalaRef.current, edicionUnidad
    );
    setCotas((prev) => prev.map((c) => (c.id === cota.id ? resultado.cota : c)));
    // Cierra el panel de forma directa — mismo motivo que en `confirmarCalibracion`.
    // `IMMEDIATELY` por el mismo motivo que al crear la cota (ver más abajo):
    // sin esto, editar la medida exacta tampoco queda como su propio paso
    // de deshacer.
    api.updateScene({ elements: resultado.elementos, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setCotaSeleccionadaId(null);
  };

  // Borra la cota seleccionada desde su propio panel — a petición del
  // usuario: la goma borra por dónde pasa el arrastre, así que si la cota
  // está encima de una imagen es fácil que se lleve la imagen por delante
  // sin querer. Seleccionar la cota y pulsar aquí es explícito: solo borra
  // eso, nunca lo que tenga debajo.
  const borrarCotaSeleccionada = () => {
    const api = apiRef.current;
    const cota = cotasRef.current.find((c) => c.id === cotaSeleccionadaId);
    if (!api || !cota) return;
    const { grupoId, flechaId } = cota.elementos;
    const restantes = api.getSceneElements().filter((el) => {
      const enGrupo = el.groupIds?.includes(grupoId);
      // La medida ("226 u") es un texto ligado a la flecha vía `containerId`,
      // no comparte `groupIds` — hay que quitarlo aparte o queda huérfano.
      const esEtiquetaDeLaFlecha = (el as any).containerId === flechaId;
      return !enGrupo && !esEtiquetaDeLaFlecha;
    });
    setCotas((prev) => prev.filter((c) => c.id !== cota.id));
    api.updateScene({ elements: restantes as ExcalidrawElement[], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    setCotaSeleccionadaId(null);
  };

  // Umbral de enganche a puntos notables (píxeles de pantalla, independiente del zoom).
  const UMBRAL_SNAP_PX = 10;
  // Por debajo de esta longitud (unidades de escena) un arrastre se trata
  // como un toque accidental: no se crea ninguna cota.
  const LONGITUD_MINIMA_ARRASTRE = 3;

  // Arrastre de la herramienta Cota: pulsar (punto A) → arrastrar viendo la
  // cota definitiva recalculada en cada fotograma (línea, remates, flechas
  // y medida) → soltar (punto B) crea la cota. Se registra en fase de
  // "capture" y detiene la propagación a propósito: mientras Cota está
  // activa, el motor de Excalidraw está en "selection" y no debe procesar
  // estos mismos gestos como una selección/arrastre suyo.
  useEffect(() => {
    if (herramienta !== 'cota') return;
    // Misma prioridad explícita que el interceptor de "seleccionar cota" —
    // ver el comentario largo ahí sobre por qué no basta con el orden en
    // el código.
    if (calibracionAbierta && modoCalibracion === 'rectangulo' && esquinasRectangulo.length < 4) return;
    const contenedor = document.querySelector<HTMLElement>(`.${styles.editorDibujoLienzo}`);
    const canvas = contenedor?.querySelector<HTMLCanvasElement>('canvas.interactive');
    if (!canvas) return;

    let arrastrando = false;
    let puntoA: PuntoEscena | null = null;
    let elementosBase: ExcalidrawElement[] = [];
    let candidatosSnap: PuntoEscena[] = [];
    let cotaEnCurso: Cota | null = null;
    let ultimoPuntoRaw: PuntoEscena | null = null;
    let rafId: number | null = null;
    let resaltoId = generarId();

    const puntoDeEvento = (e: PointerEvent): PuntoEscena => {
      const rect = canvas!.getBoundingClientRect();
      const appState = apiRef.current!.getAppState();
      return viewportCoordsToSceneCoords(
        { clientX: e.clientX, clientY: e.clientY },
        { zoom: appState.zoom, offsetLeft: rect.left, offsetTop: rect.top, scrollX: appState.scrollX, scrollY: appState.scrollY }
      );
    };

    const estiloActivo = () => ({ strokeColor: colorActivoRef.current, strokeWidth: grosorActivoRef.current });

    // Recalcula la cota en curso para el punto que se tenga en `ultimoPuntoRaw`
    // y la pinta — como máximo una vez por fotograma, aunque `pointermove`
    // dispare más eventos que eso (ratones de alta frecuencia).
    const repintar = () => {
      rafId = null;
      const api = apiRef.current;
      if (!arrastrando || !puntoA || !ultimoPuntoRaw || !cotaEnCurso || !api) return;
      const appState = api.getAppState();
      const umbral = umbralSnapEscena(UMBRAL_SNAP_PX, appState.zoom.value);
      const { punto: destino, snapeado } = buscarSnap(ultimoPuntoRaw, candidatosSnap, umbral);
      const resultado = actualizarCotaEnCurso(cotaEnCurso, puntoA, destino, escalaRef.current, estiloActivo(), unidadVisualizacionRef.current);
      cotaEnCurso = resultado.cota;
      const resalto = snapeado ? construirResaltoSnap(destino, resaltoId, appState.zoom.value) : [];
      api.updateScene({
        elements: [...elementosBase, ...resultado.elementos, ...resalto] as ExcalidrawElement[],
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    };

    const manejarMove = (e: PointerEvent) => {
      if (!arrastrando) return;
      ultimoPuntoRaw = puntoDeEvento(e);
      if (rafId === null) rafId = requestAnimationFrame(repintar);
    };

    // Cierra el arrastre en curso, con o sin resultado. `eventoSuelta` es el
    // propio `pointerup` (para usar su posición exacta, sin esperar al
    // siguiente fotograma) o `null` si se cancela (Esc, cambio de
    // herramienta, desmontaje).
    const finalizar = (eventoSuelta: PointerEvent | null) => {
      if (!arrastrando) return;
      arrastrando = false;
      window.removeEventListener('pointermove', manejarMove);
      window.removeEventListener('pointerup', manejarSoltar);
      window.removeEventListener('keydown', manejarEsc);
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }

      const api = apiRef.current;
      const base = elementosBase;
      const origen = puntoA;
      const cotaActual = cotaEnCurso;
      puntoA = null;
      cotaEnCurso = null;
      setArrastrandoCota(false);

      const descartar = () => {
        api?.updateScene({ elements: base as ExcalidrawElement[], captureUpdate: CaptureUpdateAction.NEVER });
        arrastrandoCotaRef.current = false;
      };

      if (!api || !eventoSuelta || !origen || !cotaActual) { descartar(); return; }

      const appState = api.getAppState();
      const umbral = umbralSnapEscena(UMBRAL_SNAP_PX, appState.zoom.value);
      const { punto: destinoFinal } = buscarSnap(puntoDeEvento(eventoSuelta), candidatosSnap, umbral);
      const resultado = actualizarCotaEnCurso(cotaActual, origen, destinoFinal, escalaRef.current, estiloActivo(), unidadVisualizacionRef.current);

      if (resultado.cota.longitudInterna < LONGITUD_MINIMA_ARRASTRE) { descartar(); return; }

      setCotas((prev) => [...prev, resultado.cota]);
      // `IMMEDIATELY`: esta es la única llamada que debe quedar en el
      // historial de deshacer — todo el arrastre cuenta como una sola acción.
      // Sin especificarlo explícitamente, Excalidraw no la trataba como su
      // propio paso de deshacer (quedaba como `EVENTUALLY`, sin checkpoint
      // propio) — el botón "atrás" saltaba entonces al último paso que sí
      // estaba registrado, que era lo dibujado ANTES de la cota (p. ej. una
      // imagen recién insertada), dejando la cota intacta y borrando en su
      // lugar lo que había debajo.
      api.updateScene({ elements: [...base, ...resultado.elementos] as ExcalidrawElement[], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      arrastrandoCotaRef.current = false;

      // Recién soltada, se abre directamente su edición numérica — no hace
      // falta ir a seleccionarla aparte para poder escribir la medida exacta.
      setEdicionTop(posicionBajoCabecera());
      setEdicionValor(
        resultado.cota.longitudMm !== null
          ? String(Math.round(convertirDesdeMm(resultado.cota.longitudMm, unidadVisualizacionRef.current) * 100) / 100)
          : ''
      );
      setEdicionUnidad(unidadVisualizacionRef.current);
      setCotaSeleccionadaId(resultado.cota.id);
    };

    const manejarSoltar = (e: PointerEvent) => finalizar(e);
    const manejarEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') finalizar(null); };

    const manejarPulsar = (e: PointerEvent) => {
      const api = apiRef.current;
      if (!api || arrastrando) return;
      // `stopImmediatePropagation`: ver el mismo comentario en el
      // interceptor de calibración por rectángulo — hay varios interceptores
      // propios en este `canvas` y `stopPropagation` no basta para que se
      // ignoren entre sí.
      e.stopImmediatePropagation();
      e.preventDefault();

      puntoA = puntoDeEvento(e);
      elementosBase = api.getSceneElements() as ExcalidrawElement[];
      const puntosDeCotas = cotasRef.current.flatMap((c) => [c.puntoOrigen, c.puntoDestino]);
      candidatosSnap = puntosCandidatosSnap(elementosBase, puntosDeCotas);
      resaltoId = generarId();
      arrastrandoCotaRef.current = true;
      arrastrando = true;
      ultimoPuntoRaw = puntoA;
      setArrastrandoCota(true);

      const inicio = iniciarCotaEnCurso(puntoA, escalaRef.current, orientacionCotaRef.current, estiloActivo(), unidadVisualizacionRef.current);
      cotaEnCurso = inicio.cota;
      api.updateScene({ elements: [...elementosBase, ...inicio.elementos] as ExcalidrawElement[], captureUpdate: CaptureUpdateAction.NEVER });

      window.addEventListener('pointermove', manejarMove);
      window.addEventListener('pointerup', manejarSoltar);
      window.addEventListener('keydown', manejarEsc);
    };

    canvas.addEventListener('pointerdown', manejarPulsar, { capture: true });
    return () => {
      canvas.removeEventListener('pointerdown', manejarPulsar, { capture: true });
      finalizar(null);
    };
  }, [herramienta, calibracionAbierta, modoCalibracion, esquinasRectangulo.length]);

  // Con la herramienta Seleccionar activa, una cota dibujada encima de una
  // imagen es casi imposible de tocar: su línea es muy fina y cualquier
  // toque que no caiga justo en esos pocos píxeles selecciona la imagen de
  // debajo, que ocupa toda esa zona (reportado por el usuario — no podía
  // seleccionar la cota para borrarla sin antes quitar la imagen). Se
  // intercepta el `pointerdown` en fase de captura, igual que el arrastre de
  // creación de arriba: si el punto cae cerca de la línea de alguna cota
  // (margen generoso, pensado para el dedo, no para precisión de ratón), se
  // selecciona esa cota a propósito y se evita que Excalidraw procese el
  // toque — así la cota siempre gana sobre lo que tenga debajo.
  useEffect(() => {
    if (herramienta !== 'selection') return;
    // Se desactiva del todo (ni siquiera se engancha el listener) mientras
    // se están marcando las esquinas del rectángulo de calibración: el
    // orden real en que dos listeners de `pointerdown` en el mismo
    // `canvas` se disparan depende de CUÁNDO se enganchó cada uno, no del
    // orden en el código — si la herramienta Seleccionar ya estaba activa
    // antes de abrir la calibración, este listener llevaba más tiempo
    // enganchado y se disparaba ANTES que el de las esquinas, robándole el
    // toque si caía cerca de una cota ya existente (reportado por el
    // usuario: recalibrar con un rectángulo dejaba de marcar los puntos).
    // Bajar la prioridad aquí explícitamente, en vez de fiarse del orden de
    // enganche, es la única forma robusta de evitarlo.
    if (calibracionAbierta && modoCalibracion === 'rectangulo' && esquinasRectangulo.length < 4) return;
    const contenedor = document.querySelector<HTMLElement>(`.${styles.editorDibujoLienzo}`);
    const canvas = contenedor?.querySelector<HTMLCanvasElement>('canvas.interactive');
    if (!canvas) return;

    const UMBRAL_SELECCION_COTA_PX = 14;

    const distanciaASegmento = (p: PuntoEscena, a: PuntoEscena, b: PuntoEscena): number => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const largo2 = dx * dx + dy * dy;
      if (largo2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / largo2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };

    const manejarPulsar = (e: PointerEvent) => {
      const api = apiRef.current;
      if (!api || cotasRef.current.length === 0) return;
      const rect = canvas!.getBoundingClientRect();
      const appState = api.getAppState();
      const punto = viewportCoordsToSceneCoords(
        { clientX: e.clientX, clientY: e.clientY },
        { zoom: appState.zoom, offsetLeft: rect.left, offsetTop: rect.top, scrollX: appState.scrollX, scrollY: appState.scrollY }
      );
      const umbral = UMBRAL_SELECCION_COTA_PX / appState.zoom.value;

      let mejor: Cota | null = null;
      let mejorDistancia = umbral;
      for (const cota of cotasRef.current) {
        const d = distanciaASegmento(punto, cota.puntoOrigen, cota.puntoDestino);
        if (d <= mejorDistancia) { mejorDistancia = d; mejor = cota; }
      }
      if (!mejor) return;

      e.preventDefault();
      // `stopImmediatePropagation`: ver el mismo comentario en el
      // interceptor de calibración por rectángulo.
      e.stopImmediatePropagation();
      const { flechaId, extension1Id, extension2Id } = mejor.elementos;
      api.updateScene({
        appState: {
          selectedElementIds: { [flechaId]: true, [extension1Id]: true, [extension2Id]: true },
        },
      });
    };

    canvas.addEventListener('pointerdown', manejarPulsar, { capture: true });
    return () => canvas.removeEventListener('pointerdown', manejarPulsar, { capture: true });
  }, [herramienta, calibracionAbierta, modoCalibracion, esquinasRectangulo.length]);

  // Recalcula la longitud y reconstruye la geometría de una cota cuando el
  // usuario arrastra uno de sus extremos (o, en el futuro, cuando cambie la
  // escala del dibujo) — ver cota-modelo.ts. Se compara por referencia para
  // no disparar `setCotas`/`updateScene` en cada `onChange` sin necesidad.
  const handleChangeEscena = useCallback((elements: readonly ExcalidrawElement[], appState: AppState) => {
    // Mientras se arrastra una cota nueva, este `onChange` lo dispara el
    // propio bucle de previsualización (ver el efecto de arriba) — esa
    // cota todavía no está en `cotasRef`, así que `sincronizarCotas` la
    // trataría como "desconocida" y competiría con el arrastre.
    if (arrastrandoCotaRef.current) return;

    // La goma borra cualquier elemento que toque su arrastre, imágenes
    // incluidas — muy fácil llevarse por delante la imagen de referencia
    // al intentar borrar solo una línea/cota dibujada encima. Con la goma
    // activa, ninguna imagen debe desaparecer: si alguna quedó marcada
    // como borrada, se revive antes de seguir. Con otra herramienta (p.
    // ej. Seleccionar + Suprimir) sí se deja borrar con normalidad — el
    // gate es `herramienta === 'eraser'`, no "toda imagen borrada".
    if (herramientaRef.current === 'eraser') {
      const hayImagenBorrada = elements.some((el) => el.type === 'image' && el.isDeleted);
      if (hayImagenBorrada) {
        const restauradas = elements.map((el) => (el.type === 'image' && el.isDeleted ? { ...el, isDeleted: false } : el));
        apiRef.current?.updateScene({ elements: restauradas as ExcalidrawElement[], captureUpdate: CaptureUpdateAction.NEVER });
        return;
      }
    }

    const resultado = sincronizarCotas(elements, cotasRef.current, escalaRef.current, unidadVisualizacionRef.current);
    if (resultado.cotas !== cotasRef.current) setCotas(resultado.cotas);
    if (resultado.elementos) apiRef.current?.updateScene({ elements: resultado.elementos });

    // Con la herramienta Seleccionar activa, si hay exactamente una cota
    // seleccionada se abre (o mantiene) su panel de edición de longitud;
    // si se deselecciona o se selecciona otra cosa, se cierra solo.
    if (herramientaRef.current === 'selection') {
      const cotasVigentes = resultado.cotas !== cotasRef.current ? resultado.cotas : cotasRef.current;
      // Una cota es un grupo de Excalidraw (flecha + 2 remates): seleccionar
      // uno de sus elementos selecciona el grupo entero, así que
      // `selectedElementIds` trae 3 ids, no 1 — se busca la flecha entre
      // ellos, no se exige que sea el único id seleccionado.
      const idsSeleccionados = Object.keys(appState.selectedElementIds).filter((id) => appState.selectedElementIds[id]);
      const cotasCoincidentes = cotasVigentes.filter((c) => idsSeleccionados.includes(c.elementos.flechaId));
      const cotaCoincidente = cotasCoincidentes.length === 1 ? cotasCoincidentes[0] : undefined;
      if (cotaCoincidente) {
        if (cotaSeleccionadaIdRef.current !== cotaCoincidente.id) {
          setEdicionTop(posicionBajoCabecera());
          setEdicionValor(
            cotaCoincidente.longitudMm !== null
              ? String(Math.round(convertirDesdeMm(cotaCoincidente.longitudMm, unidadVisualizacionRef.current) * 100) / 100)
              : ''
          );
          setEdicionUnidad(unidadVisualizacionRef.current);
          setCotaSeleccionadaId(cotaCoincidente.id);
        }
      } else if (cotaSeleccionadaIdRef.current !== null) {
        setCotaSeleccionadaId(null);
      }
    }
    // Fuera de la herramienta Seleccionar no se toca `cotaSeleccionadaId`
    // aquí: si viene de crear una cota arrastrando (herramienta "cota"),
    // `onChange` se dispara constantemente y cerraría el panel casi al
    // instante si se limpiara aquí también — el cierre al cambiar de
    // herramienta ya lo hace `seleccionarHerramienta` explícitamente.
  }, []);

  const ejecutarGuardado = useCallback(async (destino?: DestinoDibujo) => {
    const api = apiRef.current;
    if (!api) return;
    setGuardando(true);
    try {
      const elements = api.getSceneElements();
      const appState = api.getAppState();

      // La miniatura es un plus para la galería — si falla (p. ej. lienzo
      // vacío) se guarda igualmente el dibujo, nunca bloquea el guardado.
      let miniatura = dibujo?.miniatura ?? '';
      try {
        if (elements.length > 0) {
          const blob = await exportToBlob({
            elements, appState, files: api.getFiles(),
            mimeType: 'image/png', getDimensions: () => ({ width: 320, height: 240 }),
          });
          miniatura = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      } catch { /* miniatura opcional */ }

      const aGuardar: Dibujo = {
        id: dibujo?.id ?? generarId(),
        clienteId: destino?.proyectoId ?? dibujo?.clienteId ?? clienteId ?? '',
        carpetaId: destino?.carpetaId ?? dibujo?.carpetaId ?? carpetaId ?? '',
        // Fase 1 (04/09/2026): mismo criterio de fallback que `clienteId` de
        // arriba — antes esta línea solo conservaba el valor de un dibujo YA
        // existente (`dibujo?.proyectoId`), nunca lo rellenaba al crear uno
        // nuevo, así que el campo quedaba reservado pero siempre vacío.
        proyectoId: destino?.proyectoId ?? dibujo?.proyectoId ?? proyectoId ?? '',
        nombre: nombre.trim() || 'Dibujo sin título',
        miniatura,
        contenido: {
          elements, files: api.getFiles(), cotas: cotasRef.current,
          escala: escalaRef.current, unidadVisualizacion: unidadVisualizacionRef.current,
        } as unknown as Record<string, unknown>,
        version: dibujo?.version ?? 1,
        etiquetas: dibujo?.etiquetas ?? [],
        creadoEn: dibujo?.creadoEn ?? new Date().toISOString(),
        actualizadoEn: new Date().toISOString(),
      };
      await onGuardar(aGuardar);
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2500);
    } finally {
      setGuardando(false);
    }
  }, [dibujo, clienteId, carpetaId, proyectoId, nombre, onGuardar]);

  const handleGuardarClick = useCallback(() => {
    if (necesitaPreguntarDestino) setMostrarSelectorDestino(true);
    else ejecutarGuardado();
  }, [necesitaPreguntarDestino, ejecutarGuardado]);

  // Ctrl+S / Cmd+S para guardar sin soltar el lápiz.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleGuardarClick(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleGuardarClick]);

  // Pantalla completa del editor — más espacio real para dibujar en
  // pantallas pequeñas. Se sincroniza con el evento nativo (no solo con el
  // propio botón) porque el usuario también puede salir con Esc o con el
  // control del propio navegador/SO, y el icono del botón debe reflejarlo.
  useEffect(() => {
    const h = () => setPantallaCompleta(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const alternarPantallaCompleta = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      raizRef.current?.requestFullscreen();
    }
  }, []);

  const contenidoInicial = dibujo?.contenido && Object.keys(dibujo.contenido).length > 0
    ? {
        elements: (dibujo.contenido as any).elements ?? [],
        files: (dibujo.contenido as any).files ?? {},
      }
    : undefined;

  // Portal al contenedor raíz `.app` (no a `document.body`): el editor es
  // una pantalla completa que debe ganar a cualquier otra cosa flotante de
  // la app (p. ej. el botón de menú móvil), pero `.contenidoPrincipal`
  // establece su propio contexto de apilamiento CSS más arriba en el
  // árbol — dentro de él, ningún z-index, por alto que sea, compite de
  // verdad contra elementos de fuera. Sacarlo de ahí con un portal evita
  // pelearse con z-index ajenos. Tiene que ser dentro de `.app` y no
  // `document.body`: las variables de diseño (`--fondo`, `--blanco`...) se
  // definen ahí, no en `:root` — fuera de `.app` se pierden todas.
  const raizApp = document.querySelector(`.${styles.app}`) ?? document.body;
  return createPortal(
    <div className={styles.editorDibujo} ref={raizRef}>
      <header ref={headerRef} className={styles.editorDibujoCabecera}>
        <button className={styles.btnIcono} onClick={onVolver} aria-label={t.volver}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <input
          className={styles.editorDibujoNombre}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={t.nombrePlaceholder}
        />
        <div className={styles.editorDibujoIdiomas} title={t.idiomaTitulo}>
          {IDIOMAS.map((i) => (
            <button
              key={i.id}
              aria-label={i.label}
              className={`${styles.editorDibujoIdiomaBtn} ${idioma === i.id ? styles.editorDibujoIdiomaBtnActivo : ''}`}
              onClick={() => setIdioma(i.id)}
            >
              {i.bandera}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className={styles.editorDibujoEscalaBadge}
            title={t.escalaTitulo}
            onClick={() => {
              setCalibracionTop(posicionBajoCabecera());
              setCalibracionAbierta((v) => {
                const siguiente = !v;
                if (!siguiente) { borrarMarcadoresRectangulo(); setEsquinasRectangulo([]); }
                return siguiente;
              });
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></svg>
            {t.escalaLabel} {escala ? (escala.tipo === 'lineal' ? t.escalaFormato(escala.factorMm) : t.escalaFormatoPerspectiva(escala.anchoMm, escala.altoMm)) : t.escalaSinCalibrar}
          </button>
          {calibracionAbierta && (
            <div className={styles.editorDibujoCalibracionPanel} style={{ top: calibracionTop }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className={`${styles.btn} ${modoCalibracion === 'cota' ? styles.btnPrimario : ''}`}
                  style={{ flex: 1, fontSize: 11, padding: '0.3rem 0.4rem' }}
                  onClick={() => { setModoCalibracion('cota'); borrarMarcadoresRectangulo(); setEsquinasRectangulo([]); }}
                >
                  {t.calibrarModoCota}
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${modoCalibracion === 'rectangulo' ? styles.btnPrimario : ''}`}
                  style={{ flex: 1, fontSize: 11, padding: '0.3rem 0.4rem' }}
                  onClick={() => setModoCalibracion('rectangulo')}
                >
                  {t.calibrarModoRectangulo}
                </button>
              </div>
              {escala && (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPeligro}`}
                  onClick={quitarCalibracion}
                >
                  {t.calibrarQuitar}
                </button>
              )}
              {modoCalibracion === 'cota' ? (
                cotas.length === 0 ? (
                  <span style={{ fontSize: 12 }}>{t.calibrarSinCotas}</span>
                ) : (
                  <>
                    <label style={{ fontSize: 12 }}>{t.calibrarCotaLabel}</label>
                    <select
                      className={styles.select}
                      value={calibracionCotaId ?? cotas[cotas.length - 1].id}
                      onChange={(e) => setCalibracionCotaId(e.target.value)}
                    >
                      {cotas.map((c, i) => (
                        <option key={c.id} value={c.id}>{t.calibrarEtiquetaCota(i + 1, Math.round(c.longitudInterna))}</option>
                      ))}
                    </select>
                    <label style={{ fontSize: 12 }}>{t.calibrarValorLabel}</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="number" min="0" step="any"
                        className={styles.select} style={{ flex: 1 }}
                        value={calibracionValor}
                        onChange={(e) => setCalibracionValor(e.target.value)}
                      />
                      <select
                        className={styles.select} style={{ width: 66 }}
                        value={calibracionUnidad}
                        onChange={(e) => setCalibracionUnidad(e.target.value as UnidadVisualizacion)}
                      >
                        <option value="mm">mm</option>
                        <option value="cm">cm</option>
                        <option value="m">m</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPrimario}`}
                      disabled={!(Number(calibracionValor) > 0)}
                      onClick={() => confirmarCalibracion(calibracionCotaId ?? cotas[cotas.length - 1].id, Number(calibracionValor), calibracionUnidad)}
                    >
                      {t.calibrarBoton}
                    </button>
                  </>
                )
              ) : esquinasRectangulo.length < 4 ? (
                <>
                  <span style={{ fontSize: 12 }}>{t.calibrarRectanguloInstruccion(esquinasRectangulo.length + 1)}</span>
                  {esquinasRectangulo.length > 0 && (
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPeligro}`}
                      onClick={() => { setEsquinasRectangulo([]); borrarMarcadoresRectangulo(); }}
                    >
                      {t.calibrarRectanguloReiniciar}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <label style={{ fontSize: 12 }}>{t.calibrarRectanguloAncho}</label>
                  <input
                    type="number" min="0" step="any"
                    className={styles.select}
                    value={anchoRectangulo}
                    onChange={(e) => setAnchoRectangulo(e.target.value)}
                  />
                  <label style={{ fontSize: 12 }}>{t.calibrarRectanguloAlto}</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="number" min="0" step="any"
                      className={styles.select} style={{ flex: 1 }}
                      value={altoRectangulo}
                      onChange={(e) => setAltoRectangulo(e.target.value)}
                    />
                    <select
                      className={styles.select} style={{ width: 66 }}
                      value={unidadRectangulo}
                      onChange={(e) => setUnidadRectangulo(e.target.value as UnidadVisualizacion)}
                    >
                      <option value="mm">mm</option>
                      <option value="cm">cm</option>
                      <option value="m">m</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPrimario}`}
                      style={{ flex: 1 }}
                      disabled={!(Number(anchoRectangulo) > 0 && Number(altoRectangulo) > 0)}
                      onClick={() => confirmarCalibracionRectangulo(Number(anchoRectangulo), Number(altoRectangulo), unidadRectangulo)}
                    >
                      {t.calibrarBoton}
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPeligro}`}
                      onClick={() => { setEsquinasRectangulo([]); borrarMarcadoresRectangulo(); }}
                    >
                      {t.calibrarRectanguloReiniciar}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <select
          className={styles.select} style={{ width: 68 }}
          title={escala ? t.unidadVisualizacionTitulo : t.unidadVisualizacionBloqueada}
          disabled={!escala}
          value={unidadVisualizacion}
          onChange={(e) => cambiarUnidadVisualizacion(e.target.value as UnidadVisualizacion)}
        >
          <option value="mm">mm</option>
          <option value="cm">cm</option>
          <option value="m">m</option>
        </select>
        {cotaSeleccionadaId && (
          <div className={styles.editorDibujoCalibracionPanel} style={{ top: edicionTop }}>
            <label style={{ fontSize: 12 }}>{escala ? t.edicionLongitudLabel : t.edicionLongitudLabelSinCalibrar}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="number" min="0" step="any" autoFocus
                className={styles.select} style={{ flex: 1 }}
                value={edicionValor}
                onChange={(e) => setEdicionValor(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmarEdicionLongitud(); }}
              />
              <select
                className={styles.select} style={{ width: 66 }}
                value={edicionUnidad}
                onChange={(e) => setEdicionUnidad(e.target.value as UnidadVisualizacion)}
              >
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="m">m</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimario}`}
                style={{ flex: 1 }}
                disabled={!(Number(edicionValor) > 0)}
                onClick={confirmarEdicionLongitud}
              >
                {t.edicionLongitudBoton}
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPeligro}`}
                title={t.borrarCota}
                aria-label={t.borrarCota}
                onClick={borrarCotaSeleccionada}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
              </button>
            </div>
          </div>
        )}
        {herramienta === 'cota' && (
          <span className={styles.editorDibujoGuardadoOk} style={{ color: 'var(--topo)' }}>
            {arrastrandoCota ? t.cotaArrastrando : t.cotaInstruccion}
          </span>
        )}
        {guardadoOk && (
          <span className={styles.editorDibujoGuardadoOk}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            {t.guardado}
          </span>
        )}
        <button
          type="button"
          className={styles.btnIcono}
          onClick={alternarPantallaCompleta}
          aria-label={pantallaCompleta ? t.salirPantallaCompleta : t.pantallaCompleta}
          title={pantallaCompleta ? t.salirPantallaCompleta : t.pantallaCompleta}
        >
          {pantallaCompleta ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
          )}
        </button>
        <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={handleGuardarClick} disabled={guardando}>
          {guardando ? t.guardando : t.guardar}
        </button>
      </header>

      <div className={styles.editorDibujoCuerpo}>
        {herramientasAbiertas && (
        <aside className={styles.editorDibujoHerramientas} ref={toolbarRef}>
          {HERRAMIENTAS.map((h) => (
            <Fragment key={h.id}>
              {/* "Imagen" abre el selector de archivos nativo en el
                  siguiente toque del lienzo, no al pulsar el botón — un
                  roce accidental con este botón mientras se busca la Goma o
                  la Cota (justo debajo) pasa desapercibido hasta que ese
                  siguiente toque, pensado para medir, abre el selector de
                  golpe (en Android, a pantalla completa — reportado por el
                  usuario como "se cierra todo y se abre un drive"). Este
                  hueco de más no evita el roce, pero lo hace menos probable
                  al separar Imagen del resto de herramientas de medición. */}
              {h.id === 'image' && <span className={styles.editorDibujoDivisor} />}
              <button
                title={HERRAMIENTAS_PRO.includes(h.id) && !tienePlanAvanzado ? `${t.herramientas[h.id]} — requiere el plan PRO o superior` : t.herramientas[h.id]}
                className={`${styles.editorDibujoHerramientaBtn} ${herramienta === h.id ? styles.editorDibujoHerramientaBtnActivo : ''}`}
                onClick={() => seleccionarHerramienta(h.id)}
                disabled={HERRAMIENTAS_PRO.includes(h.id) && !tienePlanAvanzado}
                style={HERRAMIENTAS_PRO.includes(h.id) && !tienePlanAvanzado ? { opacity: 0.4, cursor: 'not-allowed', position: 'relative' } : { position: 'relative' }}
              >
                {h.icono}
                {HERRAMIENTAS_PRO.includes(h.id) && !tienePlanAvanzado && (
                  <span style={{ position: 'absolute', top: -2, right: -2, fontSize: '0.55rem', lineHeight: 1 }} aria-hidden="true">🔒</span>
                )}
              </button>
              {h.id === 'image' && <span className={styles.editorDibujoDivisor} />}
            </Fragment>
          ))}

          {herramienta === 'cota' && (
            <div className={styles.editorDibujoOrientacionCota}>
              {ORIENTACIONES_COTA.map((o) => (
                <button
                  key={o.id}
                  title={t.orientaciones[o.id]}
                  className={`${styles.editorDibujoHerramientaBtn} ${orientacionCota === o.id ? styles.editorDibujoHerramientaBtnActivo : ''}`}
                  style={{ width: 28, height: 28 }}
                  onClick={() => setOrientacionCota(o.id)}
                >
                  {o.icono}
                </button>
              ))}
            </div>
          )}

          <span className={styles.editorDibujoDivisor} />

          <button title={t.deshacer} className={styles.editorDibujoHerramientaBtn} onClick={() => atajoTeclado('z', { ctrl: true })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
          </button>
          <button title={t.rehacer} className={styles.editorDibujoHerramientaBtn} onClick={() => atajoTeclado('z', { ctrl: true, shift: true })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
          </button>

          <span className={styles.editorDibujoDivisor} />

          <button title={t.acercar} className={styles.editorDibujoHerramientaBtn} onClick={() => atajoTeclado('=', { ctrl: true })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
          </button>
          <button title={t.alejar} className={styles.editorDibujoHerramientaBtn} onClick={() => atajoTeclado('-', { ctrl: true })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
          </button>
          <button title={t.ajustarPantalla} className={styles.editorDibujoHerramientaBtn} onClick={() => atajoTeclado('1', { shift: true })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
          </button>

          <span className={styles.editorDibujoDivisor} />

          <div style={{ position: 'relative' }}>
            <button
              title={t.color}
              onClick={() => setPaletaAbierta((v) => !v)}
              className={styles.editorDibujoColorBtn}
              style={{ background: colorActivo }}
            />
            {paletaAbierta && (
              <div className={styles.editorDibujoPaleta}>
                {COLORES.map((c) => (
                  <button
                    key={c}
                    onClick={() => elegirColor(c)}
                    title={c}
                    className={styles.editorDibujoPaletaSwatch}
                    style={{ background: c, outline: colorActivo === c ? '2px solid var(--topo)' : 'none' }}
                  />
                ))}
              </div>
            )}
          </div>

          <select
            className={styles.select}
            style={{ width: 120 }}
            value={grosorActivo}
            onChange={(e) => elegirGrosor(Number(e.target.value))}
          >
            {GROSORES.map((g) => <option key={g.id} value={g.valor}>{t.grosores[g.id]}</option>)}
          </select>
          {toolbarDesbordaAbajo && <span className={styles.editorDibujoScrollAviso} aria-hidden="true" />}
        </aside>
        )}

        <div className={styles.editorDibujoLienzo}>
          <button
            type="button"
            className={styles.editorDibujoToggleHerramientas}
            onClick={() => setHerramientasAbiertas((v) => !v)}
            aria-label={herramientasAbiertas ? t.ocultarHerramientas : t.mostrarHerramientas}
            title={herramientasAbiertas ? t.ocultarHerramientas : t.mostrarHerramientas}
          >
            {herramientasAbiertas ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            )}
          </button>
          <Excalidraw
            excalidrawAPI={handleApi}
            initialData={contenidoInicial}
            onChange={handleChangeEscena}
            langCode={EXCALIDRAW_LANG_CODE[idioma]}
            UIOptions={{
              canvasActions: {
                changeViewBackgroundColor: false,
                clearCanvas: false,
                loadScene: false,
                saveToActiveFile: false,
                saveAsImage: false,
                toggleTheme: false,
                export: false,
              },
            }}
          />
        </div>
      </div>

      {mostrarSelectorDestino && clientes && (
        <SelectorDestinoGuardado
          clientes={clientes}
          onCancelar={() => setMostrarSelectorDestino(false)}
          onConfirmar={(destino) => { setMostrarSelectorDestino(false); ejecutarGuardado(destino); }}
        />
      )}
    </div>,
    raizApp
  );
}
