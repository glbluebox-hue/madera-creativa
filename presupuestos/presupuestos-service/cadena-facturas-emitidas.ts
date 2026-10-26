import { createHash } from 'node:crypto';
import { Schema, model, models, Model } from 'mongoose';
import { conectar } from './cliente.model.js';
import { FacturaEmitidaModel } from './factura-emitida.model.js';

/**
 * Cadena de integridad de facturas emitidas (SIF, Orden HAC/1177/2024,
 * algoritmo SHA-256) — cada factura, al emitirse, incluye en su propio
 * hash el hash de la factura anterior. Si alguien edita el contenido de
 * una factura ya emitida después del hecho, su hash recalculado ya no
 * coincide con el `hashAnterior` que guarda la siguiente factura de la
 * cadena — la manipulación queda detectable (ver el test de este mismo
 * módulo).
 *
 * La posición en la cadena (`secuenciaCadena`) es un contador PROPIO,
 * independiente de `numero` (que resetea cada año, ver
 * `numeracion-facturas-emitidas.ts`) — así el orden de la cadena nunca es
 * ambiguo en un cambio de año ni ante dos emisiones casi simultáneas: cada
 * una reclama atómicamente su posición exacta antes de buscar la anterior.
 */

const SecuenciaCadenaFacturaEmitidaSchema = new Schema({
  usuarioId: { type: String, required: true, unique: true, index: true },
  ultimaSecuencia: { type: Number, required: true, default: 0 },
});
export const SecuenciaCadenaFacturaEmitidaModel: Model<any> =
  models.SecuenciaCadenaFacturaEmitida || model('SecuenciaCadenaFacturaEmitida', SecuenciaCadenaFacturaEmitidaSchema);

const MAX_REINTENTOS = 20;

/** Reclama, de forma atómica, la siguiente posición en la cadena para `usuarioId` — mismo patrón `$inc`+`upsert`+reintento ante `E11000` que `reclamarNumeroFacturaEmitida`. */
export async function reclamarSecuenciaCadena(usuarioId: string): Promise<number> {
  await conectar();
  // Mismo motivo que en `numeracion-facturas-emitidas.ts` — esperar a que
  // el índice único `{usuarioId}` termine de construirse antes de la
  // primera ráfaga concurrente, o el `upsert` puede crear documentos
  // duplicados y perder posiciones de la cadena.
  await SecuenciaCadenaFacturaEmitidaModel.init();
  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    try {
      const actualizado = await SecuenciaCadenaFacturaEmitidaModel.findOneAndUpdate(
        { usuarioId },
        { $inc: { ultimaSecuencia: 1 } },
        { upsert: true, new: true }
      ).exec() as any;
      return actualizado.ultimaSecuencia;
    } catch (err: any) {
      if (err?.code === 11000) continue;
      throw err;
    }
  }
  throw new Error(`No se pudo asignar una posición en la cadena de facturas emitidas para ${usuarioId} tras ${MAX_REINTENTOS} intentos.`);
}

/** El hash de la factura con `secuenciaCadena === secuencia - 1` — `''` (raíz de la cadena) si `secuencia === 1` o no se encuentra (no debería ocurrir salvo dato corrupto). */
export async function obtenerHashAnteriorPorSecuencia(usuarioId: string, secuencia: number): Promise<string> {
  if (secuencia <= 1) return '';
  await conectar();
  const anterior = await FacturaEmitidaModel.findOne({ usuarioId, secuenciaCadena: secuencia - 1 }).select('hash').lean().exec() as any;
  return anterior?.hash || '';
}

export type DatosHashFacturaEmitida = {
  nifEmisor: string;
  numeroFormateado: string;
  fechaEmision: string;
  naturaleza: 'normal' | 'rectificativa';
  importeTotal: number;
  hashAnterior: string;
};

/**
 * Hash SHA-256 de una factura emitida, sobre: NIF emisor, número+serie
 * formateado, fecha de emisión, naturaleza (normal/rectificativa), importe
 * total — más el hash de la factura anterior en la cadena. Cadena canónica
 * con separador `|`, campos en orden fijo — cualquier cambio de orden o de
 * formato (p. ej. cómo se redondea el importe) rompería la comparación con
 * hashes ya calculados, así que esta función es la única fuente de verdad
 * de ese formato en toda la aplicación.
 */
export function calcularHashFacturaEmitida(datos: DatosHashFacturaEmitida): string {
  const importeCanonico = datos.importeTotal.toFixed(2);
  const cadena = [
    datos.nifEmisor,
    datos.numeroFormateado,
    datos.fechaEmision,
    datos.naturaleza,
    importeCanonico,
    datos.hashAnterior,
  ].join('|');
  return createHash('sha256').update(cadena).digest('hex');
}
