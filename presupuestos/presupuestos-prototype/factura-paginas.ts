import type { Factura } from './types.js';

/** Una página del documento de una factura, ya con su tipo real detectado. */
export type PaginaFacturaVista = { url: string; tipo: 'imagen' | 'pdf' };

/**
 * Reúne, en orden, las páginas visualizables de una factura desde los
 * distintos campos posibles — mismo criterio que `paginasDeFactura` del
 * backend (`documentos-factura.service.ts`), reescrito aquí para el
 * navegador. Las facturas de antes de esta ampliación guardaban cualquier
 * documento (imagen o PDF subido directamente) en `imagen`/`imagenes`, sin
 * ningún campo propio para distinguirlos — se detecta el tipo real por el
 * prefijo de la data URL en vez de asumir siempre imagen.
 */
export function paginasVisualizablesDeFactura(f: Factura): PaginaFacturaVista[] {
  if (f.paginas?.length) return f.paginas;
  if (f.pdfOriginalUrl) return [{ tipo: 'pdf', url: f.pdfOriginalUrl }];
  const tipoDesdeUrl = (url: string): 'imagen' | 'pdf' => (url.startsWith('data:application/pdf') ? 'pdf' : 'imagen');
  if (f.imagenes?.length) return f.imagenes.map((url) => ({ tipo: tipoDesdeUrl(url), url }));
  if (f.imagen) return [{ tipo: tipoDesdeUrl(f.imagen), url: f.imagen }];
  return [];
}
