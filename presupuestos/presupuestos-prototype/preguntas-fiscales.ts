import type { HechoFiscalRequerido } from './identificacion-gasto.js';

/**
 * Preguntas factuales (Fase 3C.3) — el usuario responde un HECHO
 * verificable, nunca una pregunta fiscal ("¿es deducible?", "¿qué
 * porcentaje?"). El motor (`motor-resolucion-fiscal.ts`) es quien traduce
 * la respuesta en un tratamiento — este archivo solo conoce el texto de la
 * pregunta, nunca su consecuencia fiscal.
 */

export type EjeFiscal = 'irpf' | 'iva' | 'igic';

export type PreguntaFiscalPendiente = {
  /** `"<hecho>:<eje>"` — estable y determinista, para poder deduplicar/limpiar al responder. */
  id: string;
  pregunta: string;
  eje: EjeFiscal;
};

/** Un hecho por cada `HechoFiscalRequerido` — la MISMA pregunta puede dejar pendientes varios ejes de una misma factura (p. ej. IRPF e IVA de un vehículo); responderla una vez resuelve todos. */
const TEXTO_PREGUNTA: Record<HechoFiscalRequerido, string> = {
  vehiculoUsoExclusivo: '¿El vehículo al que corresponde este gasto se utiliza exclusivamente para la actividad profesional, sin uso particular?',
  dispositivoUsoExclusivo: '¿Este dispositivo se utiliza exclusivamente para la actividad?',
  gestoriaSoloActividad: '¿Esta factura corresponde solo a la gestión de tu actividad, o también incluye tu declaración personal completa?',
};

/** Mensaje informativo (no es una pregunta de sí/no) cuando falta el dato bruto de la factura — se completa el documento, no se responde un hecho. */
export const TEXTO_DATOS_FISCALES_AUSENTES =
  'Nos faltan datos fiscales de esta factura. Puedes completar la base y el tipo de impuesto, o volver a escanear el documento.';

export function generarPreguntaFiscal(hecho: HechoFiscalRequerido, eje: EjeFiscal): PreguntaFiscalPendiente {
  return { id: `${hecho}:${eje}`, pregunta: TEXTO_PREGUNTA[hecho], eje };
}
