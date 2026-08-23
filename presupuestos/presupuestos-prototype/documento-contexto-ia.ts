import type { DocumentoMC, ElementoMC } from './documento-modelo.js';

/**
 * Extracción de contexto de texto del documento para la IA del Presupuesto
 * (23/08/2026) — funciones puras, sin React, para poder testearlas sin
 * montar el editor. Nunca modifican el documento; solo lo leen.
 */

const LONGITUD_MAXIMA_CONTEXTO = 4000;

/** Texto "de fondo" de un elemento, si su tipo tiene texto legible — hoy: `texto` y `bloqueIA` ya generado. El resto de tipos (imagen, línea, precio…) no aportan texto de contexto. */
function textoDeElemento(elemento: ElementoMC): string {
  if (elemento.tipo === 'texto') return String(elemento.contenido.texto ?? '').trim();
  if (elemento.tipo === 'bloqueIA' && elemento.contenido.estado === 'generado') return String(elemento.contenido.textoGenerado ?? '').trim();
  return '';
}

/**
 * Resumen en texto plano de todo lo ya escrito en el documento — contexto
 * para que la IA del Presupuesto no repita ni contradiga lo que el
 * carpintero ya redactó. Nunca se usa como fuente de datos que la IA pueda
 * "inventar": es solo memoria de lo ya existente.
 *
 * Recorre páginas, encabezado y pie. No entra dentro de `instanciaComponente`
 * (limitación conocida y aceptada para esta primera versión — el contenido
 * de un componente reutilizable rara vez es texto libre propio de ESTE
 * presupuesto concreto).
 */
export function extraerContextoDocumento(documento: DocumentoMC): string {
  const partes: string[] = [];
  for (const pagina of documento.paginas) {
    for (const elemento of pagina.elementos) {
      const texto = textoDeElemento(elemento);
      if (texto) partes.push(texto);
    }
    for (const zona of [pagina.encabezado, pagina.pie]) {
      if (zona && zona !== 'ninguno') {
        for (const elemento of zona.elementos) {
          const texto = textoDeElemento(elemento);
          if (texto) partes.push(texto);
        }
      }
    }
  }
  const completo = partes.join('\n\n');
  return completo.length > LONGITUD_MAXIMA_CONTEXTO
    ? completo.slice(0, LONGITUD_MAXIMA_CONTEXTO) + '\n[…contenido adicional omitido por longitud]'
    : completo;
}

/** Texto del elemento actualmente seleccionado, si tiene — cadena vacía si no hay selección o su tipo no tiene texto. */
export function textoDeElementoSeleccionado(elemento: ElementoMC | undefined): string {
  return elemento ? textoDeElemento(elemento) : '';
}

/** true si una propuesta de texto se puede aplicar a este elemento — hoy, solo elementos de tipo `'texto'` (los únicos con un campo de texto libre editable). */
export function puedeAplicarPropuestaA(elemento: ElementoMC | undefined): boolean {
  return elemento?.tipo === 'texto';
}
