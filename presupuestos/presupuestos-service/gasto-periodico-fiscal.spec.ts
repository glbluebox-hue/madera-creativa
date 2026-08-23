import { esGastoPeriodicoDeducible } from './gasto-periodico-fiscal.js';

describe('esGastoPeriodicoDeducible (vehículos no deducibles, auditoría 23/08/2026)', () => {
  it('afectacionExclusiva = true → deducible (se incluye)', () => {
    expect(esGastoPeriodicoDeducible({ afectacionExclusiva: true })).toBe(true);
  });

  it('afectacionExclusiva = false → NO deducible (se excluye)', () => {
    expect(esGastoPeriodicoDeducible({ afectacionExclusiva: false })).toBe(false);
  });

  it('afectacionExclusiva = null → deducible (comportamiento previo, sin interpretación nueva)', () => {
    expect(esGastoPeriodicoDeducible({ afectacionExclusiva: null })).toBe(true);
  });

  it('afectacionExclusiva ausente (gastos que no son de vehículo) → deducible', () => {
    expect(esGastoPeriodicoDeducible({})).toBe(true);
  });
});
