import { randomUUID } from 'node:crypto';
import { ClienteModel, EmpresaModel, FacturaModel, ProveedorModel, ProductoModel, DibujoModel, CarpetaModel, NotaModel, PresupuestoModel, PlantillaModel, RecursoModel, ComponenteModel, AutomatizacionModel, ContratoModel, GastoPeriodicoModel, conectar } from './cliente.model.js';
import { UsuarioModel, conectarUsuarios } from './usuario.model.js';
import { almacenamiento } from './almacenamiento.service.js';
import { busEventos } from './eventos.service.js';
import { enviarNotificacion } from './push.service.js';
import type { PushSub } from './push.service.js';
import { logger } from './logger.service.js';
import { procesarRecursosDocumento, borrarRecursosDocumentoHuerfanos } from './documento-procesar-recursos.js';
import { subirORecuperarRecurso } from './documento-recursos-biblioteca.js';
import type { DocumentoMC, TemaMC, RecursoMC } from './documento-modelo.js';

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

/** Estructura de una ficha de cliente tal como la maneja el servicio. */
export type ClienteDoc = Record<string, unknown> & { id: string };

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

/** Sube los dibujos nuevos (Base64) de un cliente; deja los ya subidos tal cual. */
async function procesarDibujos(dibujos: any[] | undefined): Promise<any[]> {
  return Promise.all((dibujos ?? []).map(async (d) => {
    const resultado = await subirSiEsBase64(d.dataUrl, 'dibujos');
    if (!resultado) return d;
    return { ...d, dataUrl: resultado.url, claveAlmacenamiento: resultado.clave, tamano: resultado.metadatos.tamano, tipoMime: resultado.metadatos.tipoMime, subidoEn: resultado.metadatos.subidoEn };
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
  /** REPEP activo (exención de IGIC por bajo volumen, solo Canarias) — decisión del usuario, nunca inferida. */
  repepActivo: boolean;
};

/**
 * Servicio de presupuestos: gestiona la persistencia de clientes, facturas y
 * empresa en MongoDB, siempre aislados por `usuarioId`.
 */
export class PresupuestosService {
  /**
   * Devuelve una página de fichas de cliente del usuario indicado, ordenadas
   * por fecha de creación descendente (Incremento 1.5).
   *
   * Excluye explícitamente los campos pesados (fotos, adjuntos, dibujos,
   * estancias, notas, movimientos, horas, tareas) — la vista de lista
   * (`ListaClientes`) solo necesita nombre/proyecto/estado, y algunos
   * clientes reales tienen documentos de varios MB por fotos históricas
   * embebidas. Sin esta exclusión, cada página tarda varios segundos en
   * transferirse desde Atlas y supera el timeout del proxy de desarrollo
   * (síntoma real observado: "Sin conexión con el servidor" al abrir
   * Clientes, aunque el servidor sí respondía, solo que tarde). La ficha
   * completa (con fotos/adjuntos) se sigue pidiendo aparte con
   * `obtenerCliente(id)` cuando el usuario abre una ficha concreta.
   * @param usuarioId Propietario de los datos.
   * @param opciones Página (1-indexada) y tamaño de página.
   */
  async listarClientes(usuarioId: string, opciones: { pagina: number; limite: number }): Promise<{ items: ClienteDoc[]; total: number }> {
    await conectar();
    const salto = (opciones.pagina - 1) * opciones.limite;
    const [docs, total] = await Promise.all([
      ClienteModel.find({ usuarioId })
        .select('-fotos -adjuntos -dibujos -estancias -notas -movimientos -horas -tareas')
        .sort({ creado: -1 })
        .skip(salto)
        .limit(opciones.limite)
        .lean()
        .exec(),
      ClienteModel.countDocuments({ usuarioId }).exec(),
    ]);
    return { items: docs.map((d) => this.limpiar(d)), total };
  }

  /**
   * Devuelve únicamente `id` y `nombre` de todos los clientes del usuario,
   * sin paginar — pensado para selectores/autocompletados (p. ej. el
   * desplegable de cliente al crear una factura), donde se necesita poder
   * referenciar cualquier cliente, no solo los de la página cargada. Al no
   * incluir fotos/adjuntos/dibujos, el payload es pequeño incluso con miles
   * de clientes.
   * @param usuarioId Propietario de los datos.
   */
  async listarClientesNombres(usuarioId: string): Promise<{ id: string; nombre: string }[]> {
    await conectar();
    const docs = await ClienteModel.find({ usuarioId }).select('id nombre').lean().exec();
    return (docs as any[]).map((d) => ({ id: d.id, nombre: d.nombre }));
  }

  /**
   * Devuelve un resumen ligero (sin fotos/adjuntos/dibujos/movimientos) de
   * todos los clientes del usuario, sin paginar — para vistas que necesitan
   * organizar el conjunto completo (p. ej. `SeccionPresupuestos`, agrupada
   * por año y por carpeta de estado). Al excluir los campos pesados, el
   * payload es pequeño incluso con muchos clientes.
   * @param usuarioId Propietario de los datos.
   */
  async listarClientesResumen(usuarioId: string): Promise<
    { id: string; nombre: string; proyecto: string; estado: string; presupuesto: number; creado: string }[]
  > {
    await conectar();
    const docs = await ClienteModel.find({ usuarioId })
      .select('id nombre proyecto estado presupuesto creado')
      .lean()
      .exec();
    return (docs as any[]).map((d) => ({
      id: d.id, nombre: d.nombre, proyecto: d.proyecto || '',
      estado: d.estado, presupuesto: d.presupuesto || 0, creado: d.creado,
    }));
  }

  /**
   * Crea o actualiza (upsert) una ficha de cliente para el usuario indicado.
   * @param cliente La ficha completa del cliente.
   * @param usuarioId Propietario de los datos.
   */
  async guardarCliente(cliente: ClienteDoc, usuarioId: string): Promise<ClienteDoc> {
    await conectar();
    const anterior = await ClienteModel.findOne({ id: cliente.id, usuarioId }).lean().exec() as any;

    // Sube a almacenamiento externo cualquier foto/adjunto/dibujo nuevo
    // (Base64) — los que ya eran una URL de un guardado anterior no se
    // tocan (Incremento 1.7). El contrato de la API no cambia: el frontend
    // sigue enviando Base64 igual que siempre.
    const fotos = await procesarFotos((cliente as any).fotos);
    const adjuntos = await procesarAdjuntos((cliente as any).adjuntos);
    const dibujos = await procesarDibujos((cliente as any).dibujos);

    const doc = await ClienteModel.findOneAndUpdate(
      { id: cliente.id, usuarioId },
      { ...cliente, fotos, adjuntos, dibujos, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();

    if (anterior) {
      await borrarBlobsHuerfanos(anterior.fotos, fotos);
      await borrarBlobsHuerfanos(anterior.adjuntos, adjuntos);
      await borrarBlobsHuerfanos(anterior.dibujos, dibujos);
    }

    busEventos.publicar({
      nombre: anterior ? 'cliente.actualizado' : 'cliente.creado',
      usuarioId,
      entidadId: cliente.id,
      datos: { nombre: (cliente as any).nombre, estado: (cliente as any).estado },
    });

    return this.limpiar(doc);
  }

  /**
   * Devuelve una ficha de cliente (solo si pertenece al usuario), sin los
   * adjuntos — algunos clientes reales tienen archivos adjuntos históricos
   * de varios MB embebidos (anteriores a la compresión de imágenes de la
   * Fase 1), y transferirlos siempre para abrir la ficha hacía que la
   * apertura tardara varios segundos y superara el timeout del proxy de
   * desarrollo (síntoma real: la ficha no llegaba a abrirse). Los adjuntos
   * se piden aparte con `obtenerAdjuntosCliente`, en segundo plano, sin
   * bloquear la apertura de la ficha.
   * @param id Identificador del cliente.
   * @param usuarioId Propietario de los datos.
   */
  async obtenerCliente(id: string, usuarioId: string): Promise<ClienteDoc | null> {
    await conectar();
    const doc = await ClienteModel.findOne({ id, usuarioId }).select('-adjuntos').lean().exec();
    if (!doc) return null;
    return this.limpiar(doc as Record<string, unknown>);
  }

  /**
   * Devuelve únicamente los adjuntos de un cliente (solo si pertenece al
   * usuario) — ver el comentario de `obtenerCliente` sobre por qué se
   * piden aparte.
   * @param id Identificador del cliente.
   * @param usuarioId Propietario de los datos.
   */
  async obtenerAdjuntosCliente(id: string, usuarioId: string): Promise<unknown[]> {
    await conectar();
    const doc = await ClienteModel.findOne({ id, usuarioId }).select('adjuntos').lean().exec();
    if (!doc) return [];
    return this.limpiar(doc as Record<string, unknown>).adjuntos as unknown[] ?? [];
  }

  /**
   * Borra una ficha de cliente (solo si pertenece al usuario).
   * @param id Identificador del cliente.
   * @param usuarioId Propietario de los datos.
   */
  async borrarCliente(id: string, usuarioId: string): Promise<void> {
    await conectar();
    const doc = await ClienteModel.findOne({ id, usuarioId }).lean().exec() as any;
    if (doc) {
      const todos = [...(doc.fotos ?? []), ...(doc.adjuntos ?? []), ...(doc.dibujos ?? [])];
      for (const item of todos) {
        if (item.claveAlmacenamiento) await almacenamiento.borrar(item.claveAlmacenamiento).catch(() => {});
      }
    }
    await ClienteModel.deleteOne({ id, usuarioId }).exec();
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
      repepActivo: !!(doc as any).repepActivo,
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
      repepActivo: !!(doc as any).repepActivo,
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
      FacturaModel.find(filtro).sort({ creado: -1 }).skip(salto).limit(opciones.limite).lean().exec(),
      FacturaModel.countDocuments(filtro).exec(),
    ]);
    const items = docs.map((d) => {
      const limpio = this.limpiar(d as Record<string, unknown>) as Record<string, unknown>;
      const tieneDocumento = this.tieneDocumentoFactura(limpio);
      const { imagen: _img, ...rest } = limpio;
      return { ...rest, tieneDocumento };
    });
    return { items, total };
  }

  /**
   * Indica si una factura tiene algún documento adjunto (imagen/PDF, en
   * cualquiera de sus formatos históricos), sin exponer el contenido en sí
   * — usado en el listado paginado, donde `imagen` se omite por peso pero
   * la lista sigue necesitando saber si mostrar los botones de Ver/Descargar.
   */
  private tieneDocumentoFactura(d: Record<string, unknown>): boolean {
    return Boolean(
      (Array.isArray(d.paginas) && d.paginas.length) ||
      (Array.isArray(d.imagenes) && d.imagenes.length) ||
      d.imagen ||
      d.pdfOriginalUrl
    );
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
    const docs = await FacturaModel.find({
      usuarioId,
      fecha: { $gte: `${anio}-01-01`, $lte: `${anio}-12-31` },
    }).sort({ creado: -1 }).lean().exec();
    return docs.map((d) => {
      const limpio = this.limpiar(d as Record<string, unknown>) as Record<string, unknown>;
      const tieneDocumento = this.tieneDocumentoFactura(limpio);
      const { imagen: _img, ...rest } = limpio;
      return { ...rest, tieneDocumento };
    });
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
    const docs = await FacturaModel.find({
      usuarioId,
      fecha: { $gte: `${anio}-${String(mesInicio).padStart(2, '0')}-01`, $lte: `${anio}-${String(mesFin).padStart(2, '0')}-31` },
    }).sort({ creado: -1 }).lean().exec();
    return docs.map((d) => {
      const limpio = this.limpiar(d as Record<string, unknown>) as Record<string, unknown>;
      const tieneDocumento = this.tieneDocumentoFactura(limpio);
      const { imagen: _img, ...rest } = limpio;
      return { ...rest, tieneDocumento };
    });
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
    const docs = await FacturaModel.find({ usuarioId, clienteId }).sort({ creado: -1 }).lean().exec();
    return docs.map((d) => {
      const limpio = this.limpiar(d as Record<string, unknown>) as Record<string, unknown>;
      const tieneDocumento = this.tieneDocumentoFactura(limpio);
      const { imagen: _img, ...rest } = limpio;
      return { ...rest, tieneDocumento };
    });
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
    const docs = await FacturaModel.find({
      usuarioId,
      $or: [{ proveedor: { $regex: escapado, $options: 'i' } }, { proveedor: nombreProveedor }],
    }).sort({ creado: -1 }).lean().exec();
    return docs.map((d) => {
      const limpio = this.limpiar(d as Record<string, unknown>) as Record<string, unknown>;
      const tieneDocumento = this.tieneDocumentoFactura(limpio);
      const { imagen: _img, ...rest } = limpio;
      return { ...rest, tieneDocumento };
    });
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
    return this.limpiar(doc as Record<string, unknown>);
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
    // (Incremento 1.7). `imagen`/`imagenes` no tienen un sitio propio donde
    // guardar la clave de almacenamiento (son solo cadenas, no
    // subdocumentos) — para poder limpiar la imagen anterior si se
    // reemplaza, se deriva la clave desde la propia URL con
    // `claveDesdeUrl()`.
    const resultadoImagen = await subirSiEsBase64((factura as any).imagen, 'facturas');
    const imagen = resultadoImagen ? resultadoImagen.url : (factura as any).imagen;

    const imagenesOriginal = (factura as any).imagenes;
    const imagenes = Array.isArray(imagenesOriginal)
      ? await Promise.all(imagenesOriginal.map(async (img: string) => {
          const r = await subirSiEsBase64(img, 'facturas');
          return r ? r.url : img;
        }))
      : imagenesOriginal;

    // Igual tratamiento para el PDF original (si la factura se subió
    // directamente como PDF) y para `paginas` (el documento completo en
    // orden, mezclando imagen/PDF) — ambos campos nuevos de la Fase
    // Facturas Profesional, mismo patrón que `imagen`/`imagenes`.
    const resultadoPdfOriginal = await subirSiEsBase64((factura as any).pdfOriginalUrl, 'facturas');
    const pdfOriginalUrl = resultadoPdfOriginal ? resultadoPdfOriginal.url : (factura as any).pdfOriginalUrl;

    const paginasOriginal = (factura as any).paginas;
    const paginas = Array.isArray(paginasOriginal)
      ? await Promise.all(paginasOriginal.map(async (p: { tipo: string; url: string }) => {
          const r = await subirSiEsBase64(p.url, 'facturas');
          return r ? { ...p, url: r.url } : p;
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
      { ...factura, imagen, imagenes, pdfOriginalUrl, paginas, cifNif, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();

    if (anterior) {
      if (anterior.imagen && anterior.imagen !== imagen) {
        const claveVieja = almacenamiento.claveDesdeUrl(anterior.imagen);
        if (claveVieja) await almacenamiento.borrar(claveVieja).catch(() => {});
      }
      if (anterior.pdfOriginalUrl && anterior.pdfOriginalUrl !== pdfOriginalUrl) {
        const claveVieja = almacenamiento.claveDesdeUrl(anterior.pdfOriginalUrl);
        if (claveVieja) await almacenamiento.borrar(claveVieja).catch(() => {});
      }
      const imagenesNuevas = new Set(imagenes ?? []);
      for (const img of anterior.imagenes ?? []) {
        if (!imagenesNuevas.has(img)) {
          const clave = almacenamiento.claveDesdeUrl(img);
          if (clave) await almacenamiento.borrar(clave).catch(() => {});
        }
      }
      const paginasNuevasUrls = new Set((paginas ?? []).map((p: { url: string }) => p.url));
      for (const p of anterior.paginas ?? []) {
        if (!paginasNuevasUrls.has(p.url)) {
          const clave = almacenamiento.claveDesdeUrl(p.url);
          if (clave) await almacenamiento.borrar(clave).catch(() => {});
        }
      }
    }

    busEventos.publicar({
      nombre: 'factura.guardada',
      usuarioId,
      entidadId: String(factura.id),
      datos: { tipo: (factura as any).tipo, importe: (factura as any).importe, clienteId: (factura as any).clienteId },
    });

    return this.limpiar(doc as Record<string, unknown>);
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
      const urls = [
        doc.imagen, doc.pdfOriginalUrl,
        ...(doc.imagenes ?? []),
        ...((doc.paginas ?? []) as { url: string }[]).map((p) => p.url),
      ].filter(Boolean);
      for (const url of urls) {
        const clave = almacenamiento.claveDesdeUrl(url);
        if (clave) await almacenamiento.borrar(clave).catch(() => {});
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
    const facturas = (docs as any[]).map((d) => this.limpiar(d as Record<string, unknown>));

    const [empresa, gastosPeriodicos] = await Promise.all([
      EmpresaModel.findOne({ usuarioId }).lean().exec() as Promise<any>,
      GastoPeriodicoModel.find({ usuarioId, activo: true }).lean().exec() as Promise<any[]>,
    ]);

    const ingresos = facturas.filter((f) => f.tipo === 'ingreso');
    const gastos = facturas.filter((f) => f.tipo === 'gasto');
    const NOMBRES_TRIMESTRE = ['1.er', '2.º', '3.er', '4.º'];
    const periodoLabel = `${NOMBRES_TRIMESTRE[trimestre - 1]} trimestre ${anio}`;

    const gastosPeriodicosDelTrimestre = (gastosPeriodicos ?? []).map((g) => ({
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
    const docs = await PresupuestoModel.find({ usuarioId, clienteId }).sort({ creado: -1 }).lean().exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
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
    const docs = await PresupuestoModel.find({ usuarioId })
      .select('-contenidoLienzo')
      .sort({ creado: -1 })
      .lean()
      .exec();
    return docs.map((d) => this.limpiar(d as Record<string, unknown>));
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
   */
  private async ejecutarConsecuenciasAceptacion(presupuesto: Record<string, unknown>, usuarioId: string): Promise<void> {
    const clienteId = presupuesto.clienteId as string;
    const cliente = await ClienteModel.findOne({ id: clienteId, usuarioId }).lean().exec() as any;
    if (!cliente) {
      logger.warn({ presupuestoId: presupuesto.id, clienteId }, '[presupuesto.aceptar] El cliente del presupuesto ya no existe — se omiten las consecuencias sobre el proyecto.');
      return;
    }

    const cambios: Record<string, unknown> = { estado: 'en_curso' };
    if (!cliente.tareas || cliente.tareas.length === 0) {
      cambios.tareas = TAREAS_BASE_PRESUPUESTO_ACEPTADO.map((texto) => ({ id: randomUUID(), texto, hecha: false }));
    }
    if (!cliente.presupuesto) {
      cambios.presupuesto = (presupuesto.precioTotal as number) || 0;
    }
    await ClienteModel.findOneAndUpdate({ id: clienteId, usuarioId }, { $set: cambios }).exec();

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
