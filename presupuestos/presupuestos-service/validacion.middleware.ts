import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

/** Parte de la petición HTTP contra la que se valida un esquema. */
export type UbicacionValidacion = 'body' | 'params' | 'query';

/**
 * Crea un middleware Express que valida `req[ubicacion]` contra un esquema Zod.
 *
 * Si la validación falla, responde 400 con el detalle de los campos inválidos
 * y no llama a `next()`. Si tiene éxito, sustituye `req[ubicacion]` por los
 * datos ya parseados (con los `default()` del esquema aplicados) antes de
 * continuar, para que el handler de la ruta reciba datos ya normalizados.
 */
export function validar<T>(schema: ZodType<T>, ubicacion: UbicacionValidacion = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const resultado = schema.safeParse(req[ubicacion]);
    if (!resultado.success) {
      res.status(400).json({
        error: 'Datos inválidos',
        detalles: resultado.error.issues.map((issue) => ({
          campo: issue.path.join('.') || ubicacion,
          mensaje: issue.message,
        })),
      });
      return;
    }
    (req as Record<UbicacionValidacion, unknown>)[ubicacion] = resultado.data;
    next();
  };
}
