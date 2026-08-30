import { randomUUID, createHash } from 'node:crypto';
import type { PipelineStage } from 'mongoose';
import { ClienteModel, ProyectoModel, EmpresaModel, FacturaModel, ProveedorModel, ProductoModel, DibujoModel, CarpetaModel, NotaModel, PresupuestoModel, PlantillaModel, RecursoModel, ComponenteModel, CodigoQRModel, AutomatizacionModel, ContratoModel, GastoPeriodicoModel, ReferenciaMercadoModel, conectar } from './cliente.model.js';
import { UsuarioModel, conectarUsuarios } from './usuario.model.js';
import { crearEnlacePresupuesto, buscarEnlacePorToken, reclamarEnlaceAceptado, guardarFirmaEnlace, formatoTokenValido, enlacesActivosDeUsuario } from './enlace-presupuesto.model.js';
import { crearEnlaceResena, buscarEnlaceResenaPorToken, registrarUsoEnlaceResena, formatoTokenValidoResena } from './enlace-resena.model.js';
import { almacenamiento } from './almacenamiento.service.js';
import { firmarTokenArchivo } from './token.service.js';
import { intentarBorrarArchivo } from './borrado-pendiente.service.js';
import { busEventos } from './eventos.service.js';
import { enviarNotificacion } from './push.service.js';
import type { PushSub } from './push.service.js';
import { logger } from './logger.service.js';
import { procesarRecursosDocumento, borrarRecursosDocumentoHuerfanos } from './documento-procesar-recursos.js';
import { esGastoPeriodicoDeducible } from './gasto-periodico-fiscal.js';
import { subirORecuperarRecurso } from './documento-recursos-biblioteca.js';
import type { DocumentoMC, TemaMC, RecursoMC } from './documento-modelo.js';
import { analizarPrecioPresupuesto, calcularMargenRealProyecto } from './inteligencia-precios.js';
import type { AnalisisPrecio } from './inteligencia-precios.js';
import { calcularComparables } from './comparables.js';
import type { ResultadoComparables } from './comparables.js';

/**
 * Checklist base de carpintería (Fase 1 — "presupuesto aceptado") —
 * duplicado a propósito de `TAREAS_BASE` en `tab-tareas.tsx`: backend y
 * frontend son proyectos Node independientes sin ningún paquete
 * compartido, así que no hay una única fuente real posible sin crear
 * infraestructura nueva solo para 10 strings. Si se cambia uno, cambiar
 * el otro.
 */
const TAREAS_BASE_PRESUPUESTO_ACEPTADO = [
  'Medir', 'Diseñar', 'Presupuesto', 'Cobro inicial', 'Comprar material',
  'Fabricar', 'Lijar', 'Pintar', 'Montar', 'Cobro final',
];

/**
 * Genera los hitos de cobro de un presupuesto a partir del texto libre de
 * condiciones de pago (ej. "60% al aceptar el presupuesto / 40% al
 * finalizar el trabajo") — roadmap "cobros pendientes", 18/08/2026. Busca
 * porcentajes explícitos en segmentos separados por '/', ';' o salto de
 * línea; si no encuentra ninguno (texto libre sin ese formato, o vacío),
 * genera un único hito por el importe completo — nunca deja el presupuesto
 * sin ningún cobro que marcar. El ÚLTIMO hito absorbe el redondeo (nunca se
 * reparte entre todos) para que la suma sea siempre exactamente
 * `precioTotal`, nunca unos céntimos de más o de menos.
 */
function generarCobrosDesdeCondiciones(condicionesPago: string, precioTotal: number): Array<{ id: string; concepto: string; importe: number; cobradoEn: string }> {
  const total = Math.round((precioTotal || 0) * 100) / 100;
  const segmentos = (condicionesPago || '').split(/[/;\n]/).map((s) => s.trim()).filter(Boolean);
  const hitos: Array<{ concepto: string; porcentaje: number }> = [];
  for (const seg of segmentos) {
    const m = seg.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (m) hitos.push({ concepto: seg, porcentaje: parseFloat(m[1].replace(',', '.')) });
  }
  const sumaPorcentajes = hitos.reduce((s, h) => s + h.porcentaje, 0);
  if (hitos.length === 0 || sumaPorcentajes <= 0 || total <= 0) {
    return [{ id: randomUUID(), concepto: 'Pago completo', importe: total, cobradoEn: '' }];
  }
  const resultado = hitos.map((h) => ({
    id: randomUUID(),
    concepto: h.concepto,
    importe: Math.round((total * h.porcentaje) / sumaPorcentajes * 100) / 100,
    cobradoEn: '',
  }));
  const sumaImportes = resultado.reduce((s, h) => s + h.importe, 0);
  const diferencia = Math.round((total - sumaImportes) * 100) / 100;
  if (diferencia !== 0) {
    resultado[resultado.length - 1].importe = Math.round((resultado[resultado.length - 1].importe + diferencia) * 100) / 100;
  }
  return resultado;
}

/** Estructura de una ficha de cliente (identidad) tal como la maneja el servicio. */
export type ClienteDoc = Record<string, unknown> & { id: string };

/** Estructura de un proyecto/expediente tal como la maneja el servicio (incremento "Cliente ≠ Proyecto", 20/08/2026). */
export type ProyectoDoc = Record<string, unknown> & { id: string; clienteId: string };

/**
 * Error de negocio esperado (no un fallo del servidor) — su mensaje es
 * seguro para mostrar al usuario tal cual, a diferencia de un error
 * inesperado que `responderError` convierte en un mensaje genérico.
 */
export class ErrorDeNegocio extends Error {
  constructor(message: string, public status: 400 | 409 = 400) {
    super(message);
  }
}

/**
 * Si `valor` es una data URL Base64 (subida nueva desde el frontend, ver
 * `comprimirImagen()`/`leerArchivoComoBase64()`), la sube al almacenamiento
 * de archivos y devuelve el resultado. Si ya es una URL externa (guardada en
 * un guardado anterior) devuelve `null` — no hay nada nuevo que subir
 * (Incremento 1.7).
 */
async function subirSiEsBase64(valor: unknown, carpeta: string) {
  if (typeof valor !== 'string' || !valor.startsWith('data:')) return null;
  const coincide = valor.match(/^data:([^;]+);base64,(.+)$/);
  if (!coincide) return null;
  const [, tipoMime, base64] = coincide;
  const buffer = Buffer.from(base64, 'base64');
  return almacenamiento.subir(buffer, { contentType: tipoMime, carpeta });
}

/**
 * Sustituye, en un documento de Factura ya leído de Mongo, cada URL
 * respaldada por una clave del bucket privado de facturas
 * (`imagenClave`/`pdfOriginalClave`/`imagenesClaves`/`paginas[].clave`) por
 * una URL firmada temporal recién generada (Incremento "Facturas
 * privadas", 27/08/2026) — y retira esas claves de la respuesta: son un
 * detalle interno de almacenamiento, el frontend nunca las necesita.
 *
 * Facturas guardadas ANTES de este incremento no tienen ninguna clave —
 * para ellas `imagen`/`pdfOriginalUrl`/`imagenes`/`paginas[].url` se
 * devuelven tal cual (la URL pública permanente de siempre), sin ningún
 * cambio de comportamiento.
 *
 * Se aplica a CUALQUIER lectura de una factura completa: la ficha
 * individual (`obtenerFactura`), el resultado de guardar
 * (`guardarFactura`), el aviso de posible duplicado
 * (`buscarFacturaDuplicada`) y la generación de PDF/ZIP
 * (`obtenerPdfCombinadoFacturas`, `obtenerDocumentacionAsesor`,
 * `obtenerZipFacturas` vía `obtenerFactura`) — esta última es la razón por
 * la que esto no es opcional: `documentos-factura.service.ts` descarga la
 * imagen con `fetch(url)` para incrustarla en el PDF, y una URL de un
 * bucket privado sin firmar devolvería 403.
 */
/**
 * Prefijo EXCLUSIVO de las claves del bucket privado nuevo (ver
 * `AlmacenamientoR2.PREFIJO_FACTURAS_PRIVADO` en `almacenamiento-r2.ts`,
 * la misma constante duplicada a propósito: este archivo no importa la
 * clase de R2 directamente, solo `almacenamiento.service.js`). Las
 * facturas de ANTES del incremento "Facturas privadas" pueden tener una
 * `imagenClave` con el prefijo genérico `facturas/` (bucket histórico,
 * público) — esas deben seguir resolviéndose exactamente como antes
 * (`almacenamiento.generarUrlTemporal`), nunca por el proxy nuevo, que
 * solo tiene sentido y solo está autorizado para el bucket realmente
 * privado.
 */
const PREFIJO_FACTURAS_PRIVADO = 'facturas-privado/';

/**
 * Construye la URL por la que el navegador debe pedir un archivo del
 * bucket PRIVADO de facturas — nunca una URL firmada de R2 directa
 * (incidencia real, 29/08/2026: tanto el dominio público de R2 como una
 * URL firmada pedida DIRECTAMENTE por el navegador devuelven 503 de forma
 * intermitente; el servidor, en cambio, siempre ha podido leer el objeto
 * sin fallos — ver `firmarTokenArchivo` en `token.service.ts` y la ruta
 * `/almacenamiento-privado` en `presupuestos-service.app-root.ts`, que es
 * quien de verdad llama a `almacenamiento.obtener()`).
 */
function urlProxyArchivoPrivado(clave: string): string {
  return `/almacenamiento-privado?token=${encodeURIComponent(firmarTokenArchivo(clave))}`;
}

/** Resuelve una clave a la URL con la que debe verla el navegador — proxy propio para el bucket privado nuevo, comportamiento de siempre (`generarUrlTemporal`) para cualquier otra clave. */
async function resolverUrlClave(clave: string): Promise<string> {
  return clave.startsWith(PREFIJO_FACTURAS_PRIVADO) ? urlProxyArchivoPrivado(clave) : almacenamiento.generarUrlTemporal(clave);
}

/**
 * Resuelve un campo `url`/`clave` de una factura — si no hay `clave` (bug
 * real, 29/08/2026: un reguardado antes de la corrección de `guardarFactura`
 * podía dejarla vacía) intenta derivarla del literal ya guardado en `url`
 * con `claveDesdeUrlPrivada()`. Sin esto, una factura ya afectada por ese
 * bug se queda enseñando la URL firmada de R2 caducada para siempre, aunque
 * el objeto siga existiendo en el bucket privado.
 */
async function resolverUrlCampo(clave: string | undefined | null, url: string | undefined): Promise<string | undefined> {
  if (clave) return resolverUrlClave(clave);
  const claveDerivada = typeof url === 'string' ? almacenamiento.claveDesdeUrlPrivada(url) : null;
  return claveDerivada ? urlProxyArchivoPrivado(claveDerivada) : url;
}

async function resolverUrlsFactura(doc: Record<string, unknown>): Promise<Record<string, unknown>> {
  const d = doc as any;
  const { imagenClave, imagenesClaves, pdfOriginalClave, ...resto } = d;

  const imagen = await resolverUrlCampo(imagenClave, d.imagen);
  const pdfOriginalUrl = await resolverUrlCampo(pdfOriginalClave, d.pdfOriginalUrl);
  const imagenes = Array.isArray(d.imagenes)
    ? await Promise.all(d.imagenes.map((url: string, i: number) => resolverUrlCampo(imagenesClaves?.[i], url)))
    : d.imagenes;
  const paginas = Array.isArray(d.paginas)
    ? await Promise.all(d.paginas.map(async (p: Record<string, unknown>) => {
        const { clave, ...pRest } = p as any;
        return { ...pRest, url: await resolverUrlCampo(clave, (p as any).url) };
      }))
    : d.paginas;

  return { ...resto, imagen, pdfOriginalUrl, imagenes, paginas };
}

/** Sube las fotos nuevas (Base64) de un cliente; deja las ya subidas tal cual. */
async function procesarFotos(fotos: any[] | undefined): Promise<any[]> {
  return Promise.all((fotos ?? []).map(async (f) => {
    const resultado = await subirSiEsBase64(f.url, 'fotos');
    if (!resultado) return f;
    return { ...f, url: resultado.url, claveAlmacenamiento: resultado.clave, tamano: resultado.metadatos.tamano, tipoMime: resultado.metadatos.tipoMime, subidoEn: resultado.metadatos.subidoEn };
  }));
}

/** Sube los adjuntos nuevos (Base64) de un cliente; deja los ya subidos tal cual. */
async function procesarAdjuntos(adjuntos: any[] | undefined): Promise<any[]> {
  return Promise.all((adjuntos ?? []).map(async (a) => {
    const resultado = await subirSiEsBase64(a.url, 'adjuntos');
    if (!resultado) return a;
    return { ...a, url: resultado.url, claveAlmacenamiento: resultado.clave, tamano: resultado.metadatos.tamano, tipo: resultado.metadatos.tipoMime, subidoEn: resultado.metadatos.subidoEn };
  }));
}

/**
 * Borra del almacenamiento externo los archivos que estaban en `antes` pero
 * ya no están en `despues` (comparando por `id` del subdocumento) — evita
 * acumular archivos huérfanos cuando se quita una foto/adjunto/dibujo de un
 * cliente sin borrar el cliente entero (Incremento 1.7).
 */
async function borrarBlobsHuerfanos(antes: any[] | undefined, despues: any[] | undefined): Promise<void> {
  const idsDespues = new Set((despues ?? []).map((d) => d.id));
  for (const item of antes ?? []) {
    if (!idsDespues.has(item.id) && item.claveAlmacenamiento) {
      await almacenamiento.borrar(item.claveAlmacenamiento).catch(() => {});
    }
  }
}

/**
 * Sube las imágenes nuevas (Base64) del lienzo de un presupuesto (Fase 6) al
 * almacenamiento externo, sustituyendo su `dataURL` por la URL resultante —
 * evita que el blob `contenidoLienzo` (guardado entero como `Mixed`) crezca
 * sin límite con varias fotos reales en varias hojas. Deja tal cual las
 * entradas que ya son una URL (guardado anterior) o presupuestos en modo
 * simple, que no tienen `contenidoLienzo.files`.
 */
async function procesarArchivosLienzo(contenidoLienzo: unknown): Promise<unknown> {
  if (!contenidoLienzo || typeof contenidoLienzo !== 'object' || !('files' in contenidoLienzo)) return contenidoLienzo;
  const files = (contenidoLienzo as any).files as Record<string, any> | undefined;
  if (!files) return contenidoLienzo;
  const entradas = await Promise.all(Object.entries(files).map(async ([fileId, f]) => {
    const resultado = await subirSiEsBase64(f?.dataURL, 'presupuestos-lienzo');
    if (!resultado) return [fileId, f] as const;
    return [fileId, { ...f, dataURL: resultado.url, claveAlmacenamiento: resultado.clave }] as const;
  }));
  return { ...(contenidoLienzo as object), files: Object.fromEntries(entradas) };
}

/**
 * Borra del almacenamiento externo las imágenes del lienzo (identificadas
 * por `fileId`, no por `id` de subdocumento) que estaban en `antes` pero ya
 * no están en `despues` — mismo criterio que `borrarBlobsHuerfanos`, adaptado
 * a que `files` es un diccionario por `fileId`, no un array.
 */
async function borrarArchivosLienzoHuerfanos(antes: unknown, despues: unknown): Promise<void> {
  const filesAntes = (antes as any)?.files as Record<string, any> | undefined;
  const filesDespues = (despues as any)?.files as Record<string, any> | undefined;
  for (const [fileId, f] of Object.entries(filesAntes ?? {})) {
    if (!filesDespues?.[fileId] && f?.claveAlmacenamiento) {
      await almacenamiento.borrar(f.claveAlmacenamiento).catch(() => {});
    }
  }
}

/** Datos de empresa gestionados por el servicio. */
export type EmpresaDoc = {
  nombre: string;
  /** Nombre y apellidos del titular real (autónomo) — ver `EmpresaSchema.titular` en `cliente.model.ts`. */
  titular: string;
  eslogan: string;
  logo: string;
  /** CIF/NIF de la propia empresa — para las facturas/presupuestos que ella emite. */
  nifCif: string;
  telefono: string;
  email: string;
  iban: string;
  condicionesPagoDefecto: string;
  validezDiasDefecto: number;
  /** Tema por defecto del Motor Documental (Incremento 3) — `null` hasta que el usuario personalice uno. */
  temaPorDefecto: TemaMC | null;
  /** Región fiscal (Fase Facturas Profesional) — determina si el Trimestral calcula IGIC (Canarias) o IVA (Península). */
  regionFiscal: 'canarias' | 'peninsula' | '';
  /** Ubicación estructurada (Fase 2F, "Consenso de Precio") — determina qué mercado local investigar. `isla` solo aplica a Canarias/Baleares. Vacíos hasta que el usuario los configura. */
  comunidadAutonoma: string;
  provincia: string;
  isla: string;
  /** REPEP activo (exención de IGIC por bajo volumen, solo Canarias) — decisión del usuario, nunca inferida. */
  repepActivo: boolean;
  /** Ancho en píxeles del logo en la barra lateral — ajustable a mano por el usuario. */
  logoTamano: number;
  /** Enlace de Google My Business — destino de "Pedir reseña". Vacío hasta que el negocio lo configura. */
  enlaceResenaGoogle: string;
  /** Cartel de agradecimiento en base64 para la página de solicitud de reseña — opcional. */
  imagenResena: string;
  /** Firma dibujada del titular (PNG base64), reutilizada en el elemento "Firma de la empresa" de cada presupuesto — vacía hasta que se dibuja una vez en Ajustes de empresa. */
  firmaEmpresa: string;
  /** Minutos de inactividad antes de cerrar sesión sola — `null` = nunca. */
  tiempoInactividadMin: number | null;
  /** Margen objetivo (%) del negocio (Inteligencia de Precios, Fase 1) — `null` = sin configurar. */
  margenObjetivoPorcentaje: number | null;
};

// ── Portal del cliente (enlace público de un presupuesto) ──────────────────────

/**
 * Proyección explícita del presupuesto que puede llegar a la vista pública
 * (Portal del cliente) — lista blanca, nunca `limpiar()` (ese sí deja pasar
 * `usuarioId`, confirmado al auditar esta función; aquí no puede ocurrir).
 * Deliberadamente NO incluye: `usuarioId`, `clienteId` en crudo,
 * `contenidoLienzo` (legado, no soportado en el portal), ni el IBAN de la
 * empresa (no hace falta para ver/aceptar, y es un dato bancario que no debe
 * viajar en una URL reenviable por WhatsApp — hallazgo de la revisión de
 * seguridad, 17/08/2026).
 *
 * Se usa TANTO para lo que ve el cliente COMO para calcular
 * `contenidoHash` — así "lo que ves es lo que firmas" por construcción, no
 * por disciplina de mantener dos listas de campos sincronizadas a mano.
 */
function proyeccionPublicaPresupuesto(p: Record<string, unknown>) {
  return {
    titulo: p.titulo,
    formato: p.formato,
    descripcion: p.descripcion,
    alcance: p.alcance,
    items: p.items,
    contenidoDocumento: p.formato === 'documento' ? p.contenidoDocumento : undefined,
    condicionesPago: p.condicionesPago,
    validezDias: p.validezDias,
    condicionesGenerales: p.condicionesGenerales,
    precioTotal: p.precioTotal,
  };
}

/** Hash de integridad del contenido visible del presupuesto — ver `proyeccionPublicaPresupuesto`. */
function hashContenidoPublico(p: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(proyeccionPublicaPresupuesto(p))).digest('hex');
}

/**
 * Ids de `ComponenteMC` referenciados por elementos `instanciaComponente`
 * en cualquier parte de un `DocumentoMC` (cuerpo de página, encabezado/pie
 * propios de cada página, encabezado/pie por defecto del documento) — para
 * el Portal del cliente, que no tiene sesión con la que resolverlos por su
 * cuenta (ver `obtenerPresupuestoPublico`, más abajo). Antes de esto, una
 * instancia sin resolver se quedaba mostrando "Cargando componente…" para
 * siempre en el enlace público — parecía la aplicación rota.
 */
function componenteIdsReferenciados(documento: unknown): string[] {
  if (!documento || typeof documento !== 'object') return [];
  const doc = documento as Record<string, unknown>;
  const ids = new Set<string>();
  const recorrerElementos = (elementos: unknown) => {
    if (!Array.isArray(elementos)) return;
    for (const el of elementos) {
      if (!el || typeof el !== 'object') continue;
      const elemento = el as Record<string, unknown>;
      if (elemento.tipo === 'instanciaComponente') {
        const contenido = elemento.contenido as Record<string, unknown> | undefined;
        const id = contenido?.componenteId;
        if (typeof id === 'string' && id) ids.add(id);
      }
    }
  };
  const recorrerZona = (zona: unknown) => {
    if (zona && typeof zona === 'object') recorrerElementos((zona as Record<string, unknown>).elementos);
  };
  recorrerZona(doc.encabezadoPorDefecto);
  recorrerZona(doc.piePorDefecto);
  const paginas = Array.isArray(doc.paginas) ? doc.paginas : [];
  for (const p of paginas) {
    if (!p || typeof p !== 'object') continue;
    const pagina = p as Record<string, unknown>;
    recorrerElementos(pagina.elementos);
    recorrerZona(pagina.encabezado);
    recorrerZona(pagina.pie);
  }
  return [...ids];
}

/** Cabecera real de un PNG (los primeros 8 bytes) — ver `aceptarPresupuestoPublico`. */
const CABECERA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Servicio de presupuestos: gestiona la persistencia de clientes, facturas y
 * empresa en MongoDB, siempre aislados por `usuarioId`.
 */
export class PresupuestosService {
  // ── Cliente (identidad) — incremento "Cliente ≠ Proyecto", 20/08/2026 ──
  //
  // Un `Cliente` es solo nombre/teléfono/email. Toda la gestión económica
  // y documental de un trabajo concreto vive en `Proyecto` (más abajo) —
  // un cliente puede tener tantos proyectos como trabajos reales tenga, y
  // crear uno nuevo nunca copia ni mezcla los datos de los anteriores
  // (especificación del usuario). Ver `cliente.model.ts` para el porqué
  // completo y cómo se migraron los datos existentes.

  /**
   * Devuelve una página de clientes (identidad) del usuario indicado,
   * ordenados por fecha de creación descendente.
   * @param usuarioId Propietario de los datos.
   * @param opciones Página (1-indexada) y tamaño de página.
   */
  async listarClientes(usuarioId: string, opciones: { pagina: number; limite: number }): Promise<{ items: ClienteDoc[]; total: number }> {
    await conectar();
    const salto = (opciones.pagina - 1) * opciones.limite;
    const [docs, total] = await Promise.all([
      ClienteModel.find({ usuarioId }).sort({ creado: -1 }).skip(salto).limit(opciones.limite).lean().exec(),
      ClienteModel.countDocuments({ usuarioId }).exec(),
    ]);
    return { items: docs.map((d) => this.limpiar(d)), total };
  }

  /**
   * Devuelve únicamente `id` y `nombre` de todos los clientes del usuario,
   * sin paginar — selectores/autocompletados (desplegable de cliente al
   * crear una factura, selector "cliente existente" al crear un proyecto).
   * @param usuarioId Propietario de los datos.
   */
  async listarClientesNombres(usuarioId: string): Promise<{ id: string; nombre: string }[]> {
    await conectar();
    const docs = await ClienteModel.find({ usuarioId }).select('id nombre').lean().exec();
    return (docs as any[]).map((d) => ({ id: d.id, nombre: d.nombre }));
  }

  /**
   * Crea un cliente nuevo (solo identidad) — el primer proyecto se crea
   * aparte con `crearProyecto`. Separado de `guardarCliente` (edición) para
   * que quede claro que aquí siempre se genera un id nuevo, nunca se
   * reutiliza uno existente (evita duplicar clientes por error).
   */
  async crearCliente(datos: { nombre: string; telefono?: string; email?: string; dni?: string; direccion?: string }, usuarioId: string): Promise<ClienteDoc> {
    await conectar();
    const doc = await ClienteModel.create({
      id: randomUUID(), usuarioId,
      nombre: datos.nombre, telefono: datos.telefono ?? '', email: datos.email ?? '', dni: datos.dni ?? '', direccion: datos.direccion ?? '',
      creado: new Date().toISOString(),
    });
    busEventos.publicar({ nombre: 'cliente.creado', usuarioId, entidadId: doc.id, datos: { nombre: doc.nombre } });
    return this.limpiar(doc.toObject());
  }

  /** Edita los datos de identidad de un cliente ya existente (nombre/teléfono/email/DNI-NIE). */
  async guardarCliente(cliente: { id: string; nombre: string; telefono?: string; email?: string; dni?: string; direccion?: string }, usuarioId: string): Promise<ClienteDoc> {
    await conectar();
    const doc = await ClienteModel.findOneAndUpdate(
      { id: cliente.id, usuarioId },
      { $set: { nombre: cliente.nombre, telefono: cliente.telefono ?? '', email: cliente.email ?? '', dni: cliente.dni ?? '', direccion: cliente.direccion ?? '' } },
      { new: true }
    ).lean().exec();
    if (!doc) throw new ErrorDeNegocio('Cliente no encontrado', 400);
    busEventos.publicar({ nombre: 'cliente.actualizado', usuarioId, entidadId: cliente.id, datos: { nombre: cliente.nombre } });
    return this.limpiar(doc);
  }

  /**
   * Devuelve un cliente (identidad) por id, solo si pertenece al usuario.
   * @param id Identificador del cliente.
   * @param usuarioId Propietario de los datos.
   */
  async obtenerCliente(id: string, usuarioId: string): Promise<ClienteDoc | null> {
    await conectar();
    const doc = await ClienteModel.findOne({ id, usuarioId }).lean().exec();
    if (!doc) return null;
    return this.limpiar(doc as Record<string, unknown>);
  }

  /**
   * Borra un cliente (solo si pertenece al usuario) — rechaza el borrado
   * si todavía tiene algún proyecto enlazado, para no dejar proyectos
   * huérfanos sin identidad; hay que borrar (o mover) sus proyectos antes.
   * @param id Identificador del cliente.
   * @param usuarioId Propietario de los datos.
   */
  async borrarCliente(id: string, usuarioId: string): Promise<void> {
    await conectar();
    const tieneProyectos = await ProyectoModel.exists({ clienteId: id, usuarioId });
    if (tieneProyectos) throw new ErrorDeNegocio('Este cliente todavía tiene proyectos asociados — bórralos primero.', 400);
    await ClienteModel.deleteOne({ id, usuarioId }).exec();
  }

  // ── Proyecto (expediente de trabajo) ──────────────────────────────────
  //
  // Gastos, ingresos, mediciones, tareas, fotos, adjuntos y dibujos son
  // exclusivos de CADA proyecto — nunca se mezclan entre los distintos
  // proyectos de un mismo cliente (esa mezcla era el fallo real que
  // motivó este incremento).

  /**
   * Devuelve los proyectos de un cliente concreto (resumen, sin
   * fotos/adjuntos/dibujos/movimientos) — para el selector "cliente
   * existente → nuevo proyecto" y la cabecera de la ficha de proyecto
   * ("otros proyectos de este cliente").
   */
  async listarProyectosDeCliente(clienteId: string, usuarioId: string): Promise<
    { id: string; proyecto: string; estado: string; presupuesto: number; creado: string }[]
  > {
    await conectar();
    const docs = await ProyectoModel.find({ clienteId, usuarioId })
      .select('id proyecto estado presupuesto creado')
      .sort({ creado: -1 })
      .lean()
      .exec();
    return (docs as any[]).map((d) => ({
      id: d.id, proyecto: d.proyecto || '', estado: d.estado, presupuesto: d.presupuesto || 0, creado: d.creado,
    }));
  }

  /**
   * Devuelve un resumen ligero (sin fotos/adjuntos/dibujos/movimientos) de
   * TODOS los proyectos del usuario, con el nombre de su cliente ya
   * resuelto — sin paginar, para vistas que necesitan organizar el
   * conjunto completo (`ListaClientes`, `SeccionPresupuestos`, agrupada
   * por año y por carpeta de estado). Sustituye a la antigua
   * `listarClientesResumen` (mismo shape de salida, más `clienteId`).
   * @param usuarioId Propietario de los datos.
   */
  async listarProyectosResumen(usuarioId: string): Promise<
    { id: string; clienteId: string; nombre: string; proyecto: string; estado: string; presupuesto: number; creado: string; fechaMontaje?: string; fechaMedicion?: string }[]
  > {
    await conectar();
    const [proyectos, clientes] = await Promise.all([
      ProyectoModel.find({ usuarioId }).select('id clienteId proyecto estado presupuesto creado fechaMontaje fechaMedicion').lean().exec() as Promise<any[]>,
      ClienteModel.find({ usuarioId }).select('id nombre').lean().exec() as Promise<any[]>,
    ]);
    const nombresPorClienteId = new Map(clientes.map((c) => [c.id, c.nombre as string]));
    return proyectos.map((p) => ({
      id: p.id, clienteId: p.clienteId, nombre: nombresPorClienteId.get(p.clienteId) || '',
      proyecto: p.proyecto || '', estado: p.estado, presupuesto: p.presupuesto || 0, creado: p.creado,
      fechaMontaje: p.fechaMontaje || undefined, fechaMedicion: p.fechaMedicion || undefined,
    }));
  }

  /**
   * Crea un proyecto nuevo — para un cliente nuevo o ya existente, da
   * igual: siempre empieza completamente en cero (gastos, ingresos,
   * documentos, mediciones, fotos, notas — especificación del usuario,
   * punto 4), nunca copia nada de otros proyectos del mismo cliente.
   */
  async crearProyecto(datos: {
    clienteId: string; proyecto?: string; direccion?: string; presupuesto?: number; tarifaHora?: number;
    whatsapp?: string; ubicacion?: string; codigoPuerta?: string; planta?: string; ascensor?: boolean;
    zonaCarga?: string; observacionesAcceso?: string; fechaMedicion?: string; fechaMontaje?: string;
  }, usuarioId: string): Promise<ProyectoDoc> {
    await conectar();
    const clienteExiste = await ClienteModel.exists({ id: datos.clienteId, usuarioId });
    if (!clienteExiste) throw new ErrorDeNegocio('Cliente no encontrado', 400);
    const doc = await ProyectoModel.create({
      id: randomUUID(), usuarioId, clienteId: datos.clienteId,
      proyecto: datos.proyecto ?? '', direccion: datos.direccion ?? '',
      presupuesto: datos.presupuesto ?? 0, tarifaHora: datos.tarifaHora ?? 0,
      creado: new Date().toISOString(), estado: 'presupuestado',
      whatsapp: datos.whatsapp, ubicacion: datos.ubicacion, codigoPuerta: datos.codigoPuerta,
      planta: datos.planta, ascensor: datos.ascensor, zonaCarga: datos.zonaCarga,
      observacionesAcceso: datos.observacionesAcceso, fechaMedicion: datos.fechaMedicion, fechaMontaje: datos.fechaMontaje,
      estancias: [], tareas: [], movimientos: [], horas: [], adjuntos: [], fotos: [], margenAvisado: false,
    });
    busEventos.publicar({ nombre: 'proyecto.creado', usuarioId, entidadId: doc.id, datos: { clienteId: datos.clienteId, proyecto: doc.proyecto } });
    return this.limpiarProyecto(doc.toObject());
  }

  /**
   * Edita los campos propios de un proyecto (nombre del trabajo, dirección,
   * presupuesto estimado, tarifa/hora, datos de acceso a obra, fotos/
   * adjuntos). Protege `movimientos`/`tareas`/`estado` de
   * sobrescrituras — mismo motivo y mismo patrón que ya usaba
   * `guardarCliente` antes de este incremento: solo las rutas dedicadas
   * (`/proyectos/:id/movimientos`, `/tareas`, `/estado`) pueden cambiarlos.
   */
  async guardarProyecto(proyecto: ProyectoDoc, usuarioId: string): Promise<ProyectoDoc> {
    await conectar();
    const anterior = await ProyectoModel.findOne({ id: proyecto.id, usuarioId }).lean().exec() as any;
    if (!anterior) throw new ErrorDeNegocio('Proyecto no encontrado', 400);

    const fotos = await procesarFotos((proyecto as any).fotos);
    const adjuntos = await procesarAdjuntos((proyecto as any).adjuntos);

    const { movimientos: _movimientos, tareas: _tareas, estado: _estado, clienteId: _clienteId, ...proyectoSinCamposProtegidos } = proyecto as any;

    const doc = await ProyectoModel.findOneAndUpdate(
      { id: proyecto.id, usuarioId },
      { ...proyectoSinCamposProtegidos, fotos, adjuntos, usuarioId },
      { new: true }
    ).lean().exec();

    await borrarBlobsHuerfanos(anterior.fotos, fotos);
    await borrarBlobsHuerfanos(anterior.adjuntos, adjuntos);

    return this.limpiarProyecto(doc);
  }

  /**
   * Añade UN adjunto a un proyecto — ruta quirúrgica dedicada (bug real,
   * 28/08/2026: "el PDF subido no se puede borrar"). Causa raíz: los
   * adjuntos se cargan aparte de la ficha (`obtenerAdjuntosProyecto`,
   * para no pesar la apertura) y el `Proyecto` que ve el frontend nunca
   * los incluye — el frontend mantenía su PROPIA copia local
   * (`adjuntosProyecto` en `ficha-cliente.tsx`) y la actualizaba solo de
   * forma optimista, sin nunca recibir de vuelta la URL real de
   * almacenamiento tras subir. Cada operación posterior (incluido
   * borrar) reenviaba entonces TODOS los adjuntos ya subidos otra vez en
   * Base64 a través del `guardarProyecto` genérico — payloads que
   * crecían sin límite en la misma sesión y podían superar el límite de
   * tamaño (`LIMITE_BLOBS_CLIENTE_BYTES`) o el del propio servidor, con
   * el guardado fallando en silencio (sin manejo de error en el
   * frontend). Esta ruta sube/persiste solo el adjunto que corresponde,
   * sin tocar el resto del proyecto ni reenviar nada ya subido.
   */
  async anadirAdjuntoProyecto(proyectoId: string, usuarioId: string, adjunto: { id: string; nombre: string; tipo: string; tamano: number; url: string }): Promise<unknown[]> {
    await conectar();
    const proyecto = await ProyectoModel.findOne({ id: proyectoId, usuarioId }).select('adjuntos').lean().exec();
    if (!proyecto) throw new ErrorDeNegocio('Proyecto no encontrado', 400);
    const [procesado] = await procesarAdjuntos([adjunto]);
    const actuales = Array.isArray((proyecto as any).adjuntos) ? (proyecto as any).adjuntos : [];
    const doc = await ProyectoModel.findOneAndUpdate(
      { id: proyectoId, usuarioId },
      { $set: { adjuntos: [...actuales, procesado] } },
      { new: true }
    ).select('adjuntos').lean().exec();
    if (!doc) throw new ErrorDeNegocio('Proyecto no encontrado', 400);
    return (this.limpiarProyecto(doc as Record<string, unknown>).adjuntos as unknown[]) ?? [];
  }

  /** Borra UN adjunto de un proyecto por su id — ruta quirúrgica dedicada, ver `anadirAdjuntoProyecto`. Borra también su blob de almacenamiento externo (mismo criterio que `borrarBlobsHuerfanos`). */
  async borrarAdjuntoProyecto(proyectoId: string, usuarioId: string, adjuntoId: string): Promise<unknown[]> {
    await conectar();
    const proyecto = await ProyectoModel.findOne({ id: proyectoId, usuarioId }).select('adjuntos').lean().exec();
    if (!proyecto) throw new ErrorDeNegocio('Proyecto no encontrado', 400);
    const actuales: any[] = Array.isArray((proyecto as any).adjuntos) ? (proyecto as any).adjuntos : [];
    const borrado = actuales.find((a) => a.id === adjuntoId);
    const nuevos = actuales.filter((a) => a.id !== adjuntoId);
    const doc = await ProyectoModel.findOneAndUpdate(
      { id: proyectoId, usuarioId },
      { $set: { adjuntos: nuevos } },
      { new: true }
    ).select('adjuntos').lean().exec();
    if (!doc) throw new ErrorDeNegocio('Proyecto no encontrado', 400);
    if (borrado?.claveAlmacenamiento) await almacenamiento.borrar(borrado.claveAlmacenamiento).catch(() => {});
    return (this.limpiarProyecto(doc as Record<string, unknown>).adjuntos as unknown[]) ?? [];
  }

  /**
   * Asocia (o reemplaza) el modelo 3D de SketchUp de un proyecto (Fase
   * "Diseño 3D", 30/08/2026) — el archivo en sí no se toca ni se sube
   * aquí, solo se guarda a qué archivo de Trimble Connect corresponde
   * este proyecto. Mismo criterio de aislamiento que cualquier otra ruta
   * de proyecto: filtra por `{id, usuarioId}`, nunca por `id` solo.
   */
  async asociarModelo3DProyecto(proyectoId: string, usuarioId: string, datos: {
    trimbleProjectId: string; trimbleFolderId: string; trimbleFileId: string;
    nombreArchivo: string; version: number; thumbnailUrl: string;
  }): Promise<ProyectoDoc> {
    await conectar();
    const modelo3D = {
      proveedor: 'trimble_connect' as const,
      trimbleProjectId: datos.trimbleProjectId,
      trimbleFolderId: datos.trimbleFolderId,
      trimbleFileId: datos.trimbleFileId,
      nombreArchivo: datos.nombreArchivo,
      version: datos.version,
      thumbnailUrl: datos.thumbnailUrl,
      actualizado: new Date().toISOString(),
      asociadoPor: usuarioId,
    };
    const doc = await ProyectoModel.findOneAndUpdate(
      { id: proyectoId, usuarioId },
      { $set: { modelo3D } },
      { new: true }
    ).lean().exec();
    if (!doc) throw new ErrorDeNegocio('Proyecto no encontrado', 400);
    return this.limpiarProyecto(doc);
  }

  /** Desasocia el modelo 3D de un proyecto — nunca borra el archivo real de Trimble Connect, solo la referencia guardada aquí. */
  async quitarModelo3DProyecto(proyectoId: string, usuarioId: string): Promise<ProyectoDoc> {
    await conectar();
    const doc = await ProyectoModel.findOneAndUpdate(
      { id: proyectoId, usuarioId },
      { $set: { modelo3D: null } },
      { new: true }
    ).lean().exec();
    if (!doc) throw new ErrorDeNegocio('Proyecto no encontrado', 400);
    return this.limpiarProyecto(doc);
  }

  /**
   * Añade un movimiento manual a un proyecto — ruta quirúrgica dedicada;
   * `guardarProyecto` ya no acepta cambios en `movimientos`. Nunca lleva
   * `facturaId`: los movimientos vinculados a una factura solo los crea
   * `sincronizarMovimientoFactura`.
   */
  async anadirMovimientoProyecto(proyectoId: string, usuarioId: string, datos: { fecha: string; concepto: string; categoria: string; tipo: 'gasto' | 'ingreso'; importe: number }): Promise<ProyectoDoc> {
    await conectar();
    const movimiento = { id: randomUUID(), facturaId: '', ...datos };
    const doc = await ProyectoModel.findOneAndUpdate(
      { id: proyectoId, usuarioId },
      { $push: { movimientos: movimiento } },
      { new: true }
    ).lean().exec();
    if (!doc) throw new ErrorDeNegocio('Proyecto no encontrado', 400);
    return this.limpiarProyecto(doc);
  }

  /** Edita un movimiento existente (manual o vinculado a factura) por su id. */
  async editarMovimientoProyecto(proyectoId: string, usuarioId: string, movimientoId: string, datos: { fecha: string; concepto: string; categoria: string; tipo: 'gasto' | 'ingreso'; importe: number }): Promise<ProyectoDoc> {
    await conectar();
    const doc = await ProyectoModel.findOneAndUpdate(
      { id: proyectoId, usuarioId, 'movimientos.id': movimientoId },
      { $set: {
          'movimientos.$.fecha': datos.fecha,
          'movimientos.$.concepto': datos.concepto,
          'movimientos.$.categoria': datos.categoria,
          'movimientos.$.tipo': datos.tipo,
          'movimientos.$.importe': datos.importe,
        } },
      { new: true }
    ).lean().exec();
    if (!doc) throw new ErrorDeNegocio('Movimiento no encontrado', 400);
    return this.limpiarProyecto(doc);
  }

  /** Borra un movimiento por su id. */
  async borrarMovimientoProyecto(proyectoId: string, usuarioId: string, movimientoId: string): Promise<ProyectoDoc> {
    await conectar();
    const doc = await ProyectoModel.findOneAndUpdate(
      { id: proyectoId, usuarioId },
      { $pull: { movimientos: { id: movimientoId } } },
      { new: true }
    ).lean().exec();
    if (!doc) throw new ErrorDeNegocio('Proyecto no encontrado', 400);
    return this.limpiarProyecto(doc);
  }

  /**
   * Reemplaza la lista completa de tareas de un proyecto — la pestaña de
   * tareas ya gestiona el array entero en el propio navegador (marcar
   * hecha, reordenar, añadir, borrar) y lo reenvía completo; esta ruta solo
   * garantiza que ese reenvío nunca pisa `movimientos`/`estado`.
   */
  async guardarTareasProyecto(proyectoId: string, usuarioId: string, tareas: { id: string; texto: string; hecha: boolean }[]): Promise<ProyectoDoc> {
    await conectar();
    const doc = await ProyectoModel.findOneAndUpdate(
      { id: proyectoId, usuarioId },
      { $set: { tareas } },
      { new: true }
    ).lean().exec();
    if (!doc) throw new ErrorDeNegocio('Proyecto no encontrado', 400);
    return this.limpiarProyecto(doc);
  }

  /** Cambia el estado del proyecto a mano (presupuestado/en_curso/finalizado/rechazado — "finalizado" es lo que lo archiva). */
  async cambiarEstadoProyecto(proyectoId: string, usuarioId: string, estado: string): Promise<ProyectoDoc> {
    await conectar();
    const doc = await ProyectoModel.findOneAndUpdate(
      { id: proyectoId, usuarioId },
      { $set: { estado } },
      { new: true }
    ).lean().exec();
    if (!doc) throw new ErrorDeNegocio('Proyecto no encontrado', 400);
    return this.limpiarProyecto(doc);
  }

  /**
   * Guarda (o reemplaza) una característica estructurada del trabajo
   * (Histórico Inteligente, Fase 2A) — identificada por `clave`, nunca
   * duplica dos entradas con la misma clave. `origen`/`confirmadoPorUsuario`/
   * `confianza` los decide el servidor, SIEMPRE `'usuario'`/`true`/`null`
   * en esta vía de escritura — nunca se confía en lo que mande el cliente
   * para estos tres campos (ver `esquemaCaracteristicaEntrada`, que ni
   * siquiera los acepta en el body).
   */
  async guardarCaracteristicaProyecto(proyectoId: string, usuarioId: string, clave: string, valor: string): Promise<ProyectoDoc> {
    await conectar();
    const proyecto = await ProyectoModel.findOne({ id: proyectoId, usuarioId }).lean().exec();
    if (!proyecto) throw new ErrorDeNegocio('Proyecto no encontrado', 400);
    const existentes = Array.isArray((proyecto as any).caracteristicas) ? (proyecto as any).caracteristicas : [];
    const sinEsaClave = existentes.filter((c: any) => c.clave !== clave);
    const nueva = { clave, valor, origen: 'usuario', confirmadoPorUsuario: true, confianza: null, fecha: new Date().toISOString() };
    const doc = await ProyectoModel.findOneAndUpdate(
      { id: proyectoId, usuarioId },
      { $set: { caracteristicas: [...sinEsaClave, nueva] } },
      { new: true }
    ).lean().exec();
    if (!doc) throw new ErrorDeNegocio('Proyecto no encontrado', 400);
    return this.limpiarProyecto(doc);
  }

  /**
   * Añade un trabajo extra acordado con el cliente durante la obra (pedido
   * real, 28/08/2026: "el cliente me pide otras cosas durante la obra,
   * ¿cómo sumo esto al presupuesto?"). Un solo `findOneAndUpdate` atómico:
   * `$push` la entrada (queda como registro de qué se acordó y por
   * cuánto), `$inc` el presupuesto acordado, Y `$push` un movimiento real
   * de tipo 'ingreso' — todo en la misma operación, nunca escrituras
   * separadas, para que no puedan quedar desincronizados por una carrera
   * entre dos peticiones simultáneas.
   *
   * El movimiento es lo que conecta esto de verdad con Inteligencia de
   * Precios (pedido real, 28/08/2026: "tiene que sumar en el cálculo
   * REAL") — `calcularMargenRealProyecto` suma `movimientos` tipo
   * 'ingreso', nunca `Proyecto.presupuesto` ni `trabajosExtra`; sin este
   * movimiento, un trabajo extra subía el número "Presupuesto acordado"
   * pero no participaba en ningún cálculo de margen, real ni previsto.
   */
  async anadirTrabajoExtraProyecto(proyectoId: string, usuarioId: string, descripcion: string, precio: number): Promise<ProyectoDoc> {
    await conectar();
    const ahora = new Date().toISOString();
    const trabajoExtra = { id: randomUUID(), descripcion, precio, fecha: ahora };
    const movimiento = {
      id: randomUUID(), fecha: ahora.slice(0, 10), concepto: descripcion,
      categoria: 'Trabajo extra', tipo: 'ingreso' as const, importe: precio, facturaId: '',
    };
    const doc = await ProyectoModel.findOneAndUpdate(
      { id: proyectoId, usuarioId },
      { $push: { trabajosExtra: trabajoExtra, movimientos: movimiento }, $inc: { presupuesto: precio } },
      { new: true }
    ).lean().exec();
    if (!doc) throw new ErrorDeNegocio('Proyecto no encontrado', 400);
    return this.limpiarProyecto(doc);
  }

  /** Cambia el presupuesto acordado a mano. */
  async cambiarPresupuestoProyecto(proyectoId: string, usuarioId: string, presupuesto: number): Promise<ProyectoDoc> {
    await conectar();
    const doc = await ProyectoModel.findOneAndUpdate(
      { id: proyectoId, usuarioId },
      { $set: { presupuesto } },
      { new: true }
    ).lean().exec();
    if (!doc) throw new ErrorDeNegocio('Proyecto no encontrado', 400);
    return this.limpiarProyecto(doc);
  }

  /**
   * Devuelve un proyecto (solo si pertenece al usuario), sin los adjuntos
   * — algunos proyectos reales tienen archivos adjuntos históricos de
   * varios MB embebidos, y transferirlos siempre hacía que la apertura de
   * la ficha tardara varios segundos (mismo motivo que ya tenía
   * `obtenerCliente` antes de este incremento). Los adjuntos se piden
   * aparte con `obtenerAdjuntosProyecto`, en segundo plano.
   * @param id Identificador del proyecto.
   * @param usuarioId Propietario de los datos.
   */
  async obtenerProyecto(id: string, usuarioId: string): Promise<ProyectoDoc | null> {
    await conectar();
    const doc = await ProyectoModel.findOne({ id, usuarioId }).select('-adjuntos').lean().exec();
    if (!doc) return null;
    return this.limpiarProyecto(doc as Record<string, unknown>);
  }

  /**
   * Devuelve únicamente los adjuntos de un proyecto (solo si pertenece al
   * usuario) — ver el comentario de `obtenerProyecto` sobre por qué se
   * piden aparte.
   */
  async obtenerAdjuntosProyecto(id: string, usuarioId: string): Promise<unknown[]> {
    await conectar();
    const doc = await ProyectoModel.findOne({ id, usuarioId }).select('adjuntos').lean().exec();
    if (!doc) return [];
    return this.limpiarProyecto(doc as Record<string, unknown>).adjuntos as unknown[] ?? [];
  }

  /**
   * Borra un proyecto (solo si pertenece al usuario) — borra también sus
   * blobs (fotos/adjuntos) de almacenamiento externo. NO borra el
   * cliente ni sus otros proyectos, ni las Facturas/Notas/Presupuestos/
   * Contratos/Carpetas/Dibujos vinculados por `proyectoId` (quedan
   * huérfanos de proyecto pero no se pierden — fuera de alcance de este
   * incremento decidir su limpieza).
   * @param id Identificador del proyecto.
   * @param usuarioId Propietario de los datos.
   */
  async borrarProyecto(id: string, usuarioId: string): Promise<void> {
    await conectar();
    const doc = await ProyectoModel.findOne({ id, usuarioId }).lean().exec() as any;
    if (doc) {
      const todos = [...(doc.fotos ?? []), ...(doc.adjuntos ?? [])];
      for (const item of todos) {
        if (item.claveAlmacenamiento) await almacenamiento.borrar(item.claveAlmacenamiento).catch(() => {});
      }
    }
    await ProyectoModel.deleteOne({ id, usuarioId }).exec();
  }

  /** Igual que `limpiar()`, pero tipada para `ProyectoDoc` — misma lógica (quita `_id`/`__v`/`claveAlmacenamiento`), campos distintos. */
  private limpiarProyecto(doc: Record<string, unknown>): ProyectoDoc {
    return this.limpiar(doc) as unknown as ProyectoDoc;
  }

  /**
   * Devuelve la configuración de empresa del usuario.
   * @param usuarioId Propietario.
   */
  async obtenerEmpresa(usuarioId: string): Promise<EmpresaDoc> {
    await conectar();
    let doc = await EmpresaModel.findOne({ usuarioId }).lean().exec();
    if (!doc) {
      doc = (await EmpresaModel.create({ usuarioId })).toObject();
    }
    return {
      nombre: (doc as any).nombre || '',
      titular: (doc as any).titular || '',
      eslogan: (doc as any).eslogan || '',
      logo: (doc as any).logo || '',
      nifCif: (doc as any).nifCif || '',
      telefono: (doc as any).telefono || '',
      email: (doc as any).email || '',
      iban: (doc as any).iban || '',
      condicionesPagoDefecto: (doc as any).condicionesPagoDefecto || '',
      validezDiasDefecto: (doc as any).validezDiasDefecto || 30,
      temaPorDefecto: (doc as any).temaPorDefecto ?? null,
      regionFiscal: (doc as any).regionFiscal || '',
      comunidadAutonoma: (doc as any).comunidadAutonoma || '',
      provincia: (doc as any).provincia || '',
      isla: (doc as any).isla || '',
      repepActivo: !!(doc as any).repepActivo,
      logoTamano: (doc as any).logoTamano || 187,
      enlaceResenaGoogle: (doc as any).enlaceResenaGoogle || '',
      imagenResena: (doc as any).imagenResena || '',
      firmaEmpresa: (doc as any).firmaEmpresa || '',
      tiempoInactividadMin: (doc as any).tiempoInactividadMin ?? null,
      margenObjetivoPorcentaje: (doc as any).margenObjetivoPorcentaje ?? null,
    };
  }

  /**
   * Guarda la configuración de empresa del usuario.
   * @param empresa Los datos a guardar.
   * @param usuarioId Propietario.
   */
  async guardarEmpresa(empresa: Partial<EmpresaDoc>, usuarioId: string): Promise<EmpresaDoc> {
    await conectar();
    const doc = await EmpresaModel.findOneAndUpdate(
      { usuarioId },
      { ...empresa, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();
    return {
      nombre: (doc as any).nombre || '',
      titular: (doc as any).titular || '',
      eslogan: (doc as any).eslogan || '',
      logo: (doc as any).logo || '',
      nifCif: (doc as any).nifCif || '',
      telefono: (doc as any).telefono || '',
      email: (doc as any).email || '',
      iban: (doc as any).iban || '',
      condicionesPagoDefecto: (doc as any).condicionesPagoDefecto || '',
      validezDiasDefecto: (doc as any).validezDiasDefecto || 30,
      temaPorDefecto: (doc as any).temaPorDefecto ?? null,
      regionFiscal: (doc as any).regionFiscal || '',
      comunidadAutonoma: (doc as any).comunidadAutonoma || '',
      provincia: (doc as any).provincia || '',
      isla: (doc as any).isla || '',
      repepActivo: !!(doc as any).repepActivo,
      logoTamano: (doc as any).logoTamano || 187,
      enlaceResenaGoogle: (doc as any).enlaceResenaGoogle || '',
      imagenResena: (doc as any).imagenResena || '',
      firmaEmpresa: (doc as any).firmaEmpresa || '',
      tiempoInactividadMin: (doc as any).tiempoInactividadMin ?? null,
      margenObjetivoPorcentaje: (doc as any).margenObjetivoPorcentaje ?? null,
    };
  }

  /**
   * Devuelve una página de facturas del usuario, opcionalmente filtrada por
   * tipo — el filtro se aplica en la consulta, no en memoria (Incremento 1.5).
   * @param usuarioId Propietario.
   * @param opciones Página, tamaño de página y tipo (`'todas'` para no filtrar).
   */
  async listarFacturas(
    usuarioId: string,
    opciones: { pagina: number; limite: number; tipo: 'ingreso' | 'gasto' | 'todas' }
  ): Promise<{ items: Record<string, unknown>[]; total: number }> {
    await conectar();
    const filtro: Record<string, unknown> = { usuarioId };
    if (opciones.tipo !== 'todas') filtro.tipo = opciones.tipo;
    const salto = (opciones.pagina - 1) * opciones.limite;
    const [docs, total] = await Promise.all([
      FacturaModel.aggregate([
        { $match: filtro },
        { $sort: { creado: -1 } },
        { $skip: salto },
        { $limit: opciones.limite },
        ...this.pipelineTieneDocumentoFactura(),
      ]).exec(),
      FacturaModel.countDocuments(filtro).exec(),
    ]);
    const items = docs.map((d) => this.limpiar(d as Record<string, unknown>));
    return { items, total };
  }

  /**
   * Etapas de agregación que calculan `tieneDocumento` (si hay algún
   * documento adjunto, en cualquiera de sus formatos históricos) DENTRO de
   * MongoDB y excluyen `imagen`/`imagenes` (potencialmente muchos MB en
   * base64 por factura escaneada) antes de que salgan del servidor de
   * Atlas — antes se traían completos con `.find()` y se descartaban ya en
   * Node, lo que transferría decenas de MB por cada carga del listado sin
   * necesidad (causa real de cargas de más de 50s en `/facturas`,
   * confirmada con `duracionMs` en los logs de Render, 19/08/2026).
   */
  private pipelineTieneDocumentoFactura(): PipelineStage[] {
    return [
      {
        $addFields: {
          tieneDocumento: {
            $or: [
              { $gt: [{ $size: { $ifNull: ['$paginas', []] } }, 0] },
              { $gt: [{ $size: { $ifNull: ['$imagenes', []] } }, 0] },
              { $ne: [{ $ifNull: ['$imagen', ''] }, ''] },
              { $ne: [{ $ifNull: ['$pdfOriginalUrl', ''] }, ''] },
            ],
          },
        },
      },
      // Las claves privadas (Incremento "Facturas privadas", 27/08/2026)
      // tampoco deben salir en un listado — son un detalle interno de
      // almacenamiento que el frontend nunca necesita, y este listado ya
      // no lleva `imagen`/`imagenes` con los que podrían ir de la mano.
      { $project: { imagen: 0, imagenes: 0, imagenClave: 0, imagenesClaves: 0, pdfOriginalClave: 0, 'paginas.clave': 0 } },
    ];
  }

  /**
   * Devuelve todas las facturas de un año concreto, sin paginar — pensado
   * para el resumen trimestral (`Trimestres`), que necesita el año completo
   * para calcular bien los totales por trimestre. El volumen anual de
   * facturas de un negocio pequeño está acotado por diseño.
   * @param usuarioId Propietario.
   * @param anio Año a consultar.
   */
  async listarFacturasPorAnio(usuarioId: string, anio: number): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await FacturaModel.aggregate([
      { $match: { usuarioId, fecha: { $gte: `${anio}-01-01`, $lte: `${anio}-12-31` } } },
      { $sort: { creado: -1 } },
      ...this.pipelineTieneDocumentoFactura(),
    ]).exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  /**
   * Facturas de un único trimestre de un año, sin paginar — para navegar
   * las facturas "por carpetas" (T1-T4), pensado como complemento visual a
   * `Trimestres` (que calcula totales fiscales para el mismo período).
   * Mismo cálculo de rango de meses que ya usa `obtenerZipFacturas` para la
   * descarga filtrada por trimestre, para que ambas vistas coincidan.
   * @param usuarioId Propietario.
   * @param anio Año a consultar.
   * @param trimestre Trimestre (1-4).
   */
  async listarFacturasPorTrimestre(usuarioId: string, anio: number, trimestre: number): Promise<Record<string, unknown>[]> {
    await conectar();
    const mesInicio = (trimestre - 1) * 3 + 1;
    const mesFin = mesInicio + 2;
    const docs = await FacturaModel.aggregate([
      {
        $match: {
          usuarioId,
          fecha: { $gte: `${anio}-${String(mesInicio).padStart(2, '0')}-01`, $lte: `${anio}-${String(mesFin).padStart(2, '0')}-31` },
        },
      },
      { $sort: { creado: -1 } },
      ...this.pipelineTieneDocumentoFactura(),
    ]).exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  /**
   * Todas las facturas de un cliente concreto, sin paginar — para la ficha
   * de cliente, que necesita el historial completo de gastos de ese
   * proyecto, no solo los de la página actualmente cargada en la lista
   * general de facturas. El volumen de facturas de un único proyecto está
   * acotado por diseño.
   * @param usuarioId Propietario.
   * @param clienteId Cliente al que pertenecen las facturas.
   */
  async listarFacturasDeCliente(usuarioId: string, clienteId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await FacturaModel.aggregate([
      { $match: { usuarioId, clienteId } },
      { $sort: { creado: -1 } },
      ...this.pipelineTieneDocumentoFactura(),
    ]).exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  /**
   * Facturas de UN proyecto concreto (incremento "Cliente ≠ Proyecto",
   * 20/08/2026) — a diferencia de `listarFacturasDeCliente`, nunca mezcla
   * las facturas de otro proyecto del mismo cliente. Es lo que debe usar
   * la ficha de proyecto.
   * @param usuarioId Propietario.
   * @param proyectoId Proyecto al que pertenecen las facturas.
   */
  async listarFacturasDeProyecto(usuarioId: string, proyectoId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await FacturaModel.aggregate([
      { $match: { usuarioId, proyectoId } },
      { $sort: { creado: -1 } },
      ...this.pipelineTieneDocumentoFactura(),
    ]).exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  /**
   * Todas las facturas cuyo proveedor coincide (misma búsqueda difusa que
   * usaba el frontend: substring insensible a mayúsculas, o coincidencia
   * exacta) con el nombre indicado, sin paginar — para la ficha de un
   * proveedor concreto. El historial de un único proveedor está acotado.
   * @param usuarioId Propietario.
   * @param nombreProveedor Nombre del proveedor a buscar.
   */
  async listarFacturasDeProveedor(usuarioId: string, nombreProveedor: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const escapado = nombreProveedor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const docs = await FacturaModel.aggregate([
      { $match: { usuarioId, $or: [{ proveedor: { $regex: escapado, $options: 'i' } }, { proveedor: nombreProveedor }] } },
      { $sort: { creado: -1 } },
      ...this.pipelineTieneDocumentoFactura(),
    ]).exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  /**
   * Agrega, por texto exacto de proveedor tal como aparece en cada factura
   * de gasto, el total gastado y el número de facturas — pensado para el
   * listado de proveedores, que antes sumaba esto recorriendo todas las
   * facturas en memoria. El resultado es proporcional al número de
   * proveedores distintos mencionados en facturas, no al número de
   * facturas.
   * @param usuarioId Propietario.
   */
  async resumenPorProveedorTexto(usuarioId: string): Promise<{ proveedor: string; proveedorId: string; totalGastado: number; numFacturas: number }[]> {
    await conectar();
    // Agrupa por `proveedorId` cuando la factura ya tiene la relación real
    // (Fase Facturas Profesional); si no la tiene (facturas antiguas, o
    // proveedor sin vincular todavía), agrupa por el texto libre como antes
    // — así conviven ambos casos sin migrar datos ni duplicar el total.
    const filas = await FacturaModel.aggregate([
      { $match: { usuarioId, tipo: 'gasto', proveedor: { $nin: ['', null] } } },
      {
        $group: {
          _id: { $cond: [{ $and: [{ $ne: ['$proveedorId', null] }, { $ne: ['$proveedorId', ''] }] }, '$proveedorId', '$proveedor'] },
          proveedor: { $first: '$proveedor' },
          proveedorId: { $first: '$proveedorId' },
          totalGastado: { $sum: '$importe' },
          numFacturas: { $sum: 1 },
        },
      },
    ]).exec();
    return (filas as any[]).map((f) => ({ proveedor: f.proveedor, proveedorId: f.proveedorId || '', totalGastado: f.totalGastado, numFacturas: f.numFacturas }));
  }

  /**
   * Totales de ingresos/gastos/balance del usuario, calculados con un
   * `aggregate` de Mongo — nunca se traen las facturas al servidor solo para
   * sumarlas, así el total es correcto con independencia de cuántas páginas
   * existan (Incremento 1.5).
   * @param usuarioId Propietario.
   */
  async resumenFacturas(usuarioId: string): Promise<{
    totalIngresos: number; totalGastos: number; balance: number;
    numIngresos: number; numGastos: number; numFacturas: number;
  }> {
    await conectar();
    const filas = await FacturaModel.aggregate([
      { $match: { usuarioId } },
      { $group: { _id: '$tipo', total: { $sum: '$importe' }, num: { $sum: 1 } } },
    ]).exec();
    const ingresos = (filas as any[]).find((f) => f._id === 'ingreso');
    const gastos = (filas as any[]).find((f) => f._id === 'gasto');
    const totalIngresos = ingresos?.total ?? 0;
    const totalGastos = gastos?.total ?? 0;
    const numIngresos = ingresos?.num ?? 0;
    const numGastos = gastos?.num ?? 0;
    return { totalIngresos, totalGastos, balance: totalIngresos - totalGastos, numIngresos, numGastos, numFacturas: numIngresos + numGastos };
  }

  /**
   * Años para los que el usuario tiene alguna factura, más recientes
   * primero — alimenta el selector de año de `Trimestres` sin tener que
   * cargar ninguna factura completa para averiguarlo.
   * @param usuarioId Propietario.
   */
  async aniosConFacturas(usuarioId: string): Promise<number[]> {
    await conectar();
    const filas = await FacturaModel.aggregate([
      { $match: { usuarioId } },
      { $group: { _id: { $substrCP: ['$fecha', 0, 4] } } },
      { $sort: { _id: -1 } },
    ]).exec();
    return (filas as any[])
      .map((f) => Number(f._id))
      .filter((n) => !Number.isNaN(n));
  }

  /**
   * Obtiene una factura completa incluyendo la imagen.
   * @param id Identificador de la factura.
   * @param usuarioId Propietario.
   */
  async obtenerFactura(id: string, usuarioId: string): Promise<Record<string, unknown> | null> {
    await conectar();
    const doc = await FacturaModel.findOne({ id, usuarioId }).lean().exec();
    if (!doc) return null;
    return resolverUrlsFactura(this.limpiar(doc as Record<string, unknown>));
  }

  /**
   * Busca una factura ya guardada que probablemente sea la MISMA que se
   * está a punto de guardar — fallo humano real, no un caso raro: escanear
   * dos veces sin querer el mismo papel. Nunca bloquea el guardado (lo
   * decide el usuario), solo avisa antes.
   *
   * Tres niveles de evidencia, de más a menos fiable:
   * 1. Mismo `numeroFactura` + mismo `cifNif` — dos facturas reales del
   *    mismo emisor nunca comparten número, así que esto es casi seguro.
   * 2. Sin número legible: mismo `cifNif` + misma fecha + mismo importe.
   * 3. Sin ni siquiera NIF (documento antiguo/borroso): mismo `proveedor`
   *    (texto) + misma fecha + mismo importe — más débil, pero seguir sin
   *    comprobar nada aquí sería peor.
   * `excluirId` para no comparar una factura consigo misma al editarla.
   */
  async buscarFacturaDuplicada(
    params: { numeroFactura: string; cifNif: string; proveedor: string; fecha: string; importe: number; excluirId?: string },
    usuarioId: string
  ): Promise<Record<string, unknown> | null> {
    await conectar();
    const condiciones: Record<string, unknown>[] = [];
    if (params.numeroFactura && params.cifNif) {
      condiciones.push({ numeroFactura: params.numeroFactura, cifNif: params.cifNif });
    }
    if (params.cifNif && params.fecha && params.importe) {
      condiciones.push({ cifNif: params.cifNif, fecha: params.fecha, importe: params.importe });
    }
    if (params.proveedor && params.fecha && params.importe) {
      condiciones.push({ proveedor: params.proveedor, fecha: params.fecha, importe: params.importe });
    }
    // Indicio suficiente por sí solo para avisar (nunca bloquea — ver
    // `guardar()` en escaner-factura.tsx): misma fecha e importe exactos,
    // aunque no se haya rellenado proveedor ni CIF/NIF. Bug real
    // (27/08/2026): al re-escanear el mismo papel sin volver a pulsar
    // "Extraer datos con IA" la segunda vez, esos dos campos quedaban
    // vacíos y ninguna de las condiciones de arriba llegaba a compararse
    // — el aviso de duplicado no saltaba nunca en ese caso, aunque fuera
    // literalmente la misma factura.
    if (params.fecha && params.importe) {
      condiciones.push({ fecha: params.fecha, importe: params.importe });
    }
    if (condiciones.length) {
      const filtro: Record<string, unknown> = { usuarioId, $or: condiciones };
      if (params.excluirId) filtro.id = { $ne: params.excluirId };
      const doc = await FacturaModel.findOne(filtro).lean().exec();
      if (doc) return resolverUrlsFactura(this.limpiar(doc as Record<string, unknown>));
    }

    // Respaldo sin exigir la misma fecha — bug real (27/08/2026): la fecha
    // que lee la IA de un ticket no siempre sale igual entre dos lecturas
    // del mismo papel (conversión de formato DD-MM-AAAA a AAAA-MM-DD,
    // fecha ilegible, o simplemente no se ha vuelto a pulsar "Extraer
    // datos con IA" la segunda vez y ha quedado la fecha de hoy por
    // defecto) — exigirla de más dejaba pasar duplicados reales con el
    // mismo proveedor y el mismo importe, justo lo que más importa
    // detectar. El importe es el dato más fiable de un ticket (el número
    // grande y claro), así que basta con cruzarlo con el proveedor.
    if (params.proveedor && params.importe) {
      const filtroImporte: Record<string, unknown> = { usuarioId, importe: params.importe };
      if (params.excluirId) filtroImporte.id = { $ne: params.excluirId };
      const candidatas = await FacturaModel.find(filtroImporte).lean().exec();
      // Comparación tolerante, no solo mayúsculas/minúsculas — la IA no
      // siempre lee el nombre del proveedor igual de literal entre dos
      // fotos del mismo ticket (con o sin acentos, con o sin el resto del
      // rótulo — p. ej. "MONTÓ" una vez y "MONTÓ TIENDAS" la otra). Se
      // acepta si una es sub-cadena de la otra, igual que ya se hace con
      // los nombres en `identificacion-factura.ts` (frontend).
      const normalizar = (s: string) => s
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const proveedorNormalizado = normalizar(params.proveedor);
      const encontrada = proveedorNormalizado.length >= 3
        ? candidatas.find((f: any) => {
            const otro = normalizar(f.proveedor || '');
            return otro.length >= 3 && (otro === proveedorNormalizado || otro.includes(proveedorNormalizado) || proveedorNormalizado.includes(otro));
          })
        : undefined;
      if (encontrada) return resolverUrlsFactura(this.limpiar(encontrada as Record<string, unknown>));
    }

    return null;
  }

  /**
   * Resuelve a qué proyecto pertenece de verdad una factura, para la
   * sincronización de abajo (incremento "Cliente ≠ Proyecto", 20/08/2026):
   * - Si la factura ya trae `proyectoId` explícito, se usa tal cual.
   * - Si no, y el cliente tiene EXACTAMENTE un proyecto, se asume ese —
   *   mantiene el comportamiento de siempre para el caso normal (un
   *   cliente, un proyecto), sin exigir tocar todavía las pantallas de
   *   facturas/escáner para elegir proyecto explícitamente.
   * - Si el cliente tiene 0 o 2+ proyectos, NUNCA se adivina — la factura
   *   simplemente no se sincroniza con ningún "Control de gasto" hasta que
   *   se le asigne un proyecto explícito. Adivinar aquí sería exactamente
   *   el fallo de mezcla de datos que motivó este incremento.
   */
  private async resolverProyectoDeFactura(clienteId: string, proyectoIdExplicito: string, usuarioId: string): Promise<string> {
    if (proyectoIdExplicito) return proyectoIdExplicito;
    if (!clienteId) return '';
    const proyectos = await ProyectoModel.find({ clienteId, usuarioId }).select('id').limit(2).lean().exec();
    return proyectos.length === 1 ? (proyectos[0] as any).id : '';
  }

  /**
   * Sincroniza el Movimiento del proyecto ligado a una factura (Fase 2 —
   * antes Factura y Cliente.movimientos estaban completamente
   * desconectados, así que el margen de ganancia no reflejaba facturas ya
   * escaneadas; desde el incremento "Cliente ≠ Proyecto" sincroniza contra
   * el PROYECTO, nunca contra el cliente, para no mezclar los gastos de
   * dos proyectos distintos del mismo cliente). El movimiento se localiza
   * por `facturaId`, nunca por posición ni recreando el array — eso es lo
   * que hace la operación idempotente: reguardar la misma factura
   * actualiza el mismo movimiento, nunca duplica. La actualización es una
   * única operación atómica por documento (pipeline update de Mongo), sin
   * ventana de carrera entre "comprobar si existe" y "crear".
   *
   * No lanza si el proyecto ya no existe/no se pudo resolver — se registra
   * y se continúa, igual que en `ejecutarConsecuenciasAceptacion`; la
   * factura nunca debe dejar de guardarse por un fallo en esta
   * sincronización derivada.
   */
  private async sincronizarMovimientoFactura(params: {
    usuarioId: string;
    facturaId: string;
    /** Proyecto al que estaba vinculada la factura antes de este guardado ('' si no tenía o es nueva). */
    proyectoIdAnterior: string;
    /** Proyecto al que queda vinculada tras este guardado ('' si no se pudo resolver ninguno). */
    proyectoIdNuevo: string;
    fecha: string;
    concepto: string;
    categoria: string;
    tipo: 'gasto' | 'ingreso';
    importe: number;
  }): Promise<void> {
    const { usuarioId, facturaId, proyectoIdAnterior, proyectoIdNuevo, fecha, concepto, categoria, tipo, importe } = params;
    if (!facturaId) return; // Nunca vincular/retirar por un facturaId vacío — coincidiría con movimientos manuales (que lo tienen '' por defecto).
    try {
      // El proyecto cambió (o se quitó) respecto al guardado anterior:
      // retirar el movimiento del proyecto que ya no corresponde.
      if (proyectoIdAnterior && proyectoIdAnterior !== proyectoIdNuevo) {
        await ProyectoModel.updateOne(
          { id: proyectoIdAnterior, usuarioId },
          { $pull: { movimientos: { facturaId } } }
        ).exec();
      }

      if (!proyectoIdNuevo) return;

      const resultado = await ProyectoModel.updateOne(
        { id: proyectoIdNuevo, usuarioId },
        [
          {
            $set: {
              movimientos: {
                $cond: [
                  { $in: [facturaId, { $ifNull: [{ $map: { input: '$movimientos', as: 'm', in: '$$m.facturaId' } }, []] }] },
                  {
                    $map: {
                      input: '$movimientos',
                      as: 'm',
                      in: {
                        $cond: [
                          { $eq: ['$$m.facturaId', facturaId] },
                          { $mergeObjects: ['$$m', { fecha, concepto, categoria, tipo, importe }] },
                          '$$m',
                        ],
                      },
                    },
                  },
                  {
                    $concatArrays: [
                      { $ifNull: ['$movimientos', []] },
                      [{ id: randomUUID(), facturaId, fecha, concepto, categoria, tipo, importe }],
                    ],
                  },
                ],
              },
            },
          },
        ],
        { updatePipeline: true }
      ).exec();

      if (resultado.matchedCount === 0) {
        logger.warn({ facturaId, proyectoId: proyectoIdNuevo, usuarioId }, '[factura.sincronizarMovimiento] El proyecto de la factura ya no existe — se omite la sincronización.');
      }
    } catch (err) {
      logger.error({ err, facturaId, proyectoIdAnterior, proyectoIdNuevo, usuarioId }, '[factura.sincronizarMovimiento] Fallo sincronizando el movimiento — la factura se guarda igualmente.');
    }
  }

  /**
   * Crea o actualiza una factura del usuario.
   * @param factura Datos de la factura.
   * @param usuarioId Propietario.
   */
  async guardarFactura(factura: Record<string, unknown>, usuarioId: string): Promise<Record<string, unknown>> {
    await conectar();
    const anterior = await FacturaModel.findOne({ id: factura.id, usuarioId }).lean().exec() as any;

    // Igual que en guardarCliente: sube a almacenamiento externo cualquier
    // imagen nueva (Base64); las que ya eran una URL no se tocan
    // (Incremento 1.7). Desde el Incremento "Facturas privadas"
    // (27/08/2026) las facturas nuevas suben al bucket privado de facturas
    // (si está configurado — ver `almacenamiento-r2.ts`), así que `subir()`
    // ya no devuelve una URL pública real (`resultado.url === ''`) — se
    // guarda también `resultado.clave`, la referencia real del archivo, en
    // el campo `*Clave` correspondiente. Para facturas antiguas sin clave
    // propia, se sigue pudiendo derivar de la URL con `claveDesdeUrl()`
    // (compatibilidad, ver más abajo).
    // Bug real, 29/08/2026: `resolverUrlsFactura` (más arriba) quita los
    // campos `*Clave` de toda factura antes de enviarla al frontend (nunca
    // debe ver ni reenviar la referencia interna de almacenamiento) — así
    // que en CUALQUIER reguardado (editar importe, categoría, fecha...) el
    // objeto que llega aquí en `factura` nunca trae su propio `imagenClave`/
    // `imagenesClaves`/`pdfOriginalClave`/`paginas[].clave`, aunque el
    // archivo siga siendo el mismo. Si esas claves solo se tomaran de
    // `factura` (como antes), CADA reguardado real desde el frontend las
    // borraría a `''`/`undefined` — la factura se queda sin forma fiable de
    // servir su propio archivo (justo el fallo que impedía comprobar en
    // producción el arreglo de las URLs firmadas de R2). Por eso, cuando no
    // hay subida nueva, se cae primero en la clave que trajera `factura`
    // (permite a llamadas internas/tests fijarla explícitamente), luego en
    // la que ya tenía el documento en Mongo (`anterior`) y, como último
    // recurso, se intenta derivar de la URL firmada que quedó guardada en
    // `anterior.imagen` — repara de forma permanente, en el primer
    // reguardado, cualquier factura que ya se hubiera visto afectada por
    // este bug antes de corregirlo.
    const resultadoImagen = await subirSiEsBase64((factura as any).imagen, 'facturas');
    const imagen = resultadoImagen ? resultadoImagen.url : (factura as any).imagen;
    const imagenClave = resultadoImagen
      ? resultadoImagen.clave
      : ((factura as any).imagenClave || anterior?.imagenClave || (anterior?.imagen ? almacenamiento.claveDesdeUrlPrivada(anterior.imagen) : null) || '');

    const imagenesOriginal = (factura as any).imagenes;
    const imagenesSubidas = Array.isArray(imagenesOriginal)
      ? await Promise.all(imagenesOriginal.map((img: string) => subirSiEsBase64(img, 'facturas')))
      : null;
    const imagenes = imagenesSubidas
      ? imagenesSubidas.map((r, i) => (r ? r.url : imagenesOriginal[i]))
      : imagenesOriginal;
    const imagenesClaves = imagenesSubidas
      ? imagenesSubidas.map((r, i) => (r ? r.clave : (factura as any).imagenesClaves?.[i] || anterior?.imagenesClaves?.[i] || ''))
      : ((factura as any).imagenesClaves ?? anterior?.imagenesClaves);

    // Igual tratamiento para el PDF original (si la factura se subió
    // directamente como PDF) y para `paginas` (el documento completo en
    // orden, mezclando imagen/PDF) — ambos campos nuevos de la Fase
    // Facturas Profesional, mismo patrón que `imagen`/`imagenes`.
    const resultadoPdfOriginal = await subirSiEsBase64((factura as any).pdfOriginalUrl, 'facturas');
    const pdfOriginalUrl = resultadoPdfOriginal ? resultadoPdfOriginal.url : (factura as any).pdfOriginalUrl;
    const pdfOriginalClave = resultadoPdfOriginal
      ? resultadoPdfOriginal.clave
      : ((factura as any).pdfOriginalClave || anterior?.pdfOriginalClave || (anterior?.pdfOriginalUrl ? almacenamiento.claveDesdeUrlPrivada(anterior.pdfOriginalUrl) : null) || '');

    const paginasOriginal = (factura as any).paginas;
    const paginas = Array.isArray(paginasOriginal)
      ? await Promise.all(paginasOriginal.map(async (p: { tipo: string; url: string; clave?: string }, i: number) => {
          const r = await subirSiEsBase64(p.url, 'facturas');
          return r ? { ...p, url: r.url, clave: r.clave } : { ...p, clave: p.clave || anterior?.paginas?.[i]?.clave || '' };
        }))
      : paginasOriginal;

    // Una factura de GASTO nunca puede llevar el propio CIF/NIF del usuario
    // como dato fiscal — es del proveedor (quien la emite), no del
    // destinatario. Muchas facturas muestran ambos NIF impresos, y tanto la
    // IA del escáner como un despiste al escribir a mano pueden confundirlos.
    // Se comprueba aquí (al guardar), no solo en la propuesta de la IA, para
    // que la protección cubra cualquier origen del dato, presente o futuro.
    let cifNif = (factura as any).cifNif;
    if ((factura as any).tipo === 'gasto' && cifNif) {
      const empresa = await EmpresaModel.findOne({ usuarioId }).lean().exec() as any;
      const nifPropio = (empresa?.nifCif || '').trim().toUpperCase();
      if (nifPropio && String(cifNif).trim().toUpperCase() === nifPropio) {
        cifNif = '';
      }
    }

    const doc = await FacturaModel.findOneAndUpdate(
      { id: factura.id, usuarioId },
      { ...factura, imagen, imagenClave, imagenes, imagenesClaves, pdfOriginalUrl, pdfOriginalClave, paginas, cifNif, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();

    if (anterior) {
      // Prefiere la clave propia del campo (facturas nuevas, bucket
      // privado); si no la tiene (facturas de antes de este incremento),
      // cae en derivarla de la URL pública de siempre — mismo mecanismo
      // que ya existía, ahora solo como respaldo. Cada borrado pasa por
      // `intentarBorrarArchivo`, que registra el fallo en vez de
      // descartarlo en silencio (Incremento "Facturas privadas", 27/08/2026).
      const claveDe = (url: string | undefined, clave: string | undefined): string | null =>
        clave || (url ? almacenamiento.claveDesdeUrl(url) : null);

      const claveAnteriorImagen = claveDe(anterior.imagen, anterior.imagenClave);
      const claveNuevaImagen = claveDe(imagen, imagenClave);
      if (claveAnteriorImagen && claveAnteriorImagen !== claveNuevaImagen) {
        await intentarBorrarArchivo(claveAnteriorImagen);
      }

      const claveAnteriorPdf = claveDe(anterior.pdfOriginalUrl, anterior.pdfOriginalClave);
      const claveNuevaPdf = claveDe(pdfOriginalUrl, pdfOriginalClave);
      if (claveAnteriorPdf && claveAnteriorPdf !== claveNuevaPdf) {
        await intentarBorrarArchivo(claveAnteriorPdf);
      }

      const clavesImagenesNuevas = new Set(
        (anterior.imagenes ?? []).length
          ? (imagenes ?? []).map((url: string, i: number) => claveDe(url, imagenesClaves?.[i])).filter(Boolean)
          : []
      );
      for (let i = 0; i < (anterior.imagenes ?? []).length; i++) {
        const claveVieja = claveDe(anterior.imagenes[i], anterior.imagenesClaves?.[i]);
        if (claveVieja && !clavesImagenesNuevas.has(claveVieja)) await intentarBorrarArchivo(claveVieja);
      }

      const clavesPaginasNuevas = new Set(
        (paginas ?? []).map((p: { url: string; clave?: string }) => claveDe(p.url, p.clave)).filter(Boolean)
      );
      for (const p of anterior.paginas ?? []) {
        const claveVieja = claveDe(p.url, p.clave);
        if (claveVieja && !clavesPaginasNuevas.has(claveVieja)) await intentarBorrarArchivo(claveVieja);
      }
    }

    busEventos.publicar({
      nombre: 'factura.guardada',
      usuarioId,
      entidadId: String(factura.id),
      datos: { tipo: (factura as any).tipo, importe: (factura as any).importe, clienteId: (factura as any).clienteId },
    });

    // Mantiene Proyecto.movimientos (y por tanto el margen de ganancia, que
    // se calcula a partir de él) en sincronía con la factura, sin duplicar
    // la fórmula de margen existente. Nunca contra Cliente.movimientos
    // (incremento "Cliente ≠ Proyecto", 20/08/2026) — mezclaría los gastos
    // de dos proyectos distintos del mismo cliente.
    const proyectoIdAnterior = await this.resolverProyectoDeFactura((anterior?.clienteId as string) || '', (anterior?.proyectoId as string) || '', usuarioId);
    const proyectoIdNuevo = await this.resolverProyectoDeFactura(((doc as any).clienteId as string) || '', ((doc as any).proyectoId as string) || '', usuarioId);
    await this.sincronizarMovimientoFactura({
      usuarioId,
      facturaId: String(factura.id),
      proyectoIdAnterior,
      proyectoIdNuevo,
      fecha: (doc as any).fecha,
      concepto: (doc as any).concepto || (doc as any).proveedor || 'Factura',
      categoria: (doc as any).categoria || 'General',
      tipo: (doc as any).tipo,
      importe: (doc as any).importe,
    });

    // Si `proyectoId` se auto-resolvió (la factura no lo traía explícito
    // pero el cliente solo tenía un proyecto), se deja escrito en la propia
    // factura — si no, `listarFacturasDeProyecto` (la pestaña "Facturas" de
    // la ficha de proyecto) nunca la encontraría, aunque el movimiento sí
    // se hubiera sincronizado correctamente.
    if (proyectoIdNuevo && !(doc as any).proyectoId) {
      await FacturaModel.updateOne({ id: factura.id, usuarioId }, { $set: { proyectoId: proyectoIdNuevo } }).exec();
      (doc as any).proyectoId = proyectoIdNuevo;
    }

    return resolverUrlsFactura(this.limpiar(doc as Record<string, unknown>));
  }

  /**
   * Borra una factura del usuario.
   * @param id Identificador de la factura.
   * @param usuarioId Propietario.
   */
  async borrarFactura(id: string, usuarioId: string): Promise<void> {
    await conectar();
    const doc = await FacturaModel.findOne({ id, usuarioId }).lean().exec() as any;
    if (doc) {
      // Prefiere la clave propia de cada campo (facturas nuevas, bucket
      // privado); si no la tiene, la deriva de la URL pública (facturas de
      // antes del Incremento "Facturas privadas") — mismo respaldo que en
      // `guardarFactura()`. Cada borrado pasa por `intentarBorrarArchivo`:
      // un fallo queda registrado para reintento, nunca se pierde en silencio.
      const claves = [
        doc.imagenClave || (doc.imagen ? almacenamiento.claveDesdeUrl(doc.imagen) : null),
        doc.pdfOriginalClave || (doc.pdfOriginalUrl ? almacenamiento.claveDesdeUrl(doc.pdfOriginalUrl) : null),
        ...(doc.imagenes ?? []).map((url: string, i: number) => doc.imagenesClaves?.[i] || (url ? almacenamiento.claveDesdeUrl(url) : null)),
        ...((doc.paginas ?? []) as { url: string; clave?: string }[]).map((p) => p.clave || (p.url ? almacenamiento.claveDesdeUrl(p.url) : null)),
      ].filter((c): c is string => Boolean(c));
      for (const clave of claves) {
        await intentarBorrarArchivo(clave);
      }
      // Evita un movimiento huérfano que siguiera afectando al margen de
      // ganancia de un proyecto tras borrar la factura de origen.
      const proyectoId = await this.resolverProyectoDeFactura(doc.clienteId || '', doc.proyectoId || '', usuarioId);
      if (proyectoId && id) {
        await ProyectoModel.updateOne(
          { id: proyectoId, usuarioId },
          { $pull: { movimientos: { facturaId: id } } }
        ).exec().catch((err) => logger.error({ err, facturaId: id, proyectoId, usuarioId }, '[factura.borrar] No se pudo retirar el movimiento vinculado — la factura se borra igualmente.'));
      }
    }
    await FacturaModel.deleteOne({ id, usuarioId }).exec();
  }

  /** PDF real de una factura (descarga individual, Fase Facturas Profesional). */
  async obtenerPdfFactura(id: string, usuarioId: string): Promise<{ bytes: Uint8Array; nombreArchivo: string } | null> {
    const factura = await this.obtenerFactura(id, usuarioId);
    if (!factura) return null;
    const { generarPdfFactura, nombreArchivoFactura } = await import('./documentos-factura.service.js');
    let bytes: Uint8Array;
    try {
      bytes = await generarPdfFactura(factura);
    } catch (err) {
      // "Sin documento adjunto" es un estado esperado (factura creada a
      // mano, sin foto/PDF) — 400, no un 500 de servidor.
      throw new ErrorDeNegocio(err instanceof Error ? err.message : 'No se pudo generar el PDF de esta factura.');
    }
    return { bytes, nombreArchivo: nombreArchivoFactura(factura) };
  }

  /**
   * ZIP con el PDF de varias facturas — por ids concretos (descarga
   * múltiple con selección) o por filtro de año/trimestre/tipo (descargar
   * todas). Si se pasan `ids`, tienen prioridad sobre el filtro.
   */
  async obtenerZipFacturas(
    usuarioId: string,
    opciones: { ids?: string[]; anio?: number; trimestre?: number; tipo?: 'ingreso' | 'gasto' }
  ): Promise<Uint8Array> {
    await conectar();
    let idsAUsar: string[];
    if (opciones.ids?.length) {
      idsAUsar = opciones.ids;
    } else {
      const filtro: Record<string, unknown> = { usuarioId };
      if (opciones.tipo) filtro.tipo = opciones.tipo;
      if (opciones.anio) {
        if (opciones.trimestre) {
          const mesInicio = (opciones.trimestre - 1) * 3 + 1;
          const mesFin = mesInicio + 2;
          filtro.fecha = { $gte: `${opciones.anio}-${String(mesInicio).padStart(2, '0')}-01`, $lte: `${opciones.anio}-${String(mesFin).padStart(2, '0')}-31` };
        } else {
          filtro.fecha = { $gte: `${opciones.anio}-01-01`, $lte: `${opciones.anio}-12-31` };
        }
      }
      const docs = await FacturaModel.find(filtro).select('id').lean().exec();
      idsAUsar = (docs as any[]).map((d) => d.id);
    }
    const facturas = (await Promise.all(idsAUsar.map((id) => this.obtenerFactura(id, usuarioId)))).filter(Boolean) as Record<string, unknown>[];
    const { generarZipFacturas } = await import('./documentos-factura.service.js');
    return generarZipFacturas(facturas);
  }

  /**
   * Un único PDF con las páginas de todas las facturas de un año/trimestre
   * (y tipo opcional) — "solo y exclusivamente las facturas", sin resumen
   * ni ZIP (petición real, 25/08/2026, para mandar de un vistazo al
   * asesor). Mismo cálculo de filtro por fecha que `obtenerZipFacturas`,
   * para que ambas descargas coincidan en qué facturas incluyen.
   */
  async obtenerPdfCombinadoFacturas(
    usuarioId: string,
    opciones: { anio: number; trimestre?: number; tipo?: 'ingreso' | 'gasto' }
  ): Promise<Uint8Array> {
    await conectar();
    const filtro: Record<string, unknown> = { usuarioId };
    if (opciones.tipo) filtro.tipo = opciones.tipo;
    if (opciones.trimestre) {
      const mesInicio = (opciones.trimestre - 1) * 3 + 1;
      const mesFin = mesInicio + 2;
      filtro.fecha = { $gte: `${opciones.anio}-${String(mesInicio).padStart(2, '0')}-01`, $lte: `${opciones.anio}-${String(mesFin).padStart(2, '0')}-31` };
    } else {
      filtro.fecha = { $gte: `${opciones.anio}-01-01`, $lte: `${opciones.anio}-12-31` };
    }
    const docs = await FacturaModel.find(filtro).lean().exec();
    // `resolverUrlsFactura` es imprescindible aquí, no cosmético:
    // `generarPdfCombinadoFacturas` descarga cada imagen con `fetch(url)`
    // para incrustarla en el PDF — sin resolver, una factura del bucket
    // privado nuevo llegaría con la URL en blanco (o una URL sin firmar,
    // que R2 respondería con 403).
    const facturas = await Promise.all(docs.map((d) => resolverUrlsFactura(this.limpiar(d as Record<string, unknown>))));
    const { generarPdfCombinadoFacturas } = await import('./documentos-factura.service.js');
    try {
      return await generarPdfCombinadoFacturas(facturas);
    } catch (err) {
      throw new ErrorDeNegocio(err instanceof Error ? err.message : 'No se pudo generar el PDF de facturas.');
    }
  }

  /**
   * Documentación completa para el asesor de un trimestre: RESUMEN.pdf
   * (empresa, período, totales, listados) + carpetas Ingresos/Gastos con el
   * PDF de cada factura, todo en un único ZIP.
   */
  async obtenerDocumentacionAsesor(usuarioId: string, anio: number, trimestre: number): Promise<Uint8Array> {
    await conectar();
    const mesInicio = (trimestre - 1) * 3 + 1;
    const mesFin = mesInicio + 2;
    const filtro = { usuarioId, fecha: { $gte: `${anio}-${String(mesInicio).padStart(2, '0')}-01`, $lte: `${anio}-${String(mesFin).padStart(2, '0')}-31` } };
    const docs = await FacturaModel.find(filtro).lean().exec();
    // Mismo motivo que en `obtenerPdfCombinadoFacturas`: el PDF de cada
    // factura se genera descargando su imagen por URL.
    const facturas = await Promise.all(docs.map((d) => resolverUrlsFactura(this.limpiar(d as Record<string, unknown>))));

    const [empresa, gastosPeriodicos] = await Promise.all([
      EmpresaModel.findOne({ usuarioId }).lean().exec() as Promise<any>,
      GastoPeriodicoModel.find({ usuarioId, activo: true }).lean().exec() as Promise<any[]>,
    ]);

    const ingresos = facturas.filter((f) => f.tipo === 'ingreso');
    const gastos = facturas.filter((f) => f.tipo === 'gasto');
    const NOMBRES_TRIMESTRE = ['1.er', '2.º', '3.er', '4.º'];
    const periodoLabel = `${NOMBRES_TRIMESTRE[trimestre - 1]} trimestre ${anio}`;

    // Mismo criterio que `Trimestres` (trimestres.tsx): un vehículo marcado
    // como `afectacionExclusiva: false` no es deducible en IRPF, se excluye
    // del documento del asesor sin borrar ni ocultar el gasto periódico en sí.
    const gastosPeriodicosDelTrimestre = (gastosPeriodicos ?? []).filter(esGastoPeriodicoDeducible).map((g) => ({
      descripcion: g.descripcion, tipo: g.tipo,
      importe: g.periodicidad === 'mensual' ? g.importe * 3 : g.importe,
    }));

    const avisoFiscal = [
      'Documento generado automáticamente por Madera Creativa a partir de los datos introducidos por el usuario.',
      'Los importes de IRPF/IGIC/IVA son una estimación orientativa (fórmula oficial aplicada a estos datos), no una liquidación definitiva.',
      'Los gastos periódicos/estimados reflejan los valores introducidos por el usuario, que declara haberlos confirmado con su asesor.',
      'Requiere revisión y confirmación de un asesor fiscal antes de presentar cualquier modelo ante la Agencia Tributaria.',
    ];

    const { generarResumenPdf, generarZipFacturas } = await import('./documentos-factura.service.js');
    const resumenBytes = await generarResumenPdf({
      empresaNombre: empresa?.nombre || 'Empresa',
      periodoLabel,
      ingresos, gastos, gastosPeriodicos: gastosPeriodicosDelTrimestre, avisoFiscal,
    });
    return generarZipFacturas(facturas, {
      agruparPorTipo: true,
      archivoExtra: { nombre: `RESUMEN_${periodoLabel.replace(/\s+/g, '_')}.pdf`, datos: resumenBytes },
    });
  }

  // ── Gastos periódicos/estimados (Fase Facturas Profesional) ──

  /** Lista los gastos periódicos activos del usuario — el Trimestral solo prorratea los `activo: true`. */
  async listarGastosPeriodicos(usuarioId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await GastoPeriodicoModel.find({ usuarioId }).sort({ creado: -1 }).lean().exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  async guardarGastoPeriodico(gasto: Record<string, unknown>, usuarioId: string): Promise<Record<string, unknown>> {
    await conectar();
    const ahora = new Date().toISOString();
    const doc = await GastoPeriodicoModel.findOneAndUpdate(
      { id: gasto.id, usuarioId },
      { ...gasto, usuarioId, creado: (gasto as any).creado ?? ahora },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();
    return this.limpiar(doc as Record<string, unknown>);
  }

  async borrarGastoPeriodico(id: string, usuarioId: string): Promise<void> {
    await conectar();
    await GastoPeriodicoModel.deleteOne({ id, usuarioId }).exec();
  }

  // ── Proveedores — aislados por usuarioId (Fase "Integración completa") ──

  /**
   * Lista todos los proveedores del usuario, sin paginar — el volumen de
   * proveedores de un negocio pequeño está muy lejos de necesitarla.
   * @param usuarioId Propietario.
   */
  async listarProveedores(usuarioId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await ProveedorModel.find({ usuarioId }).sort({ creado: -1 }).lean().exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  /**
   * Crea o actualiza un proveedor.
   * @param proveedor Datos del proveedor.
   * @param usuarioId Propietario.
   */
  async guardarProveedor(proveedor: Record<string, unknown>, usuarioId: string): Promise<Record<string, unknown>> {
    await conectar();
    const doc = await ProveedorModel.findOneAndUpdate(
      { id: proveedor.id, usuarioId },
      { ...proveedor, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();
    busEventos.publicar({
      nombre: 'proveedor.actualizado',
      usuarioId,
      entidadId: String(proveedor.id),
      datos: { nombre: (proveedor as any).nombre },
    });
    return this.limpiar(doc as Record<string, unknown>);
  }

  /**
   * Borra un proveedor y, en cascada, los productos de su catálogo que lo
   * referencian — mismo comportamiento que ya tenía la versión en
   * `localStorage` (`borrarProveedor` también filtraba productos huérfanos).
   * @param id Identificador del proveedor.
   * @param usuarioId Propietario.
   */
  async borrarProveedor(id: string, usuarioId: string): Promise<void> {
    await conectar();
    await ProveedorModel.deleteOne({ id, usuarioId }).exec();
    await ProductoModel.deleteMany({ proveedorId: id, usuarioId }).exec();
  }

  // ── Notas — aislados por usuarioId (rediseño del módulo de Notas) ──

  /**
   * Lista las notas del usuario, sin paginar — mismo criterio que
   * Proveedores/Productos: el volumen esperado no lo justifica todavía.
   * @param usuarioId Propietario.
   */
  async listarNotas(usuarioId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await NotaModel.find({ usuarioId }).sort({ creado: -1 }).lean().exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  /**
   * Crea o actualiza una nota.
   * @param nota Datos de la nota.
   * @param usuarioId Propietario.
   */
  async guardarNota(nota: Record<string, unknown>, usuarioId: string): Promise<Record<string, unknown>> {
    await conectar();
    const doc = await NotaModel.findOneAndUpdate(
      { id: nota.id, usuarioId },
      { ...nota, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();
    busEventos.publicar({
      nombre: 'nota.creada',
      usuarioId,
      entidadId: String(nota.id),
      datos: { titulo: (nota as any).titulo, clienteId: (nota as any).clienteId },
    });
    return this.limpiar(doc as Record<string, unknown>);
  }

  /**
   * Borra una nota.
   * @param id Identificador de la nota.
   * @param usuarioId Propietario.
   */
  async borrarNota(id: string, usuarioId: string): Promise<void> {
    await conectar();
    await NotaModel.deleteOne({ id, usuarioId }).exec();
  }

  // ── Referencias de Mercado (Fase 2F, "Consenso de Precio", 29/08/2026) ──────
  // Anotaciones MANUALES del propio usuario sobre su mercado local — nunca
  // scraping, nunca IA. Aisladas por `usuarioId` como cualquier otro dato
  // interno (autorización, condición 8): lo que un usuario anota sobre su
  // zona nunca es visible ni usable por otra empresa.

  /** Lista las referencias de mercado del usuario, sin paginar (mismo criterio que Notas/Proveedores: el volumen esperado no lo justifica). */
  async listarReferenciasMercado(usuarioId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await ReferenciaMercadoModel.find({ usuarioId }).sort({ creado: -1 }).lean().exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  /** Crea una referencia de mercado. No admite edición — se borra y se vuelve a crear, mismo criterio de simplicidad que otras entidades pequeñas de solo-anotación. */
  async crearReferenciaMercado(referencia: Record<string, unknown>, usuarioId: string): Promise<Record<string, unknown>> {
    await conectar();
    const doc = await ReferenciaMercadoModel.create({ ...referencia, usuarioId });
    return this.limpiar(doc.toObject() as Record<string, unknown>);
  }

  /** Borra una referencia de mercado. */
  async borrarReferenciaMercado(id: string, usuarioId: string): Promise<void> {
    await conectar();
    await ReferenciaMercadoModel.deleteOne({ id, usuarioId }).exec();
  }

  // ── Códigos QR (sección propia del menú, 19/08/2026) ────────────────────────

  /** Lista los códigos QR guardados, más recientes primero. */
  async listarCodigosQR(usuarioId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await CodigoQRModel.find({ usuarioId }).sort({ creado: -1 }).lean().exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  /** Crea o actualiza un código QR guardado (nombre + url de la imagen ya subida a la biblioteca de recursos). */
  async guardarCodigoQR(codigoQR: Record<string, unknown>, usuarioId: string): Promise<Record<string, unknown>> {
    await conectar();
    const doc = await CodigoQRModel.findOneAndUpdate(
      { id: codigoQR.id, usuarioId },
      { ...codigoQR, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();
    return this.limpiar(doc as Record<string, unknown>);
  }

  /** Borra un código QR guardado — no borra la imagen de la biblioteca de recursos (mismo criterio que `borrarComponente`: puede seguir referenciada en otro sitio). */
  async borrarCodigoQR(id: string, usuarioId: string): Promise<void> {
    await conectar();
    await CodigoQRModel.deleteOne({ id, usuarioId }).exec();
  }

  // ── Presupuestos (Fase 5 — copiloto de Presupuestos) — aislados por usuarioId ──

  /**
   * Lista los presupuestos de un cliente concreto, más recientes primero —
   * mismo criterio que `listarFacturasDeCliente`: el historial de un único
   * cliente está acotado por diseño.
   * @param usuarioId Propietario.
   * @param clienteId Cliente al que pertenecen los presupuestos.
   */
  async listarPresupuestosDeCliente(usuarioId: string, clienteId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const [docs, enlacesActivos] = await Promise.all([
      PresupuestoModel.find({ usuarioId, clienteId }).sort({ creado: -1 }).lean().exec(),
      enlacesActivosDeUsuario(usuarioId),
    ]);
    return docs.map((d) => ({ ...this.limpiar(d as Record<string, unknown>), enlaceActivoExpiraEn: enlacesActivos[(d as any).id] ?? null }));
  }

  /**
   * Presupuestos de UN proyecto concreto (incremento "Cliente ≠ Proyecto",
   * 20/08/2026) — a diferencia de `listarPresupuestosDeCliente`, nunca
   * mezcla los presupuestos de otro proyecto del mismo cliente. Es lo que
   * usa la ficha de proyecto; `listarPresupuestosDeCliente` queda para
   * quien de verdad necesite ver todos los presupuestos de un cliente a
   * través de sus proyectos.
   */
  async listarPresupuestosDeProyecto(usuarioId: string, proyectoId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const [docs, enlacesActivos] = await Promise.all([
      PresupuestoModel.find({ usuarioId, proyectoId }).sort({ creado: -1 }).lean().exec(),
      enlacesActivosDeUsuario(usuarioId),
    ]);
    return docs.map((d) => ({ ...this.limpiar(d as Record<string, unknown>), enlaceActivoExpiraEn: enlacesActivos[(d as any).id] ?? null }));
  }

  /**
   * Lista todos los presupuestos del usuario, de cualquier cliente,
   * ordenados por fecha de creación descendente (Fase 6 — sección global
   * "Presupuestos › Documentos"). Excluye `contenidoLienzo` explícitamente
   * (puede llevar varias fotos y varias hojas) — mismo criterio que
   * `listarClientesResumen`: la vista de lista no necesita el contenido
   * completo del lienzo, solo abrir el editor lo carga.
   * @param usuarioId Propietario.
   */
  async listarPresupuestos(usuarioId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const [docs, enlacesActivos] = await Promise.all([
      PresupuestoModel.find({ usuarioId }).select('-contenidoLienzo').sort({ creado: -1 }).lean().exec(),
      enlacesActivosDeUsuario(usuarioId),
    ]);
    // `enlaceActivoExpiraEn` (nunca el token, que no se guarda en claro) —
    // la lista lo usa para avisar antes de generar un enlace nuevo que
    // revocaría uno ya enviado a un cliente real (ver `enlacesActivosDeUsuario`).
    return docs.map((d) => ({
      ...this.limpiar(d as Record<string, unknown>),
      enlaceActivoExpiraEn: enlacesActivos[(d as any).id] ?? null,
    }));
  }

  /**
   * Inteligencia de Precios (Fase 1, ajuste 28/08/2026) — detección
   * automática de presupuestos aceptados con margen calculable.
   *
   * Causa raíz del problema real reportado: `Presupuesto.analisisPrecio`
   * SOLO se escribe dentro de `ejecutarConsecuenciasAceptacion`, que a su
   * vez SOLO se dispara en la transición `estado !== 'aceptado'` →
   * `'aceptado'` (ver el filtro `estado: {$ne:'aceptado'}` de
   * `aceptarPresupuesto`). Un presupuesto aceptado ANTES de que existiera
   * esta función, o aceptado cuando `Empresa.margenObjetivoPorcentaje`
   * todavía era `null`, nunca vuelve a pasar por esa transición — así que
   * nunca podía llegar a tener snapshot, para siempre, aunque el usuario
   * configurase el margen objetivo después. No era un problema de
   * relación entre datos (`Presupuesto.proyectoId` → `Proyecto.movimientos`/`horas`
   * ya funcionaba y ya se usaba correctamente al aceptar) sino de que ese
   * cálculo solo ocurría en un único instante que ya había pasado.
   *
   * Este método resuelve el hueco calculando (y persistiendo, "rellenando
   * lo que falta") el análisis de CUALQUIER presupuesto ya aceptado que
   * todavía no tenga `analisisPrecio`, reutilizando exactamente el mismo
   * motor determinista — nunca inventa un coste ni una relación que no
   * exista. Un presupuesto con snapshot ya guardado se devuelve tal cual,
   * sin recalcular ni sobrescribir (mismo principio que ya rige el
   * snapshot: se congela una vez, no se actualiza solo).
   *
   * @param usuarioId Propietario.
   * @returns Todos los presupuestos aceptados del usuario, con
   * `analisisPrecio` relleno en los que tenían datos suficientes.
   */
  async analizarPresupuestosAceptados(usuarioId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const [empresa, aceptados] = await Promise.all([
      EmpresaModel.findOne({ usuarioId }).select('margenObjetivoPorcentaje').lean().exec() as Promise<any>,
      PresupuestoModel.find({ usuarioId, estado: 'aceptado' })
        .select('id titulo clienteId proyectoId precioTotal estado analisisPrecio creado actualizado')
        .sort({ actualizado: -1 })
        .lean()
        .exec(),
    ]);
    const margenObjetivoPorcentaje = empresa?.margenObjetivoPorcentaje ?? null;

    const pendientes = (aceptados as any[]).filter((p) => !p.analisisPrecio && p.proyectoId);
    const proyectoIds = [...new Set(pendientes.map((p) => p.proyectoId as string))];
    const proyectos = proyectoIds.length > 0
      ? await ProyectoModel.find({ id: { $in: proyectoIds }, usuarioId }).select('id movimientos horas tarifaHora').lean().exec()
      : [];
    const proyectosPorId = new Map(proyectos.map((p: any) => [p.id, p]));

    // Persistidos en paralelo pero sin bloquear la respuesta por cada uno
    // individualmente — volumen esperado (presupuestos aceptados de un
    // único estudio) demasiado pequeño para justificar un bulkWrite.
    const escrituras: Promise<unknown>[] = [];
    for (const p of aceptados as any[]) {
      if (p.analisisPrecio) continue; // ya congelado — nunca se recalcula ni se pisa.
      const proyecto = p.proyectoId ? proyectosPorId.get(p.proyectoId) : null;
      const analisis = analizarPrecioPresupuesto(p.precioTotal || 0, proyecto ?? null, margenObjetivoPorcentaje);
      if (!analisis.disponible) continue; // sigue "pendiente de datos" — nunca se inventa un coste.
      const snapshot = { ...analisis, fecha: new Date().toISOString() };
      p.analisisPrecio = snapshot; // refleja el cálculo en la respuesta sin una segunda lectura.
      escrituras.push(PresupuestoModel.updateOne({ id: p.id, usuarioId }, { $set: { analisisPrecio: snapshot } }).exec());
    }
    await Promise.all(escrituras);

    return aceptados.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  /**
   * Inteligencia de Precios — ampliación "margen real" (28/08/2026).
   *
   * Un "trabajo" es la unidad que ve el usuario: puede tener MARGEN
   * PREVISTO (precio cotizado en un presupuesto aceptado vs. coste),
   * MARGEN REAL (ingreso realmente cobrado en un proyecto `finalizado` vs.
   * coste — ver `calcularMargenRealProyecto`), o ambos si el mismo
   * proyecto tiene un presupuesto aceptado Y ya está finalizado con datos
   * reales. Nunca se fusionan en un solo número: se calculan por separado
   * y se decide cuál es el "principal" — el real, siempre que exista,
   * porque representa lo que de verdad ocurrió; el previsto se conserva
   * aparte para el detalle y la futura comparación previsto→real.
   *
   * Identidad del trabajo: el `proyectoId` cuando existe (un proyecto
   * finalizado y su presupuesto aceptado son EL MISMO trabajo, nunca dos
   * filas), o el propio id del presupuesto cuando no está vinculado a
   * ningún proyecto.
   *
   * @param usuarioId Propietario.
   */
  async analizarTrabajos(usuarioId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const [empresa, presupuestos, proyectosFinalizados] = await Promise.all([
      EmpresaModel.findOne({ usuarioId }).select('margenObjetivoPorcentaje').lean().exec() as Promise<any>,
      this.analizarPresupuestosAceptados(usuarioId), // reutiliza la resolución/persistencia de "previsto" ya probada
      ProyectoModel.find({ usuarioId, estado: 'finalizado' })
        .select('id clienteId proyecto movimientos horas tarifaHora creado caracteristicas')
        .lean()
        .exec(),
    ]);
    const margenObjetivoPorcentaje = empresa?.margenObjetivoPorcentaje ?? null;

    /**
     * `tipoTrabajo` (Histórico Inteligente, 2B) — se muestra junto a cada
     * trabajo cuando existe, sea cual sea su origen principal (real o
     * previsto). Los proyectos finalizados ya lo traen en la consulta de
     * arriba (campo añadido al `.select()`); los que solo tienen un
     * presupuesto aceptado, sin estar finalizados todavía, necesitan una
     * consulta aparte — pero UN SOLO `$in` con los ids que de verdad
     * faltan, nunca una consulta por trabajo (nunca N+1).
     */
    const idsConReal = new Set((proyectosFinalizados as any[]).map((p) => p.id));
    const idsFaltantes = [...new Set(
      (presupuestos as any[]).map((p) => p.proyectoId as string | undefined).filter((id): id is string => !!id && !idsConReal.has(id))
    )];
    const proyectosSoloCaracteristicas = idsFaltantes.length > 0
      ? await ProyectoModel.find({ id: { $in: idsFaltantes }, usuarioId }).select('id caracteristicas').lean().exec()
      : [];
    const tipoTrabajoPorProyectoId = new Map<string, string>();
    for (const p of [...(proyectosFinalizados as any[]), ...proyectosSoloCaracteristicas]) {
      // Filtro deliberado por `confirmadoPorUsuario` (Fase 2C, principio
      // 15 de la autorización): hoy la única vía de escritura de
      // `tipoTrabajo` ya fuerza siempre `confirmadoPorUsuario:true`
      // (`guardarCaracteristicaProyecto`), así que este filtro no cambia
      // nada observable TODAVÍA — pero es la barrera estructural que
      // impide que una futura característica `origen:'ia'` sin confirmar
      // (análisis por fotografía) se cuele en el Histórico o en
      // Comparables antes de que el usuario la revise, sin tener que
      // recordar añadir esta comprobación el día que exista esa fuente.
      const caracteristica = Array.isArray(p.caracteristicas)
        ? p.caracteristicas.find((c: any) => c.clave === 'tipoTrabajo' && c.confirmadoPorUsuario === true)
        : null;
      if (caracteristica?.valor) tipoTrabajoPorProyectoId.set(p.id, caracteristica.valor);
    }

    type Trabajo = {
      id: string; titulo: string; clienteId: string; actualizado: string;
      tipoTrabajo: string | null;
      real: AnalisisPrecio | null; previsto: AnalisisPrecio | null;
      principal: AnalisisPrecio; origenPrincipal: 'real' | 'previsto' | null;
    };
    const trabajos = new Map<string, Trabajo>();

    // 1. Margen real de todo proyecto finalizado — con o sin presupuesto detrás.
    for (const proyecto of proyectosFinalizados as any[]) {
      const real = calcularMargenRealProyecto(proyecto, margenObjetivoPorcentaje);
      trabajos.set(proyecto.id, {
        id: proyecto.id,
        titulo: proyecto.proyecto || 'Proyecto sin nombre',
        clienteId: proyecto.clienteId,
        actualizado: proyecto.creado, // Proyecto no lleva campo `actualizado` propio.
        tipoTrabajo: tipoTrabajoPorProyectoId.get(proyecto.id) ?? null,
        real: real.disponible ? real : null,
        previsto: null,
        principal: real,
        origenPrincipal: real.disponible ? 'real' : null,
      });
    }

    // 2. Margen previsto de cada presupuesto aceptado — se fusiona con el
    //    trabajo real si comparten proyecto, o crea uno nuevo si no.
    for (const p of presupuestos as any[]) {
      const previsto: AnalisisPrecio | undefined = p.analisisPrecio ?? undefined;
      // Motivo aproximado cuando no hay snapshot: `analizarPresupuestosAceptados`
      // ya intentó calcularlo y decidió no persistirlo — sin más contexto
      // aquí, se ofrece el motivo más probable en vez de uno genérico.
      const previstoResultado: AnalisisPrecio = previsto ?? { disponible: false, motivo: p.proyectoId ? 'sin_costes' : 'sin_proyecto' };

      const key = (p.proyectoId as string) || `presupuesto:${p.id}`;
      const existente = trabajos.get(key);
      if (existente) {
        if (previsto) existente.previsto = previsto;
        existente.titulo = (p.titulo as string) || existente.titulo;
        if (!existente.real) {
          existente.principal = previstoResultado;
          existente.origenPrincipal = previsto ? 'previsto' : existente.origenPrincipal;
        }
      } else {
        trabajos.set(key, {
          // Identidad = el proyecto cuando existe (consistente con el paso
          // 1: un proyecto finalizado y su presupuesto SIEMPRE comparten
          // id de trabajo), aunque el proyecto no esté finalizado todavía
          // — nunca el id del propio presupuesto salvo que no haya proyecto.
          id: (p.proyectoId as string) || (p.id as string),
          titulo: p.titulo as string,
          clienteId: p.clienteId as string,
          actualizado: (p.actualizado as string) || (p.creado as string),
          tipoTrabajo: (p.proyectoId && tipoTrabajoPorProyectoId.get(p.proyectoId as string)) ?? null,
          real: null,
          previsto: previsto ?? null,
          principal: previstoResultado,
          origenPrincipal: previsto ? 'previsto' : null,
        });
      }
    }

    return [...trabajos.values()];
  }

  /**
   * Comparables Inteligentes (Fase 2C) — encuentra, dentro del histórico
   * propio del usuario, los trabajos más parecidos al que se está
   * presupuestando ahora mismo. Reutiliza `analizarTrabajos` para obtener
   * el histórico YA aislado por `usuarioId` y se lo pasa a la función pura
   * `calcularComparables` (`comparables.ts`) — ese motor nunca toca Mongo
   * por su cuenta, así que no hay ninguna vía por la que pudiera mezclar
   * datos de dos usuarios distintos (principio 12 de la autorización).
   *
   * @param usuarioId Propietario — el único límite de aislamiento.
   * @param precio Precio de referencia del trabajo que se está presupuestando.
   * @param tipoTrabajo Tipo de trabajo del proyecto vinculado, si ya lo tiene guardado.
   * @param excluirId Id de trabajo a excluir del histórico (para no comparase consigo mismo al reanalizar uno ya existente).
   * @param top Cuántos comparables devolver como máximo (por defecto 5).
   */
  async obtenerComparables(
    usuarioId: string,
    precio: number,
    tipoTrabajo: string | null,
    excluirId?: string,
    top?: number
  ): Promise<ResultadoComparables> {
    const historico = await this.analizarTrabajos(usuarioId);
    return calcularComparables(
      { precio, tipoTrabajo, excluirId },
      historico as any,
      { top }
    );
  }

  /**
   * Devuelve un presupuesto por id, o `null` si no existe o no pertenece
   * al usuario. Usado hoy por `automatizaciones-listener.ts` (Incremento
   * 11 — acción `modificarElemento`, que necesita cargar el `DocumentoMC`
   * objetivo antes de aplicarle el comando).
   * @param id Id del presupuesto.
   * @param usuarioId Propietario.
   */
  async obtenerPresupuesto(id: string, usuarioId: string): Promise<Record<string, unknown> | null> {
    await conectar();
    const doc = await PresupuestoModel.findOne({ id, usuarioId }).lean().exec();
    return doc ? this.limpiar(doc as Record<string, unknown>) : null;
  }

  /**
   * Devuelve el presupuesto más reciente de un cliente, o `null` si no
   * tiene ninguno — usado por la herramienta de IA `anadirElementoPresupuesto`
   * para resolver "el presupuesto de Juan" sin que el modelo necesite
   * conocer un id de Mongo.
   * @param usuarioId Propietario.
   * @param clienteId Cliente.
   */
  async obtenerPresupuestoMasRecienteDeCliente(usuarioId: string, clienteId: string): Promise<Record<string, unknown> | null> {
    await conectar();
    const doc = await PresupuestoModel.findOne({ usuarioId, clienteId }).sort({ creado: -1 }).lean().exec();
    return doc ? this.limpiar(doc as Record<string, unknown>) : null;
  }

  /**
   * Crea o actualiza un presupuesto.
   * @param presupuesto Datos del presupuesto.
   * @param usuarioId Propietario.
   */
  async guardarPresupuesto(presupuesto: Record<string, unknown>, usuarioId: string): Promise<Record<string, unknown>> {
    await conectar();
    const anterior = await PresupuestoModel.findOne({ id: presupuesto.id, usuarioId }).lean().exec();
    // LEGADO — solo se sigue procesando para formato:'lienzo' ya existentes; no crea documentos nuevos (ver ARQUITECTURA-MOTOR-DOCUMENTAL.md).
    const contenidoLienzo = await procesarArchivosLienzo(presupuesto.contenidoLienzo);
    // Motor Documental — independiente de lo anterior, solo se procesa cuando el propio presupuesto es formato:'documento'.
    const contenidoDocumento = presupuesto.formato === 'documento'
      ? await procesarRecursosDocumento(presupuesto.contenidoDocumento as DocumentoMC)
      : presupuesto.contenidoDocumento;
    const doc = await PresupuestoModel.findOneAndUpdate(
      { id: presupuesto.id, usuarioId },
      {
        ...presupuesto, contenidoLienzo, contenidoDocumento, usuarioId,
        // `estado` no está en `esquemaPresupuestoMC` a propósito (Fase 1 —
        // solo `aceptarPresupuesto` puede cambiarlo, nunca este PUT
        // genérico), así que `presupuesto.estado` siempre llega `undefined`
        // aquí — y `setDefaultsOnInsert` no lo suple (confirmado probando
        // en local: solo cubre valores por defecto de Zod, `esquemaPresupuestoMC`,
        // no los de Mongoose para un campo ausente del todo del esquema
        // de validación). Se fija explícitamente solo al CREAR (nunca al
        // editar uno ya existente, para no resetear un presupuesto ya
        // aceptado de vuelta a 'borrador' en una edición posterior).
        ...(anterior ? {} : { estado: 'borrador' }),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();
    if (anterior) {
      await borrarArchivosLienzoHuerfanos((anterior as any).contenidoLienzo, contenidoLienzo);
      if (presupuesto.formato === 'documento') {
        await borrarRecursosDocumentoHuerfanos((anterior as any).contenidoDocumento, contenidoDocumento as DocumentoMC);
      }
    }
    busEventos.publicar({
      nombre: 'presupuesto.creado',
      usuarioId,
      entidadId: String(presupuesto.id),
      datos: { titulo: (presupuesto as any).titulo, clienteId: (presupuesto as any).clienteId, precioTotal: (presupuesto as any).precioTotal },
    });
    return this.limpiar(doc as Record<string, unknown>);
  }

  /**
   * Acepta un presupuesto (Fase 1 — "presupuesto aceptado"). Manejador de
   * negocio dedicado, separado a propósito del motor de automatizaciones
   * del Motor Documental (`AutomatizacionModel`/`automatizaciones-listener.ts`):
   * ese motor solo sabe editar documentos (`crearDocumento` sin
   * implementar, `modificarElemento` limitado a `DocumentoMC`, `notificar`
   * que solo escribe en el log) — no tiene ninguna acción capaz de tocar
   * `Cliente.estado`/`tareas`, y no existe ninguna interfaz para
   * configurarlo. Forzar esta cadena de negocio dentro de esa pieza
   * significaría ampliar un vocabulario pensado para otra cosa.
   *
   * Idempotente por diseño: la transición ocurre en una única operación
   * atómica (`findOneAndUpdate` con la condición de estado en el propio
   * filtro, mismo patrón que la rotación de refresh tokens y el canje de
   * códigos promocionales) — dos peticiones simultáneas sobre el mismo
   * presupuesto nunca pueden aceptar dos veces ni disparar dos veces las
   * consecuencias. Reaceptar un presupuesto ya aceptado es un no-op seguro.
   *
   * El evento `presupuesto.aprobado` se publica ÚNICAMENTE después de que
   * esa transición atómica haya tenido éxito — nunca antes, nunca de forma
   * optimista.
   *
   * @param id Identificador del presupuesto.
   * @param usuarioId Propietario — nunca se confía en ningún `usuarioId` que
   * pudiera venir del cliente; siempre el de la sesión autenticada.
   * @returns El presupuesto actualizado, y si la petición fue la que causó
   * la transición o si ya estaba aceptado de antes (para que la ruta HTTP
   * pueda responder igual de bien en ambos casos, sin duplicar nada).
   */
  async aceptarPresupuesto(id: string, usuarioId: string): Promise<{ presupuesto: Record<string, unknown>; transicionOcurrioAhora: boolean }> {
    await conectar();
    const ahora = new Date().toISOString();

    // Paso atómico único que decide éxito/fracaso de la aceptación en sí:
    // `estado: { $ne: 'aceptado' }` en el FILTRO (no en una comprobación
    // previa de lectura+escritura, que sería vulnerable a una carrera)
    // coincide también con presupuestos antiguos que no tienen el campo en
    // absoluto (Mongo trata "campo ausente" como distinto de 'aceptado'),
    // así que un presupuesto creado antes de esta fase se puede aceptar
    // con normalidad.
    const recienAceptado = await PresupuestoModel.findOneAndUpdate(
      { id, usuarioId, estado: { $ne: 'aceptado' } },
      { $set: { estado: 'aceptado', actualizado: ahora } },
      { new: true }
    ).lean().exec();

    if (recienAceptado) {
      // A partir de aquí la transición YA es un hecho consumado y
      // confirmado — el evento se publica solo ahora, nunca antes.
      busEventos.publicar({
        nombre: 'presupuesto.aprobado',
        usuarioId,
        entidadId: id,
        datos: { clienteId: (recienAceptado as any).clienteId, precioTotal: (recienAceptado as any).precioTotal },
      });

      // Consecuencias — "mejor esfuerzo": la aceptación del presupuesto ya
      // quedó guardada pase lo que pase aquí abajo. Un fallo en cualquiera
      // de estos pasos se registra con detalle (trazable) pero nunca
      // deshace ni corrompe la transición ya confirmada, ni hace fallar la
      // respuesta al usuario que aceptó el presupuesto.
      this.ejecutarConsecuenciasAceptacion(recienAceptado as Record<string, unknown>, usuarioId)
        .catch((err) => logger.error({ err, presupuestoId: id, usuarioId }, '[presupuesto.aceptar] Fallo en las consecuencias posteriores a la aceptación'));

      return { presupuesto: this.limpiar(recienAceptado as Record<string, unknown>), transicionOcurrioAhora: true };
    }

    // No hubo transición: o el presupuesto no existe (o no es de este
    // usuario — mismo filtro por usuarioId que el resto del servicio,
    // nunca se distingue "no existe" de "no es tuyo" para no filtrar esa
    // información), o ya estaba aceptado de antes. Se distinguen con una
    // lectura aparte, sin volver a escribir nada.
    const existente = await PresupuestoModel.findOne({ id, usuarioId }).lean().exec();
    if (!existente) {
      throw new ErrorDeNegocio('Presupuesto no encontrado', 400);
    }
    // Ya estaba aceptado — idempotente: se responde con éxito y el estado
    // actual, sin repetir ninguna consecuencia.
    return { presupuesto: this.limpiar(existente as Record<string, unknown>), transicionOcurrioAhora: false };
  }

  /**
   * Reemplaza la lista completa de cobros de un presupuesto (roadmap
   * "cobros pendientes", 18/08/2026) — el usuario puede editar importes,
   * añadir o quitar hitos, y marcar/desmarcar cualquiera como cobrado
   * (poniendo o vaciando `cobradoEn`) libremente en el mismo guardado. Sin
   * restricción de que el presupuesto esté aceptado: no hay ninguna razón
   * de negocio para impedirlo, y así también sirve para corregir a mano si
   * la generación automática no encajó bien con el texto de condiciones.
   */
  async actualizarCobros(presupuestoId: string, usuarioId: string, cobros: Array<{ id: string; concepto: string; importe: number; cobradoEn?: string }>): Promise<Record<string, unknown>> {
    await conectar();
    const doc = await PresupuestoModel.findOneAndUpdate(
      { id: presupuestoId, usuarioId },
      { $set: { cobros: cobros.map((c) => ({ ...c, cobradoEn: c.cobradoEn || '' })) } },
      { new: true }
    ).lean().exec();
    if (!doc) throw new ErrorDeNegocio('Presupuesto no encontrado', 400);
    return this.limpiar(doc as Record<string, unknown>);
  }

  /**
   * Genera un enlace público nuevo para un presupuesto (Portal del
   * cliente). Solo disponible para el formato vigente (`'simple'` o
   * `'documento'`) — el legado `'lienzo'` (editor Excalidraw) no tiene vista
   * pública, no vale la pena duplicar ese renderizador para un formato que
   * ya no se usa para presupuestos nuevos.
   */
  async generarEnlacePresupuesto(id: string, usuarioId: string): Promise<{ token: string; expiraEn: string }> {
    await conectar();
    const presupuesto = await PresupuestoModel.findOne({ id, usuarioId }).lean().exec() as any;
    if (!presupuesto) throw new ErrorDeNegocio('Presupuesto no encontrado', 400);
    if (presupuesto.formato === 'lienzo') {
      throw new ErrorDeNegocio('Este presupuesto usa el editor antiguo — no tiene enlace público disponible.', 400);
    }
    const { token, expiraEn } = await crearEnlacePresupuesto({
      presupuestoId: id,
      usuarioId,
      contenidoHash: hashContenidoPublico(presupuesto),
      validezDias: presupuesto.validezDias || 30,
    });
    return { token, expiraEn: expiraEn.toISOString() };
  }

  /**
   * Vista pública de un presupuesto (Portal del cliente) — sin sesión, solo
   * el token del enlace. Nunca usa `limpiar()` (deja pasar `usuarioId`, ver
   * comentario de `proyeccionPublicaPresupuesto`) ni el objeto completo del
   * presupuesto: solo la lista blanca.
   */
  async obtenerPresupuestoPublico(tokenPlano: string): Promise<Record<string, unknown>> {
    if (!formatoTokenValido(tokenPlano)) throw new ErrorDeNegocio('Enlace no válido.', 400);
    await conectar();
    const enlace = await buscarEnlacePorToken(tokenPlano);
    if (!enlace) throw new ErrorDeNegocio('Enlace no válido.', 400);
    if (enlace.revocadoEn || enlace.expiraEn.getTime() < Date.now()) {
      throw new ErrorDeNegocio('Este enlace ya no está disponible. Pide uno nuevo.', 409);
    }
    const presupuesto = await PresupuestoModel.findOne({ id: enlace.presupuestoId, usuarioId: enlace.usuarioId }).lean().exec() as any;
    if (!presupuesto) throw new ErrorDeNegocio('Enlace no válido.', 400);

    const cliente = await ClienteModel.findOne({ id: presupuesto.clienteId, usuarioId: enlace.usuarioId }).select('nombre').lean().exec() as any;
    const empresa = await EmpresaModel.findOne({ usuarioId: enlace.usuarioId }).lean().exec() as any;

    // Componentes reutilizables (Incremento 6) que el documento referencia
    // desde su membrete/pie o su cuerpo — resueltos aquí, en el servidor,
    // porque el Portal del cliente no tiene sesión con la que pedirlos por
    // su cuenta. Deliberadamente FUERA de `proyeccionPublicaPresupuesto`:
    // no debe afectar a `hashContenidoPublico` (si un componente cambia
    // después de generar el enlace no invalida la firma, igual que ya pasa
    // hoy con el logo/precio "vinculado", que también se resuelve en vivo).
    // Acotado al mismo usuario dueño del presupuesto — nunca a cualquier id.
    let componentesResueltos: Record<string, unknown>[] = [];
    if (presupuesto.formato === 'documento') {
      const ids = componenteIdsReferenciados(presupuesto.contenidoDocumento);
      if (ids.length > 0) {
        const docs = await ComponenteModel.find({ id: { $in: ids }, usuarioId: enlace.usuarioId }).lean().exec();
        componentesResueltos = (docs as any[]).map((d) => this.limpiar(d as Record<string, unknown>));
      }
    }

    return {
      ...proyeccionPublicaPresupuesto(presupuesto),
      estado: presupuesto.estado || 'borrador',
      clienteNombre: cliente?.nombre || '',
      empresa: {
        nombre: empresa?.nombre || '',
        eslogan: empresa?.eslogan || '',
        logo: empresa?.logo || '',
        firma: empresa?.firmaEmpresa || '',
        telefono: empresa?.telefono || '',
        email: empresa?.email || '',
      },
      expiraEn: enlace.expiraEn.toISOString(),
      // Si ya está aceptado, el propio Presupuesto ya lleva la firma (se
      // escribe ahí en `aceptarPresupuestoPublico`) — la vista pública la
      // muestra desde aquí, no desde el enlace.
      firmaClienteUrl: presupuesto.firmaClienteUrl || '',
      firmaClienteFecha: presupuesto.firmaClienteFecha || '',
      componentesResueltos,
    };
  }

  /**
   * Acepta un presupuesto desde el Portal del cliente — aceptar = firmar,
   * la firma es obligatoria. Reutiliza `aceptarPresupuesto` sin
   * modificarlo (mismo evento, misma atomicidad/idempotencia); esta función
   * solo resuelve `{presupuestoId, usuarioId}` a partir del token, valida
   * la integridad del contenido, sube la firma, y dispara el mismo método
   * de siempre.
   *
   * Orden deliberado (revisión de seguridad, 17/08/2026): la firma se
   * guarda ANTES de llamar a `aceptarPresupuesto`, así el documento ya la
   * lleva en el momento en que se publica `presupuesto.aprobado` — un
   * futuro consumidor del evento que relea el Presupuesto ya la encuentra.
   * `reclamarEnlaceAceptado` usa `aceptadoEn: null` como guarda atómica
   * contra un doble envío concurrente del mismo enlace — se llama ANTES
   * de subir la firma, para que un envío que pierde la carrera nunca
   * llegue a subir un archivo que quedaría huérfano (hallazgo de la
   * auditoría de seguridad, 18/08/2026).
   */
  async aceptarPresupuestoPublico(tokenPlano: string, evidencia: { ip: string; userAgent: string; firmaDataUrl: string }): Promise<{ ok: true; yaEstabaAceptado: boolean }> {
    if (!formatoTokenValido(tokenPlano)) throw new ErrorDeNegocio('Enlace no válido.', 400);
    await conectar();
    const enlace = await buscarEnlacePorToken(tokenPlano);
    if (!enlace) throw new ErrorDeNegocio('Enlace no válido.', 400);
    if (enlace.revocadoEn || enlace.expiraEn.getTime() < Date.now()) {
      throw new ErrorDeNegocio('Este enlace ya no está disponible. Pide uno nuevo.', 409);
    }

    const presupuesto = await PresupuestoModel.findOne({ id: enlace.presupuestoId, usuarioId: enlace.usuarioId }).lean().exec() as any;
    if (!presupuesto) throw new ErrorDeNegocio('Enlace no válido.', 400);

    // Ya aceptado (por este mismo enlace, o por otro) — no se puede volver a
    // firmar. Sin esto, generar un enlace nuevo para un presupuesto ya
    // aceptado permitiría sustituir la firma original (hallazgo de la
    // revisión de seguridad).
    if (presupuesto.estado === 'aceptado') {
      return { ok: true, yaEstabaAceptado: true };
    }

    if (enlace.aceptadoEn) {
      // Este enlace concreto ya se usó pero el presupuesto todavía no
      // refleja 'aceptado' (carrera con otra petición en curso) —
      // idempotente, no se repite el trabajo.
      return { ok: true, yaEstabaAceptado: true };
    }

    // Integridad: el presupuesto no puede haber cambiado desde que se
    // generó el enlace — si el carpintero editó precios/alcance mientras el
    // cliente tenía la página abierta, la firma no significaría lo que el
    // cliente vio.
    if (hashContenidoPublico(presupuesto) !== enlace.contenidoHash) {
      throw new ErrorDeNegocio('El presupuesto ha cambiado desde que se generó este enlace. Pide uno nuevo.', 409);
    }

    const coincide = evidencia.firmaDataUrl.match(/^data:image\/png;base64,(.+)$/);
    if (!coincide) throw new ErrorDeNegocio('La firma no es una imagen válida.', 400);
    const bufferFirma = Buffer.from(coincide[1], 'base64');
    if (bufferFirma.subarray(0, 8).compare(CABECERA_PNG) !== 0) {
      throw new ErrorDeNegocio('La firma no es una imagen PNG válida.', 400);
    }

    // Reclama PRIMERO (atómico, guarda contra doble envío concurrente del
    // mismo enlace), sube la firma DESPUÉS — solo si se gana la carrera, ver
    // comentario en `reclamarEnlaceAceptado`.
    const enlaceReclamado = await reclamarEnlaceAceptado(tokenPlano, { ip: evidencia.ip, userAgent: evidencia.userAgent });
    if (!enlaceReclamado) {
      // Perdió la carrera contra otra petición concurrente con el mismo
      // enlace — esa otra ya está aceptando (o ya aceptó); no repetir el
      // trabajo aquí.
      return { ok: true, yaEstabaAceptado: true };
    }

    const subida = await almacenamiento.subir(bufferFirma, { contentType: 'image/png', carpeta: 'firmas' });
    await guardarFirmaEnlace(tokenPlano, subida.url);

    const ahora = new Date().toISOString();
    await PresupuestoModel.updateOne(
      { id: enlace.presupuestoId, usuarioId: enlace.usuarioId },
      { $set: { firmaClienteUrl: subida.url, firmaClienteFecha: ahora } }
    ).exec();

    const { transicionOcurrioAhora } = await this.aceptarPresupuesto(enlace.presupuestoId, enlace.usuarioId);
    return { ok: true, yaEstabaAceptado: !transicionOcurrioAhora };
  }

  /**
   * Genera (o regenera, revocando el anterior) el enlace individual de
   * solicitud de reseña de un cliente — ver `crearEnlaceResena`. Solo
   * devuelve el token: la URL completa la construye el frontend con su
   * propio origen (`${window.location.origin}/resena/${token}`), igual que
   * ya hace con el enlace del Portal.
   *
   * Exige que la empresa ya tenga configurado su enlace de Google My
   * Business (Ajustes de empresa) — sin esto, el enlace generado no
   * llevaría a ningún sitio útil al abrirse (hallazgo del usuario,
   * 20/08/2026: antes el destino era una constante fija de Madera
   * Creativa, compartida por todas las cuentas).
   */
  async generarEnlaceResena(clienteId: string, usuarioId: string): Promise<{ token: string }> {
    await conectar();
    const cliente = await ClienteModel.findOne({ id: clienteId, usuarioId }).lean().exec();
    if (!cliente) throw new ErrorDeNegocio('Cliente no encontrado', 400);
    const empresa = await EmpresaModel.findOne({ usuarioId }).lean().exec() as any;
    if (!empresa?.enlaceResenaGoogle) {
      throw new ErrorDeNegocio('Configura tu enlace de reseñas de Google en Ajustes de empresa antes de generar enlaces para tus clientes.', 400);
    }
    return crearEnlaceResena({ clienteId, usuarioId });
  }

  /**
   * Valida un enlace público de reseña y resuelve el destino real de ESA
   * empresa (no una constante global) — sin sesión, solo el token. Lanza
   * `ErrorDeNegocio` si el token no tiene el formato esperado, no existe,
   * ya fue revocado, o la empresa ya no tiene un enlace de Google
   * configurado (pudo borrarlo después de generar este enlace);
   * `resena-rutas.ts` trata cualquier fallo como "enlace no disponible"
   * sin distinguir el motivo, para no filtrar si un token concreto llegó a
   * existir alguna vez.
   */
  async resolverEnlaceResena(tokenPlano: string): Promise<{ urlGoogle: string; imagenResena: string }> {
    if (!formatoTokenValidoResena(tokenPlano)) throw new ErrorDeNegocio('Enlace no válido.', 400);
    await conectar();
    const enlace = await buscarEnlaceResenaPorToken(tokenPlano);
    if (!enlace || enlace.revocadoEn) throw new ErrorDeNegocio('Enlace no válido.', 400);
    const empresa = await EmpresaModel.findOne({ usuarioId: enlace.usuarioId }).lean().exec() as any;
    if (!empresa?.enlaceResenaGoogle) throw new ErrorDeNegocio('Enlace no válido.', 400);
    await registrarUsoEnlaceResena(tokenPlano);
    return { urlGoogle: empresa.enlaceResenaGoogle, imagenResena: empresa.imagenResena || '' };
  }

  /**
   * Consecuencias de negocio de aceptar un presupuesto — cada paso
   * reutiliza una estructura ya existente en la aplicación, a propósito:
   * ninguna de estas es una tabla/colección nueva.
   * - `Cliente.estado` → 'en_curso': ya es el campo que lee el Dashboard
   *   (`dashboard-calculos.ts`) para "Presupuestos en curso".
   * - `Cliente.tareas[]` → checklist base: mismo campo y misma forma que ya
   *   rellena a mano `tab-tareas.tsx`; solo se crea si el cliente NO tiene
   *   ya ninguna tarea, para no pisar un checklist que el artesano ya
   *   estuviera usando/modificando.
   * - `Cliente.presupuesto` → importe del presupuesto aceptado: es el
   *   mismo campo que ya usa `TablaMargen` para calcular "pendiente de
   *   cobrar" (`presupuesto - totalIngresos`) — no existe ninguna entidad
   *   "Cobro" separada en la aplicación, así que no se crea una ahora. Solo
   *   se rellena si estaba vacío, para no sobrescribir un importe que el
   *   usuario ya hubiera ajustado a mano.
   * - Notificación push al propio dueño del presupuesto (no al admin —
   *   este evento es sobre el negocio del propio usuario).
   * - `Presupuesto.analisisPrecio` → snapshot congelado del análisis de
   *   margen (Inteligencia de Precios, Fase 1, `inteligencia-precios.ts`) —
   *   "lo que pensábamos cuando se aceptó", nunca recalculado después. Solo
   *   se guarda si hay datos suficientes (proyecto con costes registrados y
   *   margen objetivo configurado); si no, se deja sin escribir en vez de
   *   guardar un análisis a medias.
   */
  private async ejecutarConsecuenciasAceptacion(presupuesto: Record<string, unknown>, usuarioId: string): Promise<void> {
    const clienteId = presupuesto.clienteId as string;
    // Incremento "Cliente ≠ Proyecto" (20/08/2026): estado/tareas/presupuesto
    // acordado son campos del PROYECTO, nunca del cliente — resuelve a qué
    // proyecto pertenece de verdad este presupuesto con el mismo criterio
    // (y la misma cautela contra mezclar proyectos) que ya usa
    // `resolverProyectoDeFactura`.
    const proyectoId = await this.resolverProyectoDeFactura(clienteId, (presupuesto.proyectoId as string) || '', usuarioId);
    const proyecto = proyectoId ? await ProyectoModel.findOne({ id: proyectoId, usuarioId }).lean().exec() as any : null;
    const cliente = await ClienteModel.findOne({ id: clienteId, usuarioId }).lean().exec() as any;
    if (!proyecto) {
      logger.warn({ presupuestoId: presupuesto.id, clienteId, proyectoId }, '[presupuesto.aceptar] No se pudo resolver un proyecto único para este presupuesto — se omiten las consecuencias sobre el proyecto (tareas/estado).');
    } else {
      const cambios: Record<string, unknown> = { estado: 'en_curso' };
      if (!proyecto.tareas || proyecto.tareas.length === 0) {
        cambios.tareas = TAREAS_BASE_PRESUPUESTO_ACEPTADO.map((texto) => ({ id: randomUUID(), texto, hecha: false }));
      }
      if (!proyecto.presupuesto) {
        cambios.presupuesto = (presupuesto.precioTotal as number) || 0;
      }
      await ProyectoModel.findOneAndUpdate({ id: proyecto.id, usuarioId }, { $set: cambios }).exec();
    }

    const empresa = await EmpresaModel.findOne({ usuarioId }).lean().exec() as any;
    const analisis = analizarPrecioPresupuesto(
      (presupuesto.precioTotal as number) || 0,
      proyecto,
      empresa?.margenObjetivoPorcentaje ?? null
    );
    if (analisis.disponible) {
      await PresupuestoModel.findOneAndUpdate(
        { id: presupuesto.id, usuarioId },
        { $set: { analisisPrecio: { ...analisis, fecha: new Date().toISOString() } } }
      ).exec();
    }

    // Cobros pendientes (roadmap, 18/08/2026) — se generan solo la primera
    // vez (presupuesto recién aceptado, `cobros` todavía vacío); a partir
    // de ahí el usuario los gestiona a mano (`actualizarCobros`), así que
    // una re-aceptación (no debería ocurrir, pero por si acaso) nunca los
    // pisa.
    if (!Array.isArray(presupuesto.cobros) || (presupuesto.cobros as unknown[]).length === 0) {
      const cobros = generarCobrosDesdeCondiciones((presupuesto.condicionesPago as string) || '', (presupuesto.precioTotal as number) || 0);
      await PresupuestoModel.findOneAndUpdate({ id: presupuesto.id, usuarioId }, { $set: { cobros } }).exec();
    }

    await conectarUsuarios();
    const propietario = await UsuarioModel.findOne({ id: usuarioId }).lean().exec() as any;
    const subs = (propietario?.pushSubs ?? []) as PushSub[];
    for (const sub of subs) {
      await enviarNotificacion(
        sub,
        'Presupuesto aceptado',
        `${cliente.nombre || 'Un cliente'} ha aceptado el presupuesto "${presupuesto.titulo ?? ''}".`,
        { clienteId }
      ).catch((err) => logger.error({ err, presupuestoId: presupuesto.id, usuarioId }, '[presupuesto.aceptar] Error enviando notificación push'));
    }
  }

  /**
   * Borra un presupuesto.
   * @param id Identificador del presupuesto.
   * @param usuarioId Propietario.
   */
  async borrarPresupuesto(id: string, usuarioId: string): Promise<void> {
    await conectar();
    await PresupuestoModel.deleteOne({ id, usuarioId }).exec();
  }

  // ── Plantillas (Motor Documental, Incremento 4) — aisladas por usuarioId ──

  /** Lista las plantillas del usuario, más recientes primero. */
  async listarPlantillas(usuarioId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await PlantillaModel.find({ usuarioId }).sort({ creadoEn: -1 }).lean().exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  /** Crea o actualiza una plantilla. */
  async guardarPlantilla(plantilla: Record<string, unknown>, usuarioId: string): Promise<Record<string, unknown>> {
    await conectar();
    const doc = await PlantillaModel.findOneAndUpdate(
      { id: plantilla.id, usuarioId },
      { ...plantilla, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();
    return this.limpiar(doc as Record<string, unknown>);
  }

  /** Borra una plantilla. */
  async borrarPlantilla(id: string, usuarioId: string): Promise<void> {
    await conectar();
    await PlantillaModel.deleteOne({ id, usuarioId }).exec();
  }

  // ── Biblioteca de recursos (Motor Documental, Incremento 5) — aislada por usuarioId ──

  /** Lista los recursos del usuario, más recientes primero. */
  async listarRecursos(usuarioId: string): Promise<RecursoMC[]> {
    await conectar();
    const docs = await RecursoModel.find({ usuarioId }).sort({ creadoEn: -1 }).lean().exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>)) as unknown as RecursoMC[];
  }

  /**
   * Sube un recurso nuevo o reutiliza uno ya catalogado con el mismo
   * contenido (deduplicación por hash — ver `documento-recursos-biblioteca.ts`).
   */
  async subirRecursoBiblioteca(datos: { nombre: string; tipo: RecursoMC['tipo']; ambito: RecursoMC['ambito']; etiquetas: string[]; dataUrl: string }, usuarioId: string): Promise<RecursoMC> {
    await conectar();
    const coincide = datos.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!coincide) throw new ErrorDeNegocio('El archivo no es un data URL en base64 válido.');
    const [, mimeType, base64] = coincide;
    const buffer = Buffer.from(base64, 'base64');
    const repositorio = {
      buscarPorHash: async (uid: string, hash: string) =>
        (await RecursoModel.findOne({ usuarioId: uid, hashContenido: hash }).lean().exec()) as unknown as RecursoMC | null,
    };
    const { recurso, nuevo } = await subirORecuperarRecurso(buffer, { nombre: datos.nombre, tipo: datos.tipo, mimeType, ambito: datos.ambito, etiquetas: datos.etiquetas }, usuarioId, repositorio);
    if (nuevo) await RecursoModel.create({ ...recurso, usuarioId });
    return recurso;
  }

  /** Renombra o retagea un recurso — no toca el archivo ni el hash. */
  async actualizarRecurso(id: string, cambios: { nombre?: string; etiquetas?: string[] }, usuarioId: string): Promise<RecursoMC> {
    await conectar();
    const doc = await RecursoModel.findOneAndUpdate({ id, usuarioId }, { $set: cambios }, { new: true }).lean().exec();
    if (!doc) throw new ErrorDeNegocio('Recurso no encontrado.');
    return this.limpiar(doc as Record<string, unknown>) as unknown as RecursoMC;
  }

  /** Borra un recurso del catálogo y de almacenamiento externo. */
  async borrarRecurso(id: string, usuarioId: string): Promise<void> {
    await conectar();
    const doc = await RecursoModel.findOne({ id, usuarioId }).lean().exec();
    if (!doc) return;
    await RecursoModel.deleteOne({ id, usuarioId }).exec();
    await almacenamiento.borrar((doc as any).claveAlmacenamiento).catch(() => {});
  }

  // ── Componentes reutilizables (Motor Documental, Incremento 6) — aislados por usuarioId ──

  /** Lista los componentes del usuario, más recientes primero. */
  async listarComponentes(usuarioId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await ComponenteModel.find({ usuarioId }).sort({ creadoEn: -1 }).lean().exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  /** Crea o actualiza un componente. */
  async guardarComponente(componente: Record<string, unknown>, usuarioId: string): Promise<Record<string, unknown>> {
    await conectar();
    const doc = await ComponenteModel.findOneAndUpdate(
      { id: componente.id, usuarioId },
      { ...componente, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();
    return this.limpiar(doc as Record<string, unknown>);
  }

  /** Borra un componente. Las instancias que lo referencian en documentos existentes no se tocan — quedarán sin poder resolverse hasta que el editor las desvincule o el usuario las elimine (comportamiento a pulir si hace falta en un incremento futuro). */
  async borrarComponente(id: string, usuarioId: string): Promise<void> {
    await conectar();
    await ComponenteModel.deleteOne({ id, usuarioId }).exec();
  }

  // ── Automatización por eventos (Motor Documental, Incremento 11) — aislada por usuarioId ──

  /** Lista las automatizaciones del usuario, más recientes primero. */
  async listarAutomatizaciones(usuarioId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await AutomatizacionModel.find({ usuarioId }).sort({ creadoEn: -1 }).lean().exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  /** Crea o actualiza una automatización. */
  async guardarAutomatizacion(automatizacion: Record<string, unknown>, usuarioId: string): Promise<Record<string, unknown>> {
    await conectar();
    const doc = await AutomatizacionModel.findOneAndUpdate(
      { id: automatizacion.id, usuarioId },
      { ...automatizacion, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();
    return this.limpiar(doc as Record<string, unknown>);
  }

  /** Borra una automatización. */
  async borrarAutomatizacion(id: string, usuarioId: string): Promise<void> {
    await conectar();
    await AutomatizacionModel.deleteOne({ id, usuarioId }).exec();
  }

  /**
   * Todas las automatizaciones activas de un usuario suscritas a un
   * evento concreto — usado por `automatizaciones-listener.ts`, nunca por
   * una ruta HTTP.
   */
  async listarAutomatizacionesActivasPorEvento(usuarioId: string, evento: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await AutomatizacionModel.find({ usuarioId, evento, activa: true }).lean().exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  // ── Contratos (Motor Documental, Incremento 12 — segundo tipo de documento) — aislados por usuarioId ──

  /**
   * Lista los contratos de un cliente, más recientes primero. A
   * diferencia de Presupuesto, un Contrato es siempre `DocumentoMC` puro
   * (sin `formato`/`contenidoLienzo`) — prueba real de que el núcleo del
   * Motor Documental (validación, procesado de recursos, mismo editor) se
   * reutiliza sin cambios para un tipo de documento distinto.
   */
  async listarContratosDeCliente(usuarioId: string, clienteId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await ContratoModel.find({ usuarioId, clienteId }).sort({ creado: -1 }).lean().exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  /** Crea o actualiza un contrato — mismo procesado de recursos (Base64 → almacenamiento externo) que un presupuesto en modo documento. */
  async guardarContrato(contrato: Record<string, unknown>, usuarioId: string): Promise<Record<string, unknown>> {
    await conectar();
    const anterior = await ContratoModel.findOne({ id: contrato.id, usuarioId }).lean().exec();
    const contenidoDocumento = await procesarRecursosDocumento(contrato.contenidoDocumento as DocumentoMC);
    const doc = await ContratoModel.findOneAndUpdate(
      { id: contrato.id, usuarioId },
      { ...contrato, contenidoDocumento, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();
    if (anterior) {
      await borrarRecursosDocumentoHuerfanos((anterior as any).contenidoDocumento, contenidoDocumento as DocumentoMC);
    }
    busEventos.publicar({
      nombre: 'contrato.guardado',
      usuarioId,
      entidadId: String(contrato.id),
      datos: { titulo: (contrato as any).titulo, clienteId: (contrato as any).clienteId },
    });
    return this.limpiar(doc as Record<string, unknown>);
  }

  /** Borra un contrato. */
  async borrarContrato(id: string, usuarioId: string): Promise<void> {
    await conectar();
    await ContratoModel.deleteOne({ id, usuarioId }).exec();
  }

  /**
   * Busca un cliente por coincidencia aproximada de nombre (substring,
   * insensible a mayúsculas) — mismo criterio de búsqueda difusa que ya usa
   * `listarFacturasDeProveedor`. Devuelve el primer resultado o `null`.
   * Pensada para que las herramientas de IA resuelvan "Juan" a un cliente
   * real sin que el modelo necesite conocer ids de Mongo.
   * @param usuarioId Propietario.
   * @param nombre Término de búsqueda.
   */
  async buscarClientePorNombre(usuarioId: string, nombre: string): Promise<{ id: string; nombre: string } | null> {
    await conectar();
    const escapado = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const doc = await ClienteModel.findOne({ usuarioId, nombre: { $regex: escapado, $options: 'i' } })
      .select('id nombre')
      .lean().exec() as any;
    return doc ? { id: doc.id, nombre: doc.nombre } : null;
  }

  // ── Productos/catálogo — aislados por usuarioId ──

  /**
   * Lista todos los productos del catálogo del usuario, sin paginar.
   * @param usuarioId Propietario.
   */
  async listarProductos(usuarioId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await ProductoModel.find({ usuarioId }).sort({ nombre: 1 }).lean().exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
  }

  /**
   * Crea o actualiza un producto del catálogo.
   * @param producto Datos del producto.
   * @param usuarioId Propietario.
   */
  async guardarProducto(producto: Record<string, unknown>, usuarioId: string): Promise<Record<string, unknown>> {
    await conectar();
    const doc = await ProductoModel.findOneAndUpdate(
      { id: producto.id, usuarioId },
      { ...producto, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();
    return this.limpiar(doc as Record<string, unknown>);
  }

  /**
   * Borra un producto del catálogo.
   * @param id Identificador del producto.
   * @param usuarioId Propietario.
   */
  async borrarProducto(id: string, usuarioId: string): Promise<void> {
    await conectar();
    await ProductoModel.deleteOne({ id, usuarioId }).exec();
  }

  /** Elimina los campos internos de Mongo (_id, __v) del documento. */
  /**
   * Elimina los campos internos de Mongo (`_id`, `__v`) y, si el documento
   * tiene fotos/adjuntos/dibujos, también `claveAlmacenamiento` de cada uno
   * (Incremento 1.7) — es un detalle interno del proveedor de
   * almacenamiento (necesario solo para poder borrar el archivo después),
   * sin ningún uso en el frontend.
   */
  private limpiar(doc: Record<string, unknown>): ClienteDoc {
    const { _id, __v, ...resto } = doc as any;
    for (const campo of ['fotos', 'adjuntos', 'dibujos']) {
      if (Array.isArray(resto[campo])) {
        resto[campo] = resto[campo].map(({ claveAlmacenamiento: _clave, ...item }: any) => item);
      }
    }
    return resto as ClienteDoc;
  }

  // ── Dibujos (módulo profesional de dibujo, Fase 2.1) ──────────────────────

  /**
   * Lista los dibujos del usuario, opcionalmente filtrados por cliente —
   * sin el campo `contenido` (el snapshot vectorial, potencialmente pesado):
   * la galería y el apartado "Dibujos" de la ficha solo necesitan miniatura
   * y metadatos para pintarse rápido, igual que `obtenerCliente` excluye
   * `adjuntos` por el mismo motivo.
   * @param usuarioId Propietario.
   * @param opciones Filtro opcional por cliente.
   */
  async listarDibujos(usuarioId: string, opciones?: { clienteId?: string; carpetaId?: string }): Promise<Record<string, unknown>[]> {
    await conectar();
    const filtro: Record<string, unknown> = { usuarioId };
    // `!== undefined` (no truthy) a propósito: clienteId/carpetaId === '' es un
    // filtro válido y distinto de "sin filtro" — así se listan por separado los
    // dibujos temporales (clienteId '') o sueltos dentro de un cliente (carpetaId '').
    if (opciones?.clienteId !== undefined) filtro.clienteId = opciones.clienteId;
    if (opciones?.carpetaId !== undefined) filtro.carpetaId = opciones.carpetaId;
    const docs = await DibujoModel.find(filtro).select('-contenido').sort({ actualizadoEn: -1 }).lean().exec();
    return docs.map((d) => this.limpiarDibujo(d as Record<string, unknown>));
  }

  /**
   * Devuelve un dibujo completo, incluyendo su contenido vectorial — se pide
   * aparte de `listarDibujos`, solo al abrir un dibujo concreto para editar.
   * @param id Identificador del dibujo.
   * @param usuarioId Propietario.
   */
  async obtenerDibujo(id: string, usuarioId: string): Promise<Record<string, unknown> | null> {
    await conectar();
    const doc = await DibujoModel.findOne({ id, usuarioId }).lean().exec();
    if (!doc) return null;
    return this.limpiarDibujo(doc as Record<string, unknown>);
  }

  /**
   * Crea o actualiza un dibujo del usuario. Sube la miniatura a
   * almacenamiento externo si llega en Base64 (mismo patrón que
   * fotos/adjuntos/facturas, Incremento 1.7) y borra la miniatura anterior
   * del almacenamiento si se reemplaza. Incrementa `version` en cada guardado.
   * @param dibujo Datos del dibujo.
   * @param usuarioId Propietario.
   */
  async guardarDibujo(dibujo: Record<string, unknown>, usuarioId: string): Promise<Record<string, unknown>> {
    await conectar();
    const anterior = await DibujoModel.findOne({ id: dibujo.id, usuarioId }).lean().exec() as any;

    const resultadoMiniatura = await subirSiEsBase64((dibujo as any).miniatura, 'dibujos-miniaturas');
    const miniatura = resultadoMiniatura ? resultadoMiniatura.url : (dibujo as any).miniatura;

    const ahora = new Date().toISOString();
    const doc = await DibujoModel.findOneAndUpdate(
      { id: dibujo.id, usuarioId },
      {
        ...dibujo,
        miniatura,
        usuarioId,
        creadoEn: anterior?.creadoEn ?? ahora,
        actualizadoEn: ahora,
        version: (anterior?.version ?? 0) + 1,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();

    if (anterior?.miniatura && anterior.miniatura !== miniatura) {
      const claveVieja = almacenamiento.claveDesdeUrl(anterior.miniatura);
      if (claveVieja) await almacenamiento.borrar(claveVieja).catch(() => {});
    }

    busEventos.publicar({
      nombre: 'dibujo.modificado',
      usuarioId,
      entidadId: String(dibujo.id),
      datos: { nombre: (dibujo as any).nombre, clienteId: (dibujo as any).clienteId },
    });

    return this.limpiarDibujo(doc as Record<string, unknown>);
  }

  /**
   * Borra un dibujo del usuario, incluyendo su miniatura del almacenamiento
   * externo si tenía una.
   * @param id Identificador del dibujo.
   * @param usuarioId Propietario.
   */
  async borrarDibujo(id: string, usuarioId: string): Promise<void> {
    await conectar();
    const doc = await DibujoModel.findOne({ id, usuarioId }).lean().exec() as any;
    if (doc?.miniatura) {
      const clave = almacenamiento.claveDesdeUrl(doc.miniatura);
      if (clave) await almacenamiento.borrar(clave).catch(() => {});
    }
    await DibujoModel.deleteOne({ id, usuarioId }).exec();
  }

  private limpiarDibujo(doc: Record<string, unknown>): Record<string, unknown> {
    const { _id, __v, ...resto } = doc as any;
    return resto;
  }

  /**
   * Duplica un dibujo existente con un nuevo id — copia también la
   * referencia a la miniatura ya subida (no hace falta volver a subirla,
   * ambos dibujos pueden apuntar a la misma hasta que uno se modifique) y
   * conserva la carpeta/cliente de origen.
   * @param id Dibujo a duplicar.
   * @param usuarioId Propietario.
   */
  async duplicarDibujo(id: string, usuarioId: string): Promise<Record<string, unknown> | null> {
    await conectar();
    const original = await DibujoModel.findOne({ id, usuarioId }).lean().exec() as any;
    if (!original) return null;
    const { _id, __v, ...resto } = original;
    const ahora = new Date().toISOString();
    const doc = await DibujoModel.create({
      ...resto,
      id: randomUUID(),
      nombre: `${original.nombre} (copia)`,
      version: 1,
      creadoEn: ahora,
      actualizadoEn: ahora,
    });
    return this.limpiarDibujo(doc.toObject());
  }

  /**
   * Lista las carpetas de dibujos de un cliente, más recientes primero.
   * @param usuarioId Propietario.
   * @param clienteId Ficha de cliente.
   */
  async listarCarpetas(usuarioId: string, clienteId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await CarpetaModel.find({ usuarioId, clienteId }).sort({ actualizadoEn: -1 }).lean().exec();
    return docs.map((c) => this.limpiarCarpeta(c as Record<string, unknown>));
  }

  /**
   * Crea una carpeta de dibujos dentro de un cliente. El nombre debe ser
   * único dentro de ese cliente (índice único en Mongo); si ya existe se
   * traduce el error de duplicado a un mensaje claro.
   * @param datos Carpeta a crear (id, clienteId, nombre).
   * @param usuarioId Propietario.
   */
  async crearCarpeta(datos: { id: string; clienteId: string; nombre: string }, usuarioId: string): Promise<Record<string, unknown>> {
    await conectar();
    const ahora = new Date().toISOString();
    try {
      const doc = await CarpetaModel.create({ ...datos, usuarioId, creadoEn: ahora, actualizadoEn: ahora });
      return this.limpiarCarpeta(doc.toObject());
    } catch (err: any) {
      if (err?.code === 11000) throw new ErrorDeNegocio('Ya existe una carpeta con ese nombre en este cliente.', 409);
      throw err;
    }
  }

  /**
   * Renombra una carpeta existente.
   * @param id Carpeta a renombrar.
   * @param nombre Nuevo nombre.
   * @param usuarioId Propietario.
   */
  async renombrarCarpeta(id: string, nombre: string, usuarioId: string): Promise<Record<string, unknown> | null> {
    await conectar();
    try {
      const doc = await CarpetaModel.findOneAndUpdate(
        { id, usuarioId },
        { nombre, actualizadoEn: new Date().toISOString() },
        { new: true }
      ).lean().exec();
      return doc ? this.limpiarCarpeta(doc as Record<string, unknown>) : null;
    } catch (err: any) {
      if (err?.code === 11000) throw new ErrorDeNegocio('Ya existe una carpeta con ese nombre en este cliente.', 409);
      throw err;
    }
  }

  /**
   * Borra una carpeta — solo si ya no contiene ningún dibujo, para evitar
   * pérdidas accidentales de documentación gráfica del cliente. El
   * llamante (ruta HTTP) traduce este mensaje a un 409.
   * @param id Carpeta a borrar.
   * @param usuarioId Propietario.
   */
  async borrarCarpeta(id: string, usuarioId: string): Promise<void> {
    await conectar();
    const numDibujos = await DibujoModel.countDocuments({ carpetaId: id, usuarioId }).exec();
    if (numDibujos > 0) {
      throw new ErrorDeNegocio(`La carpeta contiene ${numDibujos} dibujo(s) — muévelos o bórralos antes de borrar la carpeta.`, 409);
    }
    await CarpetaModel.deleteOne({ id, usuarioId }).exec();
  }

  private limpiarCarpeta(doc: Record<string, unknown>): Record<string, unknown> {
    const { _id, __v, ...resto } = doc as any;
    return resto;
  }

  /**
   * Crea una nueva instancia del servicio de presupuestos.
   */
  static from() {
    return new PresupuestosService();
  }
}
