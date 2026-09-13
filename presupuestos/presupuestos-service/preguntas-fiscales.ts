import type { HechoFiscalRequerido } from './identificacion-gasto.js';

/**
 * Preguntas factuales (Fase 3C.3, puerto backend) — mismo contenido que
 * `presupuestos-prototype/preguntas-fiscales.ts`. El usuario responde un
 * HECHO verificable, nunca una pregunta fiscal.
 */

export type EjeFiscal = 'irpf' | 'iva' | 'igic';

export type PreguntaFiscalPendiente = { id: string; pregunta: string; eje: EjeFiscal };

const TEXTO_PREGUNTA: Record<HechoFiscalRequerido, string> = {
  vehiculoUsoExclusivo: '¿El vehículo al que corresponde este gasto se utiliza exclusivamente para la actividad profesional, sin uso particular?',
  dispositivoUsoExclusivo: '¿Este dispositivo se utiliza exclusivamente para la actividad?',
  gestoriaSoloActividad: '¿Esta factura corresponde solo a la gestión de tu actividad, o también incluye tu declaración personal completa?',
};

export const TEXTO_DATOS_FISCALES_AUSENTES =
  'Nos faltan datos fiscales de esta factura. Puedes completar la base y el tipo de impuesto, o volver a escanear el documento.';

export function generarPreguntaFiscal(hecho: HechoFiscalRequerido, eje: EjeFiscal): PreguntaFiscalPendiente {
  return { id: `${hecho}:${eje}`, pregunta: TEXTO_PREGUNTA[hecho], eje };
}
