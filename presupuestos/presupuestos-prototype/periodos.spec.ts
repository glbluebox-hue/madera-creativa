import { rangoPeriodo } from './periodos.js';

/**
 * El foco de estas pruebas es la SEGURIDAD FRENTE A ZONA HORARIA (bug
 * señalado en la auditoría económica, sección C): un límite como
 * `2026-01-01` nunca debe acabar interpretándose como diciembre de 2025.
 * Por eso se fija `hoy` con `new Date(anio, mes, dia, ...)` (hora local) y
 * se comprueban los bordes de mes/trimestre/año.
 */
describe('rangoPeriodo — bordes de período', () => {
  it('este-mes: primer y último día del mes actual', () => {
    const r = rangoPeriodo('este-mes', new Date(2026, 0, 15)); // 15 enero 2026
    expect(r.desde).toBe('2026-01-01');
    expect(r.hasta).toBe('2026-01-31');
  });

  it('este-mes: febrero de un año no bisiesto termina el día 28', () => {
    const r = rangoPeriodo('este-mes', new Date(2026, 1, 10));
    expect(r.desde).toBe('2026-02-01');
    expect(r.hasta).toBe('2026-02-28');
  });

  it('mes-anterior desde enero cae en diciembre del año anterior', () => {
    const r = rangoPeriodo('mes-anterior', new Date(2026, 0, 5)); // enero 2026
    expect(r.desde).toBe('2025-12-01');
    expect(r.hasta).toBe('2025-12-31');
  });

  it('este-trimestre: en enero es el 1.er trimestre completo', () => {
    const r = rangoPeriodo('este-trimestre', new Date(2026, 0, 1));
    expect(r.desde).toBe('2026-01-01');
    expect(r.hasta).toBe('2026-03-31');
  });

  it('este-trimestre: en noviembre es Oct–Dic', () => {
    const r = rangoPeriodo('este-trimestre', new Date(2026, 10, 20));
    expect(r.desde).toBe('2026-10-01');
    expect(r.hasta).toBe('2026-12-31');
  });

  it('trimestre-anterior desde el 1.er trimestre cae en Oct–Dic del año anterior', () => {
    const r = rangoPeriodo('trimestre-anterior', new Date(2026, 1, 1)); // T1 2026
    expect(r.desde).toBe('2025-10-01');
    expect(r.hasta).toBe('2025-12-31');
  });

  it('trimestre-anterior desde el 3.er trimestre es Abr–Jun del mismo año', () => {
    const r = rangoPeriodo('trimestre-anterior', new Date(2026, 7, 15)); // T3 2026
    expect(r.desde).toBe('2026-04-01');
    expect(r.hasta).toBe('2026-06-30');
  });

  it('este-anio: 1 de enero a 31 de diciembre', () => {
    const r = rangoPeriodo('este-anio', new Date(2026, 5, 30));
    expect(r.desde).toBe('2026-01-01');
    expect(r.hasta).toBe('2026-12-31');
  });

  it('el 1 de enero a las 00:00 locales sigue dando enero (no diciembre anterior)', () => {
    const r = rangoPeriodo('este-mes', new Date(2026, 0, 1, 0, 0, 0));
    expect(r.desde).toBe('2026-01-01');
    expect(r.hasta.startsWith('2026-01')).toBe(true);
  });

  it('el 31 de diciembre a las 23:59 locales sigue dando diciembre de ese año', () => {
    const r = rangoPeriodo('este-mes', new Date(2026, 11, 31, 23, 59, 59));
    expect(r.desde).toBe('2026-12-01');
    expect(r.hasta).toBe('2026-12-31');
  });
});
