import { randomUUID } from 'node:crypto';
import { ClienteModel, EmpresaModel, FacturaModel, ProveedorModel, ProductoModel, DibujoModel, CarpetaModel, NotaModel, PresupuestoModel, conectar } from './cliente.model.js';
import { almacenamiento } from './almacenamiento.service.js';
import { busEventos } from './eventos.service.js';

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
  telefono: string;
  email: string;
  iban: string;
  condicionesPagoDefecto: string;
  validezDiasDefecto: number;
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
      telefono: (doc as any).telefono || '',
      email: (doc as any).email || '',
      iban: (doc as any).iban || '',
      condicionesPagoDefecto: (doc as any).condicionesPagoDefecto || '',
      validezDiasDefecto: (doc as any).validezDiasDefecto || 30,
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
      telefono: (doc as any).telefono || '',
      email: (doc as any).email || '',
      iban: (doc as any).iban || '',
      condicionesPagoDefecto: (doc as any).condicionesPagoDefecto || '',
      validezDiasDefecto: (doc as any).validezDiasDefecto || 30,
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
      const { imagen: _img, ...rest } = this.limpiar(d as Record<string, unknown>);
      return rest;
    });
    return { items, total };
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
      const { imagen: _img, ...rest } = this.limpiar(d as Record<string, unknown>);
      return rest;
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
      const { imagen: _img, ...rest } = this.limpiar(d as Record<string, unknown>);
      return rest;
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
      const { imagen: _img, ...rest } = this.limpiar(d as Record<string, unknown>);
      return rest;
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
  async resumenPorProveedorTexto(usuarioId: string): Promise<{ proveedor: string; totalGastado: number; numFacturas: number }[]> {
    await conectar();
    const filas = await FacturaModel.aggregate([
      { $match: { usuarioId, tipo: 'gasto', proveedor: { $nin: ['', null] } } },
      { $group: { _id: '$proveedor', totalGastado: { $sum: '$importe' }, numFacturas: { $sum: 1 } } },
    ]).exec();
    return (filas as any[]).map((f) => ({ proveedor: f._id, totalGastado: f.totalGastado, numFacturas: f.numFacturas }));
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

    const doc = await FacturaModel.findOneAndUpdate(
      { id: factura.id, usuarioId },
      { ...factura, imagen, imagenes, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();

    if (anterior) {
      if (anterior.imagen && anterior.imagen !== imagen) {
        const claveVieja = almacenamiento.claveDesdeUrl(anterior.imagen);
        if (claveVieja) await almacenamiento.borrar(claveVieja).catch(() => {});
      }
      const imagenesNuevas = new Set(imagenes ?? []);
      for (const img of anterior.imagenes ?? []) {
        if (!imagenesNuevas.has(img)) {
          const clave = almacenamiento.claveDesdeUrl(img);
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
      const urls = [doc.imagen, ...(doc.imagenes ?? [])].filter(Boolean);
      for (const url of urls) {
        const clave = almacenamiento.claveDesdeUrl(url);
        if (clave) await almacenamiento.borrar(clave).catch(() => {});
      }
    }
    await FacturaModel.deleteOne({ id, usuarioId }).exec();
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
    const contenidoLienzo = await procesarArchivosLienzo(presupuesto.contenidoLienzo);
    const doc = await PresupuestoModel.findOneAndUpdate(
      { id: presupuesto.id, usuarioId },
      { ...presupuesto, contenidoLienzo, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();
    if (anterior) await borrarArchivosLienzoHuerfanos((anterior as any).contenidoLienzo, contenidoLienzo);
    busEventos.publicar({
      nombre: 'presupuesto.creado',
      usuarioId,
      entidadId: String(presupuesto.id),
      datos: { titulo: (presupuesto as any).titulo, clienteId: (presupuesto as any).clienteId, precioTotal: (presupuesto as any).precioTotal },
    });
    return this.limpiar(doc as Record<string, unknown>);
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
