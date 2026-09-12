import { generarPreguntaFiscal, TEXTO_DATOS_FISCALES_AUSENTES } from './preguntas-fiscales.js';

describe('preguntas-fiscales — Fase 3C.3', () => {
  it('la pregunta de vehículo es un hecho verificable, nunca una pregunta de deducibilidad', () => {
    const p = generarPreguntaFiscal('vehiculoUsoExclusivo', 'irpf');
    expect(p.pregunta).toContain('uso particular');
    expect(p.pregunta.toLowerCase()).not.toContain('deduc');
    expect(p.pregunta.toLowerCase()).not.toContain('porcentaje');
  });

  it('la pregunta de dispositivo es un hecho verificable', () => {
    const p = generarPreguntaFiscal('dispositivoUsoExclusivo', 'iva');
    expect(p.pregunta).toContain('exclusivamente');
    expect(p.pregunta.toLowerCase()).not.toContain('deduc');
  });

  it('la pregunta de gestoría distingue actividad de declaración personal, sin pedir un porcentaje', () => {
    const p = generarPreguntaFiscal('gestoriaSoloActividad', 'irpf');
    expect(p.pregunta).toContain('declaración personal');
    expect(p.pregunta.toLowerCase()).not.toContain('porcentaje');
  });

  it('el id es estable y determinista para poder deduplicar/limpiar al responder', () => {
    const p1 = generarPreguntaFiscal('vehiculoUsoExclusivo', 'irpf');
    const p2 = generarPreguntaFiscal('vehiculoUsoExclusivo', 'iva');
    expect(p1.id).toBe('vehiculoUsoExclusivo:irpf');
    expect(p2.id).toBe('vehiculoUsoExclusivo:iva');
  });

  it('el mensaje de datos fiscales ausentes no pide un hecho de sí/no, pide completar el documento', () => {
    expect(TEXTO_DATOS_FISCALES_AUSENTES).toContain('base');
    expect(TEXTO_DATOS_FISCALES_AUSENTES.toLowerCase()).not.toContain('deduc');
  });
});
