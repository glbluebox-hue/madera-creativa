import { candidatoAReferenciaMercado, detectarEstanciaMedida, formatearEstancia } from './candidatos-mercado.js';
import type { CandidatoMercado } from './api.js';
import type { Estancia } from './types.js';

/**
 * Guardado de un candidato de IA (encargo "Investigación de Mercado con
 * IA", puntos 3, 4 y 9) — función pura, sin red, sin componente: cubre
 * "candidato seleccionado → se guarda con origen correcto" y "nunca
 * inventar un dato" sin necesitar simular clics (el repo no tiene
 * infraestructura de tests de interacción de React, ver
 * `metricas-por-tipo-vista.spec.tsx`).
 */

const CANDIDATO_BASE: CandidatoMercado = {
  precio: 5500, moneda: 'EUR', ubicacion: 'Tenerife', tipoTrabajoDetectado: 'Cocina',
  queIncluye: 'mobiliario y encimera', queNoIncluye: 'electrodomésticos', calidad: 'estandar',
  ivaIncluido: 'si', instalacionIncluida: 'si', fechaReferencia: '2026-05-01', fuente: 'Habitissimo',
  url: 'https://www.habitissimo.es/precio-cocina-tenerife', extracto: 'Cocina a medida por 5500€.',
  confianza: 'media', explicacionComparabilidad: 'Mismo alcance y zona.',
};

const CONTEXTO = { tipoTrabajo: 'Cocina', nivelGeografico: 'local' as const, zona: 'Tenerife', alcance: 'mobiliario_encimera' as const, fechaInvestigacion: '2026-08-30T10:00:00.000Z' };

describe('candidatoAReferenciaMercado', () => {
  it('mapea origen ia_web y conserva la trazabilidad (URL, extracto, fecha de investigación)', () => {
    const r = candidatoAReferenciaMercado({ ...CANDIDATO_BASE }, CONTEXTO);
    expect(r.origen).toBe('ia_web');
    expect(r.fuenteUrl).toBe(CANDIDATO_BASE.url);
    expect(r.extracto).toBe(CANDIDATO_BASE.extracto);
    expect(r.fechaInvestigacion).toBe(CONTEXTO.fechaInvestigacion);
  });

  it('el precio de un candidato se guarda como "desde" (un único valor, no un rango verificado) — nunca define el techo del mercado', () => {
    const r = candidatoAReferenciaMercado({ ...CANDIDATO_BASE }, CONTEXTO);
    expect(r.tipoPrecio).toBe('desde');
    expect(r.precioMin).toBe(5500);
    expect(r.precioMax).toBe(5500);
  });

  it('IVA/IGIC "sí" -> impuestosConocidos true; "no"/"desconocido" -> nunca se asume incluido', () => {
    expect(candidatoAReferenciaMercado({ ...CANDIDATO_BASE, ivaIncluido: 'si' }, CONTEXTO).impuestosConocidos).toBe(true);
    expect(candidatoAReferenciaMercado({ ...CANDIDATO_BASE, ivaIncluido: 'no' }, CONTEXTO).impuestosConocidos).toBe(false);
    expect(candidatoAReferenciaMercado({ ...CANDIDATO_BASE, ivaIncluido: 'desconocido' }, CONTEXTO).impuestosConocidos).toBe(false);
  });

  it('un dato que la fuente no determinó (calidad null) se guarda tal cual null, nunca se inventa un valor por defecto', () => {
    const r = candidatoAReferenciaMercado({ ...CANDIDATO_BASE, calidad: null }, CONTEXTO);
    expect(r.nivelCalidad).toBeNull();
  });

  it('sin fecha de referencia de la fuente, usa la fecha de hoy en vez de dejarla vacía (el esquema exige una fecha)', () => {
    const r = candidatoAReferenciaMercado({ ...CANDIDATO_BASE, fechaReferencia: null }, CONTEXTO);
    expect(r.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('usa la zona y el alcance del contexto de búsqueda, no algo derivado del candidato', () => {
    const r = candidatoAReferenciaMercado({ ...CANDIDATO_BASE }, { ...CONTEXTO, zona: 'Canarias', nivelGeografico: 'regional', alcance: 'reforma_completa' });
    expect(r.zona).toBe('Canarias');
    expect(r.nivelGeografico).toBe('regional');
    expect(r.alcance).toBe('reforma_completa');
  });
});

function estancia(extra: Partial<Estancia> = {}): Estancia {
  return { id: 'e1', nombre: 'Cocina', ...extra };
}

describe('detectarEstanciaMedida — reutiliza la Pizarra de medición, nunca adivina entre varias', () => {
  it('una única estancia cuyo nombre coincide con el tipo de trabajo se detecta automáticamente', () => {
    const r = detectarEstanciaMedida([estancia({ nombre: 'Cocina', ancho: 3.7, alto: 2.5 })], 'Cocina');
    expect(r?.id).toBe('e1');
  });

  it('coincide aunque el nombre tenga mayúsculas/acentos distintos', () => {
    const r = detectarEstanciaMedida([estancia({ nombre: 'cocina principal' })], 'Cocina');
    expect(r).not.toBeNull();
  });

  it('varias estancias, ninguna coincide por nombre -> null (nunca adivina)', () => {
    const r = detectarEstanciaMedida([estancia({ id: 'a', nombre: 'Salón' }), estancia({ id: 'b', nombre: 'Baño' })], 'Cocina');
    expect(r).toBeNull();
  });

  it('sin estancias -> null', () => {
    expect(detectarEstanciaMedida(undefined, 'Cocina')).toBeNull();
    expect(detectarEstanciaMedida([], 'Cocina')).toBeNull();
  });

  it('dos estancias que coinciden igualmente por nombre -> null (ambiguo, que elija el usuario)', () => {
    const r = detectarEstanciaMedida([estancia({ id: 'a', nombre: 'Cocina' }), estancia({ id: 'b', nombre: 'Cocina office' })], 'Cocina');
    expect(r).toBeNull();
  });
});

describe('formatearEstancia — nunca inventa una medida que no está', () => {
  it('incluye solo los campos de medida realmente presentes', () => {
    const texto = formatearEstancia(estancia({ nombre: 'Cocina', ancho: 3.7, alto: 2.5 }));
    expect(texto).toContain('ancho 3.7 m');
    expect(texto).toContain('alto 2.5 m');
    expect(texto).not.toContain('fondo');
  });

  it('sin ninguna medida numérica, devuelve cadena vacía en vez de un texto vacío engañoso', () => {
    expect(formatearEstancia(estancia({ nombre: 'Cocina' }))).toBe('');
  });
});
