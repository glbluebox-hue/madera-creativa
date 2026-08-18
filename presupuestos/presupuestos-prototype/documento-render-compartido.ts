import type { DocumentoMC, ElementoMC, ZonaMC } from './documento-modelo.js';
import { resolverEstiloEfectivo } from './documento-comandos.js';
import { formatoEuro } from './calculos.js';

/**
 * Lógica de resolución de un `DocumentoMC` para PINTARLO (no para editarlo)
 * — compartida entre `editor-documento.tsx` (lienzo interactivo) y
 * `visor-documento.tsx` (Portal del cliente, solo lectura). Deliberadamente
 * solo la parte pura (sin JSX): cada consumidor pinta el DOM a su manera
 * (el editor añade refs/arrastre/selección; el visor no necesita nada de
 * eso), pero las reglas de "qué se ve" y "con qué valor" deben ser
 * exactamente las mismas en los dos sitios.
 */

export type ContextoResolucionMC = {
  /** Logo vinculado de la empresa — para el tipo "logotipo" en modo 'vinculado'. `undefined`/vacío si no hay. */
  logoEmpresa?: string;
  /** Precio vinculado del contenedor (presupuesto) — para el tipo "precioDestacado" en modo 'vinculado'. */
  precioVinculado?: number;
};

/**
 * Resuelve la zona efectiva (encabezado o pie) de una página: `'ninguno'`
 * la desactiva explícitamente, `null` hereda la zona por defecto del
 * documento, y un valor propio la sobrescribe — mismo criterio de herencia
 * documentado en `documento-modelo.ts` (`esquemaPaginaMC`).
 */
export function resolverZonaEfectiva(
  zonaPagina: ZonaMC | 'ninguno' | null,
  zonaPorDefecto: ZonaMC | 'ninguno' | null
): ZonaMC | null {
  if (zonaPagina === 'ninguno') return null;
  if (zonaPagina) return zonaPagina;
  if (!zonaPorDefecto || zonaPorDefecto === 'ninguno') return null;
  return zonaPorDefecto;
}

/**
 * true si el elemento debe pintarse en este contexto. `modoSalida` es true
 * para cualquier "salida" del documento (exportar/imprimir en el editor, o
 * el Portal del cliente) y false para el lienzo del editor mientras se
 * edita — mismo criterio ya usado en `editor-documento.tsx` antes de este
 * cambio, solo que ahora expuesto para reutilizarlo desde el visor.
 */
export function elementoVisibleEn(elemento: ElementoMC, modoSalida: boolean): boolean {
  const v = elemento.restricciones.visibilidad;
  if (v === 'oculto') return false;
  return modoSalida ? v !== 'soloEdicion' : v !== 'soloImpresion';
}

/**
 * Elemento "de presentación": aplica el estilo efectivo (con nombre +
 * override local) y resuelve en vivo los elementos vinculados (logo de
 * empresa, precio del presupuesto) — nunca se persiste el valor resuelto,
 * siempre se recalcula a partir de la referencia (`contenido.modo:'vinculado'`).
 */
export function resolverElementoPresentacion(documento: DocumentoMC, elemento: ElementoMC, contexto: ContextoResolucionMC): ElementoMC {
  const estiloEfectivo = resolverEstiloEfectivo(documento, elemento);
  const base = estiloEfectivo === elemento.estilo ? elemento : { ...elemento, estilo: estiloEfectivo };
  if (base.tipo === 'logotipo') {
    const contenido = base.contenido as Record<string, unknown>;
    const modo = (contenido.modo as string) ?? 'vinculado';
    const url = modo === 'vinculado' ? (contexto.logoEmpresa ?? '') : ((contenido.url as string) ?? '');
    return { ...base, contenido: { ...contenido, url } };
  }
  if (base.tipo === 'precioDestacado') {
    const contenido = base.contenido as Record<string, unknown>;
    const modo = (contenido.modo as string) ?? 'vinculado';
    const valor = modo === 'vinculado'
      ? (contexto.precioVinculado !== undefined ? formatoEuro(contexto.precioVinculado) : '')
      : ((contenido.valor as string) ?? '');
    return { ...base, contenido: { ...contenido, valor } };
  }
  return base;
}
