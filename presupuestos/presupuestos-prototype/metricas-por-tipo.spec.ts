import { agruparPorTipo, calcularMetricasGrupo, calcularMetricasPorTipo, UMBRAL_MINIMO_TRABAJOS } from './metricas-por-tipo.js';
import type { TrabajoAnalizado, AnalisisPrecio } from './inteligencia-precios.js';

/**
 * Métricas por Tipo de Trabajo (Fase 2D) — funciones puras, sin Mongo,
 * mismo patrón que el resto de `*.spec.ts` de este paquete. No duplica
 * los tests de `analizarTrabajos` (backend) ni de `calcularComparables`
 * (2C) — solo la agregación NUEVA sobre datos ya producidos por ambos.
 */

function analisisReal(precio: number, margenPorcentaje: number): AnalisisPrecio {
  return { disponible: true, precio, costeEstimado: precio * (1 - margenPorcentaje / 100), margenPorcentaje, margenObjetivoPorcentaje: 45, diferenciaPuntos: margenPorcentaje - 45, estado: 'cerca' };
}

function trabajo(id: string, opts: {
  tipoTrabajo?: string | null;
  precio?: number;
  margenPorcentaje?: number;
  origenPrincipal?: 'real' | 'previsto' | null;
  disponible?: boolean;
} = {}): TrabajoAnalizado {
  const disponible = opts.disponible ?? true;
  const principal: AnalisisPrecio = disponible
    ? analisisReal(opts.precio ?? 10000, opts.margenPorcentaje ?? 40)
    : { disponible: false, motivo: 'sin_costes' };
  return {
    id, titulo: id, clienteId: 'c1', actualizado: '2026-08-01T00:00:00.000Z',
    tipoTrabajo: opts.tipoTrabajo ?? null,
    real: opts.origenPrincipal === 'real' ? (principal as any) : null,
    previsto: opts.origenPrincipal === 'previsto' ? (principal as any) : null,
    principal,
    origenPrincipal: disponible ? (opts.origenPrincipal ?? 'previsto') : null,
  };
}

describe('agruparPorTipo', () => {
  it('agrupa por coincidencia EXACTA de texto', () => {
    const grupos = agruparPorTipo([
      trabajo('a', { tipoTrabajo: 'Cocina' }),
      trabajo('b', { tipoTrabajo: 'Cocina' }),
      trabajo('c', { tipoTrabajo: 'Armario' }),
    ]);
    expect(grupos.get('Cocina')?.length).toBe(2);
    expect(grupos.get('Armario')?.length).toBe(1);
  });

  it('mayúsculas/minúsculas distintas cuentan como grupos DISTINTOS — nunca se normalizan (autorización, sección 6)', () => {
    const grupos = agruparPorTipo([
      trabajo('a', { tipoTrabajo: 'Puerta corredera' }),
      trabajo('b', { tipoTrabajo: 'puerta corredera' }),
      trabajo('c', { tipoTrabajo: 'Puertas correderas' }),
    ]);
    expect(grupos.size).toBe(3);
    expect(grupos.get('Puerta corredera')?.length).toBe(1);
    expect(grupos.get('puerta corredera')?.length).toBe(1);
    expect(grupos.get('Puertas correderas')?.length).toBe(1);
  });

  it('"Otro" (texto libre): cada texto distinto es su propio grupo, nunca se fusionan', () => {
    const grupos = agruparPorTipo([
      trabajo('a', { tipoTrabajo: 'Escalera de caracol' }),
      trabajo('b', { tipoTrabajo: 'Pérgola de madera' }),
    ]);
    expect(grupos.size).toBe(2);
  });

  it('un tipo que nunca aparece en el histórico no genera ningún grupo (0 trabajos)', () => {
    const grupos = agruparPorTipo([trabajo('a', { tipoTrabajo: 'Cocina' })]);
    expect(grupos.has('Vestidor')).toBe(false);
  });

  it('trabajo sin tipoTrabajo (proyecto antiguo o sin etiquetar): no entra en ningún grupo', () => {
    const grupos = agruparPorTipo([
      trabajo('a', { tipoTrabajo: null }),
      trabajo('b', { tipoTrabajo: 'Cocina' }),
    ]);
    expect(grupos.size).toBe(1);
    expect(grupos.get('Cocina')?.length).toBe(1);
  });

  it('trabajo con tipoTrabajo pero SIN margen/precio calculable: no entra en ningún grupo (nada que agregar)', () => {
    const grupos = agruparPorTipo([trabajo('a', { tipoTrabajo: 'Cocina', disponible: false })]);
    expect(grupos.size).toBe(0);
  });
});

describe('calcularMetricasGrupo — tamaño de muestra', () => {
  it('1 trabajo: se calcula igual, pero historicoSuficiente = false (nunca se oculta, autorización sección 4)', () => {
    const m = calcularMetricasGrupo('Mueble a medida', [trabajo('a', { tipoTrabajo: 'Mueble a medida', precio: 5000, margenPorcentaje: 30 }) as any]);
    expect(m.numTrabajos).toBe(1);
    expect(m.historicoSuficiente).toBe(false);
    expect(m.nivelConfianza).toBe('baja');
    expect(m.margenMedio).toBe(30);
  });

  it('2 trabajos: sigue insuficiente', () => {
    const lista = [trabajo('a', { precio: 5000, margenPorcentaje: 30 }), trabajo('b', { precio: 6000, margenPorcentaje: 40 })] as any;
    const m = calcularMetricasGrupo('X', lista);
    expect(m.numTrabajos).toBe(2);
    expect(m.historicoSuficiente).toBe(false);
  });

  it(`${UMBRAL_MINIMO_TRABAJOS} trabajos: ya se considera histórico suficiente`, () => {
    const lista = Array.from({ length: UMBRAL_MINIMO_TRABAJOS }, (_, i) => trabajo(`t${i}`, { precio: 10000, margenPorcentaje: 40, origenPrincipal: 'real' })) as any;
    const m = calcularMetricasGrupo('Cocina', lista);
    expect(m.historicoSuficiente).toBe(true);
  });

  it('7 trabajos, mayoría con margen real y precios poco dispersos: confianza alta', () => {
    const lista = [
      trabajo('a', { precio: 10000, margenPorcentaje: 40, origenPrincipal: 'real' }),
      trabajo('b', { precio: 10500, margenPorcentaje: 42, origenPrincipal: 'real' }),
      trabajo('c', { precio: 9800, margenPorcentaje: 38, origenPrincipal: 'real' }),
      trabajo('d', { precio: 11000, margenPorcentaje: 45, origenPrincipal: 'real' }),
      trabajo('e', { precio: 10200, margenPorcentaje: 41, origenPrincipal: 'real' }),
      trabajo('f', { precio: 9900, margenPorcentaje: 39, origenPrincipal: 'previsto' }),
      trabajo('g', { precio: 10100, margenPorcentaje: 40, origenPrincipal: 'previsto' }),
    ] as any;
    const m = calcularMetricasGrupo('Cocina', lista);
    expect(m.nivelConfianza).toBe('alta');
    expect(m.senales.length).toBeGreaterThanOrEqual(3);
  });
});

describe('calcularMetricasGrupo — cifras', () => {
  it('media: promedio simple de margenPorcentaje', () => {
    const lista = [trabajo('a', { margenPorcentaje: 20 }), trabajo('b', { margenPorcentaje: 40 }), trabajo('c', { margenPorcentaje: 60 })] as any;
    expect(calcularMetricasGrupo('X', lista).margenMedio).toBeCloseTo(40, 5);
  });

  it('mediana: con número impar de trabajos, el valor central', () => {
    const lista = [trabajo('a', { margenPorcentaje: 10 }), trabajo('b', { margenPorcentaje: 90 }), trabajo('c', { margenPorcentaje: 40 })] as any;
    expect(calcularMetricasGrupo('X', lista).margenMediana).toBe(40);
  });

  it('mediana: con número par de trabajos, la media de los dos centrales', () => {
    const lista = [trabajo('a', { margenPorcentaje: 10 }), trabajo('b', { margenPorcentaje: 20 }), trabajo('c', { margenPorcentaje: 30 }), trabajo('d', { margenPorcentaje: 40 })] as any;
    expect(calcularMetricasGrupo('X', lista).margenMediana).toBe(25);
  });

  it('mediana resiste un valor extremo mejor que la media (razón de usarla como cifra principal)', () => {
    const lista = [trabajo('a', { margenPorcentaje: 40 }), trabajo('b', { margenPorcentaje: 42 }), trabajo('c', { margenPorcentaje: 500 })] as any; // "c" claramente atípico
    const m = calcularMetricasGrupo('X', lista);
    expect(m.margenMediana).toBe(42); // apenas se mueve
    expect(m.margenMedio).toBeCloseTo(194, 0); // la media sí se dispara
  });

  it('rango de precios: mínimo y máximo exactos', () => {
    const lista = [trabajo('a', { precio: 8200 }), trabajo('b', { precio: 24500 }), trabajo('c', { precio: 15000 })] as any;
    const m = calcularMetricasGrupo('X', lista);
    expect(m.precioMinimo).toBe(8200);
    expect(m.precioMaximo).toBe(24500);
  });

  it('real vs previsto: cuenta correctamente cuántos de cada origen (prioridad real>previsto ya decidida aguas arriba)', () => {
    const lista = [
      trabajo('a', { origenPrincipal: 'real' }), trabajo('b', { origenPrincipal: 'real' }), trabajo('c', { origenPrincipal: 'previsto' }),
    ] as any;
    const m = calcularMetricasGrupo('X', lista);
    expect(m.numConMargenReal).toBe(2);
    expect(m.numSoloConMargenPrevisto).toBe(1);
  });

  it('dispersión alta (precios muy distintos): no aparece "precios poco dispersos" entre las señales', () => {
    const lista = [trabajo('a', { precio: 1000 }), trabajo('b', { precio: 50000 }), trabajo('c', { precio: 2000 })] as any;
    const m = calcularMetricasGrupo('X', lista);
    expect(m.senales).not.toContain('precios poco dispersos');
  });
});

describe('calcularMetricasPorTipo — pipeline completo y ordenación', () => {
  it('ordena primero los grupos con histórico suficiente, luego los insuficientes (autorización, sección 10)', () => {
    const trabajos = [
      trabajo('a', { tipoTrabajo: 'Vestidor' }), // 1 -> insuficiente
      trabajo('b', { tipoTrabajo: 'Cocina' }),
      trabajo('c', { tipoTrabajo: 'Cocina' }),
      trabajo('d', { tipoTrabajo: 'Cocina' }), // 3 -> suficiente
    ] as any;
    const metricas = calcularMetricasPorTipo(trabajos);
    expect(metricas[0].tipoTrabajo).toBe('Cocina');
    expect(metricas[0].historicoSuficiente).toBe(true);
    expect(metricas[1].tipoTrabajo).toBe('Vestidor');
    expect(metricas[1].historicoSuficiente).toBe(false);
  });

  it('compatibilidad con proyectos antiguos: los trabajos sin tipoTrabajo simplemente no generan ningún grupo, sin romper nada', () => {
    const trabajos = [
      trabajo('viejo1', { tipoTrabajo: null }),
      trabajo('viejo2', { tipoTrabajo: null }),
      trabajo('nuevo', { tipoTrabajo: 'Cocina' }),
    ] as any;
    const metricas = calcularMetricasPorTipo(trabajos);
    expect(metricas.length).toBe(1);
    expect(metricas[0].tipoTrabajo).toBe('Cocina');
  });
});
