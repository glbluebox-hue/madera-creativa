import type { Proyecto } from './types.js';

/** Etiqueta visible para cada estado real del proyecto. */
export const etiquetaEstado: Record<Proyecto['estado'], string> = {
  presupuestado: 'Presupuestado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  rechazado: 'No aceptado',
};

/** Los 4 estados reales se agrupan en 2 tonos de insignia: en marcha / cerrado. */
export const grupoEstado: Record<Proyecto['estado'], 'curso' | 'fin'> = {
  presupuestado: 'curso',
  en_curso: 'curso',
  finalizado: 'fin',
  rechazado: 'fin',
};
