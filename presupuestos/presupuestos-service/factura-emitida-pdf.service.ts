import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

/**
 * PDF legal de una factura emitida, con QR embebido (SIF, Fase 1-5,
 * 26/10/2026) — construcción programática con `pdf-lib`, mismo patrón ya
 * usado en `documentos-factura.service.ts` para el informe del asesor
 * (nunca HTML impreso con `window.print()`, eso solo existe para el Motor
 * Documental y no es invocable desde el servidor).
 *
 * El PDF NO es el registro fiscal — es una representación derivada de los
 * datos ya sellados en `FacturaEmitidaModel` (número, hash, cadena). Se
 * puede regenerar tantas veces como haga falta sin que eso afecte a la
 * integridad del propio registro.
 *
 * IMPORTANTE — contenido del QR sin confirmar oficialmente: el contenido
 * exacto que exige la Orden HAC/1177/2024 (codificación interna, URL de
 * verificación de la AEAT en modo VERI*FACTU, etc.) no está confirmado con
 * precisión en esta fase. Aquí se usa un formato propio, simple y
 * documentado (texto plano `NIF|numero|fecha|importe`, separado por `|`)
 * — debe confirmarse contra la especificación técnica oficial antes de
 * poner el sistema en operación real. No se presenta como el formato ya
 * certificado.
 */

const ANCHO = 595; // A4 a 72dpi
const ALTO = 842;
const MARGEN = 50;
const COLOR_TEXTO = rgb(0.13, 0.12, 0.11);
const COLOR_GRIS = rgb(0.45, 0.42, 0.37);
const COLOR_ACENTO = rgb(0.55, 0.42, 0.18);

type LineaFacturaEmitida = { id: string; concepto: string; precio: number };

export type DatosFacturaEmitidaPdf = {
  numeroFormateado: string;
  fechaEmision: string;
  titulo: string;
  lineas: LineaFacturaEmitida[];
  importeTotal: number;
  tipoImpuesto: string;
  porcentajeImpuesto?: number;
  baseImponible?: number;
  importeImpuesto?: number;
  naturaleza: 'normal' | 'rectificativa';
  numeroFacturaOriginal?: string;
  motivoRectificacion?: string;
  estado: 'emitida' | 'anulada';
  motivoAnulacion?: string;
  indicadorVerifactu: string;
  hash: string;
};

type DatosEmpresaPdf = { nombre?: string; nifCif?: string; repepActivo?: boolean };

/**
 * Contenido del QR — formato propio sin confirmar oficialmente, ver
 * cabecera del archivo. `NIF|número+serie|fecha|importe total`.
 */
function contenidoQr(nifEmisor: string, factura: DatosFacturaEmitidaPdf): string {
  return [nifEmisor, factura.numeroFormateado, factura.fechaEmision.slice(0, 10), factura.importeTotal.toFixed(2)].join('|');
}

function formatoEuro(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);
}

export async function generarPdfFacturaEmitidaBytes(
  factura: DatosFacturaEmitidaPdf,
  empresa: DatosEmpresaPdf | null,
  clienteNombre: string
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const fuenteNegrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pagina = pdf.addPage([ANCHO, ALTO]);
  let y = ALTO - MARGEN;

  const escribir = (texto: string, opciones: { x?: number; size?: number; negrita?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    pagina.drawText(texto, {
      x: opciones.x ?? MARGEN, y, size: opciones.size ?? 10,
      font: opciones.negrita ? fuenteNegrita : fuente, color: opciones.color ?? COLOR_TEXTO,
    });
  };

  // ── Cabecera ──
  escribir(empresa?.nombre || 'Madera Creativa Estudio', { size: 15, negrita: true });
  y -= 16;
  if (empresa?.nifCif) { escribir(`NIF/CIF: ${empresa.nifCif}`, { size: 9, color: COLOR_GRIS }); y -= 22; } else { y -= 14; }

  escribir(factura.naturaleza === 'rectificativa' ? 'FACTURA RECTIFICATIVA' : 'FACTURA', { size: 13, negrita: true, color: COLOR_ACENTO });
  y -= 16;
  escribir(`Nº ${factura.numeroFormateado}`, { negrita: true });
  y -= 14;
  escribir(`Fecha de emisión: ${factura.fechaEmision.slice(0, 10)}`, { size: 9, color: COLOR_GRIS });
  y -= 14;
  escribir(`Cliente: ${clienteNombre || '—'}`, { size: 9, color: COLOR_GRIS });
  y -= 22;

  if (factura.estado === 'anulada') {
    escribir(`ANULADA${factura.motivoAnulacion ? ' — ' + factura.motivoAnulacion : ''}`, { negrita: true, color: rgb(0.6, 0.18, 0.18) });
    y -= 20;
  }
  if (factura.naturaleza === 'rectificativa') {
    escribir(`Rectifica a la factura ${factura.numeroFacturaOriginal || '—'}${factura.motivoRectificacion ? ' — ' + factura.motivoRectificacion : ''}`, { size: 9, color: COLOR_GRIS });
    y -= 20;
  }

  // ── Líneas ──
  escribir('CONCEPTO', { size: 8, negrita: true, color: COLOR_GRIS });
  pagina.drawText('IMPORTE', { x: ANCHO - MARGEN - 70, y, size: 8, font: fuenteNegrita, color: COLOR_GRIS });
  y -= 14;
  for (const linea of factura.lineas) {
    escribir(linea.concepto, { size: 9.5 });
    const importeTexto = formatoEuro(linea.precio);
    const anchoImporte = fuente.widthOfTextAtSize(importeTexto, 9.5);
    pagina.drawText(importeTexto, { x: ANCHO - MARGEN - anchoImporte, y, size: 9.5, font: fuente, color: COLOR_TEXTO });
    y -= 15;
  }
  y -= 8;

  // ── Fiscal ──
  if (factura.tipoImpuesto && factura.tipoImpuesto !== 'sin_impuesto') {
    if (typeof factura.baseImponible === 'number') { escribir(`Base imponible: ${formatoEuro(factura.baseImponible)}`, { size: 9, color: COLOR_GRIS }); y -= 13; }
    if (typeof factura.importeImpuesto === 'number') {
      const etiqueta = factura.tipoImpuesto === 'igic' ? 'IGIC' : factura.tipoImpuesto === 'iva' ? 'IVA' : 'Impuesto';
      escribir(`${etiqueta}${factura.porcentajeImpuesto ? ` (${factura.porcentajeImpuesto}%)` : ''}: ${formatoEuro(factura.importeImpuesto)}`, { size: 9, color: COLOR_GRIS });
      y -= 13;
    }
  }
  if (empresa?.repepActivo) { escribir('Exención franquicia fiscal', { size: 8.5, color: COLOR_GRIS }); y -= 13; }
  y -= 6;

  escribir('TOTAL', { negrita: true, size: 11 });
  const totalTexto = formatoEuro(factura.importeTotal);
  const anchoTotal = fuenteNegrita.widthOfTextAtSize(totalTexto, 11);
  pagina.drawText(totalTexto, { x: ANCHO - MARGEN - anchoTotal, y, size: 11, font: fuenteNegrita, color: COLOR_TEXTO });
  y -= 30;

  // ── Leyendas SIF ──
  escribir(`Sistema: ${factura.indicadorVerifactu}`, { size: 7.5, color: COLOR_GRIS });
  y -= 11;
  escribir('Registro de facturación generado conforme al RD 1007/2023 — no verificable en tiempo real con la AEAT.', { size: 7.5, color: COLOR_GRIS });
  y -= 18;

  // ── QR ──
  if (empresa?.nifCif) {
    try {
      const qrDataUrl = await QRCode.toDataURL(contenidoQr(empresa.nifCif, factura), { margin: 1, width: 240 });
      const base64 = qrDataUrl.split(',')[1] ?? '';
      const qrImagen = await pdf.embedPng(Buffer.from(base64, 'base64'));
      const tamanoQr = 85;
      pagina.drawImage(qrImagen, { x: MARGEN, y: y - tamanoQr, width: tamanoQr, height: tamanoQr });
      pagina.drawText('Formato del QR sin confirmar oficialmente — ver nota técnica.', { x: MARGEN + tamanoQr + 10, y: y - tamanoQr / 2, size: 7, font: fuente, color: COLOR_GRIS });
    } catch { /* un fallo al generar el QR no debe impedir descargar el resto del PDF */ }
  }

  // ── Pie: huella de integridad ──
  pagina.drawText(`Huella: ${factura.hash.slice(0, 32)}…`, { x: MARGEN, y: 30, size: 6.5, font: fuente, color: COLOR_GRIS });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
