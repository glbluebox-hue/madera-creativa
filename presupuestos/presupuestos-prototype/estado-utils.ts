import type { Proyecto } from './types.js';

/** Etiqueta visible para cada estado real del proyecto. */
export const etiquetaEstado: Record<Proyecto['estado'], string> = {
  presupuestado: 'Presupuestado',
  presupuesto_enviado: 'Presupuesto enviado',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  rechazado: 'No aceptado',
};

/** Los estados reales se agrupan en 2 tonos de insignia: en marcha / cerrado. `presupuesto_enviado` cuenta como "en marcha" — sigue a la espera de respuesta, no está cerrado. */
export const grupoEstado: Record<Proyecto['estado'], 'curso' | 'fin'> = {
  presupuestado: 'curso',
  presupuesto_enviado: 'curso',
  en_curso: 'curso',
  finalizado: 'fin',
  rechazado: 'fin',
};
