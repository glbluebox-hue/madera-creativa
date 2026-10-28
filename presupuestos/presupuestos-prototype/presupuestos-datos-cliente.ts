import type { DocumentoMC, ElementoMC } from './documento-modelo.js';
import { crearElementoBase, anadirElemento, recorrerElementos } from './documento-comandos.js';

/**
 * Auto-relleno de los datos del cliente al crear un presupuesto
 * (24/08/2026) — módulo puro, sin React ni ninguna otra dependencia de UI,
 * a propósito: `presupuestos-lista-global.tsx` (quien lo usa) importa
 * `AbrirDocumento`, que arrastra el editor de lienzo legado sobre
 * Excalidraw — una librería que revienta en el entorno de test (jsdom no
 * implementa `HTMLCanvasElement.getContext`). Aislar esta lógica aquí es
 * lo que permite testearla sin arrastrar ese árbol de imports.
 */

export type DatosClienteAutoRelleno = { nombre: string; direccion: string; codigoPostal: string; poblacion: string; telefono: string; dni: string; fecha: string };

/**
 * Etiquetas típicas de un bloque "Cliente" en una plantilla ya diseñada
 * (Nombre:/Dirección:/Teléfono:/CIF-NIF:/Fecha:, con guiones bajos o
 * espacios de relleno) — cada una asociada al dato que debe sustituir su
 * hueco en blanco. Varias etiquetas admitidas para el mismo dato (CIF,
 * NIF, DNI, NIE) porque cada plantilla usa la que le parece.
 */
const ETIQUETAS_CLIENTE: { dato: keyof DatosClienteAutoRelleno; patron: RegExp }[] = [
  { dato: 'fecha', patron: /\bfecha\s*:/i },
  { dato: 'nombre', patron: /\bnombre\s*:/i },
  { dato: 'direccion', patron: /\bdirecci[oó]n\s*:/i },
  { dato: 'codigoPostal', patron: /\bc[oó]digo\s*postal\s*:/i },
  { dato: 'poblacion', patron: /\bpoblaci[oó]n\s*:/i },
  { dato: 'telefono', patron: /\btel[eé]fono\s*:/i },
  { dato: 'dni', patron: /\b(?:cif\s*\/\s*nif|dni\s*\/\s*nie|nif|dni|nie)\s*:/i },
];

/**
 * Rellena, dentro de una línea de texto, el hueco en blanco que sigue a
 * cada etiqueta reconocida — nunca toca una etiqueta que ya tenga algo
 * escrito detrás (solo se considera "hueco" una racha de espacios y/o
 * guiones bajos, el "___" con el que se suele dibujar la línea a
 * rellenar). Varias etiquetas pueden compartir la misma línea (ej.
 * "Teléfono: ____  CIF/NIF: ____"); se procesan de derecha a izquierda
 * para que sustituir una no invalide la posición de las anteriores.
 * Devuelve también QUÉ datos tienen ya una etiqueta propia en esta línea
 * (`cubiertos`) — lo necesita `rellenarEtiquetasCliente` para saber qué
 * datos han quedado SIN ningún sitio en toda la plantilla (petición real
 * del usuario, 28/10/2026: una plantilla con "Dirección:"/"Teléfono:" ya
 * puestos pero sin "Código postal:"/"Población:"/"Fecha:" se quedaba sin
 * esos tres datos en ningún sitio — `autoRellenarDatosCliente` solo
 * añadía el bloque de reserva completo cuando NINGÚN campo se había
 * rellenado, nunca para completar los que faltaban junto a los que sí).
 * Un dato cuenta como "cubierto" en cuanto su etiqueta EXISTE en la
 * plantilla, tenga ya contenido (manual, o resuelto antes vía
 * `{{variable}}`) o un hueco que esta función rellena ahora — en ambos
 * casos ya tiene un sitio propio y no debe duplicarse en el bloque de
 * reserva.
 */
export function rellenarLinea(linea: string, datos: DatosClienteAutoRelleno): { linea: string; huboRelleno: boolean; cubiertos: Set<keyof DatosClienteAutoRelleno> } {
  const cubiertos = new Set<keyof DatosClienteAutoRelleno>();
  const coincidencias: { finEtiqueta: number; inicio: number; dato: keyof DatosClienteAutoRelleno }[] = [];
  for (const { dato, patron } of ETIQUETAS_CLIENTE) {
    const global = new RegExp(patron.source, patron.flags.includes('g') ? patron.flags : `${patron.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = global.exec(linea))) coincidencias.push({ inicio: m.index, finEtiqueta: m.index + m[0].length, dato });
  }
  if (coincidencias.length === 0) return { linea, huboRelleno: false, cubiertos };
  for (const c of coincidencias) cubiertos.add(c.dato);
  coincidencias.sort((a, b) => a.inicio - b.inicio);
  let resultado = linea;
  let huboRelleno = false;
  for (let i = coincidencias.length - 1; i >= 0; i--) {
    const actual = coincidencias[i];
    const siguienteInicio = i + 1 < coincidencias.length ? coincidencias[i + 1].inicio : resultado.length;
    const hueco = resultado.slice(actual.finEtiqueta, siguienteInicio);
    if (!/^[ _]*$/.test(hueco)) continue; // ya hay algo escrito ahí — no tocar
    const valor = datos[actual.dato];
    if (!valor) continue; // sin dato real (ej. cliente sin DNI) — se deja el hueco tal cual, no se borra
    resultado = `${resultado.slice(0, actual.finEtiqueta)} ${valor}${resultado.slice(siguienteInicio)}`;
    huboRelleno = true;
  }
  return { linea: resultado, huboRelleno, cubiertos };
}

/**
 * Corrección 24/08/2026 (reportado con captura): el bloque de texto que
 * se insertaba antes en una posición fija se solapaba con la cabecera
 * de la plantilla en cuanto esta ya traía su propia sección "Cliente"
 * con estas mismas etiquetas en blanco. Ahora se busca y rellena ESA
 * sección existente en vez de añadir nada nuevo — recorre todos los
 * elementos de texto del documento, línea a línea. Devuelve también QUÉ
 * datos tienen ya una etiqueta propia en algún sitio del documento (unión
 * de todas las líneas), para que `autoRellenarDatosCliente` sepa cuáles
 * se han quedado sin ningún sitio en toda la plantilla y necesitan el
 * bloque de reserva — antes solo se sabía SI se había rellenado algo,
 * nunca el detalle por campo (ver `rellenarLinea`).
 */
export function rellenarEtiquetasCliente(documento: DocumentoMC, datos: DatosClienteAutoRelleno): { documento: DocumentoMC; cubiertos: Set<keyof DatosClienteAutoRelleno> } {
  const copia = structuredClone(documento);
  const cubiertos = new Set<keyof DatosClienteAutoRelleno>();
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (elemento.tipo !== 'texto') continue;
    const textoOriginal = (elemento.contenido as { texto?: unknown }).texto;
    if (typeof textoOriginal !== 'string') continue;
    const lineasNuevas = textoOriginal.split('\n').map((linea) => {
      const { linea: lineaNueva, cubiertos: cubiertosLinea } = rellenarLinea(linea, datos);
      for (const dato of cubiertosLinea) cubiertos.add(dato);
      return lineaNueva;
    });
    const textoNuevo = lineasNuevas.join('\n');
    if (textoNuevo !== textoOriginal) {
      reemplazar({ ...elemento, contenido: { ...elemento.contenido, texto: textoNuevo }, tamano: tamanoParaTexto(elemento, textoNuevo) });
    }
  }
  return { documento: copia, cubiertos };
}

/**
 * Crece la caja de un elemento de texto, nunca la encoge, para que el
 * valor que acabamos de rellenar nunca quede invisible — bug real
 * reportado con captura, 28/10/2026: una etiqueta como "Nombre:" en una
 * plantilla propia del usuario suele venir en una caja ajustada SOLO al
 * ancho de la propia etiqueta; al escribir el valor detrás, el Motor
 * Documental envuelve el texto sobrante a una segunda línea
 * (`white-space: pre-wrap` en el render) que la caja original —
 * pensada para una sola línea— recorta por completo (`overflow: hidden`),
 * así que el dato parecía no haberse rellenado aunque sí estaba guardado.
 * Ensancha lo justo para que la línea más larga quepa en una sola línea
 * (evita el envuelto) y, si aun así el texto necesitara más líneas de las
 * que ya caben, también crece el alto — mismo cálculo por caracteres que
 * `estimarAlturaTexto` en `documento-generador-presupuesto.ts`.
 */
function tamanoParaTexto(elemento: ElementoMC, texto: string): ElementoMC['tamano'] {
  const estilo = (elemento.estilo ?? {}) as { fontSize?: number; lineHeight?: number };
  const fontSize = estilo.fontSize ?? 16;
  const lineHeight = estilo.lineHeight ?? 1.2;
  const lineas = texto.split('\n');
  const anchoCaracter = fontSize * 0.55;
  const anchoNecesario = Math.max(...lineas.map((l) => Math.ceil(l.length * anchoCaracter)));
  const ancho = Math.max(elemento.tamano.ancho, anchoNecesario + 8);
  const lineasQueCaben = Math.max(1, Math.floor(elemento.tamano.alto / (fontSize * lineHeight)));
  const alto = lineas.length > lineasQueCaben ? Math.ceil(lineas.length * fontSize * lineHeight) : elemento.tamano.alto;
  return { ancho, alto };
}

/**
 * Bloque de texto de reserva con SOLO los datos que no encontraron ningún
 * hueco de etiqueta en toda la plantilla (`pendientes` — ver
 * `autoRellenarDatosCliente`) — nunca repite un dato que la propia
 * plantilla ya mostraba en su sitio. Elemento de texto normal, sin ningún
 * vínculo especial con el cliente tras crearse — el usuario puede
 * moverlo/editarlo/borrarlo como cualquier otro. `posicion` la calcula
 * `autoRellenarDatosCliente` a partir del propio documento (nunca una
 * coordenada fija — bug real con captura, 28/10/2026: `{ x: 40, y: 90 }`
 * caía justo encima del logo de la cabecera en la plantilla corporativa
 * del usuario); el valor por defecto solo es para quien llame a esta
 * función directamente (ej. los tests).
 */
export function crearBloqueDatosCliente(
  datos: DatosClienteAutoRelleno,
  pendientes: Set<keyof DatosClienteAutoRelleno>,
  posicion: { x: number; y: number } = { x: 40, y: 90 }
): ElementoMC | null {
  // Sin DNI/NIE aquí a propósito (petición del usuario, 28/10/2026): un
  // presupuesto, a diferencia de una factura, no lo necesita — si la
  // plantilla ya tiene su propia etiqueta "DNI:"/"NIF:" se sigue
  // rellenando en su sitio (ver `ETIQUETAS_CLIENTE`), pero nunca se añade
  // aquí sin que el usuario lo haya puesto él mismo en el diseño.
  const lineas: string[] = [];
  if (pendientes.has('nombre') && datos.nombre) lineas.push(datos.nombre);
  if (pendientes.has('direccion') && datos.direccion) lineas.push(datos.direccion);
  const codigoPostalYPoblacion = [pendientes.has('codigoPostal') ? datos.codigoPostal : '', pendientes.has('poblacion') ? datos.poblacion : ''].filter(Boolean).join(' ');
  if (codigoPostalYPoblacion) lineas.push(codigoPostalYPoblacion);
  if (pendientes.has('telefono') && datos.telefono) lineas.push(`Tel: ${datos.telefono}`);
  if (pendientes.has('fecha')) lineas.push(`Fecha: ${datos.fecha}`);
  if (lineas.length === 0) return null;
  const base = crearElementoBase('texto', posicion, { ancho: 260, alto: 20 * lineas.length + 20 });
  return { ...base, contenido: { texto: lineas.join('\n') }, estilo: { fontSize: 13, lineHeight: 1.4 } };
}

/**
 * Aplica el auto-relleno completo a un documento recién resuelto (con o
 * sin plantilla): primero rellena las etiquetas ya presentes en la propia
 * plantilla, y para cualquier dato con valor real que no haya encontrado
 * ningún hueco en NINGÚN sitio del documento (ej. una plantilla con
 * "Dirección:"/"Teléfono:" pero sin "Código postal:"/"Fecha:"), añade un
 * bloque de reserva pequeño SOLO con esos datos sueltos — nunca repite lo
 * que la plantilla ya mostraba en su sitio, nunca omite un dato real solo
 * porque otro campo sí encontró hueco (fallo real, 28/10/2026: con la
 * plantilla propia del usuario, código postal/población/fecha
 * desaparecían del todo porque nombre/dirección/teléfono ya habían
 * encontrado hueco en otro lado).
 */
export function autoRellenarDatosCliente(documento: DocumentoMC, datos: DatosClienteAutoRelleno): DocumentoMC {
  const { documento: documentoConEtiquetas, cubiertos } = rellenarEtiquetasCliente(documento, datos);
  const pendientes = new Set<keyof DatosClienteAutoRelleno>(
    (Object.keys(datos) as (keyof DatosClienteAutoRelleno)[]).filter((dato) => !cubiertos.has(dato))
  );
  const primeraPagina = documentoConEtiquetas.paginas[0];
  if (!primeraPagina) return documentoConEtiquetas;
  // Debajo de TODO lo que ya hay en la página (logo, membrete, tabla...),
  // nunca en una coordenada fija — evita el solape real reportado (ver
  // `crearBloqueDatosCliente`). El membrete (logo de cabecera) vive en
  // `encabezadoPorDefecto`, FUERA de `pagina.elementos` — sin contarlo,
  // un presupuesto recién creado (página casi vacía) calculaba yLibre≈0 y
  // el bloque caía encima del logo (bug real con captura, 28/10/2026).
  const alturaMembrete =
    documentoConEtiquetas.encabezadoPorDefecto && documentoConEtiquetas.encabezadoPorDefecto !== 'ninguno'
      ? documentoConEtiquetas.encabezadoPorDefecto.altura
      : 0;
  const yLibre = primeraPagina.elementos.reduce((max, el) => Math.max(max, el.posicion.y + el.tamano.alto), alturaMembrete);
  const bloque = crearBloqueDatosCliente(datos, pendientes, { x: 40, y: yLibre + 20 });
  if (!bloque) return documentoConEtiquetas;
  return anadirElemento(documentoConEtiquetas, primeraPagina.id, bloque);
}
