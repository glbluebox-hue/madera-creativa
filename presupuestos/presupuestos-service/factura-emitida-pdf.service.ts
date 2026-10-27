import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

/**
 * PDF legal de una factura emitida, con QR embebido (SIF, Fase 1-5,
 * 26/10/2026 — rediseñado el mismo día sobre una referencia visual real
 * que mandó el usuario, mismo nivel de detalle que una factura de un
 * programa de facturación comercial: logo propio, direcciones completas,
 * tabla con cantidad, caja de totales, vencimientos/método de pago y pie
 * de protección de datos). Construcción programática con `pdf-lib`, mismo
 * patrón ya usado en `documentos-factura.service.ts` (nunca HTML impreso
 * con `window.print()`, eso solo existe para el Motor Documental y no es
 * invocable desde el servidor).
 *
 * El PDF NO es el registro fiscal — es una representación derivada de los
 * datos ya sellados en `FacturaEmitidaModel` (número, hash, cadena). Se
 * puede regenerar tantas veces como haga falta sin que eso afecte a la
 * integridad del propio registro.
 *
 * IMPORTANTE — contenido del QR sin confirmar oficialmente: el formato
 * exacto que exige la Orden HAC/1177/2024 para VERI*FACTU (codificación
 * interna, URL de verificación de la AEAT, etc.) no está confirmado con
 * precisión en esta fase — ahora mismo NO hay ninguna conexión con
 * Hacienda (Fase 6, fuera de alcance). El recuadro del QR de abajo es,
 * literalmente, el hueco reservado en el diseño del documento para el día
 * que se active esa fase: la posición/tamaño no debería tener que
 * rediseñarse, solo sustituir qué contenido lleva dentro.
 *
 * IMPORTANTE — leyenda fiscal: nunca se genera un texto legal (artículo
 * concreto, "no sujeto", "inversión del sujeto pasivo"…) a partir de
 * `tipoImpuesto`. `tipoImpuesto` hoy es demasiado genérico (ver auditoría
 * SIF: exento/no sujeto/intracomunitario/exportación caen todos en el
 * mismo valor) — afirmar un artículo concreto por código podría ser
 * incorrecto en algún caso real. Ese texto, si aplica, lo escribe el
 * profesional a mano en `FacturaEmitida.leyendaFiscal` y aquí solo se
 * imprime tal cual si no está vacío.
 */

const ANCHO = 595; // A4 a 72dpi
const ALTO = 842;
const MARGEN = 50;
const COLOR_TEXTO = rgb(0.13, 0.12, 0.11);
const COLOR_GRIS = rgb(0.45, 0.42, 0.37);
const COLOR_ACENTO = rgb(0.55, 0.42, 0.18);
const COLOR_FONDO_CAJA = rgb(0.96, 0.955, 0.945);

type LineaFacturaEmitida = { id: string; concepto: string; precio: number; cantidad?: number };

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
  estado: 'borrador' | 'emitida' | 'anulada';
  motivoAnulacion?: string;
  indicadorVerifactu: string;
  hash: string;
  vencimiento?: string;
  metodoPago?: string;
  leyendaFiscal?: string;
};

type DatosEmpresaPdf = { nombre?: string; titular?: string; nifCif?: string; direccion?: string; codigoPostal?: string; poblacion?: string; telefono?: string; email?: string; logo?: string; iban?: string };

/**
 * Texto del "Método de pago" a imprimir — si es transferencia bancaria y
 * la empresa ya tiene un IBAN guardado (Ajustes de empresa), se añade
 * automáticamente: el profesional nunca debería tener que volver a
 * escribir su propio IBAN en cada factura (petición del usuario,
 * 27/10/2026). Comparación flexible (`includes`, sin distinguir
 * mayúsculas) porque `metodoPago` es texto elegido de una lista en el
 * frontend, no un valor cerrado a nivel de esquema.
 */
function textoMetodoPago(metodoPago: string | undefined, iban: string | undefined): string {
  if (!metodoPago) return '';
  const esTransferencia = /transferencia/i.test(metodoPago);
  return esTransferencia && iban ? `${metodoPago} — IBAN: ${iban}` : metodoPago;
}
type DatosClientePdf = { nombre?: string; dni?: string; direccion?: string; codigoPostal?: string; poblacion?: string; telefono?: string };

/**
 * Líneas de dirección a imprimir — la calle/número (`direccion`, puede
 * traer varias líneas propias) seguida de una línea final "CP Población"
 * solo con las partes que de verdad estén rellenas (petición del usuario,
 * 27/10/2026: la dirección de una factura necesita código postal y
 * población identificables, no un único bloque de texto). Una única
 * función para que la altura de la caja del cliente y lo que se dibuja
 * realmente nunca puedan desincronizarse (mismo criterio ya aplicado al
 * resto de este archivo).
 */
function lineasDireccion(direccion?: string, codigoPostal?: string, poblacion?: string): string[] {
  const lineas = direccion ? direccion.split('\n') : [];
  const ultima = [codigoPostal, poblacion].filter(Boolean).join(' ');
  if (ultima) lineas.push(ultima);
  return lineas;
}

/** `26/10/2026` — mismo formato que usa el resto de documentos cara al cliente (nunca `AAAA-MM-DD`). */
function fechaEs(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function formatoEuro(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);
}

/** Nombre del impuesto a mostrar — IGIC o IVA, según el tipo real de la factura (nunca inferido de la región de la empresa, mismo principio que el resto del motor fiscal). */
function etiquetaImpuesto(tipoImpuesto: string): string {
  return tipoImpuesto === 'iva' ? 'IVA' : 'IGIC';
}

/**
 * Etiqueta + importe de la línea de impuesto en la caja de totales —
 * depende de `tipoImpuesto`:
 * - `igic`/`iva`: importe real calculado, con el porcentaje.
 * - `exento`: 0€, "exento".
 * - `sin_impuesto` (o vacío): 0€, "No sujeto (base imponible)" — igual que
 *   la referencia real que mandó el usuario.
 */
function filaImpuesto(datos: DatosFacturaEmitidaPdf, baseImponible: number): { etiqueta: string; importe: number } {
  const nombre = etiquetaImpuesto(datos.tipoImpuesto);
  if (datos.tipoImpuesto === 'igic' || datos.tipoImpuesto === 'iva') {
    return { etiqueta: `${nombre}${datos.porcentajeImpuesto ? ` (${datos.porcentajeImpuesto}%)` : ''}`, importe: datos.importeImpuesto || 0 };
  }
  if (datos.tipoImpuesto === 'exento') {
    return { etiqueta: `${nombre} exento`, importe: 0 };
  }
  // 'sin_impuesto' o sin configurar — mismo redactado que la referencia: "IGIC No sujeto (2.260,00 €)".
  return { etiqueta: `${nombre} No sujeto (${formatoEuro(baseImponible)})`, importe: 0 };
}

/** Contenido del QR — formato propio sin confirmar oficialmente, ver cabecera del archivo. `NIF|número+serie|fecha|importe total`. */
function contenidoQr(nifEmisor: string, factura: DatosFacturaEmitidaPdf): string {
  return [nifEmisor, factura.numeroFormateado, factura.fechaEmision.slice(0, 10), factura.importeTotal.toFixed(2)].join('|');
}

/** Descarga el logo de la empresa y lo embebe — tolerante a cualquier fallo (sin logo, URL caída, formato no soportado): nunca rompe la generación del resto del PDF, simplemente no dibuja nada. */
async function intentarEmbeberLogo(pdf: PDFDocument, url: string | undefined) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    try { return await pdf.embedPng(bytes); } catch { return await pdf.embedJpg(bytes); }
  } catch {
    return null;
  }
}

export async function generarPdfFacturaEmitidaBytes(
  factura: DatosFacturaEmitidaPdf,
  empresa: DatosEmpresaPdf | null,
  cliente: DatosClientePdf | null
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const fuenteNegrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fuenteCursiva = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const pagina = pdf.addPage([ANCHO, ALTO]);

  const lineas = (factura.lineas || []).map((l) => ({ ...l, cantidad: l.cantidad ?? 1 }));
  const baseImponible = typeof factura.baseImponible === 'number' ? factura.baseImponible : lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const { etiqueta: etiquetaImp, importe: importeImp } = filaImpuesto(factura, baseImponible);

  const escribir = (texto: string, x: number, y: number, opciones: { size?: number; negrita?: boolean; cursiva?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    pagina.drawText(texto, {
      x, y, size: opciones.size ?? 10,
      font: opciones.negrita ? fuenteNegrita : opciones.cursiva ? fuenteCursiva : fuente,
      color: opciones.color ?? COLOR_TEXTO,
    });
  };
  const escribirDerecha = (texto: string, xDerecha: number, y: number, opciones: { size?: number; negrita?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const f = opciones.negrita ? fuenteNegrita : fuente;
    const size = opciones.size ?? 10;
    const ancho = f.widthOfTextAtSize(texto, size);
    pagina.drawText(texto, { x: xDerecha - ancho, y, size, font: f, color: opciones.color ?? COLOR_TEXTO });
  };

  let y = ALTO - MARGEN;

  // ── Cabecera: logo (izquierda) + "Factura" / número / fecha (derecha) ──
  // Grande pero equilibrado con el bloque de texto (petición del usuario,
  // 27/10/2026, segunda vuelta): un poco más pequeño que el primer intento,
  // con un margen superior propio (no pegado al borde) para quedar al
  // mismo nivel visual que "Borrador de factura", y un pequeño hueco a la
  // izquierda en vez de ir pegado al margen de la página.
  const ALTO_LOGO = 54;
  const Y_INICIO_LOGO = y - 4;
  const logo = await intentarEmbeberLogo(pdf, empresa?.logo);
  if (logo) {
    const anchoLogo = (logo.width / logo.height) * ALTO_LOGO;
    pagina.drawImage(logo, { x: MARGEN + 8, y: Y_INICIO_LOGO - ALTO_LOGO, width: anchoLogo, height: ALTO_LOGO });
  } else if (empresa?.nombre) {
    escribir(empresa.nombre, MARGEN + 8, Y_INICIO_LOGO - 24, { size: 19, negrita: true });
  }

  const esBorrador = factura.estado === 'borrador';
  escribirDerecha(esBorrador ? 'Borrador de factura' : factura.naturaleza === 'rectificativa' ? 'Factura rectificativa' : 'Factura', ANCHO - MARGEN, y - 10, { size: 17, negrita: true });
  escribirDerecha(`Número: ${factura.numeroFormateado || 'sin emitir'}`, ANCHO - MARGEN, y - 30, { size: 9, color: COLOR_GRIS });
  escribirDerecha(`Fecha: ${factura.fechaEmision ? fechaEs(factura.fechaEmision) : '—'}`, ANCHO - MARGEN, y - 43, { size: 9, color: COLOR_GRIS });
  y -= Math.max(ALTO_LOGO + 4, 43) + 14;

  // ── Aviso de vista previa — un borrador nunca debe poder confundirse con
  // el documento legal final: ni tiene número real, ni huella, ni QR.
  if (esBorrador) {
    const altoAviso = 22;
    pagina.drawRectangle({ x: MARGEN, y: y - altoAviso + 6, width: ANCHO - MARGEN * 2, height: altoAviso, color: rgb(0.97, 0.91, 0.78) });
    escribir('VISTA PREVIA — borrador sin numerar, sin validez legal. El documento final se genera al pulsar "Emitir".', MARGEN + 10, y - 9, { size: 8.5, negrita: true, color: rgb(0.55, 0.38, 0.1) });
    y -= altoAviso + 14;
  }

  if (factura.estado === 'anulada') {
    escribir(`ANULADA${factura.motivoAnulacion ? ' — ' + factura.motivoAnulacion : ''}`, MARGEN, y, { negrita: true, color: rgb(0.6, 0.18, 0.18) });
    y -= 18;
  }
  if (factura.naturaleza === 'rectificativa') {
    escribir(`Rectifica a la factura ${factura.numeroFacturaOriginal || '—'}${factura.motivoRectificacion ? ' — ' + factura.motivoRectificacion : ''}`, MARGEN, y, { size: 9, color: COLOR_GRIS });
    y -= 18;
  }

  y -= 10;

  // ── Dos columnas: emisor (izquierda, sin fondo) / cliente (derecha, caja gris) ──
  const anchoColumna = (ANCHO - MARGEN * 2 - 24) / 2;
  const xIzq = MARGEN;
  const xDer = MARGEN + anchoColumna + 24;
  const yColumnaInicio = y;

  let yIzq = yColumnaInicio;
  escribir(empresa?.titular || empresa?.nombre || '—', xIzq, yIzq, { negrita: true, size: 11 });
  yIzq -= 15;
  if (empresa?.nifCif) { escribir(empresa.nifCif, xIzq, yIzq, { size: 9.5 }); yIzq -= 14; }
  for (const linea of lineasDireccion(empresa?.direccion, empresa?.codigoPostal, empresa?.poblacion)) { escribir(linea, xIzq, yIzq, { size: 9.5 }); yIzq -= 14; }
  if (empresa?.telefono) { escribir(empresa.telefono, xIzq, yIzq, { size: 9.5 }); yIzq -= 14; }

  // Altura de la caja calculada ANTES de dibujar nada dentro — nunca se
  // dibuja dos veces el mismo texto (evita cualquier duda de orden de capas).
  const lineasDireccionCliente = lineasDireccion(cliente?.direccion, cliente?.codigoPostal, cliente?.poblacion);
  const filasCliente = 1 + (cliente?.dni ? 1 : 0) + lineasDireccionCliente.length + (cliente?.telefono ? 1 : 0);
  const altoCajaCliente = 15 + Math.max(0, filasCliente - 1) * 14 + 16;
  pagina.drawRectangle({ x: xDer, y: yColumnaInicio - altoCajaCliente + 16, width: anchoColumna, height: altoCajaCliente, color: COLOR_FONDO_CAJA });

  let yDer = yColumnaInicio;
  escribir(cliente?.nombre || '—', xDer + 12, yDer, { negrita: true, size: 11 });
  yDer -= 15;
  if (cliente?.dni) { escribir(cliente.dni, xDer + 12, yDer, { size: 9.5 }); yDer -= 14; }
  for (const linea of lineasDireccionCliente) { escribir(linea, xDer + 12, yDer, { size: 9.5 }); yDer -= 14; }
  if (cliente?.telefono) { escribir(cliente.telefono, xDer + 12, yDer, { size: 9.5 }); yDer -= 14; }

  y = Math.min(yIzq, yDer) - 26;

  // ── Tabla: CONCEPTO / CANTIDAD / PRECIO S/I / IGIC·IVA / SUBTOTAL S/I ──
  // Columnas numéricas SIEMPRE alineadas a la derecha (incluida Cantidad,
  // antes a la izquierda) — es lo que de verdad evita el solape real que
  // reportó el usuario: dos columnas alineadas a la izquierda y derecha
  // respectivamente, una junto a la otra, se pisan en cuanto el texto es
  // un poco más largo de lo esperado ("1 unidades" invadía el precio).
  const colConcepto = MARGEN;
  const colSubtotal = ANCHO - MARGEN;
  const colImpuesto = colSubtotal - 95;
  const colPrecio = colImpuesto - 95;
  const colCantidad = colPrecio - 70;

  escribir('CONCEPTO', colConcepto, y, { size: 8, negrita: true, color: COLOR_GRIS });
  escribirDerecha('CANTIDAD', colCantidad, y, { size: 8, negrita: true, color: COLOR_GRIS });
  escribirDerecha('PRECIO S/I', colPrecio, y, { size: 8, negrita: true, color: COLOR_GRIS });
  escribirDerecha(etiquetaImpuesto(factura.tipoImpuesto), colImpuesto, y, { size: 8, negrita: true, color: COLOR_GRIS });
  escribirDerecha('SUBTOTAL S/I', colSubtotal, y, { size: 8, negrita: true, color: COLOR_GRIS });
  y -= 10;
  pagina.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 0.5, color: COLOR_GRIS });
  y -= 14;

  const porcentajeTexto = factura.tipoImpuesto === 'igic' || factura.tipoImpuesto === 'iva' ? `${factura.porcentajeImpuesto ?? 0} %` : '0 %';
  for (const linea of lineas) {
    const subtotal = linea.precio * linea.cantidad;
    escribir(linea.concepto, colConcepto, y, { size: 9.5 });
    escribirDerecha(`${linea.cantidad} ud.`, colCantidad, y, { size: 9.5 });
    escribirDerecha(formatoEuro(linea.precio), colPrecio, y, { size: 9.5 });
    escribirDerecha(porcentajeTexto, colImpuesto, y, { size: 9.5 });
    escribirDerecha(formatoEuro(subtotal), colSubtotal, y, { size: 9.5 });
    y -= 16;
  }
  y -= 10;

  // ── Caja de totales ──
  const anchoCaja = 220;
  const xCaja = ANCHO - MARGEN - anchoCaja;
  const altoCaja = 58;
  pagina.drawRectangle({ x: xCaja, y: y - altoCaja, width: anchoCaja, height: altoCaja, color: COLOR_FONDO_CAJA });
  let yCaja = y - 16;
  escribir('Base imponible', xCaja + 12, yCaja, { size: 9.5 });
  escribirDerecha(formatoEuro(baseImponible), xCaja + anchoCaja - 12, yCaja, { size: 9.5 });
  yCaja -= 16;
  escribir(etiquetaImp, xCaja + 12, yCaja, { size: 9.5 });
  escribirDerecha(formatoEuro(importeImp), xCaja + anchoCaja - 12, yCaja, { size: 9.5 });
  yCaja -= 20;
  escribir('TOTAL', xCaja + 12, yCaja, { size: 12, negrita: true });
  escribirDerecha(formatoEuro(factura.importeTotal), xCaja + anchoCaja - 12, yCaja, { size: 12, negrita: true });
  y -= altoCaja + 22;

  // ── Leyenda fiscal (manual, solo si el profesional la ha escrito) ──
  if (factura.leyendaFiscal && factura.leyendaFiscal.trim()) {
    for (const linea of envolverTexto(factura.leyendaFiscal.trim(), fuenteCursiva, 8.5, ANCHO - MARGEN * 2)) {
      escribir(linea, MARGEN, y, { size: 8.5, cursiva: true, color: COLOR_GRIS });
      y -= 12;
    }
    y -= 10;
  }

  // ── Vencimientos / Método de pago (solo si hay algo que mostrar) ──
  if (factura.vencimiento || factura.metodoPago) {
    pagina.drawLine({ start: { x: MARGEN, y }, end: { x: ANCHO - MARGEN, y }, thickness: 0.5, color: rgb(0.85, 0.82, 0.76) });
    y -= 18;
    const yFila = y;
    if (factura.vencimiento) {
      escribir('Vencimientos', MARGEN, yFila, { negrita: true, size: 9.5 });
      escribir('Al contado', MARGEN, yFila - 15, { size: 9 });
      escribir(fechaEs(factura.vencimiento), MARGEN, yFila - 29, { size: 9 });
      escribirDerecha(formatoEuro(factura.importeTotal), MARGEN + anchoColumna, yFila - 29, { size: 9, negrita: true });
    }
    if (factura.metodoPago) {
      escribir('Método de pago', xDer, yFila, { negrita: true, size: 9.5 });
      let yMetodo = yFila - 15;
      for (const linea of envolverTexto(textoMetodoPago(factura.metodoPago, empresa?.iban), fuente, 9, anchoColumna)) {
        escribir(linea, xDer, yMetodo, { size: 9 });
        yMetodo -= 12;
      }
    }
    y -= 48;
  }

  // ── Pie de protección de datos (RGPD) — boilerplate genérico, datos reales de cada cuenta ──
  const titularDatos = empresa?.titular || empresa?.nombre || 'el titular de esta cuenta';
  const parrafosRgpd = [
    'Sus datos de carácter personal han sido recogidos de acuerdo con lo dispuesto en el Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo, de 27 de abril de 2016, relativo a la protección de las personas físicas en lo que respecta al tratamiento de datos personales y a la libre circulación de los mismos.',
    `Le ponemos en conocimiento que estos datos se encuentran almacenados en un fichero propiedad de ${titularDatos}.`,
    `De acuerdo con la Ley anterior, tiene derecho a ejercer los derechos de acceso, rectificación, cancelación, limitación, oposición y portabilidad de manera gratuita${empresa?.email ? ` mediante correo electrónico a: ${empresa.email}` : '.'}`,
  ];
  y -= 4;
  for (const parrafo of parrafosRgpd) {
    for (const linea of envolverTexto(parrafo, fuente, 7.3, ANCHO - MARGEN * 2)) {
      escribir(linea, MARGEN, y, { size: 7.3, color: COLOR_GRIS });
      y -= 10.5;
    }
    y -= 4;
  }

  // ── QR + pie: FLUYE justo debajo del contenido real, nunca fijo cerca
  // del borde inferior de la hoja (causa real del hueco en blanco enorme
  // que reportó el usuario en una factura corta — antes `Math.min(y-10,
  // 118)` empujaba el QR hacia abajo aposta cuanto menos contenido había,
  // justo al revés de lo que hacía falta). Un único suelo mínimo (no un
  // valor fijo) solo para no salirse de la página si hay muchas líneas.
  // Nunca hay QR en un borrador: todavía no hay número, fecha ni huella
  // reales que codificar — un QR con datos provisionales sería engañoso. ──
  let yPie = Math.max(y - 14, esBorrador ? 40 : 140);
  if (!esBorrador && empresa?.nifCif) {
    try {
      const qrDataUrl = await QRCode.toDataURL(contenidoQr(empresa.nifCif, factura), { margin: 1, width: 220 });
      const base64 = qrDataUrl.split(',')[1] ?? '';
      const qrImagen = await pdf.embedPng(Buffer.from(base64, 'base64'));
      const tamanoQr = 70;
      pagina.drawImage(qrImagen, { x: MARGEN, y: yPie - tamanoQr, width: tamanoQr, height: tamanoQr });
      escribir('Registro de facturación conforme al RD 1007/2023 (SIF).', MARGEN + tamanoQr + 10, yPie - tamanoQr / 2 + 10, { size: 7, color: COLOR_GRIS });
      escribir(`Sistema: ${factura.indicadorVerifactu} — formato del QR sin confirmar oficialmente.`, MARGEN + tamanoQr + 10, yPie - tamanoQr / 2 - 2, { size: 7, color: COLOR_GRIS });
      yPie -= tamanoQr + 18;
    } catch { yPie -= 18; /* un fallo al generar el QR no debe impedir descargar el resto del PDF */ }
  }

  // ── Última línea: huella de integridad (solo si ya existe) + paginación — fluye justo debajo de lo anterior, nunca más abajo del margen de la página. ──
  const yUltimaLinea = Math.max(yPie, 20);
  if (esBorrador) {
    escribir('Sin número, huella ni QR — se generan al emitir.', MARGEN, yUltimaLinea, { size: 6.5, color: COLOR_GRIS });
  } else {
    escribir(`Huella: ${factura.hash.slice(0, 32)}…`, MARGEN, yUltimaLinea, { size: 6.5, color: COLOR_GRIS });
  }
  escribirDerecha('Página 1 de 1', ANCHO - MARGEN, yUltimaLinea, { size: 7, color: COLOR_GRIS });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

/** Ajuste de línea básico por ancho real de texto (pdf-lib no envuelve texto solo) — sin romper palabras, igual que cualquier editor de texto sencillo. */
function envolverTexto(texto: string, fuente: Awaited<ReturnType<PDFDocument['embedFont']>>, size: number, anchoMax: number): string[] {
  const palabras = texto.split(/\s+/);
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of palabras) {
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (fuente.widthOfTextAtSize(candidata, size) > anchoMax && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = candidata;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}
