import { Schema, model, models } from 'mongoose';
import type { Model } from 'mongoose';

/**
 * Registro de un borrado de archivo en el almacenamiento (R2) que falló y
 * queda pendiente de reintento (Incremento "Facturas privadas", 27/08/2026).
 *
 * Sustituye al antiguo `.catch(() => {})` de `borrarFactura()`/`guardarFactura()`
 * (reemplazo de imagen) — petición explícita del usuario: un fallo de
 * borrado no debe perderse en silencio. Solo guarda la clave técnica del
 * objeto y el mensaje de error — nunca el contenido del archivo ni datos
 * personales de la factura a la que pertenecía.
 */
const BorradoPendienteSchema = new Schema({
  /** Clave interna del objeto en el almacenamiento (`<carpeta>/<uuid>`). */
  clave: { type: String, required: true, unique: true, index: true },
  intentos: { type: Number, required: true, default: 0 },
  ultimoError: { type: String, default: '' },
  creado: { type: String, required: true },
  actualizado: { type: String, required: true },
  /**
   * Dueño + tamaño del archivo (cuota de almacenamiento, 05/09/2026) —
   * opcionales: un borrado pendiente de ANTES de esta función no los
   * tiene, y no pasa nada — simplemente su reintento no libera ningún
   * contador (el archivo se borra igual). Con ellos, `ejecutarReintentoBorrados()`
   * puede liberar la cuota del usuario correcto en cuanto el borrado
   * realmente se completa, nunca antes (evita desincronizar el contador
   * con lo que de verdad queda en R2).
   */
  usuarioId: { type: String, default: '' },
  tamano: { type: Number, default: 0 },
});

export const BorradoPendienteModel: Model<any> = models.BorradoPendiente || model('BorradoPendiente', BorradoPendienteSchema);
