import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import { almacenamiento } from './almacenamiento.service.js';

/**
 * Generación de PDF/ZIP para facturas (Fase Facturas Profesional). Antes no
 * existía ningún PDF real descargable en toda la app — `exportarPDF` del
 * Motor Documental es `window.print()` (diálogo manual del navegador, no
 * invocable desde el servidor). Este módulo sí genera bytes de PDF reales
 * en el backend, reutilizando `almacenamiento` (ya reparado) para leer las
 * páginas guardadas de cada factura.
 */

type PaginaFactura = { tipo: 'imagen' | 'pdf'; url: string };

/** Resuelve una URL de página (relativa a `/almacenamiento/`, `data:` embebida, o externa) a sus bytes. */
async function obtenerBytesDesdeUrl(url: string): Promise<Buffer> {
  if (!url) throw new Error('URL de página vacía');
  if (url.startsWith('data:')) {
    const base64 = url.split(',')[1] ?? '';
    return Buffer.from(base64, 'base64');
  }
  const prefijoLocal = '/api/presupuestos-service/almacenamiento/';
  if (url.startsWith(prefijoLocal)) {
    const clave = url.slice(prefijoLocal.length);
    const archivo = await almacenamiento.obtener(clave);
    if (!archivo) throw new Error(`Archivo no encontrado en almacenamiento: ${clave}`);
    return archivo.datos;
  }
  // URL externa (p. ej. R2 en producción, o cualquier otro origen).
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Reúne, en orden, las páginas de una factura desde los distintos campos posibles (nuevo `paginas`, o los antiguos `pdfOriginalUrl`/`imagen`/`imagenes`, según lo que tenga cada factura). */
/**
 * Facturas de antes de esta ampliación guardaban cualquier documento
 * (imagen o PDF subido directamente) en `imagen`/`imagenes`, sin ningún
 * campo propio para distinguirlos — detecta el tipo real por el prefijo de
 * la data URL en vez de asumir siempre imagen, o un PDF antiguo fallaría al
 * intentar incrustarlo como JPEG/PNG.
 */
function tipoDesdeUrl(url: string): 'imagen' | 'pdf' {
  return url.startsWith('data:application/pdf') ? 'pdf' : 'imagen';
}

function paginasDeFactura(factura: Record<string, unknown>): PaginaFactura[] {
  const paginas = factura.paginas as PaginaFactura[] | undefined;
  if (Array.isArray(paginas) && paginas.length) return paginas;
  const pdfOriginal = factura.pdfOriginalUrl as string | undefined;
  if (pdfOriginal) return [{ tipo: 'pdf', url: pdfOriginal }];
  const imagenes = factura.imagenes as string[] | undefined;
  if (Array.isArray(imagenes) && imagenes.length) return imagenes.map((url) => ({ tipo: tipoDesdeUrl(url), url }));
  const imagen = factura.imagen as string | undefined;
  if (imagen) return [{ tipo: tipoDesdeUrl(imagen), url: imagen }];
  return [];
}

/** Incrusta una página de imagen (JPEG o PNG) en el PDF como una página a tamaño completo. */
async function anadirPaginaImagen(pdf: PDFDocument, bytes: Buffer): Promise<void> {
  let imagen;
  try {
    imagen = await pdf.embedJpg(bytes);
  } catch {
    imagen = await pdf.embedPng(bytes);
  }
  const pagina = pdf.addPage([imagen.width, imagen.height]);
  pagina.drawImage(imagen, { x: 0, y: 0, width: imagen.width, height: imagen.height });
}

/** Copia todas las páginas de un PDF ya existente (subido tal cual) al PDF de salida. */
async function anadirPaginasPdf(pdf: PDFDocument, bytes: Buffer): Promise<void> {
  const origen = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const copiadas = await pdf.copyPages(origen, origen.getPageIndices());
  for (const p of copiadas) pdf.addPage(p);
}

/**
 * Genera el PDF de una factura: si tiene un único PDF original, se
 * devuelve tal cual (sin recomprimir ni perder calidad); si tiene páginas
 * de imagen (escaneadas o fotografiadas), se ensamblan en un PDF nuevo, una
 * imagen por página, en el orden guardado. Nunca destruye el documento
 * original — esto es una vista derivada para descargar/compartir.
 */
export async function generarPdfFactura(factura: Record<string, unknown>): Promise<Uint8Array> {
  const paginas = paginasDeFactura(factura);
  if (!paginas.length) throw new Error('Esta factura no tiene ningún documento adjunto que convertir a PDF.');

  const pdf = await PDFDocument.create();
  for (const pagina of paginas) {
    const bytes = await obtenerBytesDesdeUrl(pagina.url);
    if (pagina.tipo === 'pdf') await anadirPaginasPdf(pdf, bytes);
    else await anadirPaginaImagen(pdf, bytes);
  }
  return pdf.save();
}

/** Nombre de archivo seguro (sin caracteres problemáticos) a partir del proveedor/concepto y la fecha de una factura. */
export function nombreArchivoFactura(factura: Record<string, unknown>): string {
  const base = String(factura.proveedor || factura.concepto || 'factura').trim().replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').slice(0, 60) || 'factura';
  const fecha = String(factura.fecha || '').replace(/[^0-9-]/g, '');
  return `${base}${fecha ? `_${fecha}` : ''}.pdf`.replace(/\s+/g, '_');
}

/** Evita colisiones de nombre dentro de un mismo ZIP añadiendo un sufijo numérico. */
function nombreUnicoEn(usados: Set<string>, nombre: string): string {
  if (!usados.has(nombre)) { usados.add(nombre); return nombre; }
  const punto = nombre.lastIndexOf('.');
  const base = punto === -1 ? nombre : nombre.slice(0, punto);
  const ext = punto === -1 ? '' : nombre.slice(punto);
  let i = 2;
  let candidato = `${base} (${i})${ext}`;
  while (usados.has(candidato)) { i++; candidato = `${base} (${i})${ext}`; }
  usados.add(candidato);
  return candidato;
}

/**
 * Empaqueta el PDF de cada factura en un único ZIP, organizado en carpetas
 * `Ingresos/`/`Gastos/` cuando `agruparPorTipo` está activo (documentación
 * para el asesor) o en plano cuando no (descarga múltiple normal).
 */
export async function generarZipFacturas(
  facturas: Record<string, unknown>[],
  opciones: { agruparPorTipo?: boolean; archivoExtra?: { nombre: string; datos: Uint8Array } } = {}
): Promise<Uint8Array> {
  const zip = new JSZip();
  const usados = new Set<string>();
  for (const factura of facturas) {
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await generarPdfFactura(factura);
    } catch {
      continue; // Factura sin documento adjunto — se omite del paquete, no rompe el resto.
    }
    const carpeta = opciones.agruparPorTipo ? (factura.tipo === 'ingreso' ? 'Ingresos/' : 'Gastos/') : '';
    const nombre = nombreUnicoEn(usados, `${carpeta}${nombreArchivoFactura(factura)}`);
    zip.file(nombre, pdfBytes);
  }
  if (opciones.archivoExtra) zip.file(opciones.archivoExtra.nombre, opciones.archivoExtra.datos);
  return zip.generateAsync({ type: 'uint8array' });
}

const formatoEuro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/**
 * Genera el PDF de resumen de un período (trimestre) para el asesor:
 * empresa, período, totales de ingresos/gastos/beneficio, número de
 * documentos, y el listado completo con fecha/proveedor/importe de cada
 * factura. Deliberadamente sobrio (una fuente estándar, sin maquetación
 * compleja) — es un documento de trabajo para un asesor fiscal, no una
 * pieza de diseño.
 */
export async function generarResumenPdf(datos: {
  empresaNombre: string;
  periodoLabel: string;
  ingresos: Record<string, unknown>[];
  gastos: Record<string, unknown>[];
  gastosPeriodicos?: { descripcion: string; importe: number; tipo: string }[];
  avisoFiscal: string[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const fuenteNegrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ANCHO = 595, ALTO = 842; // A4 en puntos
  let pagina = pdf.addPage([ANCHO, ALTO]);
  let y = ALTO - 50;
  const margen = 45;

  const nuevaPaginaSiHaceFalta = (alturaNecesaria: number) => {
    if (y - alturaNecesaria < 50) { pagina = pdf.addPage([ANCHO, ALTO]); y = ALTO - 50; }
  };
  const escribir = (texto: string, opciones: { tam?: number; negrita?: boolean; color?: [number, number, number]; salto?: number } = {}) => {
    const tam = opciones.tam ?? 10;
    nuevaPaginaSiHaceFalta(tam + 6);
    pagina.drawText(texto, {
      x: margen, y, size: tam, font: opciones.negrita ? fuenteNegrita : fuente,
      color: opciones.color ? rgb(...opciones.color) : rgb(0.09, 0.08, 0.06),
    });
    y -= opciones.salto ?? tam + 6;
  };

  escribir(datos.empresaNombre, { tam: 18, negrita: true, salto: 24 });
  escribir(`Resumen ${datos.periodoLabel}`, { tam: 13, negrita: true, salto: 22 });
  escribir(`Generado el ${new Date().toLocaleDateString('es-ES')}`, { tam: 8.5, color: [0.45, 0.4, 0.35], salto: 20 });

  const totalIngresos = datos.ingresos.reduce((s, f) => s + Number(f.importe || 0), 0);
  const totalGastos = datos.gastos.reduce((s, f) => s + Number(f.importe || 0), 0);
  const totalPeriodicos = (datos.gastosPeriodicos ?? []).reduce((s, g) => s + g.importe, 0);
  const beneficio = totalIngresos - totalGastos - totalPeriodicos;

  escribir('RESUMEN', { tam: 11, negrita: true, salto: 16 });
  escribir(`Ingresos: ${formatoEuro(totalIngresos)}  (${datos.ingresos.length} facturas)`, { color: [0.24, 0.48, 0.32] });
  escribir(`Gastos (facturas): ${formatoEuro(totalGastos)}  (${datos.gastos.length} facturas)`, { color: [0.61, 0.27, 0.21] });
  if (totalPeriodicos > 0) escribir(`Gastos periódicos/estimados: ${formatoEuro(totalPeriodicos)}`, { color: [0.61, 0.27, 0.21] });
  escribir(`Resultado: ${formatoEuro(beneficio)}`, { negrita: true, salto: 20 });

  const tablaFacturas = (titulo: string, filas: Record<string, unknown>[]) => {
    if (!filas.length) return;
    escribir(titulo, { tam: 11, negrita: true, salto: 16 });
    for (const f of filas) {
      nuevaPaginaSiHaceFalta(12);
      const linea = `${String(f.fecha || '').padEnd(12)}  ${String(f.numeroFactura || '').padEnd(14)}  ${String(f.proveedor || f.concepto || '—').slice(0, 40).padEnd(42)}  ${formatoEuro(Number(f.importe || 0))}`;
      escribir(linea, { tam: 8.5, salto: 12 });
    }
    y -= 8;
  };
  tablaFacturas('INGRESOS', datos.ingresos);
  tablaFacturas('GASTOS', datos.gastos);

  if (datos.gastosPeriodicos?.length) {
    escribir('GASTOS PERIÓDICOS / ESTIMADOS', { tam: 11, negrita: true, salto: 16 });
    for (const g of datos.gastosPeriodicos) {
      escribir(`${g.tipo.padEnd(14)}  ${g.descripcion.slice(0, 40).padEnd(42)}  ${formatoEuro(g.importe)}`, { tam: 8.5, salto: 12 });
    }
    y -= 8;
  }

  if (datos.avisoFiscal.length) {
    nuevaPaginaSiHaceFalta(20 + datos.avisoFiscal.length * 12);
    escribir('AVISO', { tam: 10, negrita: true, salto: 14 });
    for (const linea of datos.avisoFiscal) escribir(linea, { tam: 8, color: [0.45, 0.4, 0.35], salto: 11 });
  }

  return pdf.save();
}
