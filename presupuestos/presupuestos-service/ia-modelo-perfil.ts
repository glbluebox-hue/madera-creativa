/**
 * Perfiles de modelo — desacoplan "qué tipo de tarea es esta" de "qué
 * proveedor+modelo concreto la resuelve". Una capacidad (`ia-capacidad.ts`)
 * declara el perfil que necesita, nunca un nombre de modelo concreto —
 * `ia-selector-modelo.ts` es el único lugar que traduce un perfil a un
 * proveedor+modelo real.
 */

/**
 * Tipo de tarea que una capacidad puede requerir. `vision`/`ocr`/`voz` están
 * reservados: forman parte del contrato para que las capacidades futuras ya
 * puedan declararlos, pero no tienen ninguna entrada en
 * `ia-selector-modelo.ts` todavía — pedirlos lanza un error explícito en vez
 * de caer silenciosamente a otro modelo.
 */
export type PerfilModeloRequerido = 'razonamiento' | 'rapido_economico' | 'vision' | 'ocr' | 'voz';

/** Proveedor+modelo concreto que resuelve un perfil. */
export type ConfiguracionModelo = {
  proveedor: string;
  modelo: string;
};
