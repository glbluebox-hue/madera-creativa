import { fusionarDecisionFiscal } from './fusion-decision-fiscal.js';

const AUTOMATICO_100 = { estado: 'resuelto_automatico' as const, porcentaje: 100, confianza: 'alta' as const, explicacion: '' };
const REVISION_MANUAL = { estado: 'revision_manual' as const, confianza: 'insuficiente' as const, explicacion: '' };
const PENDIENTE = { estado: 'pendiente_respuesta' as const, confianza: 'insuficiente' as const, explicacion: '' };

describe('fusionarDecisionFiscal — Fase 3C.3', () => {
  it('nunca decidido + motor resuelve automático → se aplica con origen automatico', () => {
    const r = fusionarDecisionFiscal(undefined, undefined, undefined, AUTOMATICO_100);
    expect(r.numero).toBe(100);
    expect(r.origen).toBe('automatico');
  });

  it('decisión humana previa (deducibleIrpf=0, sin origen) → el motor NUNCA la sobrescribe, aunque resuelva 100', () => {
    const r = fusionarDecisionFiscal(0, undefined, 0, AUTOMATICO_100);
    expect(r.numero).toBe(0);
    expect(r.origen).toBeUndefined();
  });

  it('decisión humana previa marcada explícitamente (origen usuario) → tampoco se toca', () => {
    const r = fusionarDecisionFiscal(50, 'usuario', 50, AUTOMATICO_100);
    expect(r.numero).toBe(50);
    expect(r.origen).toBe('usuario');
  });

  it('el usuario cambia el valor a mano en este guardado → gana siempre, marcado como usuario', () => {
    const r = fusionarDecisionFiscal(100, 'automatico', 0, AUTOMATICO_100);
    expect(r.numero).toBe(0);
    expect(r.origen).toBe('usuario');
  });

  it('decisión automática previa + el motor sigue resolviendo lo mismo → se mantiene, sigue automática', () => {
    const r = fusionarDecisionFiscal(100, 'automatico', 100, AUTOMATICO_100);
    expect(r.numero).toBe(100);
    expect(r.origen).toBe('automatico');
  });

  it('decisión automática previa + cambia un dato relevante y ya no aplica → se retira (no queda un número obsoleto)', () => {
    const r = fusionarDecisionFiscal(100, 'automatico', 100, REVISION_MANUAL);
    expect(r.numero).toBeUndefined();
    expect(r.origen).toBeUndefined();
  });

  it('decisión automática previa + ahora falta un hecho (pendiente_respuesta) → también se retira, nunca deja el 100 antiguo', () => {
    const r = fusionarDecisionFiscal(100, 'automatico', 100, PENDIENTE);
    expect(r.numero).toBeUndefined();
  });

  it('nunca decidido + el motor tampoco puede resolver → se queda sin decidir, nunca inventa un número', () => {
    const r = fusionarDecisionFiscal(undefined, undefined, undefined, REVISION_MANUAL);
    expect(r.numero).toBeUndefined();
    expect(r.origen).toBeUndefined();
  });
});
