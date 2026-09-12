import { construirSystemPromptExtraerFactura } from './ia-prompt-extraer-factura.js';

const prompt = construirSystemPromptExtraerFactura({ resumenParaPrompt: '' });

describe('construirSystemPromptExtraerFactura — categoriaFiscalSugerida (Fase 3C.1)', () => {
  it('pide categoriaFiscalSugerida a la IA', () => {
    expect(prompt).toContain('categoriaFiscalSugerida');
  });

  it('incluye la distinción vehículo/seguros explícitamente en las instrucciones', () => {
    expect(prompt).toContain('"vehiculo"');
    expect(prompt).toContain('"seguros"');
  });

  it('NUNCA pide a la IA deducibleIrpf ni ivaIgicDeducible — la IA solo clasifica, no decide tratamiento fiscal', () => {
    expect(prompt).not.toContain('deducibleIrpf');
    expect(prompt).not.toContain('ivaIgicDeducible');
  });

  it('la regla de categoriaFiscalSugerida deja explícito que no debe usar región/REPEP/IVA-IGIC ni sugerir porcentajes de deducibilidad', () => {
    const reglaCategoria = prompt.split('categoriaFiscalSugerida').slice(1).join('categoriaFiscalSugerida');
    expect(reglaCategoria).toContain('NUNCA uses la región fiscal, REPEP');
    expect(reglaCategoria.toLowerCase()).toContain('porcentaje de deducibilidad');
  });
});
