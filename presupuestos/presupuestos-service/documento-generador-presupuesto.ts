import { randomUUID } from 'node:crypto';
import type { DocumentoMC, ElementoMC, PaginaMC } from './documento-modelo.js';
import { PAGINA_A4 } from './documento-modelo.js';

/**
 * Genera un `DocumentoMC` completo (membrete + secciones + página de
 * condiciones) a partir de una lista de secciones con precio, para la
 * herramienta de IA `crearPresupuestoDocumento` (`ia-herramientas-presupuestos.ts`).
 *
 * El esqueleto del documento (membrete, bloque cliente/empresa, plantilla
 * de una sección) se define aquí mismo como constantes, en vez de guardarse
 * como un `ComponenteMC`/`PlantillaMC` reales en Mongo: así el generador es
 * una función pura, comprobable sin base de datos ni sesión, y las
 * secciones que produce quedan como elementos normales del documento — el
 * carpintero las edita libremente en el editor sin tener que "desvincular"
 * ninguna instancia de componente primero.
 *
 * Los valores reales (cliente, empresa) se interpolan aquí directamente en
 * texto, en vez de dejar `{{cliente.direccion}}` sin resolver para que lo
 * resuelva `resolverVariables` más tarde — un cliente creado solo con
 * nombre (sin dirección/teléfono todavía) dejaba esas llaves literales
 * visibles en el documento generado (reporte real, 19/08/2026); con
 * interpolación directa esas líneas simplemente se omiten si no hay dato.
 *
 * Sin librería de maquetación de texto (Word/InDesign): la altura de cada
 * bloque de texto se ESTIMA a partir de su longitud (`estimarAlturaTexto`)
 * porque los elementos del Motor Documental tienen una caja de tamaño fijo
 * (`overflow: hidden` en el render) — es una aproximación deliberada, no
 * un cálculo real de saltos de línea del navegador; el carpintero puede
 * agrandar la caja a mano si un texto queda justo.
 */

const MARGEN = { arriba: 40, abajo: 40, izquierda: 40, derecha: 40 };
const ANCHO_UTIL = PAGINA_A4.ancho - MARGEN.izquierda - MARGEN.derecha;
const ALTURA_MEMBRETE = 100;
const ALTURA_UTIL_PAGINA = PAGINA_A4.alto - MARGEN.arriba - MARGEN.abajo;
const GAP_ENTRE_BLOQUES = 26;

/** Paleta corporativa — mismos tonos que `TEMA_POR_DEFECTO` (`documento-modelo.ts`) y la marca Madera Creativa en el resto de la app. */
const COLOR_PRIMARIO = '#51483f';
const COLOR_SECUNDARIO = '#8a6835';
const COLOR_TEXTO_CLARO = '#7a7060';

const formatoMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const formatoFechaCorta = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

export type SeccionPresupuesto = { titulo: string; descripcion: string; precio: number };

export type ContextoGeneracion = {
  cliente: { nombre: string; email?: string; telefono?: string; direccion?: string };
  empresa: { nombre: string; telefono?: string; email?: string; iban?: string; logo?: string | null };
  titulo: string;
  condicionesPago?: string;
  condicionesGenerales?: string;
};

function elementoBase(tipo: string, x: number, y: number, ancho: number, alto: number): Omit<ElementoMC, 'contenido' | 'estilo'> {
  return {
    id: randomUUID(), tipo, posicion: { x, y }, tamano: { ancho, alto }, rotacion: 0, capa: 0,
    grupoId: null, bloqueado: false,
    restricciones: { soloLectura: false, visibilidad: 'siempre', obligatorio: false },
    opacidad: 1, origenComponente: null, estiloNombradoId: null, propiedadesEspecificas: {},
  };
}

function elementoTexto(x: number, y: number, ancho: number, alto: number, texto: string, estilo: Record<string, unknown> = {}): ElementoMC {
  return {
    ...elementoBase('texto', x, y, ancho, alto),
    contenido: { texto },
    estilo: { fontFamily: 'Arial', fontSize: 13, fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', color: '#18140f', textAlign: 'left', lineHeight: 1.4, letterSpacing: 0, ...estilo },
  };
}

function elementoPrecioFijo(x: number, y: number, ancho: number, alto: number, valor: number): ElementoMC {
  return {
    ...elementoBase('precioDestacado', x, y, ancho, alto),
    contenido: { modo: 'fijo', valor: formatoMoneda.format(valor) },
    estilo: { colorFondo: '#f5ede0', colorTexto: COLOR_SECUNDARIO },
  };
}

/** Logo de empresa vinculado — el mismo que ya usa el carpintero en Ajustes de empresa, no una copia (mismo criterio ya establecido para el logo del editor). */
function elementoLogo(x: number, y: number, ancho: number, alto: number): ElementoMC {
  return {
    ...elementoBase('logotipo', x, y, ancho, alto),
    contenido: { modo: 'vinculado', url: '' },
    estilo: {},
  };
}

/** Línea horizontal fina — separador visual bajo el membrete. `RenderLinea` ignora `contenido` y dibuja un trazo a lo ancho de la caja, centrado en su alto (ver `documento-tipos-iniciales-render.tsx`). */
function elementoLinea(x: number, y: number, ancho: number, color: string): ElementoMC {
  return {
    ...elementoBase('linea', x, y, ancho, 6),
    contenido: { puntos: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
    estilo: { color, grosor: 1.5, patron: 'solido' },
  };
}

/**
 * Altura estimada (px) de un bloque de texto de `ancho` px a `fontSize`
 * dado — cuenta líneas por párrafo (`\n` separa párrafos explícitos) según
 * caracteres por línea aproximados (0.55 × fontSize es el ancho medio de
 * carácter habitual en una tipografía de palo seco).
 */
function estimarAlturaTexto(texto: string, ancho: number, fontSize: number, lineHeight: number): number {
  const caracteresPorLinea = Math.max(1, Math.floor(ancho / (fontSize * 0.55)));
  const parrafos = texto.split('\n');
  const lineas = parrafos.reduce((total, p) => total + Math.max(1, Math.ceil(p.length / caracteresPorLinea)), 0);
  return Math.ceil(lineas * fontSize * lineHeight);
}

function nuevaPagina(indice: number, nombre: string): PaginaMC {
  return {
    id: randomUUID(), indice, nombre, configuracion: null, fondo: null,
    encabezado: null, pie: null,
    numeracion: { mostrar: false, formato: '', posicion: 'centro' },
    elementos: [],
  };
}

/** Membrete corporativo: logo a la izquierda, "PRESUPUESTO" + fecha a la derecha, línea separadora al pie de la zona — mismo patrón visual que el preventivo de referencia del usuario (19/08/2026). */
function crearMembrete(): DocumentoMC['encabezadoPorDefecto'] {
  return {
    altura: ALTURA_MEMBRETE,
    elementos: [
      elementoLogo(MARGEN.izquierda, 18, 150, 60),
      elementoTexto(PAGINA_A4.ancho - MARGEN.derecha - 260, 22, 260, 28, 'PRESUPUESTO', { fontSize: 17, fontWeight: 'bold', textAlign: 'right', color: COLOR_PRIMARIO }),
      elementoTexto(PAGINA_A4.ancho - MARGEN.derecha - 260, 54, 260, 22, `Fecha: ${formatoFechaCorta.format(new Date())}`, { fontSize: 11, color: COLOR_TEXTO_CLARO, textAlign: 'right' }),
      elementoLinea(MARGEN.izquierda, ALTURA_MEMBRETE - 10, ANCHO_UTIL, COLOR_SECUNDARIO),
    ],
  };
}

/** Solo las líneas con dato real — un cliente creado con solo el nombre no debe dejar huecos de "{{...}}" ni líneas en blanco. */
function bloqueDatos(titulo: string, lineas: (string | undefined)[]): string {
  return [titulo, ...lineas.filter((l): l is string => !!l && l.trim() !== '')].join('\n');
}

/** Portada: bloque de cliente y de empresa lado a lado (debajo del membrete, nunca superpuestos con él) y el título del presupuesto. */
function crearPaginaPortada(contexto: ContextoGeneracion): { pagina: PaginaMC; alturaOcupada: number } {
  const pagina = nuevaPagina(0, 'Portada');
  const anchoBloque = (ANCHO_UTIL - GAP_ENTRE_BLOQUES) / 2;
  const inicio = ALTURA_MEMBRETE + GAP_ENTRE_BLOQUES;
  const textoCliente = bloqueDatos('CLIENTE', [contexto.cliente.nombre, contexto.cliente.direccion, contexto.cliente.telefono, contexto.cliente.email]);
  const textoEmpresa = bloqueDatos(contexto.empresa.nombre, [contexto.empresa.telefono, contexto.empresa.email]);
  const altoBloqueDatos = Math.max(estimarAlturaTexto(textoCliente, anchoBloque, 12.5, 1.6), estimarAlturaTexto(textoEmpresa, anchoBloque, 12.5, 1.6));
  pagina.elementos = [
    elementoTexto(MARGEN.izquierda, inicio, anchoBloque, altoBloqueDatos, textoCliente, { fontSize: 12.5, lineHeight: 1.6 }),
    elementoTexto(MARGEN.izquierda + anchoBloque + GAP_ENTRE_BLOQUES, inicio, anchoBloque, altoBloqueDatos, textoEmpresa, { fontSize: 12.5, lineHeight: 1.6, textAlign: 'right' }),
    elementoTexto(MARGEN.izquierda, inicio + altoBloqueDatos + GAP_ENTRE_BLOQUES, ANCHO_UTIL, 40, contexto.titulo, { fontSize: 21, fontWeight: 'bold', color: COLOR_PRIMARIO }),
  ];
  return { pagina, alturaOcupada: inicio + altoBloqueDatos + GAP_ENTRE_BLOQUES + 40 };
}

/** Página final: condiciones de pago, condiciones generales, IBAN — mismo patrón de bloque que una sección más, para que la reutilice el mismo bucle de paginación. */
function bloqueCondiciones(condicionesPago: string, condicionesGenerales: string, iban: string | undefined): { alto: number; crear: (y: number) => ElementoMC[] } {
  const textoCompleto = [
    condicionesPago ? `Condiciones de pago: ${condicionesPago}` : '',
    iban ? `IBAN: ${iban}` : '',
    condicionesGenerales,
  ].filter(Boolean).join('\n\n');
  const alto = 30 + estimarAlturaTexto(textoCompleto, ANCHO_UTIL, 12, 1.6) + 20;
  return {
    alto,
    crear: (y: number) => [
      elementoTexto(MARGEN.izquierda, y, ANCHO_UTIL, 30, 'Condiciones', { fontSize: 16, fontWeight: 'bold', color: COLOR_PRIMARIO }),
      elementoTexto(MARGEN.izquierda, y + 34, ANCHO_UTIL, alto - 34, textoCompleto, { fontSize: 12, lineHeight: 1.6, color: '#3a342c' }),
    ],
  };
}

/** Genera los elementos de una sección de trabajo (título + descripción + precio) y su altura total real (la descripción es de altura variable). */
function bloqueSeccion(seccion: SeccionPresupuesto): { alto: number; crear: (y: number) => ElementoMC[] } {
  const altoDescripcion = estimarAlturaTexto(seccion.descripcion, ANCHO_UTIL, 12.5, 1.55);
  const yPrecio = 34 + altoDescripcion + 14;
  const alto = yPrecio + 46;
  return {
    alto,
    crear: (y: number) => [
      elementoTexto(MARGEN.izquierda, y, ANCHO_UTIL, 26, seccion.titulo, { fontSize: 16.5, fontWeight: 'bold', color: COLOR_PRIMARIO }),
      elementoTexto(MARGEN.izquierda, y + 34, ANCHO_UTIL, altoDescripcion, seccion.descripcion, { fontSize: 12.5, lineHeight: 1.55 }),
      // Abajo a la derecha, como en el PDF de referencia del usuario (19/08/2026) — no a la izquierda.
      elementoPrecioFijo(MARGEN.izquierda + ANCHO_UTIL - 220, y + yPrecio, 220, 50, seccion.precio),
    ],
  };
}

/**
 * Construye el documento completo: portada + secciones (paginadas
 * automáticamente cuando no caben) + condiciones. `precioTotal` es la suma
 * real de los precios de sección — nunca se confía en que la IA haga bien
 * la suma (mismo criterio que ya usa `anadirElementoPresupuesto`).
 */
export function generarDocumentoPresupuesto(secciones: SeccionPresupuesto[], contexto: ContextoGeneracion): { documento: DocumentoMC; precioTotal: number } {
  const { pagina: paginaPortada, alturaOcupada } = crearPaginaPortada(contexto);
  const paginas: PaginaMC[] = [paginaPortada];
  let paginaActual = paginas[0];
  let cursorY = alturaOcupada + GAP_ENTRE_BLOQUES;

  const bloques = [
    ...secciones.map((s) => bloqueSeccion(s)),
    bloqueCondiciones(contexto.condicionesPago ?? '', contexto.condicionesGenerales ?? '', contexto.empresa.iban),
  ];

  for (const bloque of bloques) {
    if (cursorY + bloque.alto > ALTURA_UTIL_PAGINA) {
      paginaActual = nuevaPagina(paginas.length, '');
      paginas.push(paginaActual);
      cursorY = ALTURA_MEMBRETE + GAP_ENTRE_BLOQUES; // páginas nuevas también empiezan bajo el membrete, que se repite en todas.
    }
    paginaActual.elementos.push(...bloque.crear(cursorY));
    cursorY += bloque.alto + GAP_ENTRE_BLOQUES;
  }

  const precioTotal = secciones.reduce((suma, s) => suma + s.precio, 0);

  const documento: DocumentoMC = {
    id: randomUUID(), schemaVersion: 1, documentoBaseId: null, etiquetaVersion: null, documentVersion: 1,
    plantillaOrigen: null,
    paginas,
    configuracionPorDefecto: { ancho: PAGINA_A4.ancho, alto: PAGINA_A4.alto, orientacion: 'vertical', margenes: MARGEN },
    fondoPorDefecto: { tipo: 'ninguno' },
    encabezadoPorDefecto: crearMembrete(),
    piePorDefecto: null,
    variables: { claves: {} },
    configuracionImpresion: { sangrado: 0, escala: 1 },
    tema: null,
    estilosGuardados: [],
  };

  return { documento, precioTotal };
}

// ── Generación a partir de una plantilla real diseñada por el usuario (20/08/2026) ──

/**
 * Genera un presupuesto rellenando la PLANTILLA REAL del usuario (diseñada
 * en el editor), en vez de construir un documento desde cero con el
 * esqueleto fijo de arriba — petición explícita del usuario tras ver que
 * el diseño generado automáticamente no se parecía a su plantilla
 * corporativa real.
 *
 * Convención necesaria en la plantilla (documentada al usuario, no
 * inventada aquí sin más): debe contener UNA instancia de un componente
 * reutilizable llamado exactamente "Sección de presupuesto"
 * (`Insertar componente` en el editor), con tres elementos dentro:
 * - un texto cuyo contenido literal sea `{{seccion.titulo}}`
 * - un texto cuyo contenido literal sea `{{seccion.descripcion}}`
 * - un elemento de tipo "Precio destacado"
 *
 * Esa instancia marca DÓNDE empiezan las secciones (su posición) y CÓMO
 * se ven (el propio componente es la plantilla visual de cada sección) —
 * se sustituye por tantas copias como partidas tenga el trabajo,
 * paginando automáticamente igual que `generarDocumentoPresupuesto`. El
 * resto de la plantilla (membrete, datos de cliente/empresa ya puestos a
 * mano o vía `{{cliente.nombre}}` etc.) se resuelve con `resolverVariables`,
 * sin tocar aquí.
 */
export type ResultadoGeneracionDesdePlantilla = { documento: DocumentoMC; precioTotal: number; error?: undefined } | { error: string; documento?: undefined; precioTotal?: undefined };

const NOMBRE_COMPONENTE_SECCION = 'Sección de presupuesto';

export function generarDocumentoPresupuestoDesdePlantilla(
  plantillaBase: DocumentoMC,
  componenteSeccion: { id: string; nombre: string; elementos: ElementoMC[] },
  secciones: SeccionPresupuesto[]
): ResultadoGeneracionDesdePlantilla {
  const documento = structuredClone(plantillaBase);

  let paginaMarcador: PaginaMC | undefined;
  let indiceMarcador = -1;
  for (const pagina of documento.paginas) {
    const idx = pagina.elementos.findIndex(
      (e) => e.tipo === 'instanciaComponente' && (e.contenido as any)?.componenteId === componenteSeccion.id
    );
    if (idx !== -1) { paginaMarcador = pagina; indiceMarcador = idx; break; }
  }
  if (!paginaMarcador) {
    return {
      error: `Esta plantilla no tiene ningún marcador del componente "${NOMBRE_COMPONENTE_SECCION}" colocado — ` +
        `en el editor, con la plantilla abierta, usa "Insertar componente" y coloca una instancia de "${NOMBRE_COMPONENTE_SECCION}" ` +
        `donde quieras que empiecen las secciones, y guarda la plantilla otra vez.`,
    };
  }
  const elementoMarcador = paginaMarcador.elementos[indiceMarcador];

  const elTitulo = componenteSeccion.elementos.find((e) => e.tipo === 'texto' && String((e.contenido as any)?.texto ?? '').trim() === '{{seccion.titulo}}');
  const elDescripcion = componenteSeccion.elementos.find((e) => e.tipo === 'texto' && String((e.contenido as any)?.texto ?? '').trim() === '{{seccion.descripcion}}');
  const elPrecio = componenteSeccion.elementos.find((e) => e.tipo === 'precioDestacado');
  if (!elTitulo || !elDescripcion || !elPrecio) {
    return {
      error: `El componente "${NOMBRE_COMPONENTE_SECCION}" debe tener un texto con el contenido exacto "{{seccion.titulo}}", ` +
        `otro texto con "{{seccion.descripcion}}", y un elemento de tipo "Precio destacado" — revísalo y guárdalo de nuevo.`,
    };
  }

  const alturaComponente = Math.max(...componenteSeccion.elementos.map((e) => e.posicion.y + e.tamano.alto));
  const fondoDescripcionOriginal = elDescripcion.posicion.y + elDescripcion.tamano.alto;
  const configPagina = paginaMarcador.configuracion ?? documento.configuracionPorDefecto;
  const alturaMembrete =
    documento.encabezadoPorDefecto && documento.encabezadoPorDefecto !== 'ninguno' ? documento.encabezadoPorDefecto.altura : 0;
  const alturaUtilPagina = configPagina.alto - configPagina.margenes.abajo;
  const yInicioPaginaNueva = alturaMembrete + (alturaMembrete > 0 ? GAP_ENTRE_BLOQUES : configPagina.margenes.arriba);

  /** Materializa una sección: copia los elementos del componente, ids nuevos, contenido real, y crece la caja de descripción si el texto real no cabe en la altura diseñada (empujando hacia abajo lo que esté debajo, ej. el precio). */
  const crearBloqueSeccion = (seccion: SeccionPresupuesto, x: number, y: number): { elementos: ElementoMC[]; alto: number } => {
    const fontSize = Number((elDescripcion.estilo as any)?.fontSize ?? 13);
    const lineHeight = Number((elDescripcion.estilo as any)?.lineHeight ?? 1.4);
    const alturaRealDescripcion = Math.max(elDescripcion.tamano.alto, estimarAlturaTexto(seccion.descripcion, elDescripcion.tamano.ancho, fontSize, lineHeight));
    const alturaExtra = alturaRealDescripcion - elDescripcion.tamano.alto;

    const elementos = componenteSeccion.elementos.map((hijo) => {
      const seEmpuja = alturaExtra > 0 && hijo.posicion.y >= fondoDescripcionOriginal;
      let contenido: unknown = hijo.contenido;
      let alto = hijo.tamano.alto;
      if (hijo.id === elTitulo.id) contenido = { ...(hijo.contenido as Record<string, unknown>), texto: seccion.titulo };
      else if (hijo.id === elDescripcion.id) { contenido = { ...(hijo.contenido as Record<string, unknown>), texto: seccion.descripcion }; alto = alturaRealDescripcion; }
      else if (hijo.id === elPrecio.id) contenido = { modo: 'fijo', valor: formatoMoneda.format(seccion.precio) };
      return {
        ...hijo,
        id: randomUUID(),
        posicion: { x: x + (hijo.posicion.x - elementoMarcador.posicion.x), y: y + hijo.posicion.y + (seEmpuja ? alturaExtra : 0) },
        tamano: { ...hijo.tamano, alto },
        grupoId: null,
        origenComponente: null,
        contenido,
      };
    });
    return { elementos, alto: alturaComponente + Math.max(0, alturaExtra) };
  };

  // Quita el elemento marcador — se sustituye por las secciones reales.
  paginaMarcador.elementos.splice(indiceMarcador, 1);

  let paginaActual = paginaMarcador;
  let cursorY = elementoMarcador.posicion.y;
  for (const seccion of secciones) {
    const bloque = crearBloqueSeccion(seccion, elementoMarcador.posicion.x, cursorY);
    if (cursorY + bloque.alto > alturaUtilPagina && cursorY > yInicioPaginaNueva) {
      paginaActual = nuevaPagina(documento.paginas.length, '');
      documento.paginas.push(paginaActual);
      cursorY = yInicioPaginaNueva;
      const reintento = crearBloqueSeccion(seccion, elementoMarcador.posicion.x, cursorY);
      paginaActual.elementos.push(...reintento.elementos);
      cursorY += reintento.alto + GAP_ENTRE_BLOQUES;
      continue;
    }
    paginaActual.elementos.push(...bloque.elementos);
    cursorY += bloque.alto + GAP_ENTRE_BLOQUES;
  }

  const precioTotal = secciones.reduce((suma, s) => suma + s.precio, 0);
  return { documento, precioTotal };
}
