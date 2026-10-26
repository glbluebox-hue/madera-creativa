import { conectar } from './cliente.model.js';
import { anioMadrid } from './numeracion-presupuestos.js';
import { ContadorFacturaEmitidaModel } from './contador-factura-emitida.model.js';

/**
 * Numeración legal de facturas emitidas (SIF, Fase 1-5, 26/10/2026) —
 * mismo patrón atómico que `numeracion-presupuestos.ts` (`anioMadrid`
 * reutilizada de ahí tal cual, mismo motivo: nunca `getFullYear()`/`slice`
 * en UTC, ver ese archivo para el porqué completo del huso horario).
 *
 * Diferencia deliberada: AQUÍ NO HAY REUTILIZACIÓN DE HUECOS. Un
 * presupuesto puede reutilizar el número de uno borrado; una factura
 * EMITIDA nunca puede — la numeración legal (RD 1007/2023) exige una
 * secuencia estrictamente creciente. Por eso solo existe un camino
 * (incrementar), nunca el de "buscar hueco libre" que sí tiene
 * `reclamarNumeroPresupuesto`.
 *
 * El número se reclama SOLO en el momento de "emitir" (ver
 * `emitirFacturaEmitida` en `presupuestos-service.ts`) — nunca al crear un
 * borrador. Un borrador no tiene número hasta que se emite.
 */

const PREFIJO = 'FAC';
/** Mismo motivo que en `numeracion-presupuestos.ts`: nunca bloquear por un bug real, solo evitar un reintento infinito ante una carrera imposible de agotar en la práctica. */
const MAX_REINTENTOS = 20;

/** `FAC-0001/26` — cuatro dígitos con ceros a la izquierda, año en dos cifras. Mismo formato que `formatearNumeroPresupuesto`, prefijo distinto. */
export function formatearNumeroFacturaEmitida(numero: number, anio: number): string {
  const numeroTexto = String(numero).padStart(4, '0');
  const anioCorto = String(anio % 100).padStart(2, '0');
  return `${PREFIJO}-${numeroTexto}/${anioCorto}`;
}

/**
 * Reclama, de forma atómica, el SIGUIENTE número para `usuarioId`+`anio` —
 * siempre incrementa, nunca reutiliza. `$inc` en un único
 * `findOneAndUpdate` es atómico por documento en MongoDB; la primera vez
 * que se crea el contador de un usuario/año, dos peticiones simultáneas
 * pueden chocar contra el índice único `{usuarioId, anio}` — se detecta el
 * `E11000` y se reintenta (mismo patrón exacto que
 * `reclamarNumeroPresupuesto`).
 */
export async function reclamarNumeroFacturaEmitida(usuarioId: string, anio: number): Promise<number> {
  await conectar();
  // `Model.init()` espera a que el índice único `{usuarioId, anio}` termine
  // de crearse en MongoDB — Mongoose lo construye en segundo plano tras
  // compilar el modelo, sin bloquear las operaciones. Sin este `await`, una
  // primera ráfaga de peticiones concurrentes (primer uso real del
  // modelo) puede llegar ANTES de que el índice exista, y entonces el
  // `upsert` ya no detecta el choque (`E11000`) con el que este reintento
  // cuenta — crea documentos duplicados en vez de uno solo, y se pierden
  // incrementos (bug real, detectado por el test de concurrencia de este
  // mismo módulo). `init()` memoiza su promesa — repetirlo en cada llamada
  // es barato una vez resuelta la primera.
  await ContadorFacturaEmitidaModel.init();
  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    try {
      const actualizado = await ContadorFacturaEmitidaModel.findOneAndUpdate(
        { usuarioId, anio },
        { $inc: { ultimoNumero: 1 } },
        { upsert: true, new: true }
      ).exec() as any;
      return actualizado.ultimoNumero;
    } catch (err: any) {
      if (err?.code === 11000) continue; // otra petición creó el documento en el mismo instante — reintenta, ya existe
      throw err;
    }
  }
  throw new Error(`No se pudo asignar un número de factura emitida para ${usuarioId}/${anio} tras ${MAX_REINTENTOS} intentos.`);
}

export { anioMadrid };
