import { esquemaFactura } from './esquemas-validacion.js';

const base = { id: 'f1', tipo: 'gasto', fecha: '2026-01-01', importe: 100, creado: '2026-01-01T00:00:00.000Z' };

describe('esquemaFactura — campos de tratamiento fiscal (Fase 3C.3)', () => {
  it('acepta deducibleIrpfOrigen/ivaIgicDeducibleOrigen automatico/usuario', () => {
    expect(esquemaFactura.safeParse({ ...base, deducibleIrpfOrigen: 'automatico', ivaIgicDeducibleOrigen: 'usuario' }).success).toBe(true);
  });

  it('rechaza un origen fuera del enum cerrado', () => {
    expect(esquemaFactura.safeParse({ ...base, deducibleIrpfOrigen: 'ia' }).success).toBe(false);
  });

  it('acepta hechosFiscales con los tres hechos conocidos', () => {
    const r = esquemaFactura.safeParse({ ...base, hechosFiscales: { vehiculoUsoExclusivo: true, dispositivoUsoExclusivo: false } });
    expect(r.success).toBe(true);
  });

  it('acepta preguntasFiscalesPendientes con la forma exacta acordada', () => {
    const r = esquemaFactura.safeParse({
      ...base,
      preguntasFiscalesPendientes: [{ id: 'vehiculoUsoExclusivo:irpf', pregunta: '¿Uso exclusivo?', eje: 'irpf' }],
    });
    expect(r.success).toBe(true);
  });

  it('rechaza un eje fuera de irpf/iva/igic', () => {
    const r = esquemaFactura.safeParse({
      ...base,
      preguntasFiscalesPendientes: [{ id: 'x', pregunta: 'y', eje: 'irpfe' }],
    });
    expect(r.success).toBe(false);
  });

  it('ausente sigue siendo válido, sin default (compatibilidad total con facturas ya existentes)', () => {
    const r = esquemaFactura.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.deducibleIrpfOrigen).toBeUndefined();
      expect(r.data.hechosFiscales).toBeUndefined();
    }
  });
});
