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

export type DatosClienteAutoRelleno = { nombre: string; direccion: string; telefono: string; dni: string; fecha: string };

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
 */
export function rellenarLinea(linea: string, datos: DatosClienteAutoRelleno): { linea: string; huboRelleno: boolean } {
  const coincidencias: { finEtiqueta: number; inicio: number; dato: keyof DatosClienteAutoRelleno }[] = [];
  for (const { dato, patron } of ETIQUETAS_CLIENTE) {
    const global = new RegExp(patron.source, patron.flags.includes('g') ? patron.flags : `${patron.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = global.exec(linea))) coincidencias.push({ inicio: m.index, finEtiqueta: m.index + m[0].length, dato });
  }
  if (coincidencias.length === 0) return { linea, huboRelleno: false };
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
  return { linea: resultado, huboRelleno };
}

/**
 * Corrección 24/08/2026 (reportado con captura): el bloque de texto que
 * se insertaba antes en una posición fija se solapaba con la cabecera
 * de la plantilla en cuanto esta ya traía su propia sección "Cliente"
 * con estas mismas etiquetas en blanco. Ahora se busca y rellena ESA
 * sección existente en vez de añadir nada nuevo — recorre todos los
 * elementos de texto del documento, línea a línea. Devuelve también si
 * se rellenó algo, para decidir si aún hace falta el bloque de reserva
 * (`crearBloqueDatosCliente`, más abajo) en documentos sin ninguna
 * etiqueta reconocible (p. ej. uno en blanco, sin plantilla).
 */
export function rellenarEtiquetasCliente(documento: DocumentoMC, datos: DatosClienteAutoRelleno): { documento: DocumentoMC; rellenoAlgo: boolean } {
  const copia = structuredClone(documento);
  let rellenoAlgo = false;
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    if (elemento.tipo !== 'texto') continue;
    const textoOriginal = (elemento.contenido as { texto?: unknown }).texto;
    if (typeof textoOriginal !== 'string') continue;
    const lineasNuevas = textoOriginal.split('\n').map((linea) => {
      const { linea: lineaNueva, huboRelleno } = rellenarLinea(linea, datos);
      if (huboRelleno) rellenoAlgo = true;
      return lineaNueva;
    });
    const textoNuevo = lineasNuevas.join('\n');
    if (textoNuevo !== textoOriginal) reemplazar({ ...elemento, contenido: { ...elemento.contenido, texto: textoNuevo } });
  }
  return { documento: copia, rellenoAlgo };
}

/**
 * Bloque de texto de reserva — solo se usa cuando `rellenarEtiquetasCliente`
 * no encontró ninguna etiqueta que rellenar en todo el documento (típicamente
 * un presupuesto en blanco, sin plantilla, donde no hay nada con lo que
 * pueda solaparse). Elemento de texto normal, sin ningún vínculo especial
 * con el cliente tras crearse — el usuario puede moverlo/editarlo/borrarlo
 * como cualquier otro.
 */
export function crearBloqueDatosCliente(datos: DatosClienteAutoRelleno): ElementoMC {
  const lineas = [datos.nombre];
  if (datos.direccion) lineas.push(datos.direccion);
  if (datos.telefono) lineas.push(`Tel: ${datos.telefono}`);
  if (datos.dni) lineas.push(`DNI/NIE: ${datos.dni}`);
  lineas.push(`Fecha: ${datos.fecha}`);
  const base = crearElementoBase('texto', { x: 40, y: 90 }, { ancho: 260, alto: 20 * lineas.length + 20 });
  return { ...base, contenido: { texto: lineas.join('\n') }, estilo: { fontSize: 13, lineHeight: 1.4 } };
}

/**
 * Aplica el auto-relleno completo a un documento recién resuelto (con o
 * sin plantilla): primero intenta rellenar etiquetas ya existentes; si no
 * encuentra ninguna, añade el bloque de reserva en la primera página.
 */
export function autoRellenarDatosCliente(documento: DocumentoMC, datos: DatosClienteAutoRelleno): DocumentoMC {
  const { documento: documentoConEtiquetas, rellenoAlgo } = rellenarEtiquetasCliente(documento, datos);
  if (rellenoAlgo) return documentoConEtiquetas;
  const primeraPagina = documentoConEtiquetas.paginas[0];
  if (!primeraPagina) return documentoConEtiquetas;
  return anadirElemento(documentoConEtiquetas, primeraPagina.id, crearBloqueDatosCliente(datos));
}
