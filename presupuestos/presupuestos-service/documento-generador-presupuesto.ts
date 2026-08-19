import { randomUUID } from 'node:crypto';
import type { DocumentoMC, ElementoMC, PaginaMC } from './documento-modelo.js';
import { PAGINA_A4 } from './documento-modelo.js';
import { resolverVariables } from './documento-registro-variables.js';
import type { ContextoVariables } from './documento-registro-variables.js';

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
 * Sin librería de maquetación de texto (Word/InDesign): la altura de cada
 * bloque de texto se ESTIMA a partir de su longitud (`estimarAlturaTexto`)
 * porque los elementos del Motor Documental tienen una caja de tamaño fijo
 * (`overflow: hidden` en el render) — es una aproximación deliberada, no
 * un cálculo real de saltos de línea del navegador; el carpintero puede
 * agrandar la caja a mano si un texto queda justo.
 */

const MARGEN = { arriba: 40, abajo: 40, izquierda: 40, derecha: 40 };
const ANCHO_UTIL = PAGINA_A4.ancho - MARGEN.izquierda - MARGEN.derecha;
const ALTURA_MEMBRETE = 90;
const ALTURA_UTIL_PAGINA = PAGINA_A4.alto - MARGEN.arriba - MARGEN.abajo;
const GAP_ENTRE_BLOQUES = 24;

const formatoMoneda = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export type SeccionPresupuesto = { titulo: string; descripcion: string; precio: number };

export type ContextoGeneracion = ContextoVariables & {
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
    estilo: { colorFondo: '#f5ede0', colorTexto: '#8a6835' },
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

/** Membrete corporativo: nombre de empresa a la izquierda, "PRESUPUESTO" + fecha a la derecha — mismo patrón visual que el preventivo de referencia del usuario (19/08/2026). */
function crearMembrete(): DocumentoMC['encabezadoPorDefecto'] {
  return {
    altura: ALTURA_MEMBRETE,
    elementos: [
      elementoTexto(MARGEN.izquierda, 22, 260, 50, '{{empresa.nombre}}', { fontFamily: 'Georgia', fontSize: 22, fontWeight: 'bold', color: '#51483f' }),
      elementoTexto(PAGINA_A4.ancho - MARGEN.derecha - 260, 20, 260, 28, 'PRESUPUESTO', { fontSize: 16, fontWeight: 'bold', textAlign: 'right' }),
      elementoTexto(PAGINA_A4.ancho - MARGEN.derecha - 260, 50, 260, 22, 'Fecha: {{fecha}}', { fontSize: 11, color: '#7a7060', textAlign: 'right' }),
    ],
  };
}

/** Portada: bloque de cliente y de empresa lado a lado, y el título del presupuesto — variables sin resolver todavía ({{...}}), se resuelven al final con `resolverVariables`. */
function crearPaginaPortada(): PaginaMC {
  const pagina = nuevaPagina(0, 'Portada');
  const anchoBloque = (ANCHO_UTIL - GAP_ENTRE_BLOQUES) / 2;
  pagina.elementos = [
    elementoTexto(MARGEN.izquierda, 0, anchoBloque, 100, 'CLIENTE\n{{cliente.nombre}}\n{{cliente.direccion}}\n{{cliente.telefono}}', { fontSize: 12.5, lineHeight: 1.6 }),
    elementoTexto(MARGEN.izquierda + anchoBloque + GAP_ENTRE_BLOQUES, 0, anchoBloque, 100, '{{empresa.nombre}}\n{{empresa.telefono}}\n{{empresa.email}}', { fontSize: 12.5, lineHeight: 1.6, textAlign: 'right' }),
    elementoTexto(MARGEN.izquierda, 110, ANCHO_UTIL, 40, '{{presupuesto.titulo}}', { fontSize: 21, fontWeight: 'bold' }),
  ];
  return pagina;
}

/** Página final: condiciones de pago, condiciones generales, IBAN — mismo patrón de bloque que una sección más, para que la reutilice el mismo bucle de paginación. */
function bloqueCondiciones(condicionesPago: string, condicionesGenerales: string): { alto: number; crear: (y: number) => ElementoMC[] } {
  const textoCompleto = [
    condicionesPago ? `Condiciones de pago: ${condicionesPago}` : '',
    'IBAN: {{empresa.iban}}',
    condicionesGenerales,
  ].filter(Boolean).join('\n\n');
  const alto = 30 + estimarAlturaTexto(textoCompleto, ANCHO_UTIL, 12, 1.6) + 20;
  return {
    alto,
    crear: (y: number) => [
      elementoTexto(MARGEN.izquierda, y, ANCHO_UTIL, 30, 'Condiciones', { fontSize: 16, fontWeight: 'bold' }),
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
      elementoTexto(MARGEN.izquierda, y, ANCHO_UTIL, 26, seccion.titulo, { fontSize: 16.5, fontWeight: 'bold' }),
      elementoTexto(MARGEN.izquierda, y + 34, ANCHO_UTIL, altoDescripcion, seccion.descripcion, { fontSize: 12.5, lineHeight: 1.55 }),
      elementoPrecioFijo(MARGEN.izquierda, y + yPrecio, 210, 46, seccion.precio),
    ],
  };
}

/**
 * Construye el documento completo: portada + secciones (paginadas
 * automáticamente cuando no caben) + condiciones, y resuelve las
 * variables `{{...}}` al final contra el contexto real. `precioTotal` es
 * la suma real de los precios de sección — nunca se confía en que la IA
 * haga bien la suma (mismo criterio que ya usa `anadirElementoPresupuesto`).
 */
export function generarDocumentoPresupuesto(secciones: SeccionPresupuesto[], contexto: ContextoGeneracion): { documento: DocumentoMC; precioTotal: number } {
  const paginas: PaginaMC[] = [crearPaginaPortada()];
  let paginaActual = paginas[0];
  let cursorY = 170; // debajo del bloque de cliente/empresa + título de la portada.

  const bloques = [
    ...secciones.map((s) => bloqueSeccion(s)),
    bloqueCondiciones(contexto.condicionesPago ?? '', contexto.condicionesGenerales ?? ''),
  ];

  for (const bloque of bloques) {
    if (cursorY + bloque.alto > ALTURA_UTIL_PAGINA) {
      paginaActual = nuevaPagina(paginas.length, '');
      paginas.push(paginaActual);
      cursorY = 0;
    }
    paginaActual.elementos.push(...bloque.crear(cursorY));
    cursorY += bloque.alto + GAP_ENTRE_BLOQUES;
  }

  const precioTotal = secciones.reduce((suma, s) => suma + s.precio, 0);

  const documentoSinResolver: DocumentoMC = {
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

  const documento = resolverVariables(documentoSinResolver, { ...contexto, presupuesto: { titulo: contexto.presupuesto?.titulo ?? '', precioTotal } });
  return { documento, precioTotal };
}
