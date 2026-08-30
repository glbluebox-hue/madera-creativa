import {
  aFechaISO, desdeFechaISO, inicioSemana, rangoParaVista, agruparPorFecha, desplazar, etiquetaCabecera, hoyISO,
} from './calendario-modelo.js';
import type { ElementoCalendario } from './calendario-modelo.js';

/**
 * Calendario (30/08/2026) — cobertura de las funciones puras de fecha, la
 * parte con más riesgo real de errores "de uno" (rejilla mensual, límites
 * de semana). El resto (agregación real, CRUD de evento/recordatorio) ya
 * está cubierto en el backend (`calendario.spec.ts`).
 */

describe('aFechaISO / desdeFechaISO — sin desplazamiento de zona horaria', () => {
  it('ida y vuelta conserva exactamente el mismo día', () => {
    const iso = '2026-09-15';
    expect(aFechaISO(desdeFechaISO(iso))).toBe(iso);
  });

  it('formatea con ceros a la izquierda en mes y día', () => {
    expect(aFechaISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('inicioSemana', () => {
  it('un martes retrocede al lunes de esa semana', () => {
    // 2026-09-15 es martes.
    expect(aFechaISO(inicioSemana(new Date(2026, 8, 15)))).toBe('2026-09-14');
  });

  it('un lunes se queda en el mismo día', () => {
    expect(aFechaISO(inicioSemana(new Date(2026, 8, 14)))).toBe('2026-09-14');
  });

  it('un domingo retrocede al lunes anterior (no se adelanta)', () => {
    // 2026-09-20 es domingo.
    expect(aFechaISO(inicioSemana(new Date(2026, 8, 20)))).toBe('2026-09-14');
  });
});

describe('rangoParaVista', () => {
  it('vista "dia" devuelve el mismo día como desde y hasta', () => {
    expect(rangoParaVista('dia', new Date(2026, 8, 15))).toEqual({ desde: '2026-09-15', hasta: '2026-09-15' });
  });

  it('vista "semana" cubre de lunes a domingo', () => {
    expect(rangoParaVista('semana', new Date(2026, 8, 15))).toEqual({ desde: '2026-09-14', hasta: '2026-09-20' });
  });

  it('vista "mes" incluye los días de relleno de la semana anterior y siguiente', () => {
    // Septiembre de 2026 empieza en martes (día 1) y termina en miércoles (día 30).
    const rango = rangoParaVista('mes', new Date(2026, 8, 15));
    expect(rango.desde).toBe('2026-08-31'); // lunes de la semana que contiene el día 1
    expect(rango.hasta).toBe('2026-10-04'); // domingo de la semana que contiene el día 30
  });
});

describe('agruparPorFecha', () => {
  const elemento = (id: string, fecha: string): ElementoCalendario =>
    ({ id, tipo: 'nota', titulo: id, fecha, todoElDia: true, origenId: id });

  it('agrupa varios elementos del mismo día bajo la misma clave, en orden', () => {
    const mapa = agruparPorFecha([elemento('a', '2026-09-15'), elemento('b', '2026-09-10'), elemento('c', '2026-09-15')]);
    expect(mapa.get('2026-09-15')?.map((e) => e.id)).toEqual(['a', 'c']);
    expect(mapa.get('2026-09-10')?.map((e) => e.id)).toEqual(['b']);
  });

  it('con una lista vacía, no hay ninguna clave', () => {
    expect(agruparPorFecha([]).size).toBe(0);
  });
});

describe('desplazar', () => {
  it('"dia" avanza/retrocede exactamente un día', () => {
    expect(aFechaISO(desplazar('dia', new Date(2026, 8, 15), 1))).toBe('2026-09-16');
    expect(aFechaISO(desplazar('dia', new Date(2026, 8, 15), -1))).toBe('2026-09-14');
  });

  it('"semana" avanza/retrocede exactamente 7 días', () => {
    expect(aFechaISO(desplazar('semana', new Date(2026, 8, 15), 1))).toBe('2026-09-22');
  });

  it('"mes" cambia de mes conservando el día cuando existe', () => {
    expect(aFechaISO(desplazar('mes', new Date(2026, 8, 15), 1))).toBe('2026-10-15');
    expect(aFechaISO(desplazar('mes', new Date(2026, 8, 15), -1))).toBe('2026-08-15');
  });
});

describe('etiquetaCabecera', () => {
  it('vista "dia" incluye el día, el mes en texto y el año', () => {
    expect(etiquetaCabecera('dia', new Date(2026, 8, 15))).toBe('15 de septiembre de 2026');
  });

  it('vista "mes" muestra "Mes de Año"', () => {
    expect(etiquetaCabecera('mes', new Date(2026, 8, 15))).toBe('Septiembre de 2026');
  });

  it('vista "semana" dentro del mismo mes usa un único nombre de mes', () => {
    expect(etiquetaCabecera('semana', new Date(2026, 8, 15))).toBe('14–20 de septiembre de 2026');
  });
});

describe('hoyISO', () => {
  it('devuelve una fecha con formato AAAA-MM-DD', () => {
    expect(hoyISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
