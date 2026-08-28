import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { ComponentType, CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import * as ReactMoveable from 'react-moveable';
import type { OnDrag, OnDragGroup, OnResize } from 'react-moveable';

// Bajo la resolución de módulos estricta de `bit build` (a diferencia de
// `bit compile`, más permisivo), TypeScript infiere el import por defecto
// de `react-moveable` como el namespace completo del módulo en vez de
// como la clase — un desajuste de interop CJS/ESM real de esta librería
// bajo Node16/NodeNext, no un error de nuestro código (encontrado durante
// la verificación de este incremento). Se corrige con una aserción de tipo
// explícita en este único punto; las props del componente siguen
// comprobándose porque cada manejador (`onDrag`, `onResize`...) ya está
// tipado explícitamente contra los tipos reales importados abajo.
const Moveable = ReactMoveable.default as unknown as ComponentType<Record<string, unknown>>;
import type { Empresa } from './use-empresa.js';
import type { DocumentoMC, ElementoMC, PaginaMC, TemaMC, RecursoMC, ComponenteMC, ZonaMC, FondoMC } from './documento-modelo.js';
import { PAGINA_A4, TEMA_POR_DEFECTO } from './documento-modelo.js';
import { generarId } from './mock.js';
import {
  crearElementoBase, anadirElemento, eliminarElementos, moverElementos, redimensionarElemento, rotarElemento,
  establecerOpacidad, establecerVisibilidad, establecerSoloLectura, establecerObligatorio,
  actualizarContenido, actualizarEstilo, actualizarPropiedadesEspecificas, duplicarElementos,
  agruparElementos, desagruparElementos, establecerBloqueo, cambiarCapa, alinear, distribuir,
  anadirPagina, eliminarPagina, duplicarPagina, moverPagina, establecerFondoPagina, localizarElemento,
  crearEstiloNombrado, eliminarEstiloNombrado, renombrarEstiloNombrado, aplicarEstiloNombrado,
  establecerTema, sincronizarEstiloConNombrado,
  crearElementoInstanciaComponente, desvincularInstancia,
} from './documento-comandos.js';
import { obtenerTipoRender, listarTiposRenderInsertables, elementoObligatorioIncompleto } from './documento-registro-tipos-render.js';
import { resolverZonaEfectiva, elementoVisibleEn, resolverElementoPresentacion } from './documento-render-compartido.js';
import './documento-tipos-iniciales-render.js'; // registro de render por efecto secundario — ver ese archivo.
import './documento-tipos-avanzados-render.js'; // Tabla/Firma/Código QR/Dibujo/Bloque IA (Incremento 7) — mismo patrón.
import './documento-variables-iniciales.js'; // registro de variables inteligentes por efecto secundario (Incremento 4).
import { leerArchivoComoBase64 } from './archivos.js';
import * as api from './api.js';
import { useAutoguardado } from './use-autoguardado.js';
import { esDobleToque, fueArrastre, type PuntoToque } from './deteccion-doble-toque.js';
import { PanelIaPresupuesto } from './panel-ia-presupuesto.js';
import { extraerContextoDocumento } from './documento-contexto-ia.js';
import { TutorialOverlay } from './TutorialOverlay.js';
import { useTutorial } from './use-tutorial.js';
import { TUTORIAL_EDITOR } from './tutorial-definiciones.js';
import editorStyles from './editor-documento.module.css';
import styles from './styles.module.css';

/**
 * Forma mínima que necesita el editor de cualquier "contenedor" de negocio
 * que envuelva un `DocumentoMC` — Presupuesto, Contrato (Incremento 12) o
 * cualquier tipo futuro. Deliberadamente estructural y no importa
 * `PresupuestoMC`: el editor no debe saber qué es un presupuesto (Regla
 * de Oro 4/5) — solo pedirle a su contenedor estos campos. `PresupuestoMC`
 * y `ContratoMC` cumplen esta forma sin necesidad de heredar de ella.
 */
export type DocumentoContenedorMC = {
  id: string;
  titulo: string;
  contenidoDocumento: Record<string, unknown>;
  creado: string;
  actualizado: string;
};

export type EditorDocumentoProps = {
  contenedor: DocumentoContenedorMC;
  clienteId: string;
  clienteNombre: string;
  empresa: Empresa;
  /**
   * Valor que resuelve el tipo "Precio destacado" en modo "vinculado" —
   * solo lo usan los contenedores que tienen un precio propio (Presupuesto).
   * `undefined` para tipos de documento sin ese concepto (ej. Contrato):
   * el elemento sigue siendo insertable, simplemente no tiene nada a lo
   * que vincularse todavía.
   */
  precioVinculado?: number;
  /**
   * Firma real del cliente (y fecha de aceptación) para el tipo "firma
   * cliente" del elemento — solo tiene valor si se reabre un presupuesto
   * YA aceptado (`abrir-documento.tsx`); mientras se edita antes de
   * enviarlo, el elemento se ve vacío, como es de esperar.
   */
  firmaClienteUrl?: string;
  firmaClienteFecha?: string;
  /**
   * `contenedor` es en realidad una `PlantillaMC` que se está editando
   * directamente (abierta desde `PlantillasVista`), no un presupuesto. Sin
   * esto, "Guardar como plantilla" no tenía forma de saberlo y creaba
   * SIEMPRE una plantilla nueva con un id al azar — nunca actualizaba la
   * que el usuario tenía delante, así que los cambios "desaparecían" al
   * volver a abrirla (bug real, reportado 25/08/2026).
   */
  esPlantilla?: boolean;
  onGuardar: (c: DocumentoContenedorMC) => Promise<void>;
  onVolver: () => void;
  onCambiarLogoEmpresa?: (logo: string) => void;
  /**
   * Lista de clientes para poder reasignar este presupuesto a otro —
   * junto con `onCambiarCliente`, ambos opcionales: solo los proporciona
   * `AbrirDocumento` para presupuestos reales, nunca para Contratos ni
   * Plantillas. Antes solo se podía elegir el cliente al CREAR el
   * presupuesto — no había forma de cambiarlo después sin borrar y volver
   * a empezar (pedido real, 25/08/2026).
   */
  clientesDisponibles?: { id: string; nombre: string }[];
  onCambiarCliente?: (nuevoClienteId: string) => Promise<void>;
};

type PreviewMover = { ids: string[]; deltaX: number; deltaY: number };
type PreviewResize = { id: string; tamano: { ancho: number; alto: number }; posicion: { x: number; y: number } };

/**
 * Analiza el valor de un `<input type="number">` del panel de propiedades
 * — `null` mientras el campo está vacío o no es (todavía) un número
 * válido, en vez de sustituirlo por un valor por defecto fijo. Antes, un
 * `Number(e.target.value) || 1` hacía que en cuanto el campo pasaba por
 * vacío (ej. al seleccionar todo el texto para escribir uno nuevo) el
 * valor se "enganchaba" en 1 y no dejaba escribir el número deseado — el
 * fallo real reportado por el usuario ("el ancho se queda siempre en 1").
 * Con `null` el comando simplemente no se ejecuta todavía, y el campo
 * sigue mostrando lo que el usuario está escribiendo sin que React lo pise.
 */
function numeroValido(valorTexto: string, minimo = -Infinity): number | null {
  if (valorTexto.trim() === '') return null;
  const n = Number(valorTexto);
  return Number.isFinite(n) && n >= minimo ? n : null;
}

function documentoVacio(): DocumentoMC {
  const primeraPaginaId = generarId();
  return {
    id: generarId(),
    schemaVersion: 1,
    documentoBaseId: null,
    etiquetaVersion: null,
    documentVersion: 1,
    plantillaOrigen: null,
    paginas: [{
      id: primeraPaginaId, indice: 0, nombre: '', configuracion: null, fondo: null,
      encabezado: null, pie: null, numeracion: { mostrar: false, formato: 'Página {n} de {total}', posicion: 'centro' }, elementos: [],
    }],
    configuracionPorDefecto: { ancho: PAGINA_A4.ancho, alto: PAGINA_A4.alto, orientacion: 'vertical', margenes: { arriba: 40, abajo: 40, izquierda: 40, derecha: 40 } },
    fondoPorDefecto: { tipo: 'ninguno' },
    encabezadoPorDefecto: null,
    piePorDefecto: null,
    variables: { claves: {} },
    configuracionImpresion: { sangrado: 0, escala: 1 },
    tema: null,
    estilosGuardados: [],
  };
}

/**
 * Editor visual del Motor Documental (Incremento 2 — motor de edición
 * básico, sección 7 de ARQUITECTURA-MOTOR-DOCUMENTAL.md). Render DOM real
 * (no canvas) sobre `DocumentoMC`, con `react-moveable` para mover/redimensionar/rotar
 * y todas las mutaciones pasando por `documento-comandos.ts` (Regla de Oro 3).
 *
 * Simplificación consciente de este incremento: mover en grupo (varios
 * elementos a la vez) está soportado; redimensionar/rotar un grupo como
 * una sola unidad alrededor de su centro (sección 7.3) queda para un
 * incremento posterior — con la selección actual, redimensionar/rotar
 * solo actúa cuando hay un único elemento seleccionado.
 */
export function EditorDocumento({ contenedor, clienteId, clienteNombre, empresa, precioVinculado, firmaClienteUrl, firmaClienteFecha, esPlantilla, onGuardar, onVolver, onCambiarLogoEmpresa, clientesDisponibles, onCambiarCliente }: EditorDocumentoProps) {
  const documentoInicial = useMemo<DocumentoMC>(() => {
    const contenido = contenedor.contenidoDocumento as unknown as DocumentoMC;
    return contenido && contenido.paginas && contenido.paginas.length > 0 ? contenido : documentoVacio();
  }, [contenedor.contenidoDocumento]);

  // Prefijo genérico (no por usuario): tutorial corto y siempre repetible
  // sobre la barra de herramientas, no un progreso personal que valga la
  // pena aislar por cuenta — evita tener que enhebrar `storagePrefix` desde
  // `use-auth.ts` a través de los tres sitios que montan `EditorDocumento`
  // (`plantillas-vista.tsx`, `contratos-vista.tsx`, `abrir-documento.tsx`).
  const tutorialEditor = useTutorial('mc_');

  /**
   * Bug real, 26/08/2026: el Asistente IA general (montado siempre en la
   * raíz de la app, fuera del árbol de este editor) tapaba el botón
   * "Enviar" del panel de IA del presupuesto — ver `asistente-ia.module.css`
   * para el porqué de esta solución (una clase en `<body>`, no un ajuste
   * de z-index, que ya se intentó y no bastó).
   */
  useEffect(() => {
    document.body.classList.add('editorDocumentoAbierto');
    return () => document.body.classList.remove('editorDocumentoAbierto');
  }, []);

  const [documento, setDocumento] = useState<DocumentoMC>(documentoInicial);
  const [pasado, setPasado] = useState<DocumentoMC[]>([]);
  const [futuro, setFuturo] = useState<DocumentoMC[]>([]);
  const [titulo, setTitulo] = useState(contenedor.titulo);
  /**
   * Precio total del presupuesto (pedido real, 28/08/2026, tras varias
   * rondas fallidas guardándolo desde el panel del elemento "Precio"): se
   * trata exactamente igual que `titulo` — mismo estado local, mismo
   * `datosParaGuardar`, mismo autoguardado — a propósito. La causa real de
   * que el precio "volviera a 0" no era ninguno de los bugs de negrita: el
   * campo del panel llamaba a `onGuardar` DIRECTAMENTE con `{...contenedor,
   * precioTotal}`, en paralelo al autoguardado normal; el siguiente
   * autoguardado (disparado por cualquier otro cambio del documento) volvía
   * a enviar el `contenedor` de sus props, que nunca se había refrescado
   * con el precio nuevo, pisando el valor recién guardado. Unificar en un
   * único estado y una única vía de guardado elimina esa carrera de raíz.
   */
  const [precioTotal, setPrecioTotal] = useState<number>(precioVinculado ?? 0);
  const [precioTotalTexto, setPrecioTotalTexto] = useState<string>(String(precioVinculado ?? 0));
  const [paginaActivaId, setPaginaActivaId] = useState(documentoInicial.paginas[0].id);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const lienzoContenedorRef = useRef<HTMLDivElement>(null);
  const paginaActivaElRef = useRef<HTMLDivElement | null>(null);
  const [nombreEstiloNuevo, setNombreEstiloNuevo] = useState('');
  /**
   * En pantallas estrechas (móvil, tablet en vertical), los paneles
   * izquierdo (páginas/capas) y derecho (propiedades) tapaban el lienzo
   * por completo, sin ningún botón para cerrarlos — el usuario no podía
   * llegar a ver la plantilla en absoluto (reportado 20/08/2026, con
   * captura). En pantallas anchas (escritorio) ambos paneles se quedan
   * siempre visibles como hasta ahora; en estrechas, empiezan cerrados y
   * cada uno se abre solo con su propio botón — nunca los dos a la vez,
   * para no repetir el mismo problema con el otro panel.
   */
  const [panelMovilAbierto, setPanelMovilAbierto] = useState<'ninguno' | 'izquierdo' | 'derecho'>('ninguno');

  /**
   * Paneles laterales redimensionables (Fase B, Prioridad 3, 24/08/2026) —
   * solo aplica en escritorio/tablet horizontal: en móvil los paneles son
   * overlays a pantalla completa (`position: fixed` dentro del media query
   * de abajo, línea ~327 de `editor-documento.module.css`) que ya ignoran
   * cualquier ancho — el asa de arrastre ni siquiera se renderiza ahí. El
   * ancho se aplica como variable CSS (`--ancho-panel-*`) en vez de como
   * `style.width` directo precisamente para que la regla de ese media
   * query (que fija un `width` literal, sin usar la variable) siga
   * ganando por orden de cascada sin que un estilo inline la pise.
   * No se persiste en `localStorage` a propósito — se deja para una fase
   * posterior si hace falta, ver instrucción explícita del 24/08/2026 de no
   * complicar esta fase con eso.
   */
  const ANCHO_PANEL_MIN_PX = 160;
  const ANCHO_PANEL_MAX_PX = 420;
  const [anchoPanelIzquierdo, setAnchoPanelIzquierdo] = useState(200);
  const [anchoPanelDerecho, setAnchoPanelDerecho] = useState(260);
  const redimensionandoPanelRef = useRef<{ lado: 'izquierdo' | 'derecho'; xInicio: number; anchoInicio: number } | null>(null);
  const iniciarRedimensionPanel = useCallback((lado: 'izquierdo' | 'derecho', e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    redimensionandoPanelRef.current = { lado, xInicio: e.clientX, anchoInicio: lado === 'izquierdo' ? anchoPanelIzquierdo : anchoPanelDerecho };
    const alMover = (ev: PointerEvent) => {
      const activo = redimensionandoPanelRef.current;
      if (!activo) return;
      const deltaX = ev.clientX - activo.xInicio;
      // El panel izquierdo crece hacia la derecha (arrastrar a la derecha = más ancho);
      // el derecho crece hacia la izquierda (arrastrar a la izquierda = más ancho).
      const anchoBruto = activo.lado === 'izquierdo' ? activo.anchoInicio + deltaX : activo.anchoInicio - deltaX;
      // Nunca dejar que un panel se coma el lienzo entero: además del máximo fijo,
      // se limita también a una fracción del ancho de ventana disponible.
      const maximo = Math.min(ANCHO_PANEL_MAX_PX, window.innerWidth * 0.4);
      const ancho = Math.max(ANCHO_PANEL_MIN_PX, Math.min(anchoBruto, maximo));
      if (activo.lado === 'izquierdo') setAnchoPanelIzquierdo(ancho); else setAnchoPanelDerecho(ancho);
    };
    const alSoltar = () => {
      redimensionandoPanelRef.current = null;
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('pointerup', alSoltar);
    };
    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', alSoltar);
  }, [anchoPanelIzquierdo, anchoPanelDerecho]);

  /**
   * Selección múltiple con el dedo (petición del usuario, 20/08/2026):
   * antes solo se podía añadir un elemento a la selección manteniendo
   * pulsada la tecla Shift al tocarlo — una pantalla táctil no tiene esa
   * tecla, así que en móvil/tablet era imposible seleccionar varios
   * elementos a la vez (necesario, por ejemplo, para "Guardar selección
   * como componente"). Con este modo activado, cada toque se comporta
   * como si Shift estuviera pulsado — añade o quita del grupo en vez de
   * sustituir la selección.
   */
  const [seleccionMultipleActiva, setSeleccionMultipleActiva] = useState(false);
  /**
   * La barra de herramientas (+ Texto, + Imagen...) tiene más de 20
   * botones — en pantalla estrecha, siempre desplegada, ocupaba casi toda
   * la pantalla y dejaba el lienzo reducido a una rendija abajo del todo
   * (reportado 20/08/2026, con captura real: "es imposible de ver").
   * Empieza recogida solo en pantallas estrechas; en escritorio se queda
   * como siempre, siempre visible.
   */
  const [herramientasAbiertas, setHerramientasAbiertas] = useState(() => typeof window === 'undefined' || window.innerWidth > 720);
  const [panelTemaAbierto, setPanelTemaAbierto] = useState(false);
  const [panelPlantillaAbierto, setPanelPlantillaAbierto] = useState(false);
  const [panelClienteAbierto, setPanelClienteAbierto] = useState(false);
  const [clienteElegidoIdNuevo, setClienteElegidoIdNuevo] = useState('');
  const [cambiandoCliente, setCambiandoCliente] = useState(false);
  const [errorCambiarCliente, setErrorCambiarCliente] = useState('');
  const [nombrePlantillaNueva, setNombrePlantillaNueva] = useState('');
  const [ambitoPlantillaNueva, setAmbitoPlantillaNueva] = useState<'usuario' | 'corporativa'>('usuario');
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false);
  const [avisoPlantilla, setAvisoPlantilla] = useState<string | null>(null);
  const [bibliotecaAbierta, setBibliotecaAbierta] = useState(false);
  const [recursosBiblioteca, setRecursosBiblioteca] = useState<RecursoMC[]>([]);
  const [errorGeneracionIA, setErrorGeneracionIA] = useState<string | null>(null);
  /** IA del Presupuesto (23/08/2026) — panel propio, independiente del Asistente IA general y de `bloqueIA`. */
  const [panelIaPresupuestoAbierto, setPanelIaPresupuestoAbierto] = useState(false);
  const [componentesCache, setComponentesCache] = useState<Map<string, ComponenteMC>>(new Map());
  const [selectorComponentesAbierto, setSelectorComponentesAbierto] = useState(false);
  const [panelGuardarComponenteAbierto, setPanelGuardarComponenteAbierto] = useState(false);
  const [nombreComponenteNuevo, setNombreComponenteNuevo] = useState('');
  const [tipoComponenteNuevo, setTipoComponenteNuevo] = useState<ComponenteMC['tipo']>('libre');
  const [avisoComponente, setAvisoComponente] = useState<string | null>(null);
  const [modoImpresion, setModoImpresion] = useState(false);

  /**
   * Mientras se arrastra/redimensiona, la posición se escribe directamente
   * en el DOM del elemento (`onDrag`/`onResize`, más abajo) — nunca por
   * `setState`, para que el movimiento sea fluido de verdad (un `setState`
   * en cada evento de arrastre forzaba re-renderizar TODOS los elementos
   * de la página en cada píxel de movimiento, que era la causa real de la
   * falta de fluidez). Estas refs solo guardan el último valor visto, para
   * poder confirmarlo con `ejecutar()` una única vez al soltar.
   *
   * Sin asa de rotación arrastrable a propósito (se quitó tras feedback
   * del usuario — "un cuadrado arriba que no tiene que ver" — comparado
   * con editores de referencia como Canva, que no muestran un asa de
   * rotación flotante por defecto). La rotación sigue existiendo como
   * capacidad real: el campo numérico "Rotación" del panel de propiedades
   * llama a `rotarElemento` directamente, sin pasar por Moveable.
   */
  const previewMoverRef = useRef<PreviewMover | null>(null);
  const previewResizeRef = useRef<PreviewResize | null>(null);

  const refsElementos = useRef<Map<string, HTMLDivElement>>(new Map());
  const clipboardRef = useRef<ElementoMC[] | null>(null);

  // Detección manual de doble toque/doble clic (Fase B, Prioridad 1,
  // 24/08/2026) — en paralelo al `onDoubleClick` nativo, no en su lugar
  // (ver `deteccion-doble-toque.ts`). `inicioGestoRef` guarda dónde empezó
  // el puntero de ESTE gesto en curso (para distinguir un toque limpio de
  // un arrastre); `ultimoToqueRef` guarda el último toque ya confirmado
  // como "no fue arrastre", a la espera de un segundo que lo convierta en
  // doble toque. Un único par de refs para todo el lienzo basta: solo hay
  // un puntero interactuando a la vez.
  const inicioGestoRef = useRef<{ x: number; y: number } | null>(null);
  const ultimoToqueRef = useRef<PuntoToque | null>(null);

  /**
   * Moveable mide la posición del elemento seleccionado en pantalla una
   * vez y la deja en caché — si el usuario hace scroll del lienzo con la
   * rueda del ratón (sin arrastrar nada), esa posición en pantalla cambia
   * pero Moveable nunca se entera por su cuenta, así que su caja de
   * selección se queda "plantada" en el sitio antiguo mientras la página
   * se desplaza por debajo (fallo real reportado por el usuario,
   * 19/08/2026 y de nuevo 20/08/2026, con captura de pantalla y comparado
   * contra Canva). `updateRect()` es el método que la propia librería
   * expone para forzar remedir, pero por sí solo NO basta: sin la opción
   * `useAccuratePosition` (desactivada por defecto en react-moveable),
   * `updateRect()` no vuelve a leer `getBoundingClientRect()` del target,
   * así que la caja seguía exactamente en el mismo sitio tras el scroll
   * — comprobado con un arnés de pruebas aislado comparando la posición
   * real del elemento contra la de `.moveable-control-box` antes/después
   * de forzar `updateRect()`. Con `useAccuratePosition` en los dos
   * `<Moveable>` de abajo, la llamada en cada evento de scroll del
   * contenedor del lienzo sí recalcula la posición real.
   */
  const moveableUnicoRef = useRef<{ updateRect: () => void } | null>(null);
  const moveableGrupoRef = useRef<{ updateRect: () => void } | null>(null);
  useEffect(() => {
    const contenedor = lienzoContenedorRef.current;
    if (!contenedor) return;
    const alHacerScroll = () => {
      moveableUnicoRef.current?.updateRect();
      moveableGrupoRef.current?.updateRect();
    };
    contenedor.addEventListener('scroll', alHacerScroll);
    return () => contenedor.removeEventListener('scroll', alHacerScroll);
  }, []);

  /**
   * Pellizcar con dos dedos para hacer zoom (petición del usuario,
   * 20/08/2026) — no existe ningún control táctil de zoom, solo los
   * botones +/- pensados para ratón. Distancia entre los dos dedos al
   * empezar el gesto vs. distancia actual, aplicado como factor sobre el
   * zoom que ya hubiera (no lo sustituye desde 1, para que pellizcar
   * partiendo de cualquier nivel de zoom se sienta natural). `passive:
   * false` + `preventDefault` es necesario para que el navegador no haga
   * ADEMÁS su propio zoom de página nativo a la vez (que solo ampliaría
   * toda la interfaz, no el lienzo).
   */
  useEffect(() => {
    const contenedor = lienzoContenedorRef.current;
    if (!contenedor) return;
    let distanciaInicial: number | null = null;
    let zoomInicial = 1;
    const distanciaEntreDedos = (t: TouchList): number => {
      const [a, b] = [t[0], t[1]];
      return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    };
    const alEmpezar = (e: TouchEvent) => {
      if (e.touches.length !== 2) { distanciaInicial = null; return; }
      distanciaInicial = distanciaEntreDedos(e.touches);
      zoomInicial = zoom;
    };
    const alMover = (e: TouchEvent) => {
      if (e.touches.length !== 2 || distanciaInicial === null) return;
      e.preventDefault();
      const distanciaActual = distanciaEntreDedos(e.touches);
      const factor = distanciaActual / distanciaInicial;
      setZoom(Math.min(2, Math.max(0.25, zoomInicial * factor)));
    };
    const alTerminar = (e: TouchEvent) => { if (e.touches.length < 2) distanciaInicial = null; };
    contenedor.addEventListener('touchstart', alEmpezar, { passive: true });
    contenedor.addEventListener('touchmove', alMover, { passive: false });
    contenedor.addEventListener('touchend', alTerminar, { passive: true });
    contenedor.addEventListener('touchcancel', alTerminar, { passive: true });
    return () => {
      contenedor.removeEventListener('touchstart', alEmpezar);
      contenedor.removeEventListener('touchmove', alMover);
      contenedor.removeEventListener('touchend', alTerminar);
      contenedor.removeEventListener('touchcancel', alTerminar);
    };
    // Deliberadamente sin `zoom` en las dependencias: reinstalar los
    // listeners en cada cambio de zoom cortaría un pellizco a mitad de
    // gesto. `zoomInicial` ya captura el valor vigente al EMPEZAR cada
    // gesto nuevo, que es lo único que hace falta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Ajusta el zoom inicial al ancho real disponible cuando la página no
   * cabe (móvil/tablet) — sin esto, una hoja A4 a 100% es más ancha que
   * la mayoría de pantallas de móvil y queda cortada por un lado, sin
   * ninguna pista visual de que hay más hoja fuera de la vista (reportado
   * 20/08/2026, con captura real: "se corta"). Solo al montar y al girar
   * la pantalla — nunca en cada cambio del documento, para no pisar un
   * zoom que el usuario ya haya elegido a mano con los botones +/- Zoom.
   */
  useEffect(() => {
    const contenedor = lienzoContenedorRef.current;
    if (!contenedor) return;
    const ajustarZoomInicial = () => {
      const configPagina = documento.paginas.find((p) => p.id === paginaActivaId)?.configuracion ?? documento.configuracionPorDefecto;
      const anchoDisponible = contenedor.clientWidth - 32; // padding lateral del contenedor (1rem a cada lado)
      if (anchoDisponible > 0 && configPagina.ancho > anchoDisponible) {
        setZoom(Math.max(0.25, anchoDisponible / configPagina.ancho));
      }
    };
    ajustarZoomInicial();
    window.addEventListener('resize', ajustarZoomInicial);
    window.addEventListener('orientationchange', ajustarZoomInicial);
    return () => {
      window.removeEventListener('resize', ajustarZoomInicial);
      window.removeEventListener('orientationchange', ajustarZoomInicial);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Botón "Ajustar" del control de zoom fijo — mismo cálculo que el ajuste automático de arriba, pero disparado a mano en cualquier momento (no solo cuando la hoja no cabe). */
  const ajustarZoomAVentana = useCallback(() => {
    const contenedor = lienzoContenedorRef.current;
    if (!contenedor) return;
    const configPagina = documento.paginas.find((p) => p.id === paginaActivaId)?.configuracion ?? documento.configuracionPorDefecto;
    const anchoDisponible = contenedor.clientWidth - 32;
    if (anchoDisponible > 0) setZoom(Math.max(0.25, Math.min(2, anchoDisponible / configPagina.ancho)));
  }, [documento, paginaActivaId]);

  /** Aplica un comando (DocumentoMC actual -> nuevo) empujando el estado previo al historial de deshacer. Único punto de mutación del documento en todo el editor — nunca se llama a setDocumento directamente fuera de aquí (Regla de Oro 3). */
  const ejecutar = useCallback((comando: (doc: DocumentoMC) => DocumentoMC) => {
    setDocumento((actual) => {
      const siguiente = comando(actual);
      if (siguiente === actual) return actual; // el comando decidió no hacer nada (ej. bloqueado, <2 elementos)
      setPasado((p) => [...p, actual]);
      setFuturo([]);
      return siguiente;
    });
  }, []);

  const deshacer = useCallback(() => {
    setPasado((p) => {
      if (p.length === 0) return p;
      const anterior = p[p.length - 1];
      setDocumento((actual) => { setFuturo((f) => [actual, ...f]); return anterior; });
      return p.slice(0, -1);
    });
  }, []);

  const rehacer = useCallback(() => {
    setFuturo((f) => {
      if (f.length === 0) return f;
      const siguiente = f[0];
      setDocumento((actual) => { setPasado((p) => [...p, actual]); return siguiente; });
      return f.slice(1);
    });
  }, []);

  const paginaActiva = documento.paginas.find((p) => p.id === paginaActivaId) ?? documento.paginas[0];

  // ── Selección ────────────────────────────────────────────────────────────────

  /**
   * Bug real, 28/08/2026 ("la negrita no se guarda, el texto vuelve a
   * como estaba al hacer clic fuera"): `seleccionarElemento`/`limpiarSeleccion`
   * cambiaban `editandoId` a mano vía estado de React ANTES de que el
   * `blur` NATIVO del elemento en edición (el que de verdad dispara su
   * guardado, ver `onBlur` en `documento-tipos-iniciales-render.tsx`)
   * llegara a producirse — al re-renderizar con `editando:false` primero,
   * el manejador de blur que finalmente se ejecutaba ya cerraba sobre ese
   * `editando:false` y se saltaba el guardado por completo (su propia
   * comprobación `if (!editando) return`). Forzar aquí el `.blur()`
   * explícito del elemento activo, ANTES de tocar el estado de React,
   * garantiza que el guardado ya se ha disparado y completado con
   * `editando` todavía en `true` en el momento correcto.
   */
  const confirmarEdicionEnCurso = () => {
    const activo = document.activeElement;
    if (activo instanceof HTMLElement && activo.isContentEditable) activo.blur();
  };

  const seleccionarElemento = useCallback((id: string, opciones: { extender?: boolean; paginaId?: string } = {}) => {
    confirmarEdicionEnCurso();
    setEditandoId(null);
    if (opciones.paginaId) setPaginaActivaId(opciones.paginaId);
    setSeleccion((actual) => {
      if (opciones.extender) {
        return actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id];
      }
      return [id];
    });
    // En pantallas estrechas, seleccionar un elemento abre directamente el
    // panel de propiedades — sin esto, el usuario tendría que tocar el
    // botón "Propiedades" a mano cada vez, un paso extra innecesario. En
    // escritorio no tiene efecto visual (los paneles ya están siempre
    // visibles ahí).
    setPanelMovilAbierto('derecho');
  }, []);

  const limpiarSeleccion = useCallback(() => { confirmarEdicionEnCurso(); setSeleccion([]); setEditandoId(null); }, []);

  // ── Inserción / eliminación ──────────────────────────────────────────────────

  const insertarElemento = useCallback((tipo: string) => {
    const definicion = obtenerTipoRender(tipo);
    const pagina = documento.paginas.find((p) => p.id === paginaActivaId) ?? documento.paginas[0];
    const config = pagina.configuracion ?? documento.configuracionPorDefecto;
    // Centrado en la parte de la hoja que se ve AHORA en pantalla, no en el
    // centro de toda la hoja A4 — con zoom/scroll, el centro de la hoja
    // completa cae fácilmente fuera de la vista, y el elemento nuevo
    // "aparece" muy por debajo de donde el carpintero está mirando, obligando
    // a buscarlo con scroll para poder escribir (reporte real, 20/08/2026:
    // "ese mismo sitio tiene que ser mi recuadro... no quiero otro más abajo").
    let centroX = config.ancho / 2;
    let centroY = config.alto / 2;
    const contenedor = lienzoContenedorRef.current;
    const paginaEl = pagina.id === paginaActivaId ? paginaActivaElRef.current : null;
    if (contenedor && paginaEl) {
      const rectContenedor = contenedor.getBoundingClientRect();
      const rectPagina = paginaEl.getBoundingClientRect();
      const visibleIzq = Math.max(0, rectContenedor.left - rectPagina.left);
      const visibleArriba = Math.max(0, rectContenedor.top - rectPagina.top);
      const visibleDer = Math.min(rectPagina.width, rectContenedor.right - rectPagina.left);
      const visibleAbajo = Math.min(rectPagina.height, rectContenedor.bottom - rectPagina.top);
      if (visibleDer > visibleIzq && visibleAbajo > visibleArriba) {
        centroX = (visibleIzq + visibleDer) / 2 / zoom;
        centroY = (visibleArriba + visibleAbajo) / 2 / zoom;
      }
    }
    const posicionInicial = {
      x: Math.min(Math.max(0, config.ancho - definicion.tamanoInicial.ancho), Math.max(0, Math.round(centroX - definicion.tamanoInicial.ancho / 2))),
      y: Math.min(Math.max(0, config.alto - definicion.tamanoInicial.alto), Math.max(0, Math.round(centroY - definicion.tamanoInicial.alto / 2))),
    };
    const base = crearElementoBase(tipo, posicionInicial, definicion.tamanoInicial);
    const elemento: ElementoMC = {
      ...base,
      contenido: definicion.crearContenidoInicial(),
      estilo: definicion.crearEstiloInicial(),
      propiedadesEspecificas: definicion.crearPropiedadesIniciales(),
    };
    ejecutar((doc) => anadirElemento(doc, paginaActivaId, elemento));
    setSeleccion([elemento.id]);
  }, [ejecutar, paginaActivaId, documento]);

  const eliminarSeleccionActual = useCallback(() => {
    if (seleccion.length === 0) return;
    ejecutar((doc) => eliminarElementos(doc, seleccion));
    limpiarSeleccion();
  }, [ejecutar, seleccion, limpiarSeleccion]);

  const duplicarSeleccionActual = useCallback(() => {
    if (seleccion.length === 0) return;
    setDocumento((actual) => {
      const { documento: siguiente, nuevosIds } = duplicarElementos(actual, seleccion);
      setPasado((p) => [...p, actual]);
      setFuturo([]);
      setSeleccion(nuevosIds);
      return siguiente;
    });
  }, [seleccion]);

  const copiarSeleccion = useCallback(() => {
    const elementos = seleccion.map((id) => localizarElemento(documento, id)?.elemento).filter((e): e is ElementoMC => !!e);
    if (elementos.length > 0) clipboardRef.current = elementos;
  }, [documento, seleccion]);

  const pegarSeleccion = useCallback(() => {
    if (!clipboardRef.current || clipboardRef.current.length === 0) return;
    const ids = clipboardRef.current.map((e) => e.id);
    setDocumento((actual) => {
      let base = actual;
      // Los elementos copiados pueden no existir ya en el documento actual (copiar y pegar entre presupuestos no está soportado aún) — si existen, se duplican; si no, se insertan como nuevos.
      const existentes = ids.filter((id) => localizarElemento(base, id));
      if (existentes.length === ids.length) {
        const { documento: siguiente, nuevosIds } = duplicarElementos(base, ids);
        setPasado((p) => [...p, actual]);
        setFuturo([]);
        setSeleccion(nuevosIds);
        return siguiente;
      }
      const nuevosIds: string[] = [];
      for (const original of clipboardRef.current!) {
        const nuevo = { ...original, id: `${original.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
        nuevosIds.push(nuevo.id);
        base = anadirElemento(base, paginaActivaId, nuevo);
      }
      setPasado((p) => [...p, actual]);
      setFuturo([]);
      setSeleccion(nuevosIds);
      return base;
    });
  }, [paginaActivaId]);

  // ── Agrupar / bloquear / capas / alinear ────────────────────────────────────

  const agruparSeleccionActual = useCallback(() => { if (seleccion.length >= 2) ejecutar((doc) => agruparElementos(doc, seleccion)); }, [ejecutar, seleccion]);
  const desagruparSeleccionActual = useCallback(() => {
    const grupoId = seleccion.length > 0 ? localizarElemento(documento, seleccion[0])?.elemento.grupoId : null;
    if (grupoId) ejecutar((doc) => desagruparElementos(doc, grupoId));
  }, [ejecutar, documento, seleccion]);
  const bloquearSeleccionActual = useCallback((bloqueado: boolean) => { if (seleccion.length > 0) ejecutar((doc) => establecerBloqueo(doc, seleccion, bloqueado)); }, [ejecutar, seleccion]);
  const cambiarCapaSeleccionActual = useCallback((direccion: 'arriba' | 'abajo' | 'frente' | 'fondo') => {
    if (seleccion.length !== 1) return;
    ejecutar((doc) => cambiarCapa(doc, seleccion[0], direccion));
  }, [ejecutar, seleccion]);
  const alinearSeleccionActual = useCallback((tipo: Parameters<typeof alinear>[2]) => { if (seleccion.length >= 2) ejecutar((doc) => alinear(doc, seleccion, tipo)); }, [ejecutar, seleccion]);
  const distribuirSeleccionActual = useCallback((eje: 'horizontal' | 'vertical') => { if (seleccion.length >= 3) ejecutar((doc) => distribuir(doc, seleccion, eje)); }, [ejecutar, seleccion]);

  // ── Sistema de estilos (Incremento 3) ───────────────────────────────────────

  const guardarComoEstiloNuevo = useCallback((elementoId: string) => {
    const nombre = nombreEstiloNuevo.trim();
    if (!nombre) return;
    setDocumento((actual) => {
      const elemento = localizarElemento(actual, elementoId)?.elemento;
      if (!elemento) return actual;
      const { documento: siguiente, id } = crearEstiloNombrado(actual, nombre, elemento.estilo);
      const conAplicado = aplicarEstiloNombrado(siguiente, [elementoId], id);
      setPasado((p) => [...p, actual]);
      setFuturo([]);
      return conAplicado;
    });
    setNombreEstiloNuevo('');
  }, [nombreEstiloNuevo]);

  // ── Páginas ──────────────────────────────────────────────────────────────────

  const anadirPaginaActual = useCallback(() => {
    setDocumento((actual) => {
      const siguiente = anadirPagina(actual);
      setPasado((p) => [...p, actual]);
      setFuturo([]);
      setPaginaActivaId(siguiente.paginas[siguiente.paginas.length - 1].id);
      return siguiente;
    });
  }, []);

  const eliminarPaginaActual = useCallback((paginaId: string) => {
    ejecutar((doc) => eliminarPagina(doc, paginaId));
    setSeleccion([]);
    if (paginaId === paginaActivaId) setPaginaActivaId(documento.paginas.find((p) => p.id !== paginaId)?.id ?? documento.paginas[0].id);
  }, [ejecutar, paginaActivaId, documento.paginas]);

  const duplicarPaginaActual = useCallback((paginaId: string) => {
    setDocumento((actual) => {
      const { documento: siguiente, nuevaPaginaId } = duplicarPagina(actual, paginaId);
      if (siguiente === actual) return actual;
      setPasado((p) => [...p, actual]);
      setFuturo([]);
      setPaginaActivaId(nuevaPaginaId);
      return siguiente;
    });
  }, []);

  const moverPaginaActual = useCallback((paginaId: string, direccion: 'arriba' | 'abajo') => {
    ejecutar((doc) => moverPagina(doc, paginaId, direccion));
  }, [ejecutar]);

  // ── Resolución perezosa de instancias de componente (Incremento 6) ──────────

  useEffect(() => {
    const idsReferenciados = new Set<string>();
    for (const pagina of documento.paginas) {
      for (const el of pagina.elementos) {
        if (el.tipo === 'instanciaComponente') idsReferenciados.add(el.contenido.componenteId as string);
      }
    }
    const faltan = [...idsReferenciados].some((id) => !componentesCache.has(id));
    if (faltan) api.obtenerComponentes().then(cachearComponentes).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documento]);

  // ── Teclado ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editandoId) return; // no interceptar mientras se escribe texto
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && seleccion.length > 0) { e.preventDefault(); eliminarSeleccionActual(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); deshacer(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); rehacer(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicarSeleccionActual(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { copiarSeleccion(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { pegarSeleccion(); return; }
      if (seleccion.length > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const paso = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -paso : e.key === 'ArrowRight' ? paso : 0;
        const dy = e.key === 'ArrowUp' ? -paso : e.key === 'ArrowDown' ? paso : 0;
        ejecutar((doc) => moverElementos(doc, seleccion, dx, dy));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editandoId, seleccion, eliminarSeleccionActual, deshacer, rehacer, duplicarSeleccionActual, copiarSeleccion, pegarSeleccion, ejecutar]);

  // ── Zoom con gesto de pellizcar (trackpad/pantalla táctil) ──────────────────
  // El pellizco de dos dedos (o Ctrl+rueda) se recibe en el navegador como un
  // evento `wheel` con `ctrlKey: true` — así lo reportan por igual Chrome,
  // Firefox y Safari, sea el gesto real "pellizcar" o "Ctrl" físico. Sin
  // interceptarlo, el navegador hace zoom de TODA la página (barras, panel,
  // todo) en vez de solo la hoja de trabajo (fallo real reportado por el
  // usuario). El listener tiene que añadirse de forma nativa con
  // `{ passive: false }` — el `onWheel` de React es pasivo por defecto y no
  // deja bloquear el zoom del navegador con `preventDefault()`.
  useEffect(() => {
    const contenedor = lienzoContenedorRef.current;
    if (!contenedor) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // rueda normal: se deja hacer scroll, no zoom
      e.preventDefault();
      setZoom((z) => Math.min(2, Math.max(0.25, z - e.deltaY * 0.01)));
    };
    contenedor.addEventListener('wheel', onWheel, { passive: false });
    return () => contenedor.removeEventListener('wheel', onWheel);
  }, []);

  // ── Guardado ─────────────────────────────────────────────────────────────────
  // Fase A del informe de incidencias (23/08/2026 — "el presupuesto no
  // puede desaparecer"): antes solo existía este guardado manual, sin
  // autoguardado ni protección al salir. `useAutoguardado` reutiliza
  // exactamente esta misma llamada a `onGuardar` (mismo payload, mismo
  // camino); la única diferencia es CUÁNDO se dispara. `datosParaGuardar`
  // debe ser una referencia estable (por eso `useMemo`) para que el motor
  // pueda comparar "¿cambió de verdad?" por igualdad de referencia, no por
  // una recreación accidental del objeto en cada render.
  const datosParaGuardar = useMemo(
    () => ({ documento, titulo, precioTotal: esPlantilla ? undefined : precioTotal }),
    [documento, titulo, precioTotal, esPlantilla],
  );
  const guardarContenedor = useCallback(async (datos: { documento: DocumentoMC; titulo: string; precioTotal: number | undefined }) => {
    await onGuardar({
      ...contenedor,
      titulo: datos.titulo.trim() || contenedor.titulo,
      contenidoDocumento: datos.documento as unknown as Record<string, unknown>,
      ...(datos.precioTotal !== undefined ? { precioTotal: datos.precioTotal } : {}),
      actualizado: new Date().toISOString(),
    } as DocumentoContenedorMC);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenedor, onGuardar]);
  const { estado: estadoGuardado, errorMensaje: error, guardarAhora } = useAutoguardado(datosParaGuardar, guardarContenedor);
  const guardando = estadoGuardado === 'guardando';

  // "← Volver" ya no navega a ciegas: si hay cambios sin guardar, guarda
  // primero (reutilizando el mismo `guardarAhora` del autoguardado) y solo
  // sale si el guardado termina bien — si falla, se queda en el editor con
  // el aviso de error ya existente a la vista, en vez de perder el trabajo
  // silenciosamente.
  const alPulsarVolver = async () => {
    if (estadoGuardado === 'guardado') { onVolver(); return; }
    const ok = await guardarAhora();
    if (ok) onVolver();
  };

  // ── Exportación (Incremento 8) ──────────────────────────────────────────────
  // Sección 9 de la arquitectura: "exportar y editar comparten el mismo
  // render — el PDF sale del mismo HTML que ve el usuario en el editor".
  // Se usa la impresión nativa del navegador sobre el DOM real del editor
  // (misma jerarquía de componentes de render que en pantalla, filtrada por
  // `restricciones.visibilidad`) en vez de un segundo motor de render en
  // el servidor — decisión tomada en este incremento para no depender de
  // un navegador headless (Puppeteer/Playwright) en este entorno; sigue
  // cumpliendo la regla de oro de no duplicar el render.
  useEffect(() => {
    const alTerminarImprimir = () => setModoImpresion(false);
    window.addEventListener('afterprint', alTerminarImprimir);
    return () => window.removeEventListener('afterprint', alTerminarImprimir);
  }, []);

  const exportarPDF = () => {
    const incompletos = documento.paginas.flatMap((p) => p.elementos).filter(elementoObligatorioIncompleto);
    if (incompletos.length > 0) {
      const seguir = window.confirm(
        `Hay ${incompletos.length} elemento${incompletos.length !== 1 ? 's' : ''} obligatorio${incompletos.length !== 1 ? 's' : ''} sin completar. ¿Exportar de todas formas?`
      );
      if (!seguir) return;
    }
    limpiarSeleccion();
    setModoImpresion(true);
    // Un frame para que React pinte en modo impresión (barra/paneles
    // ocultos, filtro de visibilidad cambiado) antes de invocar el diálogo
    // nativo de impresión — `window.print()` es síncrono y bloquea hasta
    // que el usuario cierra el diálogo, así que el DOM debe estar listo antes.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  const guardarComoPlantilla = async () => {
    const nombre = nombrePlantillaNueva.trim();
    if (!nombre) return;
    setGuardandoPlantilla(true);
    setAvisoPlantilla(null);
    try {
      const ahora = new Date().toISOString();
      await api.guardarPlantilla({
        // Editando una plantilla existente (`esPlantilla`): reutiliza su
        // mismo id y su `creadoEn` real para ACTUALIZARLA — `guardarPlantilla`
        // en el backend es un upsert por id (findOneAndUpdate), así que un
        // id nuevo aquí siempre creaba una plantilla aparte en vez de tocar
        // la que el usuario tenía abierta.
        id: esPlantilla ? contenedor.id : generarId(),
        nombre, ambito: ambitoPlantillaNueva, documentoBase: documento,
        creadoEn: esPlantilla ? contenedor.creado : ahora,
        actualizadoEn: ahora,
      });
      setAvisoPlantilla(esPlantilla ? 'Plantilla actualizada.' : 'Plantilla guardada.');
      setNombrePlantillaNueva('');
      setTimeout(() => { setPanelPlantillaAbierto(false); setAvisoPlantilla(null); }, 1200);
    } catch (e) {
      setAvisoPlantilla(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setGuardandoPlantilla(false);
    }
  };

  const cambiarCliente = async () => {
    if (!onCambiarCliente || !clienteElegidoIdNuevo || clienteElegidoIdNuevo === clienteId) return;
    setCambiandoCliente(true);
    setErrorCambiarCliente('');
    try {
      await onCambiarCliente(clienteElegidoIdNuevo);
      setPanelClienteAbierto(false);
      setClienteElegidoIdNuevo('');
    } catch (e) {
      setErrorCambiarCliente(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setCambiandoCliente(false);
    }
  };

  // ── Subida de archivos (imagen/logotipo fijo/adjunto) ───────────────────────

  const sustituirArchivoDe = async (elementoId: string, tipo: string, file: File) => {
    const dataUrl = await leerArchivoComoBase64(file);
    if (tipo === 'archivoAdjunto') {
      ejecutar((doc) => actualizarContenido(doc, elementoId, { url: dataUrl, nombre: file.name, mimeType: file.type, tamano: file.size }));
      return;
    }
    if (tipo === 'logotipo') {
      const elemento = localizarElemento(documento, elementoId)?.elemento;
      const modo = (elemento?.contenido.modo as string) ?? 'vinculado';
      // Un logotipo 'vinculado' no guarda su propia imagen — sustituir el
      // archivo actualiza el logo de la Empresa (afecta a todos los
      // documentos vinculados); solo un logotipo 'fijo' guarda su URL propia.
      if (modo === 'vinculado') { onCambiarLogoEmpresa?.(dataUrl); return; }
    }
    ejecutar((doc) => actualizarContenido(doc, elementoId, { url: dataUrl }));
  };

  // ── Biblioteca de recursos (Incremento 5) ───────────────────────────────────

  const abrirBiblioteca = () => {
    setBibliotecaAbierta(true);
    api.obtenerRecursos().then(setRecursosBiblioteca).catch(() => setRecursosBiblioteca([]));
  };

  const elegirRecursoDeBiblioteca = (recurso: RecursoMC) => {
    if (seleccion.length !== 1) { setBibliotecaAbierta(false); return; }
    ejecutar((doc) => actualizarContenido(doc, seleccion[0], { url: recurso.url, recursoId: recurso.id }));
    setBibliotecaAbierta(false);
  };

  /** Sube el archivo directamente a la biblioteca (con deduplicación real por hash) y lo aplica al elemento — a diferencia de `sustituirArchivoDe`, que embebe el archivo en el propio documento sin catalogarlo. */
  const subirArchivoABiblioteca = async (elementoId: string, tipo: 'logo' | 'icono' | 'imagen' | 'fondo' | 'sello' | 'otro', file: File) => {
    const dataUrl = await leerArchivoComoBase64(file);
    const recurso = await api.subirRecurso({ nombre: file.name, tipo, ambito: 'usuario', etiquetas: [], dataUrl });
    ejecutar((doc) => actualizarContenido(doc, elementoId, { url: recurso.url, recursoId: recurso.id }));
  };

  /**
   * Fondo de página a partir de una imagen subida por el usuario (ej. una
   * plantilla en papel escaneada, o un membrete completo) — sube a la
   * biblioteca de recursos (nunca Base64 embebido, mismo criterio que el
   * resto del Motor Documental) y la aplica como `pagina.fondo` de la
   * página activa. El usuario sigue pudiendo añadir elementos editables
   * encima de esa imagen.
   */
  const subirFondoPaginaActiva = async (file: File) => {
    const dataUrl = await leerArchivoComoBase64(file);
    const recurso = await api.subirRecurso({ nombre: file.name, tipo: 'fondo', ambito: 'usuario', etiquetas: [], dataUrl });
    ejecutar((doc) => establecerFondoPagina(doc, paginaActivaId, { tipo: 'imagen', imagenUrl: recurso.url, ajuste: 'cubrir' }));
  };

  const quitarFondoPaginaActiva = () => {
    ejecutar((doc) => establecerFondoPagina(doc, paginaActivaId, null));
  };

  /**
   * "Generar con IA" del Bloque IA (Incremento 9) — la IA nunca toca el
   * documento directamente (Regla de Oro 3): genera texto plano y ese texto
   * se aplica con el mismo comando `actualizarContenido` que usaría un
   * humano escribiendo a mano. `estado` vive en el propio documento
   * (persistido); el mensaje de error es solo de la sesión de edición actual.
   */
  const generarBloqueIA = async (elementoId: string, instrucciones: string) => {
    setErrorGeneracionIA(null);
    ejecutar((doc) => actualizarContenido(doc, elementoId, { estado: 'generando' }));
    try {
      const resultado = await api.generarRespuestaIA({
        capacidad: 'generar-bloque-documento',
        mensajes: [{ role: 'user', content: instrucciones }],
        referencias: { clienteId },
      });
      ejecutar((doc) => actualizarContenido(doc, elementoId, { textoGenerado: resultado.respuesta, estado: 'generado' }));
    } catch {
      ejecutar((doc) => actualizarContenido(doc, elementoId, { estado: 'vacio' }));
      setErrorGeneracionIA('No se pudo generar el texto. Inténtalo de nuevo.');
    }
  };

  // ── Componentes reutilizables (Incremento 6) ────────────────────────────────

  const cachearComponentes = (lista: ComponenteMC[]) => {
    setComponentesCache((actual) => {
      const siguiente = new Map(actual);
      for (const c of lista) siguiente.set(c.id, c);
      return siguiente;
    });
  };

  const abrirSelectorComponentes = () => {
    setSelectorComponentesAbierto(true);
    api.obtenerComponentes().then(cachearComponentes).catch(() => {});
  };

  const insertarComponente = (componente: ComponenteMC) => {
    const minX = Math.min(...componente.elementos.map((e) => e.posicion.x), 0);
    const minY = Math.min(...componente.elementos.map((e) => e.posicion.y), 0);
    const maxX = Math.max(...componente.elementos.map((e) => e.posicion.x + e.tamano.ancho), 200);
    const maxY = Math.max(...componente.elementos.map((e) => e.posicion.y + e.tamano.alto), 100);
    const elemento = crearElementoInstanciaComponente(componente.id, { x: 60, y: 60 }, { ancho: maxX - minX, alto: maxY - minY });
    ejecutar((doc) => anadirElemento(doc, paginaActivaId, elemento));
    setSeleccion([elemento.id]);
    setSelectorComponentesAbierto(false);
  };

  const guardarComoComponente = async () => {
    const nombre = nombreComponenteNuevo.trim();
    if (!nombre || seleccion.length === 0) return;
    const elementos = seleccion.map((id) => localizarElemento(documento, id)?.elemento).filter((e): e is ElementoMC => !!e);
    if (elementos.length === 0) return;
    const minX = Math.min(...elementos.map((e) => e.posicion.x));
    const minY = Math.min(...elementos.map((e) => e.posicion.y));
    // Coordenadas relativas a la esquina superior izquierda de la selección — el componente queda reutilizable en cualquier posición futura, no atado a donde se creó.
    const elementosRelativos = elementos.map((e) => ({ ...e, posicion: { x: e.posicion.x - minX, y: e.posicion.y - minY } }));
    setAvisoComponente(null);
    try {
      const ahora = new Date().toISOString();
      await api.guardarComponente({ id: generarId(), nombre, tipo: tipoComponenteNuevo, elementos: elementosRelativos, ambito: 'usuario', creadoEn: ahora, actualizadoEn: ahora });
      setAvisoComponente('Componente guardado.');
      setNombreComponenteNuevo('');
      setTimeout(() => { setPanelGuardarComponenteAbierto(false); setAvisoComponente(null); }, 1200);
    } catch (e) {
      setAvisoComponente(String(e).replace(/^Error:\s*/, ''));
    }
  };

  const desvincularSeleccionActual = async () => {
    if (seleccion.length !== 1) return;
    const elemento = localizarElemento(documento, seleccion[0])?.elemento;
    if (!elemento || elemento.tipo !== 'instanciaComponente') return;
    const componenteId = elemento.contenido.componenteId as string;
    let componente = componentesCache.get(componenteId);
    if (!componente) {
      const lista = await api.obtenerComponentes();
      cachearComponentes(lista);
      componente = lista.find((c) => c.id === componenteId);
    }
    if (!componente) return;
    ejecutar((doc) => desvincularInstancia(doc, elemento.id, componente!.elementos, componenteId));
    setSeleccion([]);
  };

  // ── Render de un elemento ────────────────────────────────────────────────────

  function renderElemento(elemento: ElementoMC, pagina: PaginaMC) {
    const definicion = obtenerTipoRender(elemento.tipo);
    const seleccionado = seleccion.includes(elemento.id);
    const editando = editandoId === elemento.id;

    // Posición/tamaño/rotación en reposo — durante un arrastre en curso,
    // el DOM de este nodo ya está actualizado directamente (ver nota junto
    // a `previewMoverRef` más abajo); React solo necesita conocer el
    // valor confirmado, no el intermedio.
    const posicion = elemento.posicion;
    const tamano = elemento.tamano;
    const rotacion = elemento.rotacion;

    // Sección 9 de la arquitectura: al exportar/imprimir se filtra por
    // visibilidad !== 'soloEdicion'; al mostrar el editor, se filtra lo
    // contrario (nunca se ve 'soloImpresion' mientras se edita). 'oculto'
    // nunca se ve en ningún contexto. Misma regla que usa el visor de solo
    // lectura del Portal del cliente (`documento-render-compartido.ts`).
    if (!elementoVisibleEn(elemento, modoImpresion)) return null;

    // Elementos vinculados (logo/precio) y el estilo con nombre (sección 4 de
    // la arquitectura) se resuelven en un ElementoMC "de presentación" — nunca
    // se persiste el valor resuelto, siempre se recalcula a partir de la
    // referencia (`estiloNombradoId` / `contenido.modo:'vinculado'`).
    const elementoPresentacion = resolverElementoPresentacion(documento, elemento, { logoEmpresa: empresa.logo ?? undefined, precioVinculado: !esPlantilla && precioVinculado !== undefined ? precioTotal : precioVinculado, firmaEmpresa: empresa.firmaEmpresa || undefined, firmaClienteUrl, firmaClienteFecha });

    return (
      <div
        key={elemento.id}
        ref={(el) => { if (el) refsElementos.current.set(elemento.id, el); else refsElementos.current.delete(elemento.id); }}
        data-elemento-id={elemento.id}
        className={`${editorStyles.elemento} ${seleccionado ? editorStyles.elementoSeleccionado : ''} ${elemento.bloqueado ? editorStyles.elementoBloqueado : ''}`}
        // El rectángulo aplica su propia opacidad SOLO al relleno, no al
        // borde (petición del usuario, 24/08/2026: "las líneas siempre se
        // quedan de la misma... el interior sí tiene que seguir el comando
        // opacidad") — `RenderRectangulo` gestiona esa separación
        // internamente, así que aquí se le pasa opacidad 1 y se evita
        // aplicar `opacity` dos veces (que también habría afectado al
        // borde, ya que `opacity` de CSS siempre afecta a todo el
        // subárbol del elemento que la lleva, sin excepción posible).
        style={{ left: posicion.x, top: posicion.y, width: tamano.ancho, height: tamano.alto, transform: `rotate(${rotacion}deg)`, opacity: elemento.tipo === 'rectangulo' ? 1 : elemento.opacidad, zIndex: elemento.capa }}
        onMouseDown={(e) => { e.stopPropagation(); if (!editando) seleccionarElemento(elemento.id, { extender: e.shiftKey || seleccionMultipleActiva, paginaId: pagina.id }); }}
        onDoubleClick={() => { if (definicion.editableEnLienzo && !elemento.bloqueado && !elemento.restricciones.soloLectura) setEditandoId(elemento.id); }}
        onPointerDown={(e) => { inicioGestoRef.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={(e) => {
          // Nunca interfiere con Moveable: solo lee/registra, no llama a
          // `stopPropagation`/`preventDefault` — Moveable sigue recibiendo
          // este mismo evento con normalidad.
          const inicio = inicioGestoRef.current;
          inicioGestoRef.current = null;
          if (editando || !inicio) return;
          const fin = { x: e.clientX, y: e.clientY };
          if (fueArrastre(inicio, fin)) {
            // Un arrastre real (mover/redimensionar el elemento) nunca debe
            // contar como la mitad de un doble toque.
            ultimoToqueRef.current = null;
            return;
          }
          const actual: PuntoToque = { elementoId: elemento.id, tiempo: Date.now(), x: fin.x, y: fin.y };
          if (esDobleToque(ultimoToqueRef.current, actual)) {
            ultimoToqueRef.current = null;
            if (definicion.editableEnLienzo && !elemento.bloqueado && !elemento.restricciones.soloLectura) setEditandoId(elemento.id);
          } else {
            ultimoToqueRef.current = actual;
          }
        }}
      >
        <definicion.Render
          elemento={elementoPresentacion}
          editando={editando}
          onCambiarContenido={(contenido) => ejecutar((doc) => actualizarContenido(doc, elemento.id, contenido))}
          onSalirEdicion={() => setEditandoId(null)}
          resolverComponente={(id) => componentesCache.get(id)}
        />
      </div>
    );
  }

  /**
   * Pinta un elemento de una zona repetida (encabezado/pie) — a diferencia
   * de `renderElemento`, siempre de solo lectura en este incremento: el
   * membrete se ve en el lienzo (hueco real que tenía el editor: nunca se
   * pintaba, ni en pantalla ni al exportar), pero seleccionarlo/arrastrarlo
   * dentro del propio editor queda para un incremento posterior — no hacía
   * falta para que el Portal del cliente muestre el documento real, que es
   * el encargo de este incremento.
   */
  function renderElementoZona(elemento: ElementoMC) {
    if (!elementoVisibleEn(elemento, modoImpresion)) return null;
    const definicion = obtenerTipoRender(elemento.tipo);
    const elementoPresentacion = resolverElementoPresentacion(documento, elemento, { logoEmpresa: empresa.logo ?? undefined, precioVinculado: !esPlantilla && precioVinculado !== undefined ? precioTotal : precioVinculado, firmaEmpresa: empresa.firmaEmpresa || undefined, firmaClienteUrl, firmaClienteFecha });
    return (
      <div
        key={elemento.id}
        className={editorStyles.elemento}
        style={{ left: elemento.posicion.x, top: elemento.posicion.y, width: elemento.tamano.ancho, height: elemento.tamano.alto, transform: `rotate(${elemento.rotacion}deg)`, opacity: elemento.tipo === 'rectangulo' ? 1 : elemento.opacidad, zIndex: elemento.capa }}
      >
        <definicion.Render
          elemento={elementoPresentacion}
          editando={false}
          onCambiarContenido={() => {}}
          onSalirEdicion={() => {}}
          resolverComponente={(id) => componentesCache.get(id)}
        />
      </div>
    );
  }

  /** Pinta la banda de encabezado o pie de una página, si tiene una zona efectiva (herencia resuelta con `resolverZonaEfectiva`). `pointerEvents: 'none'` a propósito: en este incremento el membrete se ve pero no se interactúa con él en el lienzo (ver nota de `renderElementoZona`). */
  function renderZonaDocumento(zona: ZonaMC | null, ancho: number, posicion: 'arriba' | 'abajo') {
    if (!zona) return null;
    return (
      <div style={{ position: 'absolute', left: 0, [posicion === 'arriba' ? 'top' : 'bottom']: 0, width: ancho, height: zona.altura, pointerEvents: 'none' }}>
        {zona.elementos.map((el) => renderElementoZona(el))}
      </div>
    );
  }

  // ── Moveable — un único elemento o grupo (solo mover) seleccionado ──────────

  const elementoUnicoSeleccionado = seleccion.length === 1 ? localizarElemento(documento, seleccion[0])?.elemento : undefined;
  const targetsMoveable = seleccion.map((id) => refsElementos.current.get(id)).filter((el): el is HTMLDivElement => !!el);
  const bloqueadoSeleccion = elementoUnicoSeleccionado?.bloqueado ?? seleccion.some((id) => localizarElemento(documento, id)?.elemento.bloqueado);

  /**
   * Barra de formato flotante, anclada justo encima (o debajo si no cabe)
   * del elemento seleccionado — igual que Canva: los controles de fuente/
   * color/alineación viven pegados a lo que se está construyendo, no en un
   * panel aparte al que hay que ir a buscarlos (petición explícita del
   * usuario, 20/08/2026: "quiero poder editarlo en el mismo recuadro que
   * estoy construyendo... no quiero otro más abajo"). Se recalcula en cada
   * scroll/resize porque `getBoundingClientRect` es del viewport, no del
   * documento — igual que ya hace el propio Moveable más abajo.
   */
  const idElementoFlotante = elementoUnicoSeleccionado?.id ?? null;
  const [rectBarraFlotante, setRectBarraFlotante] = useState<{ left: number; top: number; abajo: boolean } | null>(null);
  /**
   * Recalcula la posición de la barra flotante a partir del DOM real del
   * elemento — se llama también DESDE `onDragUnico`/`onResizeUnico` (no
   * solo desde el efecto de abajo), porque durante un arrastre en curso
   * `target.style.left/top` se muta directamente sin pasar por
   * `documento` (ver nota junto a `previewMoverRef`) — sin esta llamada
   * explícita la barra se quedaba "congelada" en su sitio de antes
   * mientras el recuadro se movía debajo, pareciendo un elemento suelto y
   * desconectado (fallo real reportado por el usuario, 20/08/2026: "no la
   * puedo visualizar... quiero que se mueva todo junto con los puntos").
   */
  /**
   * Altura estimada de la barra flotante — desde que `.panelSeccion` pasó a
   * `flex-wrap: nowrap` (fila única con scroll horizontal, Fase B,
   * Prioridad 2, 24/08/2026) su altura es siempre ~1 fila, así que una
   * estimación fija basta para recortarla contra el borde superior/inferior
   * del viewport sin tener que medir el DOM real (que aún no existe en el
   * primer render, antes de que React pinte la barra).
   */
  const ALTURA_ESTIMADA_BARRA_FLOTANTE_PX = 64;
  const actualizarRectBarraFlotante = useCallback((nodo: HTMLElement) => {
    const r = nodo.getBoundingClientRect();
    const abajo = r.top < 90; // sin sitio arriba (barra superior + herramientas) — se ancla debajo en su lugar.
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 360 - 8));
    const topSinRecortar = abajo ? r.bottom + 8 : r.top - 8;
    // `top` significa cosas distintas según el ancla: si va abajo, es el
    // borde SUPERIOR de la barra (crece hacia abajo); si va arriba, es el
    // borde INFERIOR (crece hacia arriba, con `translateY(-100%)`) — cada
    // caso se recorta contra el borde del viewport que le corresponde.
    const top = abajo
      ? Math.min(topSinRecortar, window.innerHeight - ALTURA_ESTIMADA_BARRA_FLOTANTE_PX - 8)
      : Math.max(topSinRecortar, ALTURA_ESTIMADA_BARRA_FLOTANTE_PX + 8);
    setRectBarraFlotante({ left, top, abajo });
  }, []);
  useEffect(() => {
    if (!idElementoFlotante) { setRectBarraFlotante(null); return; }
    const actualizar = () => {
      const nodo = refsElementos.current.get(idElementoFlotante);
      if (!nodo) { setRectBarraFlotante(null); return; }
      actualizarRectBarraFlotante(nodo);
    };
    actualizar();
    const contenedor = lienzoContenedorRef.current;
    contenedor?.addEventListener('scroll', actualizar);
    window.addEventListener('resize', actualizar);
    return () => { contenedor?.removeEventListener('scroll', actualizar); window.removeEventListener('resize', actualizar); };
  }, [idElementoFlotante, zoom, documento, actualizarRectBarraFlotante]);

  // ── Guías de alineación (regla/medidor de centrado) — al arrastrar o
  // redimensionar, Moveable dibuja líneas de guía cuando el elemento
  // queda alineado (borde o centro) con otro elemento de la misma página,
  // o con el centro de la propia página. Puramente visual — no cambia
  // cómo se guarda la posición (sigue siendo la que suelte el usuario).
  const paginaActivaParaGuias = documento.paginas.find((p) => p.id === paginaActivaId);
  const elementosGuia = (paginaActivaParaGuias?.elementos ?? [])
    .filter((el) => !seleccion.includes(el.id))
    .map((el) => refsElementos.current.get(el.id))
    .filter((el): el is HTMLDivElement => !!el);
  const configPaginaActivaParaGuias = paginaActivaParaGuias?.configuracion ?? documento.configuracionPorDefecto;
  const propsGuias = {
    snappable: true,
    snapCenter: true,
    elementGuidelines: elementosGuia,
    verticalGuidelines: [configPaginaActivaParaGuias.ancho / 2],
    horizontalGuidelines: [configPaginaActivaParaGuias.alto / 2],
    snapThreshold: 5,
    isDisplaySnapDigit: false,
  };

  const onDragUnico = ({ target, left, top }: OnDrag) => {
    const original = elementoUnicoSeleccionado;
    if (!original) return;
    (target as HTMLElement).style.left = `${left}px`;
    (target as HTMLElement).style.top = `${top}px`;
    previewMoverRef.current = { ids: [original.id], deltaX: left - original.posicion.x, deltaY: top - original.posicion.y };
    actualizarRectBarraFlotante(target as HTMLElement);
  };
  const onDragGroupUnico = ({ events }: OnDragGroup) => {
    if (events.length === 0) return;
    const deltas = events.map((ev) => {
      (ev.target as HTMLElement).style.left = `${ev.left}px`;
      (ev.target as HTMLElement).style.top = `${ev.top}px`;
      const id = ev.target.getAttribute('data-elemento-id') ?? '';
      const el = localizarElemento(documento, id)?.elemento;
      return el ? { id, dx: ev.left - el.posicion.x, dy: ev.top - el.posicion.y } : null;
    }).filter((d): d is { id: string; dx: number; dy: number } => !!d);
    if (deltas.length === 0) return;
    // En un movimiento de grupo todos comparten el mismo delta (arrastre rígido) — se toma el primero como representativo.
    previewMoverRef.current = { ids: deltas.map((d) => d.id), deltaX: deltas[0].dx, deltaY: deltas[0].dy };
  };
  const onDragEnd = () => {
    const preview = previewMoverRef.current;
    if (preview) ejecutar((doc) => moverElementos(doc, preview.ids, preview.deltaX, preview.deltaY));
    previewMoverRef.current = null;
  };
  const onResizeUnico = ({ target, width, height, drag }: OnResize) => {
    const original = elementoUnicoSeleccionado;
    if (!original) return;
    const t = target as HTMLElement;
    const tamano = { ancho: Math.max(10, width), alto: Math.max(10, height) };
    t.style.width = `${tamano.ancho}px`;
    t.style.height = `${tamano.alto}px`;
    t.style.left = `${drag.left}px`;
    t.style.top = `${drag.top}px`;
    previewResizeRef.current = { id: original.id, tamano, posicion: { x: drag.left, y: drag.top } };
    actualizarRectBarraFlotante(t);
  };
  const onResizeEnd = () => {
    const preview = previewResizeRef.current;
    if (preview) ejecutar((doc) => redimensionarElemento(doc, preview.id, preview.tamano, preview.posicion));
    previewResizeRef.current = null;
  };
  // ── Panel de propiedades ─────────────────────────────────────────────────────

  /** Controles de formato de un elemento (fuente/color/alineación...) — se usa tanto en el panel derecho como en la barra flotante anclada al propio elemento. */
  function panelEstiloDe(elemento: ElementoMC) {
    const definicion = obtenerTipoRender(elemento.tipo);
    return (
      <definicion.PanelPropiedades
        elemento={elemento}
        onCambiarContenido={(contenido) => ejecutar((doc) => actualizarContenido(doc, elemento.id, contenido))}
        onCambiarEstilo={(estilo) => ejecutar((doc) => actualizarEstilo(doc, [elemento.id], estilo))}
        onCambiarPropiedades={(propiedades) => ejecutar((doc) => actualizarPropiedadesEspecificas(doc, elemento.id, propiedades))}
        onSustituirArchivo={(file) => sustituirArchivoDe(elemento.id, elemento.tipo, file)}
        onElegirDeBiblioteca={elemento.tipo === 'imagen' || elemento.tipo === 'logotipo' ? abrirBiblioteca : undefined}
        onSubirABiblioteca={elemento.tipo === 'imagen' ? (file) => subirArchivoABiblioteca(elemento.id, 'imagen', file) : undefined}
        onGenerarConIA={elemento.tipo === 'bloqueIA' ? (instrucciones) => generarBloqueIA(elemento.id, instrucciones) : undefined}
        errorGenerarConIA={elemento.tipo === 'bloqueIA' ? errorGeneracionIA : undefined}
        precioTotal={elemento.tipo === 'precioDestacado' && !esPlantilla && precioVinculado !== undefined ? precioTotal : undefined}
        onCambiarPrecioTotal={
          elemento.tipo === 'precioDestacado' && !esPlantilla && precioVinculado !== undefined
            ? (valor) => { setPrecioTotal(valor); setPrecioTotalTexto(String(valor)); }
            : undefined
        }
      />
    );
  }

  function panelPropiedades() {
    if (seleccion.length === 0) return <p className={editorStyles.panelNota}>Selecciona un elemento para ver sus propiedades.</p>;
    if (seleccion.length > 1) {
      return (
        <div className={editorStyles.panelSeccion}>
          <p className={editorStyles.panelNota}>{seleccion.length} elementos seleccionados.</p>
        </div>
      );
    }
    const elemento = elementoUnicoSeleccionado;
    if (!elemento) return null;
    const definicion = obtenerTipoRender(elemento.tipo);
    return (
      <>
        <p className={editorStyles.panelTituloSeccion}>{definicion.etiqueta}</p>
        <div className={editorStyles.panelSeccion}>
          <div className={editorStyles.panelFila}>
            <label className={editorStyles.panelCampo}>X<input type="number" value={Math.round(elemento.posicion.x)} onChange={(e) => { const v = numeroValido(e.target.value); if (v !== null) ejecutar((doc) => redimensionarElemento(doc, elemento.id, elemento.tamano, { x: v, y: elemento.posicion.y })); }} /></label>
            <label className={editorStyles.panelCampo}>Y<input type="number" value={Math.round(elemento.posicion.y)} onChange={(e) => { const v = numeroValido(e.target.value); if (v !== null) ejecutar((doc) => redimensionarElemento(doc, elemento.id, elemento.tamano, { x: elemento.posicion.x, y: v })); }} /></label>
          </div>
          <div className={editorStyles.panelFila}>
            <label className={editorStyles.panelCampo}>Ancho<input type="number" value={Math.round(elemento.tamano.ancho)} onChange={(e) => { const v = numeroValido(e.target.value, 1); if (v !== null) ejecutar((doc) => redimensionarElemento(doc, elemento.id, { ancho: v, alto: elemento.tamano.alto })); }} /></label>
            <label className={editorStyles.panelCampo}>Alto<input type="number" value={Math.round(elemento.tamano.alto)} onChange={(e) => { const v = numeroValido(e.target.value, 1); if (v !== null) ejecutar((doc) => redimensionarElemento(doc, elemento.id, { ancho: elemento.tamano.ancho, alto: v })); }} /></label>
          </div>
          <label className={editorStyles.panelCampo}>Rotación<input type="number" value={Math.round(elemento.rotacion)} onChange={(e) => { const v = numeroValido(e.target.value); if (v !== null) ejecutar((doc) => rotarElemento(doc, elemento.id, v)); }} /></label>
          <label className={editorStyles.panelCampo}>Opacidad
            <input type="range" min={0} max={1} step={0.05} value={elemento.opacidad} onChange={(e) => ejecutar((doc) => establecerOpacidad(doc, elemento.id, Number(e.target.value)))} />
          </label>
          <label className={editorStyles.panelCampo}>
            Visibilidad
            <select value={elemento.restricciones.visibilidad} onChange={(e) => ejecutar((doc) => establecerVisibilidad(doc, elemento.id, e.target.value as typeof elemento.restricciones.visibilidad))}>
              <option value="siempre">Siempre</option>
              <option value="soloEdicion">Solo en el editor (no sale en el PDF)</option>
              <option value="soloImpresion">Solo en el PDF (oculto al editar)</option>
              <option value="oculto">Oculto en todas partes</option>
            </select>
          </label>
          <div className={editorStyles.panelFila}>
            <label className={editorStyles.panelCampo} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="checkbox"
                checked={elemento.restricciones.soloLectura}
                onChange={(e) => ejecutar((doc) => establecerSoloLectura(doc, elemento.id, e.target.checked))}
              />
              Solo lectura
            </label>
            <label className={editorStyles.panelCampo} style={{ flexDirection: 'row', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="checkbox"
                checked={elemento.restricciones.obligatorio}
                onChange={(e) => ejecutar((doc) => establecerObligatorio(doc, elemento.id, e.target.checked))}
              />
              Obligatorio
            </label>
          </div>
        </div>
        <p className={editorStyles.panelTituloSeccion}>Estilo con nombre</p>
        <div className={editorStyles.panelSeccion}>
          <select
            value={elemento.estiloNombradoId ?? ''}
            onChange={(e) => ejecutar((doc) => aplicarEstiloNombrado(doc, [elemento.id], e.target.value || null))}
          >
            <option value="">— Sin estilo con nombre —</option>
            {documento.estilosGuardados.map((es) => <option key={es.id} value={es.id}>{es.nombre}</option>)}
          </select>
          {/*
            Renombrar/borrar el estilo aplicado, aquí mismo — corrección
            24/08/2026 (reportado por el usuario: "no hay manera de
            editarlo... una vez que se ha creado un estilo con nombre").
            Ambas acciones ya existían, pero solo desde el modal aparte
            "🎨 Tema y estilos" — nada en este panel indicaba que había que
            ir a buscarlas allí. Mismos comandos (`renombrarEstiloNombrado`/
            `eliminarEstiloNombrado`), solo expuestos también donde el
            usuario ya está mirando al aplicar el estilo.
          */}
          {elemento.estiloNombradoId && (() => {
            const estiloActual = documento.estilosGuardados.find((es) => es.id === elemento.estiloNombradoId);
            if (!estiloActual) return null;
            return (
              <div className={editorStyles.panelFila} style={{ alignItems: 'center' }}>
                <input
                  type="text"
                  value={estiloActual.nombre}
                  onChange={(e) => ejecutar((doc) => renombrarEstiloNombrado(doc, estiloActual.id, e.target.value))}
                  style={{ flex: 1 }}
                  title="Renombrar este estilo — afecta a todos los elementos que lo usan"
                />
                <button
                  className={editorStyles.miniBtn}
                  onClick={() => ejecutar((doc) => eliminarEstiloNombrado(doc, estiloActual.id))}
                  title="Eliminar este estilo — los elementos que lo usan vuelven a su estilo propio, no se rompen"
                >
                  ✕
                </button>
              </div>
            );
          })()}
          {elemento.estiloNombradoId && Object.keys(elemento.estilo).length > 0 && (
            <button className={editorStyles.btnPanel} onClick={() => ejecutar((doc) => sincronizarEstiloConNombrado(doc, elemento.id))}>
              Guardar estos ajustes en el estilo
            </button>
          )}
          <div className={editorStyles.panelFila}>
            <input type="text" placeholder="Nombre del estilo nuevo" value={nombreEstiloNuevo} onChange={(e) => setNombreEstiloNuevo(e.target.value)} />
            <button className={editorStyles.btnPanel} onClick={() => guardarComoEstiloNuevo(elemento.id)} disabled={!nombreEstiloNuevo.trim()}>Guardar como nuevo</button>
          </div>
        </div>
        <p className={editorStyles.panelTituloSeccion}>Estilo</p>
        {panelEstiloDe(elemento)}
      </>
    );
  }

  return (
    <div className={`${editorStyles.raiz} ${modoImpresion ? editorStyles.modoImpresion : ''}`}>
      <div className={editorStyles.barraSuperior}>
        <button className={styles.btn} onClick={alPulsarVolver}>← Volver</button>
        <input className={editorStyles.titulo} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título del documento" />
        {!esPlantilla && precioVinculado !== undefined && (
          <label
            title="El precio del presupuesto — se guarda solo, igual que el título. No hace falta tocar el lienzo para nada."
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#eaf3ee',
              border: '1px solid #3d7a52', borderRadius: 6, padding: '0.25rem 0.55rem', fontSize: '0.8rem', fontWeight: 600, color: '#245134',
            }}
          >
            💶 Precio total
            <input
              type="number"
              min={0}
              step="0.01"
              value={precioTotalTexto}
              onChange={(e) => {
                setPrecioTotalTexto(e.target.value);
                const n = Number(e.target.value);
                if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= 0) setPrecioTotal(n);
              }}
              onBlur={() => setPrecioTotalTexto(String(precioTotal))}
              style={{ width: '6.5rem', border: '1px solid #3d7a52', borderRadius: 4, padding: '0.15rem 0.35rem', fontSize: '0.85rem', fontWeight: 600, color: '#245134' }}
            />
            €
          </label>
        )}
        {onCambiarCliente && clientesDisponibles ? (
          <button
            className={styles.btn}
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
            onClick={() => { setClienteElegidoIdNuevo(clienteId); setErrorCambiarCliente(''); setPanelClienteAbierto(true); }}
            title="Cambiar a qué cliente pertenece este presupuesto"
          >
            👤 {clienteNombre} ✎
          </button>
        ) : (
          <span style={{ fontSize: '0.75rem', color: 'var(--topo-claro)' }}>{clienteNombre}</span>
        )}
        <div style={{ flex: 1 }} />
        {/* Solo visibles en pantallas estrechas (ver CSS) — en escritorio
            ambos paneles ya están siempre a la vista. */}
        <button className={editorStyles.btnPanelMovil} onClick={() => setPanelMovilAbierto((v) => (v === 'izquierdo' ? 'ninguno' : 'izquierdo'))}>📑 Páginas</button>
        <button className={editorStyles.btnPanelMovil} onClick={() => setPanelMovilAbierto((v) => (v === 'derecho' ? 'ninguno' : 'derecho'))}>⚙️ Propiedades</button>
        <button className={editorStyles.btnPanelMovil} onClick={() => setHerramientasAbiertas((v) => !v)}>{herramientasAbiertas ? '🛠️ Ocultar herramientas' : '🛠️ Herramientas'}</button>
        {error && <span style={{ color: 'var(--rojo, #c0392b)', fontSize: '0.78rem' }}>{error}</span>}
        {!error && estadoGuardado === 'pendiente' && <span style={{ color: 'var(--topo-claro)', fontSize: '0.78rem' }}>Cambios sin guardar…</span>}
        <button className={styles.btn} onClick={() => tutorialEditor.abrir(TUTORIAL_EDITOR)} title="Cómo funciona el editor">? Tutorial</button>
        <button className={styles.btn} onClick={() => guardarAhora()} disabled={guardando} data-tutorial-id="editor-guardar-btn">{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>

      <div
        className={`${editorStyles.barraHerramientas} ${!herramientasAbiertas ? editorStyles.barraHerramientasCerrada : ''}`}
        data-tutorial-id="editor-barra-herramientas"
      >
        {listarTiposRenderInsertables().map((t) => (
          <button key={t.tipo} className={editorStyles.btnHerramienta} onClick={() => insertarElemento(t.tipo)}>+ {t.etiqueta}</button>
        ))}
        <div className={editorStyles.separador} />
        <button className={editorStyles.btnHerramienta} onClick={deshacer} disabled={pasado.length === 0}>↶ Deshacer</button>
        <button className={editorStyles.btnHerramienta} onClick={rehacer} disabled={futuro.length === 0}>↷ Rehacer</button>
        <div className={editorStyles.separador} />
        <button
          className={editorStyles.btnHerramienta}
          style={seleccionMultipleActiva ? { background: 'var(--topo-tinte)', borderColor: 'var(--topo)' } : undefined}
          onClick={() => setSeleccionMultipleActiva((v) => !v)}
          title="Con esto activado, cada elemento que toques se añade a la selección en vez de sustituirla — útil en móvil/tablet, donde no existe la tecla Shift."
        >
          {seleccionMultipleActiva ? '✓ Selección múltiple' : 'Selección múltiple'}
        </button>
        <div className={editorStyles.separador} />
        <button className={editorStyles.btnHerramienta} onClick={duplicarSeleccionActual} disabled={seleccion.length === 0}>Duplicar</button>
        <button className={editorStyles.btnHerramienta} onClick={eliminarSeleccionActual} disabled={seleccion.length === 0}>Eliminar</button>
        <button className={editorStyles.btnHerramienta} onClick={() => bloquearSeleccionActual(!bloqueadoSeleccion)} disabled={seleccion.length === 0}>{bloqueadoSeleccion ? 'Desbloquear' : 'Bloquear'}</button>
        <div className={editorStyles.separador} />
        <button className={editorStyles.btnHerramienta} onClick={agruparSeleccionActual} disabled={seleccion.length < 2}>Agrupar</button>
        <button className={editorStyles.btnHerramienta} onClick={desagruparSeleccionActual} disabled={!elementoUnicoSeleccionado?.grupoId}>Desagrupar</button>
        <div className={editorStyles.separador} />
        <button className={editorStyles.btnHerramienta} onClick={() => cambiarCapaSeleccionActual('frente')} disabled={seleccion.length !== 1}>Traer al frente</button>
        <button className={editorStyles.btnHerramienta} onClick={() => cambiarCapaSeleccionActual('fondo')} disabled={seleccion.length !== 1}>Enviar al fondo</button>
        <div className={editorStyles.separador} />
        <button className={editorStyles.btnHerramienta} onClick={() => alinearSeleccionActual('izquierda')} disabled={seleccion.length < 2}>Alinear izq.</button>
        <button className={editorStyles.btnHerramienta} onClick={() => alinearSeleccionActual('centroH')} disabled={seleccion.length < 2}>Centrar H</button>
        <button className={editorStyles.btnHerramienta} onClick={() => alinearSeleccionActual('derecha')} disabled={seleccion.length < 2}>Alinear der.</button>
        <button className={editorStyles.btnHerramienta} onClick={() => distribuirSeleccionActual('horizontal')} disabled={seleccion.length < 3}>Distribuir</button>
        <div className={editorStyles.separador} />
        <button className={editorStyles.btnHerramienta} onClick={() => setPanelTemaAbierto((v) => !v)}>🎨 Tema y estilos</button>
        <button
          className={editorStyles.btnHerramienta}
          onClick={() => { if (esPlantilla) setNombrePlantillaNueva(titulo); setPanelPlantillaAbierto(true); }}
        >
          {esPlantilla ? '📄 Actualizar plantilla' : '📄 Guardar como plantilla'}
        </button>
        <div className={editorStyles.separador} />
        <button className={editorStyles.btnHerramienta} onClick={abrirSelectorComponentes}>🧩 Insertar componente</button>
        <button className={editorStyles.btnHerramienta} onClick={() => setPanelGuardarComponenteAbierto(true)} disabled={seleccion.length === 0}>Guardar selección como componente</button>
        <button className={editorStyles.btnHerramienta} onClick={desvincularSeleccionActual} disabled={elementoUnicoSeleccionado?.tipo !== 'instanciaComponente'}>Desvincular</button>
        <div className={editorStyles.separador} />
        <button className={editorStyles.btnHerramienta} onClick={exportarPDF}>🖨️ Exportar a PDF</button>
        <div className={editorStyles.separador} />
        <button
          className={editorStyles.btnHerramienta}
          style={panelIaPresupuestoAbierto ? { background: 'var(--topo-tinte)', borderColor: 'var(--topo)' } : undefined}
          onClick={() => setPanelIaPresupuestoAbierto((v) => !v)}
          data-tutorial-id="editor-ia-btn"
        >
          ✨ IA del presupuesto
        </button>
      </div>

      {selectorComponentesAbierto && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSelectorComponentesAbierto(false)}>
          <div style={{ background: 'var(--fondo-panel)', borderRadius: 10, padding: '1.25rem', minWidth: 300, maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>Insertar componente</p>
            {[...componentesCache.values()].length === 0 && <p className={editorStyles.panelNota}>Todavía no hay ningún componente guardado. Selecciona uno o varios elementos y usa "Guardar selección como componente".</p>}
            {[...componentesCache.values()].map((c) => (
              <button key={c.id} className={styles.btn} style={{ textAlign: 'left', fontSize: '0.8rem' }} onClick={() => insertarComponente(c)}>{c.nombre} <span style={{ color: 'var(--topo-claro)' }}>· {c.tipo}</span></button>
            ))}
            <button className={styles.btn} style={{ alignSelf: 'flex-end' }} onClick={() => setSelectorComponentesAbierto(false)}>Cerrar</button>
          </div>
        </div>
      )}

      {panelGuardarComponenteAbierto && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPanelGuardarComponenteAbierto(false)}>
          <div style={{ background: 'var(--fondo-panel)', borderRadius: 10, padding: '1.25rem', minWidth: 300, display: 'flex', flexDirection: 'column', gap: '0.7rem' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>Guardar selección como componente</p>
            <p className={editorStyles.panelNota}>{seleccion.length} elemento{seleccion.length !== 1 ? 's' : ''} seleccionado{seleccion.length !== 1 ? 's' : ''}. Quedará disponible en "Insertar componente" para reutilizarlo en cualquier documento.</p>
            <label className={editorStyles.panelCampo}>
              Nombre
              <input type="text" value={nombreComponenteNuevo} onChange={(e) => setNombreComponenteNuevo(e.target.value)} placeholder="Ej. Cabecera con logo y datos" />
            </label>
            <label className={editorStyles.panelCampo}>
              Tipo
              <select value={tipoComponenteNuevo} onChange={(e) => setTipoComponenteNuevo(e.target.value as ComponenteMC['tipo'])}>
                <option value="cabecera">Cabecera</option>
                <option value="pie">Pie</option>
                <option value="firma">Firma</option>
                <option value="condiciones">Condiciones</option>
                <option value="bloqueCorporativo">Bloque corporativo</option>
                <option value="libre">Libre</option>
              </select>
            </label>
            {avisoComponente && <p className={editorStyles.panelNota}>{avisoComponente}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className={styles.btn} onClick={() => setPanelGuardarComponenteAbierto(false)}>Cancelar</button>
              <button className={styles.btn} onClick={guardarComoComponente} disabled={!nombreComponenteNuevo.trim()}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {panelPlantillaAbierto && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPanelPlantillaAbierto(false)}>
          <div style={{ background: 'var(--fondo-panel)', borderRadius: 10, padding: '1.25rem', minWidth: 300, display: 'flex', flexDirection: 'column', gap: '0.7rem' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>{esPlantilla ? 'Actualizar esta plantilla' : 'Guardar como plantilla'}</p>
            <p className={editorStyles.panelNota}>
              {esPlantilla
                ? 'Se sobrescribe esta misma plantilla con el contenido actual (incluidas variables como '
                : 'Se guarda el documento tal como está ahora (incluidas variables como '}
              <code>{'{{cliente.nombre}}'}</code>
              {esPlantilla ? ' si las has escrito).' : ' si las has escrito) como una plantilla reutilizable.'}
            </p>
            <label className={editorStyles.panelCampo}>
              Nombre
              <input type="text" value={nombrePlantillaNueva} onChange={(e) => setNombrePlantillaNueva(e.target.value)} placeholder="Ej. Presupuesto cocina estándar" />
            </label>
            <label className={editorStyles.panelCampo}>
              Ámbito
              <select value={ambitoPlantillaNueva} onChange={(e) => setAmbitoPlantillaNueva(e.target.value as 'usuario' | 'corporativa')}>
                <option value="usuario">Personal</option>
                <option value="corporativa">Corporativa (toda la empresa)</option>
              </select>
            </label>
            {avisoPlantilla && <p className={editorStyles.panelNota}>{avisoPlantilla}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className={styles.btn} onClick={() => setPanelPlantillaAbierto(false)}>Cancelar</button>
              <button className={styles.btn} onClick={guardarComoPlantilla} disabled={!nombrePlantillaNueva.trim() || guardandoPlantilla}>
                {guardandoPlantilla ? 'Guardando…' : esPlantilla ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {panelClienteAbierto && clientesDisponibles && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPanelClienteAbierto(false)}>
          <div style={{ background: 'var(--fondo-panel)', borderRadius: 10, padding: '1.25rem', minWidth: 300, display: 'flex', flexDirection: 'column', gap: '0.7rem' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>Cambiar cliente de este presupuesto</p>
            <p className={editorStyles.panelNota}>Este presupuesto pasará a pertenecer al cliente que elijas — dejará de aparecer en la ficha de "{clienteNombre}".</p>
            <label className={editorStyles.panelCampo}>
              Cliente
              <select value={clienteElegidoIdNuevo} onChange={(e) => setClienteElegidoIdNuevo(e.target.value)}>
                {clientesDisponibles.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
            {errorCambiarCliente && <p className={editorStyles.panelNota} style={{ color: 'var(--rojo, #c0392b)' }}>{errorCambiarCliente}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className={styles.btn} onClick={() => setPanelClienteAbierto(false)}>Cancelar</button>
              <button className={styles.btn} onClick={cambiarCliente} disabled={!clienteElegidoIdNuevo || clienteElegidoIdNuevo === clienteId || cambiandoCliente}>
                {cambiandoCliente ? 'Cambiando…' : 'Cambiar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bibliotecaAbierta && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setBibliotecaAbierta(false)}>
          <div style={{ background: 'var(--fondo-panel)', borderRadius: 10, padding: '1.25rem', minWidth: 340, maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.7rem' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>Biblioteca de recursos</p>
            {recursosBiblioteca.length === 0 && <p className={editorStyles.panelNota}>Todavía no hay ningún recurso guardado. Sube una imagen desde el panel de propiedades y quedará disponible aquí para reutilizarla.</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {recursosBiblioteca.map((r) => (
                <button key={r.id} type="button" onClick={() => elegirRecursoDeBiblioteca(r)} style={{ border: '1px solid var(--borde)', borderRadius: 6, padding: '0.3rem', background: 'var(--fondo-panel)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'center' }} title={r.nombre}>
                  <img src={r.url} alt={r.nombre} style={{ width: '100%', height: 60, objectFit: 'contain' }} />
                  <span style={{ fontSize: '0.65rem', color: 'var(--topo-claro)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{r.nombre}</span>
                </button>
              ))}
            </div>
            <button className={styles.btn} style={{ alignSelf: 'flex-end' }} onClick={() => setBibliotecaAbierta(false)}>Cerrar</button>
          </div>
        </div>
      )}

      {panelTemaAbierto && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPanelTemaAbierto(false)}>
          <div style={{ background: 'var(--fondo-panel)', borderRadius: 10, padding: '1.25rem', minWidth: 320, maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.8rem' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>Tema del documento</p>
            {(() => {
              const temaEfectivo: TemaMC = documento.tema ?? empresa.temaPorDefecto ?? TEMA_POR_DEFECTO;
              const actualizarColor = (clave: keyof TemaMC['colores'], valor: string) =>
                ejecutar((doc) => establecerTema(doc, { ...temaEfectivo, colores: { ...temaEfectivo.colores, [clave]: valor } }));
              const actualizarTipografia = (clave: keyof TemaMC['tipografias'], valor: string) =>
                ejecutar((doc) => establecerTema(doc, { ...temaEfectivo, tipografias: { ...temaEfectivo.tipografias, [clave]: valor } }));
              return (
                <div className={editorStyles.panelSeccion}>
                  {!documento.tema && <p className={editorStyles.panelNota}>Usando el tema por defecto de la empresa. Cambiar cualquier valor crea uno propio para este documento.</p>}
                  <div className={editorStyles.panelFila}>
                    <label className={editorStyles.panelCampo}>Primario<input type="color" value={temaEfectivo.colores.primario} onChange={(e) => actualizarColor('primario', e.target.value)} /></label>
                    <label className={editorStyles.panelCampo}>Secundario<input type="color" value={temaEfectivo.colores.secundario} onChange={(e) => actualizarColor('secundario', e.target.value)} /></label>
                  </div>
                  <div className={editorStyles.panelFila}>
                    <label className={editorStyles.panelCampo}>Fondo<input type="color" value={temaEfectivo.colores.fondo} onChange={(e) => actualizarColor('fondo', e.target.value)} /></label>
                    <label className={editorStyles.panelCampo}>Texto<input type="color" value={temaEfectivo.colores.texto} onChange={(e) => actualizarColor('texto', e.target.value)} /></label>
                  </div>
                  <label className={editorStyles.panelCampo}>Fuente de títulos
                    <select value={temaEfectivo.tipografias.titulos} onChange={(e) => actualizarTipografia('titulos', e.target.value)}>
                      <option value="Georgia">Georgia</option>
                      <option value="Arial">Arial</option>
                      <option value="'Times New Roman'">Times New Roman</option>
                    </select>
                  </label>
                  <label className={editorStyles.panelCampo}>Fuente de cuerpo
                    <select value={temaEfectivo.tipografias.cuerpo} onChange={(e) => actualizarTipografia('cuerpo', e.target.value)}>
                      <option value="Arial">Arial</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Verdana">Verdana</option>
                    </select>
                  </label>
                  {documento.tema && (
                    <button className={editorStyles.btnPanel} onClick={() => ejecutar((doc) => establecerTema(doc, null))}>Volver al tema de la empresa</button>
                  )}
                </div>
              );
            })()}

            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>Estilos guardados</p>
            {documento.estilosGuardados.length === 0 && <p className={editorStyles.panelNota}>Todavía no hay ningún estilo guardado — se crean desde el panel de propiedades de un elemento de texto.</p>}
            {documento.estilosGuardados.map((es) => (
              <div key={es.id} className={editorStyles.panelFila} style={{ alignItems: 'center' }}>
                <input type="text" value={es.nombre} onChange={(e) => ejecutar((doc) => renombrarEstiloNombrado(doc, es.id, e.target.value))} style={{ flex: 1 }} />
                <button className={editorStyles.miniBtn} onClick={() => ejecutar((doc) => eliminarEstiloNombrado(doc, es.id))} title="Eliminar estilo">✕</button>
              </div>
            ))}

            <button className={styles.btn} style={{ alignSelf: 'flex-end' }} onClick={() => setPanelTemaAbierto(false)}>Cerrar</button>
          </div>
        </div>
      )}

      <div className={editorStyles.cuerpo}>
        <div
          className={`${editorStyles.panelIzquierdo} ${panelMovilAbierto === 'izquierdo' ? editorStyles.panelMovilAbierto : ''}`}
          style={{ ['--ancho-panel-izquierdo' as string]: `${anchoPanelIzquierdo}px` } as CSSProperties}
        >
          <button className={editorStyles.btnCerrarPanelMovil} onClick={() => setPanelMovilAbierto('ninguno')}>✕ Cerrar</button>
          <p className={editorStyles.panelTituloSeccion}>Páginas</p>
          {documento.paginas.map((p, i) => (
            <div key={p.id} className={`${editorStyles.paginaFila} ${p.id === paginaActivaId ? editorStyles.paginaFilaActiva : ''}`} onClick={() => setPaginaActivaId(p.id)}>
              <span>{p.nombre || `Página ${i + 1}`}</span>
              <div className={editorStyles.paginaFilaAcciones}>
                <button className={editorStyles.miniBtn} onClick={(e) => { e.stopPropagation(); moverPaginaActual(p.id, 'arriba'); }} disabled={i === 0} title="Subir página">↑</button>
                <button className={editorStyles.miniBtn} onClick={(e) => { e.stopPropagation(); moverPaginaActual(p.id, 'abajo'); }} disabled={i === documento.paginas.length - 1} title="Bajar página">↓</button>
                <button className={editorStyles.miniBtn} onClick={(e) => { e.stopPropagation(); duplicarPaginaActual(p.id); }} title="Duplicar página">⧉</button>
                {documento.paginas.length > 1 && <button className={editorStyles.miniBtn} onClick={(e) => { e.stopPropagation(); eliminarPaginaActual(p.id); }} title="Eliminar página">✕</button>}
              </div>
            </div>
          ))}
          <button className={editorStyles.btnPanel} onClick={anadirPaginaActual}>+ Añadir página</button>

          <p className={editorStyles.panelTituloSeccion}>Fondo de la página</p>
          <div className={editorStyles.panelSeccion}>
            {paginaActiva.fondo?.tipo === 'imagen' && paginaActiva.fondo.imagenUrl && (
              <img src={paginaActiva.fondo.imagenUrl} alt="Fondo de la página" style={{ width: '100%', borderRadius: 6, border: '1px solid var(--borde)' }} />
            )}
            <label className={editorStyles.btnPanel} style={{ textAlign: 'center', cursor: 'pointer' }}>
              {paginaActiva.fondo?.tipo === 'imagen' ? 'Sustituir imagen de fondo' : 'Subir imagen de fondo'}
              <input
                type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) subirFondoPaginaActiva(f); e.target.value = ''; }}
              />
            </label>
            {paginaActiva.fondo?.tipo === 'imagen' && paginaActiva.fondo.imagenUrl && (
              // Antes se subía siempre con `ajuste: 'cubrir'` fijo y no había
              // forma de cambiarlo — el dato ya existía en el modelo
              // (`FondoMC.ajuste`), solo faltaba este control (24/08/2026).
              <label className={editorStyles.panelCampo}>
                Ajuste de la imagen
                <select
                  value={paginaActiva.fondo.ajuste ?? 'cubrir'}
                  onChange={(e) => {
                    const fondoActual = paginaActiva.fondo;
                    if (!fondoActual) return;
                    ejecutar((doc) => establecerFondoPagina(doc, paginaActivaId, { ...fondoActual, ajuste: e.target.value as FondoMC['ajuste'] }));
                  }}
                >
                  <option value="cubrir">Cubrir (recorta para llenar toda la página)</option>
                  <option value="contener">Contener (se ve entera, puede dejar márgenes)</option>
                  <option value="mosaico">Mosaico (se repite en su tamaño real)</option>
                </select>
              </label>
            )}
            {paginaActiva.fondo?.tipo === 'imagen' && (
              <button className={editorStyles.btnPanel} onClick={quitarFondoPaginaActiva}>Quitar fondo</button>
            )}
            <p className={editorStyles.panelNota}>Útil para partir de una plantilla en papel escaneada: sube la imagen como fondo y añade encima los campos que quieras que sean editables.</p>
          </div>

          <p className={editorStyles.panelTituloSeccion}>Capas</p>
          {[...paginaActiva.elementos].sort((a, b) => b.capa - a.capa).map((el) => (
            <div key={el.id} className={`${editorStyles.capaFila} ${seleccion.includes(el.id) ? editorStyles.capaFilaActiva : ''}`} onClick={() => seleccionarElemento(el.id, { paginaId: paginaActiva.id })}>
              <span>{obtenerTipoRender(el.tipo).etiqueta}</span>
              {el.bloqueado && <span title="Bloqueado">🔒</span>}
            </div>
          ))}
          {paginaActiva.elementos.length === 0 && <p className={editorStyles.panelNota}>Sin elementos en esta página.</p>}
          <div
            className={editorStyles.asaRedimensionarPanel}
            onPointerDown={(e) => iniciarRedimensionPanel('izquierdo', e)}
            title="Arrastrar para cambiar el ancho del panel"
          />
        </div>

        <div ref={lienzoContenedorRef} className={editorStyles.lienzoContenedor} onMouseDown={() => { limpiarSeleccion(); setPanelMovilAbierto('ninguno'); }}>
          {documento.paginas.map((pagina) => {
            const config = pagina.configuracion ?? documento.configuracionPorDefecto;
            const fondo = pagina.fondo;
            const encabezado = resolverZonaEfectiva(pagina.encabezado, documento.encabezadoPorDefecto);
            const pie = resolverZonaEfectiva(pagina.pie, documento.piePorDefecto);
            const estiloFondo: CSSProperties =
              fondo?.tipo === 'imagen' && fondo.imagenUrl
                ? {
                    backgroundImage: `url(${fondo.imagenUrl})`,
                    backgroundSize: fondo.ajuste === 'contener' ? 'contain' : fondo.ajuste === 'mosaico' ? 'auto' : 'cover',
                    backgroundRepeat: fondo.ajuste === 'mosaico' ? 'repeat' : 'no-repeat',
                    backgroundPosition: 'center',
                  }
                : fondo?.tipo === 'color' && fondo.color
                  ? { backgroundColor: fondo.color }
                  : {};
            return (
              <div
                key={pagina.id}
                ref={pagina.id === paginaActivaId ? paginaActivaElRef : undefined}
                className={`${editorStyles.pagina} ${pagina.id === paginaActivaId ? editorStyles.paginaActiva : ''}`}
                style={{ width: config.ancho * zoom, height: config.alto * zoom, ...estiloFondo }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div style={{ width: config.ancho, height: config.alto, transform: `scale(${zoom})`, transformOrigin: 'top left', position: 'relative' }}>
                  {renderZonaDocumento(encabezado, config.ancho, 'arriba')}
                  {pagina.elementos.map((el) => renderElemento(el, pagina))}
                  {renderZonaDocumento(pie, config.ancho, 'abajo')}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className={`${editorStyles.panelDerecho} ${panelMovilAbierto === 'derecho' ? editorStyles.panelMovilAbierto : ''}`}
          style={{ ['--ancho-panel-derecho' as string]: `${anchoPanelDerecho}px` } as CSSProperties}
        >
          <div
            className={`${editorStyles.asaRedimensionarPanel} ${editorStyles.asaRedimensionarPanelIzquierda}`}
            onPointerDown={(e) => iniciarRedimensionPanel('derecho', e)}
            title="Arrastrar para cambiar el ancho del panel"
          />
          <button className={editorStyles.btnCerrarPanelMovil} onClick={() => setPanelMovilAbierto('ninguno')}>✕ Cerrar</button>
          {panelPropiedades()}
        </div>
      </div>

      <PanelIaPresupuesto
        abierto={panelIaPresupuestoAbierto}
        onCerrar={() => setPanelIaPresupuestoAbierto(false)}
        clienteId={clienteId}
        contextoDocumento={extraerContextoDocumento(documento)}
        elementoSeleccionado={elementoUnicoSeleccionado}
        onAplicarPropuesta={(texto) => {
          if (elementoUnicoSeleccionado) ejecutar((doc) => actualizarContenido(doc, elementoUnicoSeleccionado.id, { texto }));
        }}
      />

      <div className={editorStyles.zoomFlotante}>
        <button className={editorStyles.miniBtn} onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))} title="Reducir zoom">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className={editorStyles.miniBtn} onClick={() => setZoom((z) => Math.min(2, z + 0.1))} title="Aumentar zoom">+</button>
        <div className={editorStyles.separador} />
        <button className={editorStyles.miniBtn} onClick={ajustarZoomAVentana} title="Ajustar la hoja a la ventana">⤢ Ajustar</button>
      </div>

      {elementoUnicoSeleccionado && rectBarraFlotante && !elementoUnicoSeleccionado.bloqueado && (
        <div
          className={editorStyles.barraFlotanteFormato}
          style={{ left: rectBarraFlotante.left, top: rectBarraFlotante.top, transform: rectBarraFlotante.abajo ? undefined : 'translateY(-100%)' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {panelEstiloDe(elementoUnicoSeleccionado)}
        </div>
      )}

      {targetsMoveable.length === 1 && !bloqueadoSeleccion && editandoId !== elementoUnicoSeleccionado?.id && elementoUnicoSeleccionado && (
        <Moveable
          // Moveable solo vuelve a medir el target por sí solo cuando el
          // cambio viene de su propio gesto de arrastre/redimensionado —
          // un cambio de posición/tamaño desde OTRO sitio (los campos X/Y/Ancho/Alto
          // del panel, o cualquier comando futuro) lo deja con la caja de
          // selección "congelada" en el sitio antiguo, aunque el elemento
          // real ya se haya movido (fallo real reportado por el usuario:
          // el cuadro de selección aparecía muy por debajo del elemento
          // real tras moverlo desde el panel). Una `key` que cambia con la
          // geometría confirmada del elemento fuerza a Moveable a
          // desmontarse y montarse de nuevo, midiendo siempre la posición
          // real actual, venga el cambio de donde venga.
          key={`${elementoUnicoSeleccionado.id}-${elementoUnicoSeleccionado.posicion.x}-${elementoUnicoSeleccionado.posicion.y}-${elementoUnicoSeleccionado.tamano.ancho}-${elementoUnicoSeleccionado.tamano.alto}`}
          ref={moveableUnicoRef}
          target={targetsMoveable[0]}
          className={editorStyles.moveableControlBox}
          useAccuratePosition
          draggable resizable
          onDrag={onDragUnico}
          onDragEnd={onDragEnd}
          onResize={onResizeUnico}
          onResizeEnd={onResizeEnd}
          throttleDrag={0} throttleResize={0}
          {...propsGuias}
        />
      )}
      {targetsMoveable.length > 1 && !bloqueadoSeleccion && (
        <Moveable
          // Mismo motivo que en el Moveable de un solo elemento — forzar
          // a remedir si la geometría de cualquiera de los seleccionados
          // cambió por un camino que no sea el propio arrastre del grupo
          // (ej. alinear/distribuir).
          key={seleccion.map((id) => {
            const el = localizarElemento(documento, id)?.elemento;
            return el ? `${id}-${el.posicion.x}-${el.posicion.y}` : id;
          }).join('|')}
          ref={moveableGrupoRef}
          target={targetsMoveable}
          className={editorStyles.moveableControlBox}
          useAccuratePosition
          draggable
          onDragGroup={onDragGroupUnico}
          onDragGroupEnd={onDragEnd}
          throttleDrag={0}
          {...propsGuias}
        />
      )}

      <TutorialOverlay
        estado={tutorialEditor.estado}
        onAvanzar={tutorialEditor.avanzar}
        onRetroceder={tutorialEditor.retroceder}
        onCerrar={tutorialEditor.cerrar}
        onObjetivoLocalizado={tutorialEditor.objetivoLocalizado}
        onAccionDetectada={tutorialEditor.accionDetectada}
        seccionActual="editor"
        onNavegar={() => {}}
        menuMovilAbierto={false}
        onAbrirMenuMovil={() => {}}
        onCerrarMenuMovil={() => {}}
      />
    </div>
  );
}
