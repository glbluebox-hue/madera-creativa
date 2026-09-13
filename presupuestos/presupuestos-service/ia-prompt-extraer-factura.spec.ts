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

describe('construirSystemPromptExtraerFactura — desglose fiscal por tramos (12/09/2026)', () => {
  it('pide lineasFiscales, ya no un único campo "baseImponible" suelto a nivel de factura', () => {
    expect(prompt).toContain('"lineasFiscales"');
    // El campo suelto de antes tenía su propia entrada de nivel superior con esta forma exacta — ya no debe estar.
    expect(prompt).not.toContain('"baseImponible": number | null');
  });

  it('instruye explícitamente a no resumir varios tramos en uno solo', () => {
    expect(prompt.toLowerCase()).toContain('varios tramos');
    expect(prompt).toContain('nunca resumirlas en una sola');
  });

  it('instruye a comprobar que la suma de bases+cuotas coincide con el importe antes de responder', () => {
    expect(prompt.toLowerCase()).toContain('suma');
    expect(prompt).toContain('importe');
  });

  it('prohíbe mezclar IVA e IGIC en las líneas de una misma factura', () => {
    expect(prompt.toLowerCase()).toContain('nunca lleva iva e igic a la vez');
  });
});

describe('construirSystemPromptExtraerFactura — exención frente a tipo real al 0% (13/09/2026)', () => {
  it('instruye a usar "exento" cuando el documento indica una exención, aunque la tasa impresa sea 0,00%', () => {
    expect(prompt).toContain('EXENCIÓN frente a tipo real al 0%');
    expect(prompt).toContain('"tipo": "exento"');
    expect(prompt.toLowerCase()).toContain('un "0,00%" ahí no significa por sí solo que sea un tipo real al 0%');
  });
});
