/**
 * Catálogo estático de geografía de España (Fase 2F, "Consenso de Precio",
 * 29/08/2026) — usado para (1) el formulario de ubicación en Ajustes de
 * Empresa y (2) la jerarquía local → regional → nacional del motor de
 * mercado (`mercado-local.ts`). Datos puros, sin llamada a red: ninguna
 * fuente de mercado investigada (INE/ISTAC/CIEC) resuelve por debajo de
 * provincia, así que no hace falta nada más granular (ver auditoría
 * "Brújula de Mercado", sección B).
 *
 * La isla solo aplica a Canarias y Baleares — el resto de comunidades no
 * la necesitan (autorización Fase 2F, condición 1: "en Canarias, la isla
 * debe tener prioridad sobre provincia/comunidad").
 */

export const COMUNIDADES_AUTONOMAS = [
  'Andalucía', 'Aragón', 'Asturias', 'Baleares', 'Canarias', 'Cantabria',
  'Castilla-La Mancha', 'Castilla y León', 'Cataluña', 'Ceuta',
  'Comunidad de Madrid', 'Comunidad Valenciana', 'Extremadura', 'Galicia',
  'La Rioja', 'Melilla', 'Navarra', 'País Vasco', 'Región de Murcia',
] as const;

export type ComunidadAutonoma = typeof COMUNIDADES_AUTONOMAS[number];

export const PROVINCIAS_POR_COMUNIDAD: Record<ComunidadAutonoma, string[]> = {
  'Andalucía': ['Almería', 'Cádiz', 'Córdoba', 'Granada', 'Huelva', 'Jaén', 'Málaga', 'Sevilla'],
  'Aragón': ['Huesca', 'Teruel', 'Zaragoza'],
  'Asturias': ['Asturias'],
  'Baleares': ['Illes Balears'],
  'Canarias': ['Las Palmas', 'Santa Cruz de Tenerife'],
  'Cantabria': ['Cantabria'],
  'Castilla-La Mancha': ['Albacete', 'Ciudad Real', 'Cuenca', 'Guadalajara', 'Toledo'],
  'Castilla y León': ['Ávila', 'Burgos', 'León', 'Palencia', 'Salamanca', 'Segovia', 'Soria', 'Valladolid', 'Zamora'],
  'Cataluña': ['Barcelona', 'Girona', 'Lleida', 'Tarragona'],
  'Ceuta': ['Ceuta'],
  'Comunidad de Madrid': ['Madrid'],
  'Comunidad Valenciana': ['Alicante', 'Castellón', 'Valencia'],
  'Extremadura': ['Badajoz', 'Cáceres'],
  'Galicia': ['A Coruña', 'Lugo', 'Ourense', 'Pontevedra'],
  'La Rioja': ['La Rioja'],
  'Melilla': ['Melilla'],
  'Navarra': ['Navarra'],
  'País Vasco': ['Álava', 'Gipuzkoa', 'Bizkaia'],
  'Región de Murcia': ['Murcia'],
};

/** Solo Canarias y Baleares: el resto de comunidades no necesitan este nivel extra (una provincia peninsular ya identifica un mercado local único). */
export const ISLAS_POR_COMUNIDAD: Partial<Record<ComunidadAutonoma, string[]>> = {
  'Canarias': ['Tenerife', 'Gran Canaria', 'La Palma', 'La Gomera', 'El Hierro', 'Lanzarote', 'Fuerteventura'],
  'Baleares': ['Mallorca', 'Menorca', 'Ibiza', 'Formentera'],
};

/** `true` si esta comunidad autónoma se organiza en islas (Canarias/Baleares) — determina si el formulario de Empresa muestra el selector de isla. */
export function esComunidadInsular(comunidadAutonoma: string): boolean {
  return comunidadAutonoma in ISLAS_POR_COMUNIDAD;
}
