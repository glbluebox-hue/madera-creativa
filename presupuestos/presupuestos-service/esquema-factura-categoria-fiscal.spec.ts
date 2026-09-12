import { esquemaFactura } from './esquemas-validacion.js';

const base = { id: 'f1', tipo: 'gasto' as const, fecha: '2026-01-01', importe: 100, creado: '2026-01-01T00:00:00.000Z' };

describe('esquemaFactura — validación del enum categoriaFiscal (Fase 3C.1)', () => {
  it('materiales, herramienta_pequena y maquinaria_inversion son válidos', () => {
    expect(esquemaFactura.safeParse({ ...base, categoriaFiscal: 'materiales' }).success).toBe(true);
    expect(esquemaFactura.safeParse({ ...base, categoriaFiscal: 'herramienta_pequena' }).success).toBe(true);
    expect(esquemaFactura.safeParse({ ...base, categoriaFiscal: 'maquinaria_inversion' }).success).toBe(true);
  });

  it('vehiculo y seguros son válidos y distintos (distinción vehículo/seguros)', () => {
    expect(esquemaFactura.safeParse({ ...base, categoriaFiscal: 'vehiculo' }).success).toBe(true);
    expect(esquemaFactura.safeParse({ ...base, categoriaFiscal: 'seguros' }).success).toBe(true);
  });

  it('otros y por_clasificar son válidos', () => {
    expect(esquemaFactura.safeParse({ ...base, categoriaFiscal: 'otros' }).success).toBe(true);
    expect(esquemaFactura.safeParse({ ...base, categoriaFiscal: 'por_clasificar' }).success).toBe(true);
  });

  it('ausente (campo no enviado) es válido y NO tiene default — sigue siendo undefined, no se inventa un valor', () => {
    const r = esquemaFactura.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.categoriaFiscal).toBeUndefined();
  });

  it('una factura histórica (sin categoriaFiscal) sigue siendo válida sin ningún otro cambio', () => {
    const historica = { id: 'h1', tipo: 'gasto' as const, fecha: '2020-01-01', importe: 50, creado: '2020-01-01T00:00:00.000Z', categoria: 'ferretería' };
    const r = esquemaFactura.safeParse(historica);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.categoriaFiscal).toBeUndefined();
      expect(r.data.categoria).toBe('ferretería'); // categoria (texto libre) no se ve afectada
    }
  });

  it('cualquier valor fuera del enum cerrado se rechaza', () => {
    expect(esquemaFactura.safeParse({ ...base, categoriaFiscal: 'gasto_deducible' }).success).toBe(false);
    expect(esquemaFactura.safeParse({ ...base, categoriaFiscal: 'Materiales' }).success).toBe(false);
    expect(esquemaFactura.safeParse({ ...base, categoriaFiscal: '' }).success).toBe(false);
    expect(esquemaFactura.safeParse({ ...base, categoriaFiscal: 0 }).success).toBe(false);
  });

  it('categoria (texto libre, ya existente) sigue funcionando exactamente igual junto al campo nuevo', () => {
    const r = esquemaFactura.safeParse({ ...base, categoria: 'madera y tableros', categoriaFiscal: 'materiales' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.categoria).toBe('madera y tableros');
      expect(r.data.categoriaFiscal).toBe('materiales');
    }
  });
});
