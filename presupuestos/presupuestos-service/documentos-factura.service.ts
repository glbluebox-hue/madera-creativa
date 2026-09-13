import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import { almacenamiento } from './almacenamiento.service.js';
import { verificarTokenArchivo } from './token.service.js';
import type { ResumenImpuestosTrimestre } from './motor-fiscal.js';

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
  // Factura del bucket privado (Fase "Facturas privadas" + incidencia
  // 29/08/2026) — `resolverUrlsFactura` ya no devuelve una URL firmada de
  // R2 externa para estos archivos, sino esta ruta propia relativa (ver
  // `token.service.ts`). Un `fetch()` normal fallaría (URL relativa sin
  // base) e iría innecesariamente por HTTP contra el propio servidor —
  // se resuelve el token aquí mismo y se lee directo de `almacenamiento`,
  // exactamente igual que hace la propia ruta `/almacenamiento-privado`.
  const prefijoPrivado = '/almacenamiento-privado?token=';
  if (url.startsWith(prefijoPrivado)) {
    const token = decodeURIComponent(url.slice(prefijoPrivado.length));
    const clave = verificarTokenArchivo(token);
    if (!clave) throw new Error('Token de archivo privado inválido o caducado');
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
 * Un único PDF con las páginas de TODAS las facturas dadas, una detrás de
 * otra en el mismo orden — sin resumen, sin ZIP, solo el contenido visual
 * de las facturas tal cual se guardaron (petición real, 25/08/2026: "un
 * PDF solo de imagen de facturas" para mandar de un vistazo al asesor, en
 * vez del ZIP con un archivo por factura de `generarZipFacturas`). Una
 * factura sin documento adjunto (creada a mano, sin foto/PDF) se omite sin
 * romper el resto, igual que en `generarZipFacturas`.
 */
export async function generarPdfCombinadoFacturas(facturas: Record<string, unknown>[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const factura of facturas) {
    const paginas = paginasDeFactura(factura);
    for (const pagina of paginas) {
      try {
        const bytes = await obtenerBytesDesdeUrl(pagina.url);
        if (pagina.tipo === 'pdf') await anadirPaginasPdf(pdf, bytes);
        else await anadirPaginaImagen(pdf, bytes);
      } catch {
        continue; // Página ilegible/no encontrada — se omite, no rompe el resto del documento.
      }
    }
  }
  // Un PDF sin ninguna página no es un archivo válido (pdf-lib lo rechaza
  // al guardar) — puede pasar si el filtro no tiene facturas, o si las que
  // hay son todas manuales sin documento adjunto.
  if (pdf.getPageCount() === 0) throw new Error('No hay ninguna página de factura para incluir en el PDF.');
  return pdf.save();
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
 * Fusiona varios PDF ya generados en uno solo, uno detrás de otro en el
 * orden dado (auditoría Facturas/Trimestral, 13/09/2026: petición explícita
 * de que "en el informe general tiene que venir informe y facturas" en un
 * único archivo, no un ZIP con piezas sueltas). Copia páginas tal cual, sin
 * recomprimir ni perder calidad.
 */
export async function combinarPdfs(partes: Uint8Array[]): Promise<Uint8Array> {
  const combinado = await PDFDocument.create();
  for (const parte of partes) {
    const origen = await PDFDocument.load(parte, { ignoreEncryption: true });
    const copiadas = await combinado.copyPages(origen, origen.getPageIndices());
    for (const p of copiadas) combinado.addPage(p);
  }
  return combinado.save();
}

/**
 * Genera el PDF de resumen de un período (trimestre) para el asesor:
 * empresa, período, totales de ingresos/gastos/beneficio, número de
 * documentos, y una tabla real (columnas alineadas por posición, no texto
 * con espacios — una fuente proporcional como Helvetica nunca alinea con
 * espacios) con fecha/nº factura/proveedor-cliente/importe de cada
 * factura. Rediseño 13/09/2026: la versión anterior, con columnas
 * simuladas por `padEnd`, no se veía alineada en absoluto con esta fuente.
 */
export async function generarResumenPdf(datos: {
  empresaNombre: string;
  periodoLabel: string;
  ingresos: Record<string, unknown>[];
  gastos: Record<string, unknown>[];
  gastosPeriodicos?: { descripcion: string; importe: number; tipo: string }[];
  /** IVA/IGIC repercutido y soportado, clasificado por el `tipoImpuesto` real de cada factura — nunca por región (subfase "Agregación trimestral IVA/IGIC"). Opcional: ausente en PDFs de tipos de documento sin facturas de por medio. */
  impuestos?: ResumenImpuestosTrimestre;
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

  const COLOR_GRIS = rgb(0.45, 0.4, 0.35);
  const COLOR_TEXTO = rgb(0.09, 0.08, 0.06);
  const COLOR_LINEA = rgb(0.82, 0.8, 0.76);

  /** Recorta `texto` a lo que quepa en `anchoMax` puntos con `font`/`tam`, añadiendo "…" — nunca cuenta caracteres, mide el ancho real (una fuente proporcional no tiene un ancho fijo por letra). */
  const truncarTexto = (font: typeof fuente, texto: string, tam: number, anchoMax: number): string => {
    if (font.widthOfTextAtSize(texto, tam) <= anchoMax) return texto;
    let recortado = texto;
    while (recortado.length > 1 && font.widthOfTextAtSize(`${recortado}…`, tam) > anchoMax) recortado = recortado.slice(0, -1);
    return `${recortado}…`;
  };

  /** Dibuja `texto` terminando exactamente en `xFin` (para la columna de importe, siempre alineada a la derecha). */
  const escribirAlineadoDerecha = (texto: string, xFin: number, opciones: { tam: number; negrita?: boolean; color?: ReturnType<typeof rgb> }) => {
    const font = opciones.negrita ? fuenteNegrita : fuente;
    const ancho = font.widthOfTextAtSize(texto, opciones.tam);
    pagina.drawText(texto, { x: xFin - ancho, y, size: opciones.tam, font, color: opciones.color ?? COLOR_TEXTO });
  };

  // Columnas de la tabla de facturas — posiciones fijas, nunca espacios: la
  // única forma real de alinear con una fuente proporcional.
  const COL_FECHA = margen;
  const COL_NUMERO = margen + 62;
  const COL_NOMBRE = margen + 150;
  const COL_IMPORTE_FIN = ANCHO - margen;

  /**
   * Tabla real de facturas (fecha/nº factura/proveedor o cliente/importe),
   * con cabecera repetida en cada página nueva y fila de total — sustituye
   * a la versión anterior con `padEnd` sobre una fuente proporcional, que
   * nunca llegaba a alinear nada (auditoría 13/09/2026). `columnaFecha`
   * permite reutilizarla para gastos periódicos (sin nº de documento):
   * la 1ª columna pasa a ser un tipo/etiqueta corta y la de nombre empieza
   * antes, ocupando el hueco de la columna de nº de factura.
   */
  const tablaFacturas = (
    titulo: string, columnaNombre: string, filas: Record<string, unknown>[],
    opciones: { columnaFecha?: string; conNumero?: boolean } = {}
  ) => {
    if (!filas.length) return;
    const conNumero = opciones.conNumero ?? true;
    const colNombreInicio = conNumero ? COL_NOMBRE : COL_NUMERO;
    escribir(titulo, { tam: 11, negrita: true, salto: 16 });

    const dibujarCabecera = () => {
      nuevaPaginaSiHaceFalta(20);
      pagina.drawText((opciones.columnaFecha ?? 'FECHA').toUpperCase(), { x: COL_FECHA, y, size: 7.5, font: fuenteNegrita, color: COLOR_GRIS });
      if (conNumero) pagina.drawText('Nº FACTURA', { x: COL_NUMERO, y, size: 7.5, font: fuenteNegrita, color: COLOR_GRIS });
      pagina.drawText(columnaNombre.toUpperCase(), { x: colNombreInicio, y, size: 7.5, font: fuenteNegrita, color: COLOR_GRIS });
      escribirAlineadoDerecha('IMPORTE', COL_IMPORTE_FIN, { tam: 7.5, negrita: true, color: COLOR_GRIS });
      y -= 6;
      pagina.drawLine({ start: { x: margen, y }, end: { x: ANCHO - margen, y }, thickness: 0.6, color: COLOR_LINEA });
      y -= 12;
    };
    dibujarCabecera();

    for (const f of filas) {
      if (y - 13 < 55) { pagina = pdf.addPage([ANCHO, ALTO]); y = ALTO - 50; dibujarCabecera(); }
      const tam = 8.5;
      const importeTexto = formatoEuro(Number(f.importe || 0));
      pagina.drawText(truncarTexto(fuente, String(f.fecha || '—'), tam, COL_NUMERO - COL_FECHA - 6), { x: COL_FECHA, y, size: tam, font: fuente, color: COLOR_TEXTO });
      if (conNumero) pagina.drawText(truncarTexto(fuente, String(f.numeroFactura || '—'), tam, COL_NOMBRE - COL_NUMERO - 6), { x: COL_NUMERO, y, size: tam, font: fuente, color: COLOR_TEXTO });
      const anchoImporte = fuente.widthOfTextAtSize(importeTexto, tam);
      pagina.drawText(
        truncarTexto(fuente, String(f.proveedor || f.concepto || '—'), tam, COL_IMPORTE_FIN - anchoImporte - 10 - colNombreInicio),
        { x: colNombreInicio, y, size: tam, font: fuente, color: COLOR_TEXTO }
      );
      pagina.drawText(importeTexto, { x: COL_IMPORTE_FIN - anchoImporte, y, size: tam, font: fuente, color: COLOR_TEXTO });
      y -= 13;
    }

    nuevaPaginaSiHaceFalta(20);
    y -= 3;
    pagina.drawLine({ start: { x: colNombreInicio, y: y + 10 }, end: { x: ANCHO - margen, y: y + 10 }, thickness: 0.6, color: COLOR_LINEA });
    const total = filas.reduce((s, f) => s + Number(f.importe || 0), 0);
    pagina.drawText('TOTAL', { x: colNombreInicio, y, size: 9, font: fuenteNegrita, color: COLOR_TEXTO });
    escribirAlineadoDerecha(formatoEuro(total), COL_IMPORTE_FIN, { tam: 9, negrita: true });
    y -= 22;
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

  tablaFacturas('INGRESOS', 'Cliente', datos.ingresos);
  tablaFacturas('GASTOS', 'Proveedor', datos.gastos);

  if (datos.gastosPeriodicos?.length) {
    tablaFacturas(
      'GASTOS PERIÓDICOS / ESTIMADOS', 'Descripción',
      datos.gastosPeriodicos.map((g) => ({ fecha: g.tipo, proveedor: g.descripcion, importe: g.importe })),
      { columnaFecha: 'Tipo', conNumero: false }
    );
  }

  // IVA/IGIC — dato real por factura (`tipoImpuesto`), nunca decidido por
  // la región fiscal de la empresa (ver `motor-fiscal.ts`).
  if (datos.impuestos) {
    const imp = datos.impuestos;
    nuevaPaginaSiHaceFalta(16 + 5 * 12);
    escribir('IVA / IGIC', { tam: 11, negrita: true, salto: 16 });
    escribir(`IVA repercutido: ${formatoEuro(imp.ivaRepercutido)}      IVA soportado: ${formatoEuro(imp.ivaSoportado)}`, { tam: 9, salto: 13 });
    escribir(`IGIC repercutido: ${formatoEuro(imp.igicRepercutido)}      IGIC soportado: ${formatoEuro(imp.igicSoportado)}`, { tam: 9, salto: 13 });
    if (imp.noIdentificado.numFacturas > 0) {
      escribir(
        `Impuesto sin identificar: ${imp.noIdentificado.numFacturas} factura(s), ${formatoEuro(imp.noIdentificado.repercutido + imp.noIdentificado.soportado)} — revisar tipo de impuesto`,
        { tam: 8.5, color: [0.61, 0.45, 0.1], salto: 13 }
      );
    }
    if (imp.noCalculable.numFacturas > 0) {
      escribir(
        `IVA/IGIC identificado sin importe calculable: ${imp.noCalculable.numFacturas} factura(s) — NO incluida(s) en los totales de arriba, revisar antes de declarar`,
        { tam: 8.5, color: [0.61, 0.45, 0.1], salto: 13 }
      );
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
