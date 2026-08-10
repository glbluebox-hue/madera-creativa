import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { generarId } from './mock.js';

/** Punto en coordenadas de escena de Excalidraw (no de pantalla). */
export type PuntoEscena = { x: number; y: number };

/**
 * Snapshot de la escala del dibujo: cuántos milímetros reales representa
 * una unidad de escena. Se fija una sola vez al calibrar (ver
 * `calibrarDesdeCota`) y no vuelve a cambiar salvo que el usuario recalibre
 * — es un hecho físico del dibujo, no una preferencia de visualización
 * (para eso está `UnidadVisualizacion`, que se puede cambiar libremente sin
 * volver a calibrar).
 */
export type EscalaSnapshot = { factorMm: number };

/**
 * Escala del dibujo — `null` mientras no exista una calibración real. Con
 * `null`, ninguna cota puede mostrar una unidad física: se muestran solo en
 * unidades internas, para no dar la impresión de una medida real que no lo
 * es.
 */
export type EscalaDibujo = EscalaSnapshot | null;

/** Unidad en la que se muestran las medidas — libre de elegir en cualquier momento una vez que el dibujo está calibrado; no afecta a la calibración en sí. */
export type UnidadVisualizacion = 'mm' | 'cm' | 'm';

/**
 * Alineada: la línea de cota sigue el ángulo real entre los dos puntos.
 * Horizontal/vertical: la línea de cota se fuerza a ese eje y mide solo la
 * distancia en X/Y — los puntos pueden estar a alturas/columnas distintas.
 */
export type OrientacionCota = 'alineada' | 'horizontal' | 'vertical';

/**
 * Una cota como entidad propia del dibujo — no "una flecha con texto".
 * `puntoOrigen`/`puntoDestino` son siempre los extremos vivos de la línea de
 * cota (los que el usuario ve y puede arrastrar), en coordenadas de escena.
 * `tipo: 'lineal'` es la única variante hoy (con 3 orientaciones); deja el
 * hueco abierto para `'angular' | 'radial'` en fases futuras sin romper las
 * cotas ya creadas.
 */
export type Cota = {
  id: string;
  tipo: 'lineal';
  orientacion: OrientacionCota;
  puntoOrigen: PuntoEscena;
  puntoDestino: PuntoEscena;
  /** Longitud en unidades de escena — siempre calculable, con o sin calibración. */
  longitudInterna: number;
  /** Copia de la escala del dibujo usada la última vez que se calculó esta cota. */
  escalaUtilizada: EscalaSnapshot | null;
  /** Longitud real en milímetros (unidad canónica) — `null` mientras el dibujo no esté calibrado. La unidad en que se *muestra* (mm/cm/m) es una preferencia de visualización aparte, ver `UnidadVisualizacion`. */
  longitudMm: number | null;
  elementos: { flechaId: string; extension1Id: string; extension2Id: string; grupoId: string };
  fecha: string;
  version: number;
};

/** Longitud (en unidades de escena) de cada remate de extensión a cada lado de la línea de cota. */
const LARGO_EXTENSION = 10;
/**
 * Distancia (en unidades de escena) entre los puntos que marca el usuario y
 * la línea de cota, en horizontal/vertical — se aplica una sola vez, al
 * crear la cota (ver `proyectarSobreEje`). A partir de ahí,
 * `puntoOrigen`/`puntoDestino` YA representan la línea de cota final (los
 * mismos que ve y puede arrastrar el usuario), así que el resto del
 * módulo — geometría y sincronización — no necesita saber en qué
 * orientación se creó: una flecha horizontal no es más que una flecha
 * alineada cuyos dos puntos ya comparten la misma Y.
 */
const SEPARACION_LINEA_COTA = 24;

/** Distancia entre dos puntos — con los puntos ya proyectados al eje correspondiente (ver `crearCota`), esto mide exactamente lo que hay que medir en cualquier orientación. */
function distancia(a: PuntoEscena, b: PuntoEscena): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Vector unitario perpendicular a A→B. */
function perpendicularUnitaria(a: PuntoEscena, b: PuntoEscena): PuntoEscena {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

function calcularLongitudMm(longitudInterna: number, escala: EscalaDibujo): number | null {
  return escala ? longitudInterna * escala.factorMm : null;
}

/** Convierte una longitud en milímetros a la unidad de visualización elegida. */
export function convertirDesdeMm(longitudMm: number, unidadVisualizacion: UnidadVisualizacion): number {
  if (unidadVisualizacion === 'mm') return longitudMm;
  if (unidadVisualizacion === 'cm') return longitudMm / 10;
  return longitudMm / 1000;
}

/** Convierte un valor en la unidad dada a milímetros — inverso de `convertirDesdeMm`. */
function convertirAMm(valor: number, unidad: UnidadVisualizacion): number {
  if (unidad === 'mm') return valor;
  if (unidad === 'cm') return valor * 10;
  return valor * 1000;
}

/**
 * Texto a mostrar en la etiqueta de la cota. Sin calibración se muestra en
 * unidades internas ("240 u") — nunca mm/cm/m, para que nadie confunda ese
 * número con una medida real.
 */
export function formatoLongitudCota(
  cota: Pick<Cota, 'longitudInterna' | 'longitudMm'>,
  unidadVisualizacion: UnidadVisualizacion
): string {
  if (cota.longitudMm === null) {
    return `${Math.round(cota.longitudInterna)} u`;
  }
  const valor = convertirDesdeMm(cota.longitudMm, unidadVisualizacion);
  const decimales = unidadVisualizacion === 'mm' ? 0 : unidadVisualizacion === 'cm' ? 1 : 2;
  return `${valor.toFixed(decimales)} ${unidadVisualizacion}`;
}

/**
 * Color y grosor de una cota — son propiedades del elemento de Excalidraw,
 * no del registro lógico `Cota` (que describe *qué se mide*, no *cómo se
 * ve*). Por eso no viven en el tipo `Cota`: se leen del color/grosor
 * seleccionados al crearla, y de los del propio elemento vivo al
 * resincronizarla, para no perder un cambio de estilo que el usuario haya
 * hecho después de crearla.
 */
export type EstiloCota = { strokeColor: string; strokeWidth: number };

const ESTILO_POR_DEFECTO: EstiloCota = { strokeColor: '#1e1e1e', strokeWidth: 1 };

/**
 * Construye los 3 elementos visuales de una cota (flecha con etiqueta
 * nativa + 2 remates de extensión) a partir de su registro lógico. Se usa
 * tanto al crear la cota como al resincronizarla tras un cambio, para que
 * la geometría visual nunca pueda desincronizarse del registro: siempre se
 * reconstruye entera desde los mismos datos.
 *
 * Usa `convertToExcalidrawElements` (API pública de Excalidraw) en vez de
 * construir los elementos a mano: así la etiqueta de texto queda vinculada
 * a la flecha exactamente como lo haría Excalidraw de forma nativa (mismo
 * cálculo de posición/ajuste que ya usa para cualquier flecha con texto),
 * sin depender de ninguna función interna no exportada por la librería.
 *
 * `points`/`x`/`y` se pasan como números planos y no como el tipo `LocalPoint`
 * que pide la definición de tipos de Excalidraw — ese tipo es una marca de
 * Excalidraw definida en un módulo interno (`math/point`) que no forma parte
 * de la API pública del paquete, así que no hay forma soportada de
 * construirlo desde fuera. En tiempo de ejecución es un array `[number,
 * number]` normal; el `as any` de abajo es deliberado por ese motivo, no un
 * descuido de tipado.
 */
export function construirElementosCota(
  cota: Cota,
  estilo: EstiloCota = ESTILO_POR_DEFECTO,
  unidadVisualizacion: UnidadVisualizacion = 'cm'
): ExcalidrawElement[] {
  const { puntoOrigen: a, puntoDestino: b } = cota;
  const perp = perpendicularUnitaria(a, b);
  const { flechaId, extension1Id, extension2Id, grupoId } = cota.elementos;

  // Un remate corto y centrado en cada punto, perpendicular a la línea de
  // cota — igual para las 3 orientaciones: en horizontal/vertical la línea
  // ya es horizontal/vertical (`crearCota` la construyó así), así que su
  // perpendicular sale automáticamente vertical/horizontal, sin necesitar
  // ninguna rama de código aparte.
  const extA = { x: a.x - perp.x * LARGO_EXTENSION, y: a.y - perp.y * LARGO_EXTENSION };
  const extB = { x: b.x - perp.x * LARGO_EXTENSION, y: b.y - perp.y * LARGO_EXTENSION };

  const skeletons = [
    {
      type: 'arrow',
      id: flechaId,
      x: a.x,
      y: a.y,
      points: [[0, 0], [b.x - a.x, b.y - a.y]],
      startArrowhead: 'arrow',
      endArrowhead: 'arrow',
      strokeColor: estilo.strokeColor,
      strokeWidth: estilo.strokeWidth,
      label: { text: formatoLongitudCota(cota, unidadVisualizacion), strokeColor: estilo.strokeColor },
      groupIds: [grupoId],
      customData: { cotaId: cota.id, grupoId, rol: 'linea', orientacion: cota.orientacion },
    },
    {
      type: 'line',
      id: extension1Id,
      x: extA.x,
      y: extA.y,
      points: [[0, 0], [perp.x * LARGO_EXTENSION * 2, perp.y * LARGO_EXTENSION * 2]],
      strokeColor: estilo.strokeColor,
      strokeWidth: estilo.strokeWidth,
      groupIds: [grupoId],
    },
    {
      type: 'line',
      id: extension2Id,
      x: extB.x,
      y: extB.y,
      points: [[0, 0], [perp.x * LARGO_EXTENSION * 2, perp.y * LARGO_EXTENSION * 2]],
      strokeColor: estilo.strokeColor,
      strokeWidth: estilo.strokeWidth,
      groupIds: [grupoId],
    },
  ];

  return convertToExcalidrawElements(skeletons as any, { regenerateIds: false });
}

/**
 * Proyecta los dos puntos que marca el usuario sobre el eje que corresponda
 * — horizontal fuerza la misma Y en ambos (por encima del más alto),
 * vertical fuerza la misma X (a la izquierda del más a la izquierda),
 * alineada los deja tal cual. Se aplica una única vez, al crear la cota:
 * a partir de ahí `puntoOrigen`/`puntoDestino` YA son la línea de cota
 * definitiva, así que el resto del módulo trata las 3 orientaciones
 * exactamente igual (ver `construirElementosCota`).
 */
function proyectarSobreEje(
  puntoOrigen: PuntoEscena,
  puntoDestino: PuntoEscena,
  orientacion: OrientacionCota
): { puntoOrigen: PuntoEscena; puntoDestino: PuntoEscena } {
  if (orientacion === 'horizontal') {
    const yLinea = Math.min(puntoOrigen.y, puntoDestino.y) - SEPARACION_LINEA_COTA;
    return { puntoOrigen: { x: puntoOrigen.x, y: yLinea }, puntoDestino: { x: puntoDestino.x, y: yLinea } };
  }
  if (orientacion === 'vertical') {
    const xLinea = Math.min(puntoOrigen.x, puntoDestino.x) - SEPARACION_LINEA_COTA;
    return { puntoOrigen: { x: xLinea, y: puntoOrigen.y }, puntoDestino: { x: xLinea, y: puntoDestino.y } };
  }
  return { puntoOrigen, puntoDestino };
}

/** Lo que identifica a una cota de forma estable a lo largo de su vida: no cambia aunque su geometría se recalcule (arrastre de un extremo, previsualización en vivo, cambio de escala...). */
type IdentidadCota = Pick<Cota, 'id' | 'elementos' | 'fecha' | 'version'>;

/** Recalcula la geometría/longitud de una cota a partir de dos puntos de clic, conservando la identidad dada — es el núcleo compartido por `crearCota` (identidad nueva) y `actualizarCotaEnCurso` (identidad ya existente, para previsualización en vivo sin parpadeo). */
function construirCota(
  identidad: IdentidadCota,
  puntoOrigenClic: PuntoEscena,
  puntoDestinoClic: PuntoEscena,
  escala: EscalaDibujo,
  orientacion: OrientacionCota
): Cota {
  const { puntoOrigen, puntoDestino } = proyectarSobreEje(puntoOrigenClic, puntoDestinoClic, orientacion);
  const longitudInterna = distancia(puntoOrigen, puntoDestino);
  return {
    id: identidad.id,
    tipo: 'lineal',
    orientacion,
    puntoOrigen,
    puntoDestino,
    longitudInterna,
    escalaUtilizada: escala,
    longitudMm: calcularLongitudMm(longitudInterna, escala),
    elementos: identidad.elementos,
    fecha: identidad.fecha,
    version: identidad.version,
  };
}

function generarIdentidad(): IdentidadCota {
  return {
    id: generarId(),
    elementos: { flechaId: generarId(), extension1Id: generarId(), extension2Id: generarId(), grupoId: generarId() },
    fecha: new Date().toISOString(),
    version: 1,
  };
}

/**
 * Crea una cota nueva entre dos puntos de escena — el registro lógico más
 * los elementos de Excalidraw que la representan hoy.
 */
export function crearCota(
  puntoOrigenClic: PuntoEscena,
  puntoDestinoClic: PuntoEscena,
  escala: EscalaDibujo,
  orientacion: OrientacionCota = 'alineada',
  estilo: EstiloCota = ESTILO_POR_DEFECTO,
  unidadVisualizacion: UnidadVisualizacion = 'cm'
): { cota: Cota; elementos: ExcalidrawElement[] } {
  const cota = construirCota(generarIdentidad(), puntoOrigenClic, puntoDestinoClic, escala, orientacion);
  return { cota, elementos: construirElementosCota(cota, estilo, unidadVisualizacion) };
}

/**
 * Arranca una cota "en curso" — se usa al pulsar el botón para empezar un
 * arrastre: nace con longitud cero (origen y destino en el mismo punto) pero
 * ya con identidad fija, para que `actualizarCotaEnCurso` pueda recalcularla
 * en cada fotograma del arrastre sin que Excalidraw la vea como un elemento
 * distinto en cada frame (eso es lo que evita el parpadeo).
 */
export function iniciarCotaEnCurso(
  puntoOrigenClic: PuntoEscena,
  escala: EscalaDibujo,
  orientacion: OrientacionCota,
  estilo: EstiloCota = ESTILO_POR_DEFECTO,
  unidadVisualizacion: UnidadVisualizacion = 'cm'
): { cota: Cota; elementos: ExcalidrawElement[] } {
  return crearCota(puntoOrigenClic, puntoOrigenClic, escala, orientacion, estilo, unidadVisualizacion);
}

/**
 * Recalcula una cota "en curso" con un nuevo punto de destino, manteniendo
 * su identidad (mismos ids de elementos) — lo que se ve en cada fotograma
 * del arrastre es la cota definitiva con los puntos de ese instante, no una
 * previsualización distinta que luego se sustituye.
 */
export function actualizarCotaEnCurso(
  cotaEnCurso: Cota,
  puntoOrigenClic: PuntoEscena,
  puntoDestinoClicActual: PuntoEscena,
  escala: EscalaDibujo,
  estilo: EstiloCota = ESTILO_POR_DEFECTO,
  unidadVisualizacion: UnidadVisualizacion = 'cm'
): { cota: Cota; elementos: ExcalidrawElement[] } {
  const cota = construirCota(cotaEnCurso, puntoOrigenClic, puntoDestinoClicActual, escala, cotaEnCurso.orientacion);
  return { cota, elementos: construirElementosCota(cota, estilo, unidadVisualizacion) };
}

/**
 * Calcula la escala del dibujo a partir de una cota ya dibujada y su medida
 * real conocida — el único mecanismo para calibrar (no hay forma de teclear
 * un factor de escala directamente, siempre se ancla a una medida real
 * verificable). `valorReal` se interpreta en `unidadReal`.
 */
export function calibrarDesdeCota(
  cotaReferencia: Pick<Cota, 'longitudInterna'>,
  valorReal: number,
  unidadReal: UnidadVisualizacion
): EscalaSnapshot {
  return { factorMm: convertirAMm(valorReal, unidadReal) / cotaReferencia.longitudInterna };
}

/**
 * Reconstruye solo la etiqueta de texto (no la geometría) de cada cota de
 * la escena para una nueva unidad de visualización — se usa cuando el
 * usuario cambia mm/cm/m sin que nada de la geometría haya cambiado, así
 * que ni la línea de cota ni sus remates necesitan tocarse.
 */
export function regenerarEtiquetasCotas(
  elements: readonly ExcalidrawElement[],
  cotas: readonly Cota[],
  unidadVisualizacion: UnidadVisualizacion
): ExcalidrawElement[] {
  const cotasPorId = new Map(cotas.map((c) => [c.id, c]));
  const idsAEliminar = new Set<string>();
  const reemplazos = new Map<string, ExcalidrawElement[]>();
  for (const e of elements) {
    const el = e as any;
    if (el.isDeleted || el.type !== 'arrow' || el.customData?.rol !== 'linea') continue;
    const cota = cotasPorId.get(el.customData.cotaId);
    if (!cota) continue;
    const etiquetaVieja = etiquetaVivaId(e);
    if (etiquetaVieja) idsAEliminar.add(etiquetaVieja);
    reemplazos.set(el.id, construirElementosCota(cota, estiloDeFlecha(e), unidadVisualizacion));
  }
  if (reemplazos.size === 0) return elements as ExcalidrawElement[];
  return elements
    .filter((e) => !idsAEliminar.has(e.id))
    .flatMap((e) => reemplazos.get(e.id) ?? [e]) as ExcalidrawElement[];
}

/** Punto absoluto de un extremo de una flecha (`points` son offsets relativos a `x`/`y`). */
function extremoAbsoluto(flecha: ExcalidrawElement, indice: 0 | 1): PuntoEscena {
  const p = (flecha as any).points[indice] as [number, number];
  return { x: (flecha as any).x + p[0], y: (flecha as any).y + p[1] };
}

/**
 * Color/grosor actuales de la flecha, tal cual están en la escena — se usa
 * al reconstruir una cota tras un cambio, para no perder un color/grosor
 * que el usuario le haya puesto después de crearla (Excalidraw sí permite
 * recolorear una selección ya existente; reconstruir con un estilo por
 * defecto lo desharía sin motivo).
 */
function estiloDeFlecha(flecha: ExcalidrawElement): EstiloCota {
  return {
    strokeColor: (flecha as any).strokeColor ?? ESTILO_POR_DEFECTO.strokeColor,
    strokeWidth: (flecha as any).strokeWidth ?? ESTILO_POR_DEFECTO.strokeWidth,
  };
}

/**
 * Id de la etiqueta de texto actualmente enlazada a una flecha de cota.
 * `convertToExcalidrawElements` no permite fijar el id de una etiqueta (no
 * es un campo soportado en su esqueleto): cada vez que se reconstruye una
 * cota, Excalidraw le asigna una etiqueta con un id nuevo. Sin este
 * seguimiento explícito, la etiqueta anterior queda huérfana en la escena
 * en vez de desaparecer — confirmado en vivo: un solo arrastre de un
 * extremo dejaba varios números fantasma acumulados. Por eso cualquier
 * reconstrucción debe leer este id ANTES de reconstruir y añadirlo a
 * `idsAEliminar`.
 */
function etiquetaVivaId(flecha: ExcalidrawElement): string | undefined {
  return (flecha as any).boundElements?.find((b: any) => b?.type === 'text')?.id;
}

/**
 * Umbral (unidades de escena) por debajo del cual un cambio de posición no
 * se considera un arrastre real del usuario. Tiene que ser mayor que el
 * pequeño desplazamiento que el propio Excalidraw introduce al construir
 * una flecha con puntas: la punta debe llegar exactamente al punto pedido,
 * así que la LÍNEA se acorta un poco por dentro — confirmado en vivo, del
 * orden de 1 unidad interna con el grosor por defecto. Sin este margen,
 * cada reconstrucción propia (recalibrar, cambiar de unidad) se detectaba
 * a sí misma como "el usuario movió el extremo" y volvía a medir la
 * geometría desde ese acortamiento, encogiendo la cota un poco más en cada
 * ciclo. Bastante por debajo de cualquier arrastre real (que se mide en
 * decenas/cientos de unidades), así que sigue detectando arrastres
 * genuinos sin problema.
 */
const EPSILON = 3;

/**
 * Se llama desde `onChange` de Excalidraw. Recorre la escena buscando
 * flechas de cota (`customData.rol === 'linea'`) y:
 *
 * 1. Si sus extremos cambiaron respecto al registro conocido (el usuario
 *    arrastró un extremo), recalcula la longitud y regenera esa cota entera
 *    (etiqueta + remates de extensión) a partir de los nuevos puntos.
 * 2. Si aparecen dos flechas vivas con el mismo `cotaId` pero un `grupoId`
 *    distinto al conocido (duplicado por Ctrl+D o copiar/pegar — Excalidraw
 *    no sabe nada de nuestro registro `Cota`), crea un registro `Cota`
 *    propio para la copia con un id nuevo, re-etiquetando sus elementos.
 * 3. Si un registro conocido ya no tiene su flecha en la escena (se borró),
 *    se descarta el registro.
 *
 * Devuelve la lista de cotas y una lista de elementos, pero por referencia:
 * si nada cambió de verdad, `cotas` es literalmente el mismo array que se
 * pasó (`cotasConocidas`) y `elementos` es `null` — así el llamante (que se
 * ejecuta en cada `onChange`, muy a menudo) puede saltarse `setCotas`/
 * `updateScene` con una simple comprobación de referencia, sin arriesgarse
 * a un bucle de actualizaciones.
 */
export function sincronizarCotas(
  elements: readonly ExcalidrawElement[],
  cotasConocidas: readonly Cota[],
  escala: EscalaDibujo,
  unidadVisualizacion: UnidadVisualizacion = 'cm'
): { cotas: readonly Cota[]; elementos: ExcalidrawElement[] | null } {
  const flechasCota = elements.filter(
    (e: any) => !e.isDeleted && e.type === 'arrow' && e.customData?.rol === 'linea' && e.customData?.cotaId
  );

  if (flechasCota.length === 0 && cotasConocidas.length === 0) {
    return { cotas: cotasConocidas, elementos: null };
  }

  const cotasPorId = new Map(cotasConocidas.map((c) => [c.id, c]));
  const nuevasCotas: Cota[] = [];
  let hayCambiosEnCotas = flechasCota.length !== cotasConocidas.length;
  const idsAEliminar = new Set<string>();
  const reemplazosFlecha = new Map<string, ExcalidrawElement[]>(); // id de flecha viva -> trío nuevo a insertar en su lugar

  for (const flecha of flechasCota) {
    const customData = (flecha as any).customData as { cotaId: string; orientacion?: OrientacionCota };
    const orientacionFlecha: OrientacionCota = customData.orientacion ?? 'alineada';
    // El `groupIds` real de Excalidraw es la fuente de verdad de "qué instancia
    // visual es esta" — a diferencia de `customData`, que Excalidraw clona tal
    // cual al duplicar, así que dos copias de la misma cota comparten
    // `customData.cotaId` pero Excalidraw les asigna `groupIds` distintos.
    const grupoIdActual: string | undefined = (flecha as any).groupIds?.[0];
    const cota = cotasPorId.get(customData.cotaId);
    const esDuplicado = !!cota && !!grupoIdActual && cota.elementos.grupoId !== grupoIdActual;

    if (!cota || esDuplicado) {
      // Cota desconocida (no debería pasar en uso normal, pero se recupera
      // igual) o flecha duplicada de una cota conocida: nace un registro propio.
      if (esDuplicado && grupoIdActual) {
        // Las líneas de extensión duplicadas por Excalidraw comparten el
        // mismo `groupIds` nuevo que la flecha — se sustituyen por unas
        // recién construidas desde el registro nuevo, igual que al crear.
        for (const e of elements) {
          if (e.id !== flecha.id && !e.isDeleted && (e as any).type === 'line' && (e as any).groupIds?.includes(grupoIdActual)) {
            idsAEliminar.add(e.id);
          }
        }
      }
      const etiquetaVieja = etiquetaVivaId(flecha);
      if (etiquetaVieja) idsAEliminar.add(etiquetaVieja);
      const p1 = extremoAbsoluto(flecha, 0);
      const p2 = extremoAbsoluto(flecha, 1);
      const longitudInterna = distancia(p1, p2);
      const nueva: Cota = {
        tipo: 'lineal',
        orientacion: orientacionFlecha,
        id: generarId(),
        puntoOrigen: p1,
        puntoDestino: p2,
        longitudInterna,
        escalaUtilizada: escala,
        longitudMm: calcularLongitudMm(longitudInterna, escala),
        elementos: {
          flechaId: generarId(),
          extension1Id: generarId(),
          extension2Id: generarId(),
          grupoId: grupoIdActual ?? generarId(),
        },
        fecha: new Date().toISOString(),
        version: 1,
      };
      reemplazosFlecha.set(flecha.id, construirElementosCota(nueva, estiloDeFlecha(flecha), unidadVisualizacion));
      nuevasCotas.push(nueva);
      hayCambiosEnCotas = true;
      continue;
    }

    const p1 = extremoAbsoluto(flecha, 0);
    const p2 = extremoAbsoluto(flecha, 1);
    const cambioGeometria =
      Math.abs(p1.x - cota.puntoOrigen.x) > EPSILON ||
      Math.abs(p1.y - cota.puntoOrigen.y) > EPSILON ||
      Math.abs(p2.x - cota.puntoDestino.x) > EPSILON ||
      Math.abs(p2.y - cota.puntoDestino.y) > EPSILON;
    const cambioEscala = JSON.stringify(cota.escalaUtilizada) !== JSON.stringify(escala);

    if (cambioGeometria || cambioEscala) {
      // Solo se remide la geometría si de verdad cambió — si lo único que
      // cambió fue la escala, se reutilizan los puntos/longitud ya
      // conocidos (los mismos que se usaron para calibrar) en vez de
      // volver a medirlos desde la flecha viva, que por el acortamiento de
      // las puntas de flecha (ver EPSILON) nunca coincide exactamente con
      // la intención — eso es justo lo que causaba que calibrar con un
      // valor exacto (p. ej. "500 cm") acabara mostrando un número distinto
      // ("498.9 cm"): la escala se calculaba con una longitud y la
      // reconstrucción inmediatamente posterior mostraba otra.
      const puntoOrigen = cambioGeometria ? p1 : cota.puntoOrigen;
      const puntoDestino = cambioGeometria ? p2 : cota.puntoDestino;
      const longitudInterna = cambioGeometria ? distancia(p1, p2) : cota.longitudInterna;
      const actualizada: Cota = {
        ...cota,
        puntoOrigen,
        puntoDestino,
        longitudInterna,
        escalaUtilizada: escala,
        longitudMm: calcularLongitudMm(longitudInterna, escala),
        version: cota.version + 1,
        fecha: new Date().toISOString(),
      };
      idsAEliminar.add(cota.elementos.extension1Id);
      idsAEliminar.add(cota.elementos.extension2Id);
      const etiquetaVieja = etiquetaVivaId(flecha);
      if (etiquetaVieja) idsAEliminar.add(etiquetaVieja);
      reemplazosFlecha.set(flecha.id, construirElementosCota(actualizada, estiloDeFlecha(flecha), unidadVisualizacion));
      nuevasCotas.push(actualizada);
      hayCambiosEnCotas = true;
    } else {
      nuevasCotas.push(cota);
    }
  }

  // Registros conocidos cuya flecha ya no existe viva en la escena (se
  // borró, sola o junto con todo su grupo) simplemente no entran en
  // `nuevasCotas` — Excalidraw ya se encarga de quitar sus elementos de la
  // escena, no hace falta tocar `elements` para eso.
  let elementosFinales: ExcalidrawElement[] | null = null;
  if (idsAEliminar.size > 0 || reemplazosFlecha.size > 0) {
    elementosFinales = elements
      .filter((e) => !idsAEliminar.has(e.id))
      .flatMap((e) => reemplazosFlecha.get(e.id) ?? [e]);
  }

  return { cotas: hayCambiosEnCotas ? nuevasCotas : cotasConocidas, elementos: elementosFinales };
}

/**
 * Ajusta una cota ya existente para que mida exactamente `longitudNueva` —
 * teclear el número, en vez de fiarse solo de la precisión del dedo al
 * arrastrar. El origen no se mueve; el destino se desplaza a lo largo de la
 * misma dirección que ya tenía (para horizontal/vertical eso ya es
 * puramente horizontal/vertical, sin ninguna rama especial, por el mismo
 * motivo que el resto del módulo: la orientación ya quedó fijada en la
 * geometría al crear la cota). Solo tiene sentido con el dibujo ya
 * calibrado — sin escala no hay forma de traducir un valor real a unidades
 * de escena; para ese caso (sin calibrar) la acción correcta es calibrar
 * con `calibrarDesdeCota`, no esta función.
 */
export function ajustarLongitudCotaEnEscena(
  elements: readonly ExcalidrawElement[],
  cota: Cota,
  longitudNueva: number,
  unidadNueva: UnidadVisualizacion,
  escala: EscalaSnapshot,
  unidadVisualizacion: UnidadVisualizacion = 'cm'
): { cota: Cota; elementos: ExcalidrawElement[] } {
  const flechaViva = elements.find((e) => e.id === cota.elementos.flechaId);
  const estilo = flechaViva ? estiloDeFlecha(flechaViva) : ESTILO_POR_DEFECTO;

  const longitudMm = convertirAMm(longitudNueva, unidadNueva);
  const longitudInterna = longitudMm / escala.factorMm;
  const dx = cota.puntoDestino.x - cota.puntoOrigen.x;
  const dy = cota.puntoDestino.y - cota.puntoOrigen.y;
  const largoActual = Math.hypot(dx, dy) || 1;
  const puntoDestino = {
    x: cota.puntoOrigen.x + (dx / largoActual) * longitudInterna,
    y: cota.puntoOrigen.y + (dy / largoActual) * longitudInterna,
  };

  const actualizada: Cota = {
    ...cota,
    puntoDestino,
    longitudInterna,
    escalaUtilizada: escala,
    longitudMm,
    version: cota.version + 1,
    fecha: new Date().toISOString(),
  };

  const idsAEliminar = new Set([cota.elementos.extension1Id, cota.elementos.extension2Id]);
  if (flechaViva) {
    const etiquetaVieja = etiquetaVivaId(flechaViva);
    if (etiquetaVieja) idsAEliminar.add(etiquetaVieja);
  }
  const reemplazos = new Map([[cota.elementos.flechaId, construirElementosCota(actualizada, estilo, unidadVisualizacion)]]);
  const elementosFinales = elements
    .filter((e) => !idsAEliminar.has(e.id))
    .flatMap((e) => reemplazos.get(e.id) ?? [e]);

  return { cota: actualizada, elementos: elementosFinales as ExcalidrawElement[] };
}
