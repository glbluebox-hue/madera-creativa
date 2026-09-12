import { generarPreguntaFiscal, TEXTO_DATOS_FISCALES_AUSENTES } from './preguntas-fiscales.js';

describe('preguntas-fiscales — Fase 3C.3 (backend)', () => {
  it('la pregunta de vehículo es un hecho verificable, nunca pide un porcentaje', () => {
    const p = generarPreguntaFiscal('vehiculoUsoExclusivo', 'irpf');
    expect(p.pregunta.toLowerCase()).not.toContain('porcentaje');
    expect(p.pregunta.toLowerCase()).not.toContain('deduc');
  });

  it('el id combina hecho y eje, estable para deduplicar', () => {
    expect(generarPreguntaFiscal('dispositivoUsoExclusivo', 'iva').id).toBe('dispositivoUsoExclusivo:iva');
  });

  it('el mensaje de datos ausentes no es una pregunta de sí/no', () => {
    expect(TEXTO_DATOS_FISCALES_AUSENTES).toContain('base');
  });
});
