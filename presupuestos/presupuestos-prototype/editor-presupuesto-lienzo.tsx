import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Excalidraw, convertToExcalidrawElements, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI, AppState } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement, ExcalidrawFrameElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';
import type { PresupuestoMC } from './presupuestos-modelo.js';
import type { Empresa } from './use-empresa.js';
import { generarId } from './mock.js';
import { leerArchivoComoBase64 } from './archivos.js';
import { comprimirImagen } from './procesamiento-imagenes.js';
import { formatoEuro } from './calculos.js';
import * as api from './api.js';
import styles from './styles.module.css';

// Misma paleta de marca que `styles.module.css` (`--negro`/`--topo`/
// `--topo-claro`/`--ocre`/`--ocre-bg`) — el lienzo es Excalidraw puro (canvas,
// no CSS), así que estos valores no pueden leerse de las custom properties:
// se repiten aquí a propósito para que el membrete y los bloques de cierre
// usen el mismo aspecto de marca que el resto de la aplicación, no el negro
// por defecto de Excalidraw.
const COLOR_NEGRO = '#18140f';
const COLOR_TOPO = '#51483f';
const COLOR_TOPO_CLARO = '#7a7060';
const COLOR_OCRE = '#8a6835';
const COLOR_OCRE_BG = '#f5ede0';

/** Props del editor de presupuesto en modo lienzo (Fase 6). */
export type EditorPresupuestoLienzoProps = {
  /** Presupuesto a editar — `null` para empezar uno nuevo en blanco. */
  presupuesto: PresupuestoMC | null;
  /** Cliente al que pertenece — fijo, no se cambia desde este editor. */
  clienteId: string;
  clienteNombre: string;
  empresa: Empresa;
  onGuardar: (p: PresupuestoMC) => Promise<void>;
  onVolver: () => void;
  /** Persiste un logo nuevo como el de la empresa (clic sobre el logo en el lienzo) — opcional: sin él, el logo solo cambia en este documento. */
  onCambiarLogoEmpresa?: (logo: string) => void;
};

// Dimensiones de una hoja A4 a 96dpi — unidades de escena de Excalidraw
// coinciden 1:1 con px CSS a zoom 1, así que sirven de referencia visual
// directa sin necesidad de ninguna conversión.
const ANCHO_HOJA = 794;
const ALTO_HOJA = 1123;
const ESPACIO_ENTRE_HOJAS = 60;
const MARGEN_HOJA = 56;

type HerramientaLienzo = 'selection' | 'freedraw' | 'text';

/** Detecta si un elemento es una hoja (frame) — helper de tipo para filtrar `getSceneElements()`. */
function esFrame(e: ExcalidrawElement): e is ExcalidrawFrameElement {
  return e.type === 'frame';
}

/** Marca en `customData` el elemento de imagen del logo — permite detectarlo al seleccionarlo y ofrecer "Cambiar logo" sin salir del lienzo. */
const CUSTOM_DATA_LOGO = { mcLogo: true };

/**
 * Construye la primera hoja de un presupuesto nuevo — plantilla por defecto
 * completa (Fase 6, corrección explícita del usuario tras ver un ejemplo
 * real de sus propios presupuestos): cabecera con logo/fecha, datos de
 * empresa/cliente, cuadro de partidas con una línea de ejemplo rellenable,
 * fila de total, notas, bloque de forma de pago con IBAN y firmas. El
 * usuario edita cada texto directamente sobre el lienzo (duplicando la
 * línea de ejemplo para más partidas) y puede añadir más hojas sin membrete
 * con el botón "Añadir hoja".
 */
function construirPrimeraHoja(
  empresa: Empresa, clienteNombre: string, precioTotal: number, condicionesPago: string, validezDias: number
): { elements: ExcalidrawElement[]; files: Record<string, any> } {
  const frameId = generarId();
  const files: Record<string, any> = {};
  const IZQ = MARGEN_HOJA;
  const DER = ANCHO_HOJA - MARGEN_HOJA;
  const ANCHO_CONTENIDO = DER - IZQ;
  const skeleton: any[] = [
    { type: 'frame', id: frameId, children: [], name: 'Hoja 1', x: 0, y: 0, width: ANCHO_HOJA, height: ALTO_HOJA },
  ];

  // ── Cabecera: logo (clicable, ver customData.mcLogo) + PREVENTIVO + fecha ──
  if (empresa.logo) {
    const fileId = generarId();
    files[fileId] = { id: fileId, dataURL: empresa.logo, mimeType: 'image/png', created: Date.now() };
    skeleton.push({ type: 'image', id: generarId(), fileId, x: IZQ, y: 46, width: 150, height: 78, frameId, customData: CUSTOM_DATA_LOGO });
  }
  const hoy = new Date();
  const fecha = `${String(hoy.getDate()).padStart(2, '0')} / ${String(hoy.getMonth() + 1).padStart(2, '0')} / ${hoy.getFullYear()}`;
  skeleton.push({ type: 'text', id: generarId(), x: 480, y: 52, text: 'PREVENTIVO', fontSize: 22, width: 260, strokeColor: COLOR_NEGRO, frameId });
  skeleton.push({ type: 'text', id: generarId(), x: 480, y: 86, text: `Fecha: ${fecha}`, fontSize: 13, width: 260, strokeColor: COLOR_TOPO_CLARO, frameId });
  skeleton.push({ type: 'line', id: generarId(), x: IZQ, y: 145, points: [[0, 0], [ANCHO_CONTENIDO, 0]], strokeColor: COLOR_TOPO, frameId });

  // ── Datos de empresa / cliente, dos columnas ──
  const COL2 = 420;
  skeleton.push({ type: 'text', id: generarId(), x: IZQ, y: 165, text: empresa.nombre || 'Mi empresa', fontSize: 14, width: COL2 - IZQ - 20, strokeColor: COLOR_NEGRO, frameId });
  skeleton.push({ type: 'text', id: generarId(), x: IZQ, y: 190, text: `Tel: ${empresa.telefono || '—'}`, fontSize: 12, width: COL2 - IZQ - 20, strokeColor: COLOR_TOPO, frameId });
  skeleton.push({ type: 'text', id: generarId(), x: IZQ, y: 210, text: `Email: ${empresa.email || '—'}`, fontSize: 12, width: COL2 - IZQ - 20, strokeColor: COLOR_TOPO, frameId });
  skeleton.push({ type: 'text', id: generarId(), x: COL2, y: 165, text: 'CLIENTE', fontSize: 14, width: DER - COL2, strokeColor: COLOR_NEGRO, frameId });
  skeleton.push({ type: 'text', id: generarId(), x: COL2, y: 190, text: `Nombre: ${clienteNombre}`, fontSize: 12, width: DER - COL2, strokeColor: COLOR_TOPO, frameId });
  skeleton.push({ type: 'line', id: generarId(), x: IZQ, y: 248, points: [[0, 0], [ANCHO_CONTENIDO, 0]], strokeColor: COLOR_TOPO, frameId });

  // ── Cabecera del cuadro de partidas ──
  skeleton.push({ type: 'text', id: generarId(), x: IZQ, y: 268, text: 'PRESUPUESTO', fontSize: 16, width: 260, strokeColor: COLOR_OCRE, frameId });
  skeleton.push({ type: 'text', id: generarId(), x: 430, y: 271, text: 'UDS.', fontSize: 10, width: 50, strokeColor: COLOR_TOPO_CLARO, frameId });
  skeleton.push({ type: 'text', id: generarId(), x: 490, y: 271, text: 'PRECIO UNITARIO', fontSize: 10, width: 130, strokeColor: COLOR_TOPO_CLARO, frameId });
  skeleton.push({ type: 'text', id: generarId(), x: 648, y: 271, text: 'TOTAL', fontSize: 10, width: 90, strokeColor: COLOR_TOPO_CLARO, frameId });

  // ── Cuadro con una partida de ejemplo, rellenable/duplicable ──
  const CAJA_Y = 296;
  const CAJA_ALTO = 470;
  skeleton.push({
    type: 'rectangle', id: generarId(), x: IZQ, y: CAJA_Y, width: ANCHO_CONTENIDO, height: CAJA_ALTO,
    backgroundColor: 'transparent', strokeColor: COLOR_TOPO, roundness: { type: 3 }, frameId,
  });
  const ITEM_Y = CAJA_Y + 22;
  skeleton.push({ type: 'text', id: generarId(), x: IZQ + 20, y: ITEM_Y, text: '1. Concepto del trabajo', fontSize: 14, width: 350, strokeColor: COLOR_NEGRO, frameId });
  skeleton.push({ type: 'text', id: generarId(), x: IZQ + 20, y: ITEM_Y + 26, text: '• Descripción de la partida — edita o duplica esta línea por cada trabajo', fontSize: 11, width: 350, strokeColor: COLOR_TOPO_CLARO, frameId });
  skeleton.push({ type: 'text', id: generarId(), x: 430, y: ITEM_Y, text: '1', fontSize: 13, width: 50, strokeColor: COLOR_NEGRO, frameId });
  skeleton.push({ type: 'text', id: generarId(), x: 490, y: ITEM_Y, text: '0,00 €', fontSize: 13, width: 130, strokeColor: COLOR_NEGRO, frameId });
  skeleton.push({ type: 'text', id: generarId(), x: 648, y: ITEM_Y, text: '0,00 €', fontSize: 13, width: 90, strokeColor: COLOR_NEGRO, frameId });
  skeleton.push({ type: 'line', id: generarId(), x: IZQ + 20, y: ITEM_Y + 66, points: [[0, 0], [ANCHO_CONTENIDO - 40, 0]], strokeColor: '#e5e0d8', frameId });

  // ── Fila de total, dentro del cuadro, pegada abajo ──
  const TOTAL_Y = CAJA_Y + CAJA_ALTO - 46;
  skeleton.push({
    type: 'rectangle', id: generarId(), x: IZQ + 4, y: TOTAL_Y, width: ANCHO_CONTENIDO - 8, height: 40,
    backgroundColor: COLOR_OCRE_BG, strokeColor: 'transparent', roundness: { type: 3 }, frameId,
  });
  skeleton.push({ type: 'text', id: generarId(), x: IZQ + 20, y: TOTAL_Y + 10, text: 'TOTAL PRESUPUESTO', fontSize: 14, width: 300, strokeColor: COLOR_NEGRO, frameId });
  skeleton.push({ type: 'text', id: generarId(), x: 630, y: TOTAL_Y + 8, text: formatoEuro(precioTotal), fontSize: 16, width: 100, strokeColor: COLOR_NEGRO, frameId });

  // ── Notas bajo el cuadro ──
  const NOTA_Y = CAJA_Y + CAJA_ALTO + 24;
  skeleton.push({ type: 'text', id: generarId(), x: IZQ, y: NOTA_Y, text: '• Cualquier trabajo adicional o imprevisto será presupuestado antes de realizarse.', fontSize: 11, width: ANCHO_CONTENIDO, strokeColor: COLOR_TOPO, frameId });
  skeleton.push({ type: 'text', id: generarId(), x: IZQ, y: NOTA_Y + 20, text: `• Validez del presupuesto: ${validezDias} días desde la fecha indicada.`, fontSize: 11, width: ANCHO_CONTENIDO, strokeColor: COLOR_TOPO, frameId });

  const elementosBase = convertToExcalidrawElements(skeleton);

  // ── Forma de pago + firmas — mismo bloque reutilizable que el botón de la barra de herramientas ──
  const cierre = construirBloqueCierre(empresa.nombre, clienteNombre, condicionesPago, empresa.iban, ANCHO_HOJA / 2, NOTA_Y + 60, frameId);

  return { elements: [...elementosBase, ...cierre], files };
}

/**
 * Bloque "precio destacado" — rectángulo con relleno ocre y el precio
 * centrado dentro, mismo tratamiento visual que las cajas de precio del
 * presupuesto de referencia del usuario (fondo de color, texto en negrita).
 * `label` (API de Excalidraw) crea el texto ya envuelto y centrado dentro
 * del rectángulo automáticamente — no hace falta posicionarlo a mano.
 */
function construirBloquePrecio(precioTotal: number, ox: number, oy: number, frameId: string | null): ExcalidrawElement[] {
  const ANCHO = 340;
  const ALTO = 64;
  const skeleton: any[] = [
    {
      type: 'rectangle', id: generarId(), x: ox - ANCHO / 2, y: oy - ALTO / 2, width: ANCHO, height: ALTO,
      backgroundColor: COLOR_OCRE_BG, strokeColor: COLOR_OCRE, roundness: { type: 3 }, frameId,
      label: { text: `Precio total: ${formatoEuro(precioTotal)}`, fontSize: 18, strokeColor: COLOR_OCRE, textAlign: 'center', verticalAlign: 'middle' },
    },
  ];
  return convertToExcalidrawElements(skeleton);
}

/**
 * Bloque de cierre — condiciones de pago + IBAN dentro de un recuadro, y dos
 * líneas de firma (empresa / cliente) debajo, mismo contenido que la última
 * página del presupuesto de referencia del usuario ("METODO DEL PAGAMENTO" +
 * firmas). Se inserta como bloque independiente (no forma parte automática
 * de ninguna hoja) para que el usuario decida en qué hoja lo quiere — normal
 * en un documento de una sola página tanto como en uno de cinco.
 */
function construirBloqueCierre(
  empresaNombre: string, clienteNombre: string, condicionesPago: string, iban: string,
  ox: number, oy: number, frameId: string | null
): ExcalidrawElement[] {
  const ANCHO = 660;
  const anchoFirma = 220;
  const x = ox - ANCHO / 2;
  const y = oy;
  const textoCondiciones = iban ? `${condicionesPago}\nIBAN: ${iban}` : condicionesPago;
  const skeleton: any[] = [
    { type: 'text', id: generarId(), x, y, text: 'MÉTODO DE PAGO', fontSize: 15, strokeColor: COLOR_OCRE, frameId },
    {
      type: 'rectangle', id: generarId(), x, y: y + 26, width: ANCHO, height: 90,
      backgroundColor: 'transparent', strokeColor: COLOR_TOPO, roundness: { type: 3 }, frameId,
      label: { text: textoCondiciones, fontSize: 14, strokeColor: COLOR_NEGRO, textAlign: 'left', verticalAlign: 'middle' },
    },
    { type: 'text', id: generarId(), x, y: y + 150, text: `Firma ${empresaNombre || 'empresa'}`, fontSize: 13, strokeColor: COLOR_TOPO_CLARO, frameId },
    { type: 'line', id: generarId(), x, y: y + 180, points: [[0, 0], [anchoFirma, 0]], strokeColor: COLOR_TOPO, frameId },
    { type: 'text', id: generarId(), x: x + ANCHO - anchoFirma, y: y + 150, text: `Firma ${clienteNombre}`, fontSize: 13, strokeColor: COLOR_TOPO_CLARO, frameId },
    { type: 'line', id: generarId(), x: x + ANCHO - anchoFirma, y: y + 180, points: [[0, 0], [anchoFirma, 0]], strokeColor: COLOR_TOPO, frameId },
  ];
  return convertToExcalidrawElements(skeleton);
}

/** Construye una hoja adicional (sin membrete) debajo de la última existente. */
function construirHojaSiguiente(elementosActuales: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  const frames = elementosActuales.filter(esFrame);
  const y = frames.length > 0 ? Math.max(...frames.map((f) => f.y + f.height)) + ESPACIO_ENTRE_HOJAS : 0;
  const skeleton: any[] = [
    { type: 'frame', id: generarId(), children: [], name: `Hoja ${frames.length + 1}`, x: 0, y, width: ANCHO_HOJA, height: ALTO_HOJA },
  ];
  return convertToExcalidrawElements(skeleton);
}

/** Envía un atajo de teclado sintético al contenedor real de Excalidraw (deshacer/rehacer/zoom) — mismo mecanismo que editor-dibujo.tsx. */
function atajoTeclado(key: string, opts: { ctrl?: boolean; shift?: boolean } = {}) {
  const contenedor = document.querySelector<HTMLElement>(`.${styles.editorDibujoLienzo} .excalidraw`) ?? document;
  contenedor.dispatchEvent(new KeyboardEvent('keydown', {
    key, code: key === '=' ? 'Equal' : key === '-' ? 'Minus' : undefined,
    ctrlKey: !!opts.ctrl, metaKey: !!opts.ctrl, shiftKey: !!opts.shift, bubbles: true, cancelable: true,
  }));
}

/**
 * Editor de presupuestos en modo lienzo (Fase 6) — hojas libres inspiradas
 * en el mismo motor Excalidraw que la Pizarra de medición (`editor-dibujo.tsx`),
 * pero sin sistema de cotas: cada hoja es un `frame` nativo de Excalidraw, el
 * usuario coloca texto, dibujo libre, fotos y archivos donde quiera, y añade
 * tantas hojas como necesite — solo la primera lleva el membrete de empresa.
 */
export function EditorPresupuestoLienzo({ presupuesto, clienteId, clienteNombre, empresa, onGuardar, onVolver, onCambiarLogoEmpresa }: EditorPresupuestoLienzoProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const raizRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const inputImagenRef = useRef<HTMLInputElement>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [herramientasAbiertas, setHerramientasAbiertas] = useState(true);
  const [titulo, setTitulo] = useState(presupuesto?.titulo ?? 'Presupuesto sin título');
  const [herramienta, setHerramienta] = useState<HerramientaLienzo>('selection');
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [precioTotal, setPrecioTotal] = useState(String(presupuesto?.precioTotal ?? 0));
  const [condicionesAbiertas, setCondicionesAbiertas] = useState(false);
  const [condicionesPago, setCondicionesPago] = useState(presupuesto?.condicionesPago || empresa.condicionesPagoDefecto);
  const [validezDias, setValidezDias] = useState(String(presupuesto?.validezDias ?? empresa.validezDiasDefecto));
  const [condicionesGenerales, setCondicionesGenerales] = useState(presupuesto?.condicionesGenerales ?? '');

  const [redactarAbierto, setRedactarAbierto] = useState(false);
  const [redactarNotas, setRedactarNotas] = useState('');
  const [redactando, setRedactando] = useState(false);
  const [redactarError, setRedactarError] = useState<string | null>(null);

  // Elemento "archivo" (no imagen) actualmente seleccionado en el lienzo —
  // se muestra un panel contextual con "Abrir archivo", mismo patrón que el
  // panel de edición de longitud de una cota en editor-dibujo.tsx.
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<{ nombre: string; url: string } | null>(null);
  const [archivoPanelTop, setArchivoPanelTop] = useState(60);

  // Igual que el archivo seleccionado, pero para el elemento de imagen del
  // logo (marcado con `customData.mcLogo` en construirPrimeraHoja) — permite
  // cambiarlo con un clic sin salir del lienzo, a petición explícita del usuario.
  const [logoSeleccionadoId, setLogoSeleccionadoId] = useState<string | null>(null);
  const [logoPanelTop, setLogoPanelTop] = useState(60);
  const inputLogoRef = useRef<HTMLInputElement>(null);

  const posicionBajoCabecera = () => (headerRef.current?.getBoundingClientRect().bottom ?? 52) + 8;

  const handleApi = useCallback((apiInst: ExcalidrawImperativeAPI) => {
    apiRef.current = apiInst;
    setTimeout(() => apiInst.setActiveTool({ type: 'selection' }), 0);
  }, []);

  const seleccionarHerramienta = (id: HerramientaLienzo) => {
    setHerramienta(id);
    apiRef.current?.setActiveTool({ type: id });
  };

  // Punto central del viewport, en coordenadas de escena — usado para saber
  // en qué hoja insertar una imagen/archivo subidos por botón (a diferencia
  // de texto/dibujo libre, que el propio motor de Excalidraw ya asigna a la
  // hoja donde el usuario dibuja o hace clic).
  const puntoCentroVista = (): { x: number; y: number } | null => {
    const apiInst = apiRef.current;
    const contenedor = document.querySelector<HTMLElement>(`.${styles.editorDibujoLienzo}`);
    if (!apiInst || !contenedor) return null;
    const rect = contenedor.getBoundingClientRect();
    const appState = apiInst.getAppState();
    return viewportCoordsToSceneCoords(
      { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 },
      { zoom: appState.zoom, offsetLeft: rect.left, offsetTop: rect.top, scrollX: appState.scrollX, scrollY: appState.scrollY }
    );
  };

  const frameEnPunto = (p: { x: number; y: number }): ExcalidrawFrameElement | null => {
    const apiInst = apiRef.current;
    if (!apiInst) return null;
    const frames = (apiInst.getSceneElements() as readonly ExcalidrawElement[]).filter(esFrame);
    return frames.find((f) => p.x >= f.x && p.x <= f.x + f.width && p.y >= f.y && p.y <= f.y + f.height) ?? null;
  };

  const anadirHoja = () => {
    const apiInst = apiRef.current;
    if (!apiInst) return;
    const actuales = apiInst.getSceneElements() as readonly ExcalidrawElement[];
    const nuevos = construirHojaSiguiente(actuales);
    apiInst.updateScene({ elements: [...actuales, ...nuevos] });
    apiInst.scrollToContent(nuevos, { fitToContent: true, animate: true });
  };

  const subirImagen = async (files: FileList | null) => {
    const file = files?.[0];
    const apiInst = apiRef.current;
    if (!file || !apiInst) return;
    const { blob } = await comprimirImagen(file);
    const dataURL = await leerArchivoComoBase64(blob);
    const punto = puntoCentroVista();
    if (!punto) return;
    const frame = frameEnPunto(punto);
    const fileId = generarId();
    apiInst.addFiles([{ id: fileId as any, dataURL: dataURL as any, mimeType: blob.type as any, created: Date.now() }]);
    const ancho = 260;
    const alto = 260;
    const skeleton = convertToExcalidrawElements([
      { type: 'image', id: generarId(), fileId: fileId as any, x: punto.x - ancho / 2, y: punto.y - alto / 2, width: ancho, height: alto, frameId: frame?.id ?? null },
    ]);
    apiInst.updateScene({ elements: [...(apiInst.getSceneElements() as ExcalidrawElement[]), ...skeleton] });
  };

  const subirArchivo = async (files: FileList | null) => {
    const file = files?.[0];
    const apiInst = apiRef.current;
    if (!file || !apiInst) return;
    const dataURL = await leerArchivoComoBase64(file);
    const punto = puntoCentroVista();
    if (!punto) return;
    const frame = frameEnPunto(punto);
    const skeleton = convertToExcalidrawElements([
      {
        type: 'text', id: generarId(), x: punto.x, y: punto.y, text: `\u{1F4C4} ${file.name}`, fontSize: 16,
        frameId: frame?.id ?? null,
        customData: { mcArchivo: { nombre: file.name, url: dataURL, tipo: file.type } },
      } as any,
    ]);
    apiInst.updateScene({ elements: [...(apiInst.getSceneElements() as ExcalidrawElement[]), ...skeleton] });
  };

  const insertarTextoIA = (texto: string) => {
    const apiInst = apiRef.current;
    const punto = puntoCentroVista();
    if (!apiInst || !punto) return;
    const frame = frameEnPunto(punto);
    const skeleton = convertToExcalidrawElements([
      { type: 'text', id: generarId(), x: punto.x - 150, y: punto.y, text: texto, fontSize: 16, width: 300, frameId: frame?.id ?? null } as any,
    ]);
    apiInst.updateScene({ elements: [...(apiInst.getSceneElements() as ExcalidrawElement[]), ...skeleton] });
  };

  const insertarPrecioDestacado = () => {
    const apiInst = apiRef.current;
    const punto = puntoCentroVista();
    if (!apiInst || !punto) return;
    const frame = frameEnPunto(punto);
    const nuevos = construirBloquePrecio(Number(precioTotal) || 0, punto.x, punto.y, frame?.id ?? null);
    apiInst.updateScene({ elements: [...(apiInst.getSceneElements() as ExcalidrawElement[]), ...nuevos] });
  };

  const insertarCierre = () => {
    const apiInst = apiRef.current;
    const punto = puntoCentroVista();
    if (!apiInst || !punto) return;
    const frame = frameEnPunto(punto);
    const nuevos = construirBloqueCierre(empresa.nombre, clienteNombre, condicionesPago, empresa.iban, punto.x, punto.y, frame?.id ?? null);
    apiInst.updateScene({ elements: [...(apiInst.getSceneElements() as ExcalidrawElement[]), ...nuevos] });
  };

  const redactarConIA = async () => {
    if (!redactarNotas.trim()) return;
    setRedactando(true);
    setRedactarError(null);
    try {
      const resultado = await api.generarRespuestaIA({
        capacidad: 'redactar-presupuesto',
        mensajes: [{ role: 'user', content: redactarNotas.trim() }],
        referencias: { clienteId },
      });
      insertarTextoIA(resultado.respuesta);
      setRedactarNotas('');
      setRedactarAbierto(false);
    } catch (e) {
      setRedactarError(e instanceof Error ? e.message : 'No se pudo redactar el texto');
    } finally {
      setRedactando(false);
    }
  };

  // Detecta si hay exactamente un elemento "archivo" seleccionado, para
  // mostrar su panel contextual "Abrir archivo" — mismo patrón que la
  // selección de una cota en editor-dibujo.tsx.
  const handleChangeEscena = useCallback((_elements: readonly ExcalidrawElement[], appState: AppState) => {
    const apiInst = apiRef.current;
    if (!apiInst) return;
    const idsSeleccionados = Object.keys(appState.selectedElementIds).filter((id) => appState.selectedElementIds[id]);
    if (idsSeleccionados.length !== 1) {
      setArchivoSeleccionado(null);
      setLogoSeleccionadoId(null);
      return;
    }
    const elemento = (apiInst.getSceneElements() as ExcalidrawElement[]).find((e) => e.id === idsSeleccionados[0]);
    const mcArchivo = (elemento?.customData as any)?.mcArchivo as { nombre: string; url: string } | undefined;
    const esLogo = !!(elemento?.customData as any)?.mcLogo;
    if (mcArchivo) {
      setArchivoPanelTop(posicionBajoCabecera());
      setArchivoSeleccionado(mcArchivo);
      setLogoSeleccionadoId(null);
    } else if (esLogo) {
      setLogoPanelTop(posicionBajoCabecera());
      setLogoSeleccionadoId(elemento!.id);
      setArchivoSeleccionado(null);
    } else {
      setArchivoSeleccionado(null);
      setLogoSeleccionadoId(null);
    }
  }, []);

  const cambiarLogo = async (files: FileList | null) => {
    const file = files?.[0];
    const apiInst = apiRef.current;
    if (!file || !file.type.startsWith('image/') || !apiInst || !logoSeleccionadoId) return;
    const dataURL = await leerArchivoComoBase64(file);
    const fileId = generarId();
    apiInst.addFiles([{ id: fileId as any, dataURL: dataURL as any, mimeType: file.type as any, created: Date.now() }]);
    const elementos = (apiInst.getSceneElements() as ExcalidrawElement[]).map((e) =>
      e.id === logoSeleccionadoId ? ({ ...e, fileId } as any) : e
    );
    apiInst.updateScene({ elements: elementos });
    onCambiarLogoEmpresa?.(dataURL);
  };

  const ejecutarGuardado = useCallback(async () => {
    const apiInst = apiRef.current;
    if (!apiInst) return;
    setGuardando(true);
    setError(null);
    try {
      const elements = apiInst.getSceneElements();
      const ahora = new Date().toISOString();
      const aGuardar: PresupuestoMC = {
        id: presupuesto?.id ?? generarId(),
        clienteId,
        titulo: titulo.trim() || 'Presupuesto sin título',
        formato: 'lienzo',
        descripcion: presupuesto?.descripcion ?? '',
        alcance: presupuesto?.alcance ?? [],
        items: presupuesto?.items ?? [],
        contenidoLienzo: { elements, files: apiInst.getFiles() },
        // Editor legado — nunca escribe contenido nuevo del Motor Documental,
        // solo conserva lo que ya hubiera (ver ARQUITECTURA-MOTOR-DOCUMENTAL.md).
        contenidoDocumento: presupuesto?.contenidoDocumento ?? {},
        condicionesPago,
        validezDias: Number(validezDias) || empresa.validezDiasDefecto,
        condicionesGenerales,
        precioTotal: Number(precioTotal) || 0,
        creado: presupuesto?.creado ?? ahora,
        actualizado: ahora,
      };
      await onGuardar(aGuardar);
      setGuardadoOk(true);
      setTimeout(() => setGuardadoOk(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el presupuesto');
    } finally {
      setGuardando(false);
    }
  }, [presupuesto, clienteId, titulo, condicionesPago, validezDias, condicionesGenerales, precioTotal, empresa.validezDiasDefecto, onGuardar]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); ejecutarGuardado(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [ejecutarGuardado]);

  useEffect(() => {
    const h = () => setPantallaCompleta(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const alternarPantallaCompleta = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else raizRef.current?.requestFullscreen();
  }, []);

  const [datosIniciales] = useState(() => {
    const contenido = presupuesto?.contenidoLienzo as { elements?: ExcalidrawElement[]; files?: Record<string, any> } | undefined;
    if (contenido?.elements && contenido.elements.length > 0) {
      return { elements: contenido.elements, files: contenido.files ?? {} };
    }
    return construirPrimeraHoja(empresa, clienteNombre, Number(precioTotal) || 0, condicionesPago, Number(validezDias) || empresa.validezDiasDefecto);
  });

  const raizApp = document.querySelector(`.${styles.app}`) ?? document.body;
  return createPortal(
    <div className={styles.editorDibujo} ref={raizRef}>
      <header ref={headerRef} className={styles.editorDibujoCabecera}>
        <button className={styles.btnIcono} onClick={onVolver} aria-label="Volver">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <input
          className={styles.editorDibujoNombre}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título del presupuesto"
        />
        <input
          type="number" min="0" step="any"
          className={styles.select} style={{ width: 110 }}
          title="Precio total"
          value={precioTotal}
          onChange={(e) => setPrecioTotal(e.target.value)}
        />
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className={styles.editorDibujoEscalaBadge}
            onClick={() => setCondicionesAbiertas((v) => !v)}
          >
            Condiciones
          </button>
          {condicionesAbiertas && (
            <div className={styles.editorDibujoCalibracionPanel} style={{ top: posicionBajoCabecera(), width: 280 }}>
              <label style={{ fontSize: 12 }}>Condiciones de pago</label>
              <textarea
                className={styles.select}
                style={{ width: '100%', minHeight: 50, resize: 'vertical' }}
                value={condicionesPago}
                onChange={(e) => setCondicionesPago(e.target.value)}
              />
              <span style={{ fontSize: 11, color: 'var(--topo-claro)' }}>
                IBAN: {empresa.iban || 'sin configurar — Ajustes de empresa'}
              </span>
              <label style={{ fontSize: 12 }}>Validez (días)</label>
              <input
                type="number" min="1" className={styles.select}
                value={validezDias}
                onChange={(e) => setValidezDias(e.target.value)}
              />
              <label style={{ fontSize: 12 }}>Condiciones generales</label>
              <textarea
                className={styles.select}
                style={{ width: '100%', minHeight: 60, resize: 'vertical' }}
                value={condicionesGenerales}
                onChange={(e) => setCondicionesGenerales(e.target.value)}
                placeholder="IBAN, garantía, plazos de ejecución…"
              />
            </div>
          )}
        </div>
        {guardadoOk && (
          <span className={styles.editorDibujoGuardadoOk}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            Guardado
          </span>
        )}
        {error && <span style={{ fontSize: 12, color: 'var(--rojo, #e03131)' }}>{error}</span>}
        <button
          type="button"
          className={styles.btnIcono}
          onClick={alternarPantallaCompleta}
          aria-label={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
          title={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          {pantallaCompleta ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
          )}
        </button>
        <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={ejecutarGuardado} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </header>

      <div className={styles.editorDibujoCuerpo}>
        {herramientasAbiertas && (
          <aside className={styles.editorDibujoHerramientas}>
            <button
              title="Seleccionar"
              className={`${styles.editorDibujoHerramientaBtn} ${herramienta === 'selection' ? styles.editorDibujoHerramientaBtnActivo : ''}`}
              onClick={() => seleccionarHerramienta('selection')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51z" /></svg>
            </button>
            <button
              title="Dibujo libre"
              className={`${styles.editorDibujoHerramientaBtn} ${herramienta === 'freedraw' ? styles.editorDibujoHerramientaBtnActivo : ''}`}
              onClick={() => seleccionarHerramienta('freedraw')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
            </button>
            <button
              title="Texto"
              className={`${styles.editorDibujoHerramientaBtn} ${herramienta === 'text' ? styles.editorDibujoHerramientaBtnActivo : ''}`}
              onClick={() => seleccionarHerramienta('text')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>
            </button>

            <span className={styles.editorDibujoDivisor} />

            <button title="Subir foto" className={styles.editorDibujoHerramientaBtn} onClick={() => inputImagenRef.current?.click()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
            </button>
            <input ref={inputImagenRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { subirImagen(e.target.files); e.target.value = ''; }} />

            <button title="Subir archivo" className={styles.editorDibujoHerramientaBtn} onClick={() => inputArchivoRef.current?.click()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            </button>
            <input ref={inputArchivoRef} type="file" style={{ display: 'none' }} onChange={(e) => { subirArchivo(e.target.files); e.target.value = ''; }} />

            <span className={styles.editorDibujoDivisor} />

            <button title="Insertar precio destacado" className={styles.editorDibujoHerramientaBtn} onClick={insertarPrecioDestacado}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </button>

            <button title="Insertar pago y firmas" className={styles.editorDibujoHerramientaBtn} onClick={insertarCierre}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /><line x1="6" y1="15" x2="10" y2="15" /></svg>
            </button>

            <span className={styles.editorDibujoDivisor} />

            <button title="Redactar con IA" className={styles.editorDibujoHerramientaBtn} onClick={() => setRedactarAbierto((v) => !v)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" /></svg>
            </button>

            <span className={styles.editorDibujoDivisor} />

            <button title="Añadir hoja" className={styles.editorDibujoHerramientaBtn} onClick={anadirHoja}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>
            </button>

            <span className={styles.editorDibujoDivisor} />

            <button title="Deshacer" className={styles.editorDibujoHerramientaBtn} onClick={() => atajoTeclado('z', { ctrl: true })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
            </button>
            <button title="Rehacer" className={styles.editorDibujoHerramientaBtn} onClick={() => atajoTeclado('z', { ctrl: true, shift: true })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            </button>
          </aside>
        )}

        <div className={styles.editorDibujoLienzo}>
          <button
            type="button"
            className={styles.editorDibujoToggleHerramientas}
            onClick={() => setHerramientasAbiertas((v) => !v)}
            aria-label={herramientasAbiertas ? 'Ocultar herramientas' : 'Mostrar herramientas'}
          >
            {herramientasAbiertas ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            )}
          </button>

          {redactarAbierto && (
            <div className={styles.editorDibujoCalibracionPanel} style={{ top: posicionBajoCabecera(), left: 44, right: 'auto', width: 300 }}>
              <label style={{ fontSize: 12 }}>Notas para redactar (ej. "cocina en L, blanco mate, encimera Silestone")</label>
              <textarea
                className={styles.select}
                style={{ width: '100%', minHeight: 70, resize: 'vertical' }}
                value={redactarNotas}
                onChange={(e) => setRedactarNotas(e.target.value)}
                autoFocus
              />
              {redactarError && <span style={{ fontSize: 12, color: 'var(--rojo, #e03131)' }}>{redactarError}</span>}
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimario}`}
                disabled={!redactarNotas.trim() || redactando}
                onClick={redactarConIA}
              >
                {redactando ? 'Redactando…' : 'Generar y añadir'}
              </button>
            </div>
          )}

          {archivoSeleccionado && (
            <div className={styles.editorDibujoCalibracionPanel} style={{ top: archivoPanelTop }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{archivoSeleccionado.nombre}</span>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimario}`}
                onClick={() => window.open(archivoSeleccionado.url, '_blank')}
              >
                Abrir archivo
              </button>
            </div>
          )}

          {logoSeleccionadoId && (
            <div className={styles.editorDibujoCalibracionPanel} style={{ top: logoPanelTop }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Logo de la empresa</span>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimario}`}
                onClick={() => inputLogoRef.current?.click()}
              >
                Cambiar logo
              </button>
            </div>
          )}
          <input ref={inputLogoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { cambiarLogo(e.target.files); e.target.value = ''; }} />

          <Excalidraw
            excalidrawAPI={handleApi}
            initialData={datosIniciales}
            onChange={handleChangeEscena}
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
    </div>,
    raizApp
  );
}
