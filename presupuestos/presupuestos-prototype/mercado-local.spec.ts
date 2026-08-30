import { resolverZonaLocal, resolverMercadoLocal, sonComparables } from './mercado-local.js';
import type { ReferenciaMercado, UbicacionEmpresa } from './mercado-local.js';

/**
 * Motor de Mercado Local (Fase 2F, ampliado en "Ficha Comparable") —
 * cubre las condiciones de ambas autorizaciones: la isla manda sobre la
 * provincia en Canarias, nunca se sustituye Canarias por Madrid o España
 * en silencio, la confianza baja con pocas referencias o datos
 * incompletos en vez de fingir precisión, y ninguna referencia con
 * alcance/unidad distinta entra en el cálculo aunque coincidan tipo y
 * zona.
 */

function ref(extra: Partial<ReferenciaMercado> = {}): ReferenciaMercado {
  return {
    id: 'r1', tipoTrabajo: 'Cocina', nivelGeografico: 'local', zona: 'Tenerife',
    precioMin: 5000, precioMax: 6000, fuente: 'Manual', fecha: '2026-06-01', creado: '2026-06-01',
    alcance: 'mobiliario_encimera', obraIncluida: false, electrodomesticosIncluidos: null,
    nivelCalidad: null, tamano: null, unidad: 'total', impuestosConocidos: true,
    tipoPrecio: 'publicado', origen: 'manual',
    ...extra,
  };
}

const tenerife: UbicacionEmpresa = { comunidadAutonoma: 'Canarias', provincia: 'Santa Cruz de Tenerife', isla: 'Tenerife' };
const madrid: UbicacionEmpresa = { comunidadAutonoma: 'Comunidad de Madrid', provincia: 'Madrid', isla: '' };

describe('resolverZonaLocal', () => {
  it('en Canarias, la isla manda sobre la provincia', () => {
    expect(resolverZonaLocal(tenerife)).toBe('Tenerife');
  });
  it('sin isla, usa la provincia', () => {
    expect(resolverZonaLocal(madrid)).toBe('Madrid');
  });
  it('sin nada configurado, null', () => {
    expect(resolverZonaLocal({ comunidadAutonoma: '', provincia: '', isla: '' })).toBeNull();
  });
});

describe('sonComparables', () => {
  it('mismo tipo, mismo alcance, misma unidad -> comparable', () => {
    expect(sonComparables(ref({ id: 'a' }), ref({ id: 'b' }))).toBe(true);
  });
  it('alcance distinto -> no comparable', () => {
    expect(sonComparables(ref({ id: 'a', alcance: 'solo_mobiliario' }), ref({ id: 'b', alcance: 'reforma_completa' }))).toBe(false);
  });
  it('unidad distinta -> no comparable', () => {
    expect(sonComparables(ref({ id: 'a', unidad: 'total' }), ref({ id: 'b', unidad: 'metro_lineal' }))).toBe(false);
  });
  it('tipo de trabajo distinto -> no comparable', () => {
    expect(sonComparables(ref({ id: 'a', tipoTrabajo: 'Cocina' }), ref({ id: 'b', tipoTrabajo: 'Armario' }))).toBe(false);
  });
});

describe('resolverMercadoLocal — escalado geográfico (sin cambios respecto a la Fase 2F)', () => {
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

  it('sin referencia local, escala a regional (Canarias)', () => {
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

  it('una empresa de Tenerife NUNCA usa una referencia de Madrid', () => {
    const referencias = [ref({ nivelGeografico: 'local', zona: 'Madrid' })];
    expect(resolverMercadoLocal(tenerife, referencias, 'Cocina')).toEqual({ disponible: false });
  });

  it('una empresa de Madrid usa Madrid, no Tenerife', () => {
    const referencias = [
      ref({ nivelGeografico: 'local', zona: 'Tenerife' }),
      ref({ id: 'r2', nivelGeografico: 'local', zona: 'Madrid', precioMin: 7000, precioMax: 8000 }),
    ];
    const r = resolverMercadoLocal(madrid, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.zona).toBe('Madrid');
    expect(r.precioMin).toBe(7000);
  });
});

describe('resolverMercadoLocal — filtro de comparabilidad (Ficha Comparable, punto 3)', () => {
  it('referencia con alcance distinto NO entra en el cálculo aunque coincidan tipo y zona', () => {
    const referencias = [
      ref({ id: 'a', alcance: 'mobiliario_encimera', precioMin: 5000, precioMax: 6000, fecha: '2026-06-01' }),
      ref({ id: 'b', alcance: 'reforma_completa', precioMin: 9000, precioMax: 12000, fecha: '2026-05-01' }),
    ];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    // La ancla es la más reciente (a) -> solo se combina con lo que comparte su alcance.
    expect(r.precioMin).toBe(5000);
    expect(r.precioMax).toBe(6000);
    expect(r.numReferencias).toBe(1);
  });

  it('la referencia no comparable no desaparece: se devuelve en referenciasNoComparables', () => {
    const referencias = [
      ref({ id: 'a', alcance: 'mobiliario_encimera', fecha: '2026-06-01' }),
      ref({ id: 'b', alcance: 'reforma_completa', fecha: '2026-05-01' }),
    ];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.referenciasNoComparables.map((x) => x.id)).toEqual(['b']);
  });

  it('referencia con unidad distinta (€/metro lineal vs total) NO se mezcla', () => {
    const referencias = [
      ref({ id: 'a', unidad: 'total', precioMin: 5000, precioMax: 6000, fecha: '2026-06-01' }),
      ref({ id: 'b', unidad: 'metro_lineal', precioMin: 500, precioMax: 900, fecha: '2026-05-01' }),
    ];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.unidad).toBe('total');
    expect(r.precioMax).toBe(6000);
    expect(r.referenciasNoComparables.map((x) => x.id)).toEqual(['b']);
  });

  it('varias referencias comparables entre sí SÍ se combinan con min/max conjunto', () => {
    const referencias = [
      ref({ id: 'a', precioMin: 5000, precioMax: 6000, fecha: '2026-06-01' }),
      ref({ id: 'b', precioMin: 5500, precioMax: 7000, fecha: '2026-05-01' }),
    ];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.precioMin).toBe(5000);
    expect(r.precioMax).toBe(7000);
    expect(r.numReferencias).toBe(2);
  });
});

describe('resolverMercadoLocal — precio "desde" (Ficha Comparable, punto 5)', () => {
  it('un "desde" no amplía artificialmente el techo del rango', () => {
    const referencias = [
      ref({ id: 'a', tipoPrecio: 'publicado', precioMin: 5000, precioMax: 6000, fecha: '2026-06-01' }),
      ref({ id: 'b', tipoPrecio: 'desde', precioMin: 9000, precioMax: 9000, fecha: '2026-07-01' }),
    ];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    // "b" es la ancla (más reciente) pero es "desde" -> igualmente comparable con "a" (mismo alcance/unidad),
    // y aun así su precioMax (9000) NUNCA participa en el cálculo del techo.
    expect(r.precioMax).toBe(6000);
  });

  it('un "desde" SÍ puede aportar un mínimo más bajo observado', () => {
    const referencias = [
      ref({ id: 'a', tipoPrecio: 'publicado', precioMin: 5000, precioMax: 6000, fecha: '2026-06-01' }),
      ref({ id: 'b', tipoPrecio: 'desde', precioMin: 4000, precioMax: 4000, fecha: '2026-07-01' }),
    ];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.precioMin).toBe(4000);
    expect(r.precioMax).toBe(6000);
  });

  it('si TODAS las referencias del grupo son "desde", el máximo conocido es el propio mínimo -- nunca se inventa un techo mayor', () => {
    const referencias = [ref({ id: 'a', tipoPrecio: 'desde', precioMin: 5000, precioMax: 5000 })];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.precioMax).toBe(5000);
  });
});

describe('resolverMercadoLocal — confianza (Ficha Comparable, punto 8)', () => {
  it('una sola referencia nunca produce confianza alta -- aquí, nunca pasa de "baja"', () => {
    const r = resolverMercadoLocal(tenerife, [ref({ impuestosConocidos: true })], 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.confianza).toBe('baja');
  });

  it('impuestos desconocidos en cualquiera de las referencias usadas -> confianza baja, aunque haya 3+', () => {
    const referencias = [
      ref({ id: 'a', impuestosConocidos: true }),
      ref({ id: 'b', impuestosConocidos: true }),
      ref({ id: 'c', impuestosConocidos: false }),
    ];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.confianza).toBe('baja');
  });

  it('dispersión alta entre las referencias usadas -> confianza baja, aunque haya 3+', () => {
    const referencias = [
      ref({ id: 'a', precioMin: 1000, precioMax: 1200, impuestosConocidos: true }),
      ref({ id: 'b', precioMin: 5000, precioMax: 5200, impuestosConocidos: true }),
      ref({ id: 'c', precioMin: 20000, precioMax: 21000, impuestosConocidos: true }),
    ];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.confianza).toBe('baja');
  });

  it('3+ referencias, impuestos conocidos y dispersión baja -> confianza media (nunca alta, techo del origen manual)', () => {
    const referencias = [
      ref({ id: 'a', precioMin: 5000, precioMax: 5200, impuestosConocidos: true }),
      ref({ id: 'b', precioMin: 5100, precioMax: 5300, impuestosConocidos: true }),
      ref({ id: 'c', precioMin: 5200, precioMax: 5400, impuestosConocidos: true }),
    ];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.confianza).toBe('media');
  });

  it('2 referencias (por debajo del umbral mínimo) -> confianza baja', () => {
    const referencias = [
      ref({ id: 'a', impuestosConocidos: true }),
      ref({ id: 'b', impuestosConocidos: true }),
    ];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.confianza).toBe('baja');
  });
});

describe('resolverMercadoLocal — origen "ia_web" (Investigación de Mercado con IA, encargo punto 8)', () => {
  it('una única referencia ia_web nunca sube de "baja", igual que una manual', () => {
    const r = resolverMercadoLocal(tenerife, [ref({ origen: 'ia_web', impuestosConocidos: true })], 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.confianza).toBe('baja');
  });

  it('3+ referencias ia_web, impuestos conocidos y dispersión baja -> igualmente tope "baja" (techo inferior al manual)', () => {
    const referencias = [
      ref({ id: 'a', origen: 'ia_web', precioMin: 5000, precioMax: 5200, impuestosConocidos: true }),
      ref({ id: 'b', origen: 'ia_web', precioMin: 5100, precioMax: 5300, impuestosConocidos: true }),
      ref({ id: 'c', origen: 'ia_web', precioMin: 5200, precioMax: 5400, impuestosConocidos: true }),
    ];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    // Con solo referencias 'manual' este mismo grupo da 'media' (ver test de arriba) —
    // con 'ia_web' el techo del origen menos fiable presente acota el resultado a 'baja'.
    expect(r.confianza).toBe('baja');
  });

  it('mezclar manual + ia_web comparables queda acotado por el techo más bajo presente (ia_web)', () => {
    const referencias = [
      ref({ id: 'a', origen: 'manual', precioMin: 5000, precioMax: 5200, impuestosConocidos: true }),
      ref({ id: 'b', origen: 'manual', precioMin: 5100, precioMax: 5300, impuestosConocidos: true }),
      ref({ id: 'c', origen: 'ia_web', precioMin: 5200, precioMax: 5400, impuestosConocidos: true }),
    ];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.confianza).toBe('baja');
  });

  it('una referencia ia_web sigue participando en el filtro de comparabilidad exactamente igual que una manual', () => {
    const referencias = [
      ref({ id: 'a', origen: 'ia_web', alcance: 'mobiliario_encimera', fecha: '2026-06-01' }),
      ref({ id: 'b', origen: 'ia_web', alcance: 'reforma_completa', fecha: '2026-05-01' }),
    ];
    const r = resolverMercadoLocal(tenerife, referencias, 'Cocina');
    if (!r.disponible) throw new Error('debería estar disponible');
    expect(r.referenciasNoComparables.map((x) => x.id)).toEqual(['b']);
  });
});
