import { CATEGORIAS_FISCALES, ETIQUETA_CATEGORIA_FISCAL, esCategoriaFiscalValida, aplicarSugerenciaCategoriaFiscal } from './categoria-fiscal.js';

describe('CATEGORIAS_FISCALES — enum cerrado (Fase 3C.1)', () => {
  it('tiene exactamente 22 categorías específicas + por_clasificar = 23 identificadores', () => {
    expect(CATEGORIAS_FISCALES).toHaveLength(23);
  });

  it('incluye materiales, herramienta_pequena y maquinaria_inversion', () => {
    expect(CATEGORIAS_FISCALES).toContain('materiales');
    expect(CATEGORIAS_FISCALES).toContain('herramienta_pequena');
    expect(CATEGORIAS_FISCALES).toContain('maquinaria_inversion');
  });

  it('incluye otros y por_clasificar como valores distintos', () => {
    expect(CATEGORIAS_FISCALES).toContain('otros');
    expect(CATEGORIAS_FISCALES).toContain('por_clasificar');
  });

  it('cada categoría tiene una etiqueta visible', () => {
    for (const cat of CATEGORIAS_FISCALES) {
      expect(typeof ETIQUETA_CATEGORIA_FISCAL[cat]).toBe('string');
      expect(ETIQUETA_CATEGORIA_FISCAL[cat].length).toBeGreaterThan(0);
    }
  });
});

describe('esCategoriaFiscalValida', () => {
  it('acepta vehiculo y seguros (distinción vehículo/seguros, punto 2 de la especificación)', () => {
    expect(esCategoriaFiscalValida('vehiculo')).toBe(true);
    expect(esCategoriaFiscalValida('seguros')).toBe(true);
  });

  it('rechaza un valor inventado fuera del enum cerrado', () => {
    expect(esCategoriaFiscalValida('gasto_deducible')).toBe(false);
    expect(esCategoriaFiscalValida('vehiculo_seguro')).toBe(false);
  });

  it('rechaza null/undefined/números — solo strings del enum', () => {
    expect(esCategoriaFiscalValida(null)).toBe(false);
    expect(esCategoriaFiscalValida(undefined)).toBe(false);
    expect(esCategoriaFiscalValida(42)).toBe(false);
  });
});

describe('aplicarSugerenciaCategoriaFiscal — mismo criterio que sugerirTipoImpuesto (Fase 2.1)', () => {
  it('aplica la sugerencia cuando no hay valor todavía (undefined = nunca clasificada)', () => {
    expect(aplicarSugerenciaCategoriaFiscal(undefined, 'materiales')).toBe('materiales');
  });

  it('NUNCA sobrescribe un valor ya presente, aunque la sugerencia sea distinta', () => {
    expect(aplicarSugerenciaCategoriaFiscal('herramienta_pequena', 'materiales')).toBe('herramienta_pequena');
  });

  it('una sugerencia inválida no se aplica — se queda como estaba (undefined sigue undefined, nunca inventa)', () => {
    expect(aplicarSugerenciaCategoriaFiscal(undefined, 'no_existe')).toBe(undefined);
    expect(aplicarSugerenciaCategoriaFiscal(undefined, null)).toBe(undefined);
  });

  it('por_clasificar y otros se aplican igual que cualquier otra categoría (son valores válidos del enum)', () => {
    expect(aplicarSugerenciaCategoriaFiscal(undefined, 'por_clasificar')).toBe('por_clasificar');
    expect(aplicarSugerenciaCategoriaFiscal(undefined, 'otros')).toBe('otros');
  });

  it('acepta la clasificación sin recibir ni necesitar regionFiscal/repepActivo/tipoImpuesto — garantizado por su propia firma (2 parámetros: actual y sugerida, nada más)', () => {
    // La propia llamada, con solo estos dos argumentos, es la prueba: no hay
    // ningún tercer parámetro de contexto fiscal que la función pudiera usar.
    expect(aplicarSugerenciaCategoriaFiscal(undefined, 'vehiculo')).toBe('vehiculo');
  });
});
