import { resolverZonaLocal, resolverMercadoLocal } from './mercado-local.js';
import type { ReferenciaMercado, UbicacionEmpresa } from './mercado-local.js';

/**
 * Motor de Mercado Local (Fase 2F) — cubre exactamente las condiciones de
 * la autorización: la isla manda sobre la provincia en Canarias (1), nunca
 * se sustituye Canarias por Madrid o España en silencio (6), y la
 * confianza baja con pocas referencias en vez de fingir precisión (7).
 */

function ref(extra: Partial<ReferenciaMercado>): ReferenciaMercado {
  return {
    id: 'r1', tipoTrabajo: 'Cocina', nivelGeografico: 'local', zona: 'Tenerife',
    precioMin: 5000, precioMax: 6000, fuente: 'Manual', fecha: '2026-06-01', creado: '2026-06-01',
    ...extra,
  };
}

const tenerife: UbicacionEmpresa = { comunidadAutonoma: 'Canarias', provincia: 'Santa Cruz de Tenerife', isla: 'Tenerife' };
const madrid: UbicacionEmpresa = { comunidadAutonoma: 'Comunidad de Madrid', provincia: 'Madrid', isla: '' };

describe('resolverZonaLocal', () => {
  it('en Canarias, la isla manda sobre la provincia (condición 1 de la autorización)', () => {
    expect(resolverZonaLocal(tenerife)).toBe('Tenerife');
  });
  it('sin isla, usa la provincia', () => {
    expect(resolverZonaLocal(madrid)).toBe('Madrid');
  });
  it('sin nada configurado, null', () => {
    expect(resolverZonaLocal({ comunidadAutonoma: '', provincia: '', isla: '' })).toBeNull();
  });
});

describe('resolverMercadoLocal — escalado geográfico', () => {
  it('sin tipoTrabajo, no disponible', () => {
    expect(resolverMercadoLocal(tenerife, [ref({})], null)).toEqual({ disponible: false });
  });

  it('sin ninguna referencia de ese tipo, no disponible', () => {
    expect(resolverMercadoLocal(tenerife, [ref({ tipoTrabajo: 'Armario' })], 'Cocina')).toEqual({ disponible: false });
  });

  it('con referencia local (Tenerife), usa el nivel local -- nunca lo amplía a Canarias ni a España', () => {
    const r = resolverMercadoLocal(tenerife, [ref({})], 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.nivelUsado).toBe('local');
    expect(r.zona).toBe('Tenerife');
  });

  it('sin referencia local, escala a regional (Canarias) -- nunca cruza a otra comunidad', () => {
    const referencias = [ref({ nivelGeografico: 'regional', zona: 'Canarias' })];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.nivelUsado).toBe('regional');
    expect(r.zona).toBe('Canarias');
  });

  it('sin local ni regional, escala a nacional (España)', () => {
    const referencias = [ref({ nivelGeografico: 'nacional', zona: 'España' })];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.nivelUsado).toBe('nacional');
  });

  it('una empresa de Tenerife NUNCA usa una referencia de Madrid, aunque exista y sea la única disponible', () => {
    const referencias = [ref({ nivelGeografico: 'local', zona: 'Madrid' })];
    expect(resolverMercadoLocal(tenerife, referencias, 'Cocina')).toEqual({ disponible: false });
  });

  it('una empresa de Madrid usa Madrid, no Tenerife, aunque Tenerife tenga más referencias', () => {
    const referencias = [
      ref({ nivelGeografico: 'local', zona: 'Tenerife' }),
      ref({ id: 'r2', nivelGeografico: 'local', zona: 'Madrid', precioMin: 7000, precioMax: 8000 }),
    ];
    const r = resolverMercadoLocal(madrid, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.zona).toBe('Madrid');
    expect(r.precioMin).toBe(7000);
  });

  it('combina varias referencias del mismo nivel/zona con min/max conjunto', () => {
    const referencias = [
      ref({ id: 'a', precioMin: 5000, precioMax: 6000, fuente: 'Habitissimo' }),
      ref({ id: 'b', precioMin: 5500, precioMax: 7000, fuente: 'Competidor visto en Instagram' }),
    ];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.precioMin).toBe(5000);
    expect(r.precioMax).toBe(7000);
    expect(r.numReferencias).toBe(2);
    expect(r.fuentes).toEqual(['Habitissimo', 'Competidor visto en Instagram']);
  });
});

describe('resolverMercadoLocal — confianza', () => {
  it('menos de 3 referencias: confianza baja, nunca finge precisión', () => {
    const r = resolverMercadoLocal(tenerife, [ref({})], 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.confianza).toBe('baja');
  });

  it('3 o más referencias: confianza media', () => {
    const referencias = [ref({ id: 'a' }), ref({ id: 'b' }), ref({ id: 'c' })];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.confianza).toBe('media');
  });
});
