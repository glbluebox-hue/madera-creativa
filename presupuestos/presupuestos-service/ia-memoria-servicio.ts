import { randomUUID } from 'node:crypto';
import { MemoriaModel } from './ia-memoria.model.js';
import { conectar } from './cliente.model.js';
import { logger } from './logger.service.js';
import type { AmbitoMemoria, TipoMemoria, MemoriaEntrada, RecuperadorMemoria } from './ia-memoria.js';

/**
 * Tope duro de entradas activas por `(usuarioId, ambito, entidadId)` — se
 * aplica desde el día 1, sin esperar a verlo en producción, para contener el
 * crecimiento de la colección y del contexto que llega a construir a partir
 * de ella cualquier capacidad futura que la consulte.
 */
const TOPE_ENTRADAS_POR_AMBITO = 30;

export type DatosNuevaMemoria = {
  usuarioId: string;
  ambito: AmbitoMemoria;
  /** Vacío/omitido si `ambito === 'usuario'`. */
  entidadId?: string;
  tipo: TipoMemoria;
  /** Si se indica, la entrada se fusiona (upsert) con cualquier otra que ya tenga la misma clave para este usuario. */
  clave?: string;
  contenido: string;
  capacidadOrigen: string;
  origen?: 'ia' | 'usuario';
};

function limpiar(doc: Record<string, unknown>): MemoriaEntrada {
  const { _id, __v, caduca: _caduca, ...resto } = doc as any;
  return resto as MemoriaEntrada;
}

/** Borra las entradas más antiguas/menos usadas por encima de `TOPE_ENTRADAS_POR_AMBITO` — fire-and-forget, nunca bloquea a quien guarda. */
async function podar(usuarioId: string, ambito: AmbitoMemoria, entidadId: string): Promise<void> {
  const total = await MemoriaModel.countDocuments({ usuarioId, ambito, entidadId }).exec();
  const exceso = total - TOPE_ENTRADAS_POR_AMBITO;
  if (exceso <= 0) return;
  const candidatas = await MemoriaModel.find({ usuarioId, ambito, entidadId })
    .sort({ ultimoUso: 1, actualizado: 1 }) // menos usadas y más antiguas primero (LRU)
    .limit(exceso)
    .select('_id')
    .lean().exec();
  const ids = (candidatas as any[]).map((c) => c._id);
  if (ids.length) await MemoriaModel.deleteMany({ _id: { $in: ids } }).exec();
}

/** Crea una entrada de memoria, o la fusiona con una existente si se indica `clave`. */
export async function guardarMemoria(datos: DatosNuevaMemoria): Promise<MemoriaEntrada> {
  await conectar();
  const ahora = new Date().toISOString();
  const entidadId = datos.entidadId ?? '';

  let doc: Record<string, unknown>;
  if (datos.clave) {
    doc = await MemoriaModel.findOneAndUpdate(
      { usuarioId: datos.usuarioId, clave: datos.clave },
      {
        $set: {
          ambito: datos.ambito, entidadId, tipo: datos.tipo, contenido: datos.contenido,
          capacidadOrigen: datos.capacidadOrigen, origen: datos.origen ?? 'ia', actualizado: ahora,
        },
        $setOnInsert: { id: randomUUID(), usuarioId: datos.usuarioId, clave: datos.clave, creado: ahora, vecesUsado: 0 },
      },
      { upsert: true, new: true }
    ).lean().exec() as Record<string, unknown>;
  } else {
    const creado = await MemoriaModel.create({
      id: randomUUID(), usuarioId: datos.usuarioId, ambito: datos.ambito, entidadId,
      tipo: datos.tipo, contenido: datos.contenido, capacidadOrigen: datos.capacidadOrigen,
      origen: datos.origen ?? 'ia', vecesUsado: 0, creado: ahora, actualizado: ahora,
    });
    doc = creado.toObject();
  }

  podar(datos.usuarioId, datos.ambito, entidadId).catch((err) =>
    logger.warn({ err, usuarioId: datos.usuarioId, ambito: datos.ambito }, '[ia-memoria] La poda de entradas antiguas falló')
  );

  return limpiar(doc);
}

/** Recupera memoria por ámbito+entidad, más reciente primero — implementa `RecuperadorMemoria`. */
export async function recuperarMemoria(params: {
  usuarioId: string; ambito: AmbitoMemoria; entidadId?: string; tipo?: TipoMemoria; limite: number;
}): Promise<MemoriaEntrada[]> {
  await conectar();
  const ahora = new Date().toISOString();
  const filtro: Record<string, unknown> = {
    usuarioId: params.usuarioId,
    ambito: params.ambito,
    entidadId: params.entidadId ?? '',
    $or: [{ caduca: '' }, { caduca: { $gt: ahora } }],
  };
  if (params.tipo) filtro.tipo = params.tipo;

  const docs = await MemoriaModel.find(filtro).sort({ actualizado: -1 }).limit(params.limite).lean().exec();

  const ids = (docs as any[]).map((d) => d.id);
  if (ids.length) {
    MemoriaModel.updateMany({ id: { $in: ids } }, { $inc: { vecesUsado: 1 }, $set: { ultimoUso: ahora } })
      .exec()
      .catch((err) => logger.warn({ err, usuarioId: params.usuarioId }, '[ia-memoria] No se pudo actualizar el uso de memoria'));
  }

  return (docs as Record<string, unknown>[]).map(limpiar);
}

export const recuperadorMemoria: RecuperadorMemoria = { recuperar: recuperarMemoria };
