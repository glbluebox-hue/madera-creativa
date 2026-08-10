import type { Cliente } from './types.js';

/** Etiqueta visible para cada estado real del proyecto. */
export const etiquetaEstado: Record<Cliente['estado'], string> = {
  presupuestado: 'Presupuestado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  rechazado: 'No aceptado',
};

/** Los 4 estados reales se agrupan en 2 tonos de insignia: en marcha / cerrado. */
export const grupoEstado: Record<Cliente['estado'], 'curso' | 'fin'> = {
  presupuestado: 'curso',
  en_curso: 'curso',
  finalizado: 'fin',
  rechazado: 'fin',
};
