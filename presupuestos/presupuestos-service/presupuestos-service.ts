import { ClienteModel, EmpresaModel, FacturaModel, conectar } from './cliente.model.js';

/** Estructura de una ficha de cliente tal como la maneja el servicio. */
export type ClienteDoc = Record<string, unknown> & { id: string };

/** Datos de empresa gestionados por el servicio. */
export type EmpresaDoc = {
  nombre: string;
  eslogan: string;
  logo: string;
};

/**
 * Servicio de presupuestos: gestiona la persistencia de clientes, facturas y
 * empresa en MongoDB, siempre aislados por `usuarioId`.
 */
export class PresupuestosService {
  /**
   * Devuelve todas las fichas de cliente del usuario indicado.
   * @param usuarioId Propietario de los datos.
   */
  async listarClientes(usuarioId: string): Promise<ClienteDoc[]> {
    await conectar();
    const docs = await ClienteModel.find({ usuarioId }).lean().exec();
    return docs.map((d) => this.limpiar(d));
  }

  /**
   * Crea o actualiza (upsert) una ficha de cliente para el usuario indicado.
   * @param cliente La ficha completa del cliente.
   * @param usuarioId Propietario de los datos.
   */
  async guardarCliente(cliente: ClienteDoc, usuarioId: string): Promise<ClienteDoc> {
    await conectar();
    const doc = await ClienteModel.findOneAndUpdate(
      { id: cliente.id, usuarioId },
      { ...cliente, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();
    return this.limpiar(doc);
  }

  /**
   * Devuelve una ficha completa de cliente (solo si pertenece al usuario).
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
   * Borra una ficha de cliente (solo si pertenece al usuario).
   * @param id Identificador del cliente.
   * @param usuarioId Propietario de los datos.
   */
  async borrarCliente(id: string, usuarioId: string): Promise<void> {
    await conectar();
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
    };
  }

  /**
   * Lista todas las facturas del usuario.
   * @param usuarioId Propietario.
   */
  async listarFacturas(usuarioId: string): Promise<Record<string, unknown>[]> {
    await conectar();
    const docs = await FacturaModel.find({ usuarioId }).sort({ creado: -1 }).lean().exec();
    return docs.map((d) => {
      const { imagen: _img, ...rest } = this.limpiar(d as Record<string, unknown>);
      return rest;
    });
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
    const doc = await FacturaModel.findOneAndUpdate(
      { id: factura.id, usuarioId },
      { ...factura, usuarioId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean().exec();
    return this.limpiar(doc as Record<string, unknown>);
  }

  /**
   * Borra una factura del usuario.
   * @param id Identificador de la factura.
   * @param usuarioId Propietario.
   */
  async borrarFactura(id: string, usuarioId: string): Promise<void> {
    await conectar();
    await FacturaModel.deleteOne({ id, usuarioId }).exec();
  }

  /** Elimina los campos internos de Mongo (_id, __v) del documento. */
  private limpiar(doc: Record<string, unknown>): ClienteDoc {
    const { _id, __v, ...resto } = doc as any;
    return resto as ClienteDoc;
  }

  /**
   * Crea una nueva instancia del servicio de presupuestos.
   */
  static from() {
    return new PresupuestosService();
  }
}
