import { calcularComparables } from './comparables.js';
import type { TrabajoParaComparar } from './comparables.js';
import type { AnalisisPrecio } from './inteligencia-precios.js';

/**
 * Comparables Inteligentes (Fase 2C) — función pura, sin Mongo. Ver la
 * autorización aprobada: motor determinista sobre el histórico ya
 * producido por `svc.analizarTrabajos` (probado aparte, Mongo en
 * memoria, en `trabajos-analizados.spec.ts` y `comparables-servicio.spec.ts`).
 */

const HOY = new Date('2026-08-28T12:00:00.000Z');

function haceMeses(meses: number): string {
  const d = new Date(HOY);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString();
}

function analisis(precio: number, margenPorcentaje = 40): AnalisisPrecio {
  return {
    disponible: true, precio, costeEstimado: precio * (1 - margenPorcentaje / 100),
    margenPorcentaje, margenObjetivoPorcentaje: 45, diferenciaPuntos: margenPorcentaje - 45, estado: 'cerca',
  };
}

function trabajo(id: string, opts: {
  tipoTrabajo?: string | null; real?: AnalisisPrecio | null; previsto?: AnalisisPrecio | null; actualizado?: string;
} = {}): TrabajoParaComparar {
  const real = opts.real ?? null;
  const previsto = opts.previsto ?? null;
  const principal = real ?? previsto ?? { disponible: false, motivo: 'sin_precio' as const };
  return {
    id, titulo: id, clienteId: 'c1',
    actualizado: opts.actualizado ?? haceMeses(1),
    tipoTrabajo: opts.tipoTrabajo ?? null,
    real, previsto, principal,
    origenPrincipal: real ? 'real' : previsto ? 'previsto' : null,
  };
}

describe('calcularComparables — Fase 2C', () => {
  it('1. mismo tipo + precio similar + reciente -> muy comparable, con los tres motivos', () => {
    const candidato = trabajo('cocina-garcia', { tipoTrabajo: 'Cocina', real: analisis(10500), actualizado: haceMeses(2) });
    const r = calcularComparables({ precio: 10000, tipoTrabajo: 'Cocina' }, [candidato]);
    expect(r.disponible).toBe(true);
    if (!r.disponible) return;
    expect(r.comparables[0].nivel).toBe('muy_comparable');
    const tipos = r.comparables[0].motivos.map((m) => m.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['mismo_tipo_trabajo', 'precio_similar', 'reciente']));
  });

  it('2. mismo tipo + precio muy diferente -> el motivo de precio no aparece, puntuación más baja', () => {
    const cercano = trabajo('cocina-similar', { tipoTrabajo: 'Cocina', real: analisis(10500) });
    const lejano = trabajo('cocina-cara', { tipoTrabajo: 'Cocina', real: analisis(30000) });
    const r = calcularComparables({ precio: 10000, tipoTrabajo: 'Cocina' }, [cercano, lejano]);
    if (!r.disponible) throw new Error('debería estar disponible');
    const caro = r.comparables.find((c) => c.trabajo.id === 'cocina-cara')!;
    expect(caro.motivos.map((m) => m.tipo)).not.toContain('precio_similar');
    const similar = r.comparables.find((c) => c.trabajo.id === 'cocina-similar')!;
    expect(similar.puntuacion).toBeGreaterThan(caro.puntuacion);
  });

  it('3. tipo diferente -> el componente de tipo puntúa 0 pero SIGUE participando (no se omite, no es secundario)', () => {
    const candidato = trabajo('armario', { tipoTrabajo: 'Armario', real: analisis(10000) });
    const r = calcularComparables({ precio: 10000, tipoTrabajo: 'Cocina' }, [candidato]);
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.comparables[0].esSecundario).toBe(false);
    expect(r.comparables[0].motivos.map((m) => m.tipo)).not.toContain('mismo_tipo_trabajo');
  });

  it('4. ausencia de tipoTrabajo (en el candidato) -> comparable secundario, redistribuye el peso sin inventar coincidencia', () => {
    const sinTipo = trabajo('viejo-sin-tipo', { tipoTrabajo: null, real: analisis(10000), actualizado: haceMeses(1) });
    const r = calcularComparables({ precio: 10000, tipoTrabajo: 'Cocina' }, [sinTipo]);
    if (!r.disponible) throw new Error('debería estar disponible');
    const c = r.comparables[0];
    expect(c.esSecundario).toBe(true);
    expect(c.motivos.map((m) => m.tipo)).not.toContain('mismo_tipo_trabajo');
    // Precio idéntico + muy reciente, con el peso de "tipo" redistribuido entre los dos componentes activos -> 100 puntos exactos.
    expect(c.puntuacion).toBe(100);
  });

  it('4b. ausencia de tipoTrabajo en el trabajo NUEVO (aunque el candidato sí lo tenga) también es secundario', () => {
    const conTipo = trabajo('cocina-etiquetada', { tipoTrabajo: 'Cocina', real: analisis(10000), actualizado: haceMeses(1) });
    const r = calcularComparables({ precio: 10000, tipoTrabajo: null }, [conTipo]);
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.comparables[0].esSecundario).toBe(true);
  });

  it('5. sin precio de referencia -> disponible:false, motivo sin_precio_referencia, sin evaluar nada', () => {
    const candidato = trabajo('c1', { real: analisis(10000) });
    const r1 = calcularComparables({ precio: 0, tipoTrabajo: null }, [candidato]);
    expect(r1).toEqual({ disponible: false, motivo: 'sin_precio_referencia' });
    const r2 = calcularComparables({ precio: NaN, tipoTrabajo: null }, [candidato]);
    expect(r2).toEqual({ disponible: false, motivo: 'sin_precio_referencia' });
  });

  it('5b. candidato sin ningún precio disponible (ni real ni previsto) se excluye, nunca cuenta como comparable', () => {
    const sinPrecio = trabajo('sin-datos', { real: null, previsto: null });
    const r = calcularComparables({ precio: 10000, tipoTrabajo: null }, [sinPrecio]);
    expect(r).toEqual({ disponible: false, motivo: 'sin_historico' });
  });

  it('6. proyectos muy antiguos (>5 años) -> el componente de fecha puntúa 0, sin motivo "reciente", pero sigue pudiendo aparecer', () => {
    const antiguo = trabajo('cocina-2018', { tipoTrabajo: 'Cocina', real: analisis(10000), actualizado: haceMeses(96) });
    const r = calcularComparables({ precio: 10000, tipoTrabajo: 'Cocina' }, [antiguo]);
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.comparables[0].motivos.map((m) => m.tipo)).not.toContain('reciente');
    // Tipo (50) + precio idéntico (35) + fecha (0) = 85/100 -> sigue siendo "muy comparable" pese a ser antiguo.
    expect(r.comparables[0].puntuacion).toBe(85);
  });

  it('7. pocos trabajos en el histórico -> se devuelven todos los disponibles, totalEvaluados refleja el número real', () => {
    const dos = [trabajo('a', { real: analisis(10000) }), trabajo('b', { real: analisis(11000) })];
    const r = calcularComparables({ precio: 10000, tipoTrabajo: null }, dos);
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.totalEvaluados).toBe(2);
    expect(r.comparables.length).toBe(2); // nunca se rellena con más de los que hay
  });

  it('8. top 5 por defecto, top 10 explícito, nunca más de lo pedido', () => {
    const historico = Array.from({ length: 12 }, (_, i) => trabajo(`t${i}`, { real: analisis(10000 + i * 50) }));
    const porDefecto = calcularComparables({ precio: 10000, tipoTrabajo: null }, historico);
    if (!porDefecto.disponible) throw new Error('debería estar disponible');
    expect(porDefecto.comparables.length).toBe(5);
    expect(porDefecto.totalEvaluados).toBe(12); // se evaluaron todos, aunque solo se devuelven 5

    const top10 = calcularComparables({ precio: 10000, tipoTrabajo: null }, historico, { top: 10 });
    if (!top10.disponible) throw new Error('debería estar disponible');
    expect(top10.comparables.length).toBe(10);
  });

  it('9. ordenación: los resultados vienen siempre de mayor a menor puntuación', () => {
    const historico = [
      trabajo('lejano', { real: analisis(50000) }),
      trabajo('exacto', { real: analisis(10000) }),
      trabajo('cercano', { real: analisis(10500) }),
    ];
    const r = calcularComparables({ precio: 10000, tipoTrabajo: null }, historico, { top: 10 });
    if (!r.disponible) throw new Error('debería estar disponible');
    const puntuaciones = r.comparables.map((c) => c.puntuacion);
    expect(puntuaciones).toEqual([...puntuaciones].sort((a, b) => b - a));
    expect(r.comparables[0].trabajo.id).toBe('exacto');
  });

  it('10. explicación: solo se listan las señales que de verdad coincidieron, cada una con su dato', () => {
    const candidato = trabajo('c', { tipoTrabajo: 'Cocina', real: analisis(10200), actualizado: haceMeses(3) });
    const r = calcularComparables({ precio: 10000, tipoTrabajo: 'Cocina' }, [candidato]);
    if (!r.disponible) throw new Error('debería estar disponible');
    const motivoPrecio = r.comparables[0].motivos.find((m) => m.tipo === 'precio_similar');
    expect(motivoPrecio).toBeTruthy();
    if (motivoPrecio?.tipo === 'precio_similar') expect(motivoPrecio.diferenciaPorcentaje).toBeCloseTo(2, 0);
    const motivoFecha = r.comparables[0].motivos.find((m) => m.tipo === 'reciente');
    if (motivoFecha?.tipo === 'reciente') expect(motivoFecha.mesesAntiguedad).toBeCloseTo(3, 0);
  });

  it('11. real vs previsto: cuando ambos existen, la comparación usa SIEMPRE el precio real (misma prioridad que 2B)', () => {
    // Precio real muy cercano al nuevo, precio previsto muy lejano -> si usara "previsto" por error, la puntuación de precio sería baja.
    const candidato = trabajo('c', { real: analisis(10100), previsto: analisis(50000) });
    const r = calcularComparables({ precio: 10000, tipoTrabajo: null }, [candidato]);
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.comparables[0].motivos.map((m) => m.tipo)).toContain('precio_similar');
  });

  it('11b. sin margen real, usa el precio previsto', () => {
    const candidato = trabajo('c', { real: null, previsto: analisis(10100) });
    const r = calcularComparables({ precio: 10000, tipoTrabajo: null }, [candidato]);
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.comparables[0].motivos.map((m) => m.tipo)).toContain('precio_similar');
  });

  it('12. excluirId: un trabajo nunca se compara consigo mismo', () => {
    const candidato = trabajo('el-propio', { real: analisis(10000) });
    const r = calcularComparables({ precio: 10000, tipoTrabajo: null, excluirId: 'el-propio' }, [candidato]);
    expect(r).toEqual({ disponible: false, motivo: 'sin_historico' });
  });

  it('13. sin histórico en absoluto -> disponible:false, motivo sin_historico, nunca inventa nada', () => {
    const r = calcularComparables({ precio: 10000, tipoTrabajo: 'Cocina' }, []);
    expect(r).toEqual({ disponible: false, motivo: 'sin_historico' });
  });

  it('14. redistribución genérica: con dos componentes activos y ambos perfectos, la puntuación llega a 100 igual que con tres', () => {
    // Prueba de caja blanca sobre la fórmula de redistribución (principio 14
    // de la autorización: "cada nueva señal debe poder incorporarse como un
    // componente adicional sin rehacer el sistema"). Con SOLO precio+fecha
    // activos (tipo omitido) y ambos en su máximo, el resultado sigue
    // siendo 100 -- la misma fórmula (puntos obtenidos / peso activo * 100)
    // funcionará igual el día que se añada un componente nuevo, se omita
    // uno cualquiera, o se omitan varios a la vez, sin ningún caso especial.
    const perfecto = trabajo('perfecto', { tipoTrabajo: null, real: analisis(10000), actualizado: haceMeses(0) });
    const r = calcularComparables({ precio: 10000, tipoTrabajo: null }, [perfecto]);
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.comparables[0].puntuacion).toBe(100);
    expect(r.comparables[0].nivel).toBe('muy_comparable');
  });
});
