/**
 * Regla fiscal de deducibilidad de un gasto periódico (auditoría
 * Facturas/Trimestral, 23/08/2026). Un vehículo de amortización marcado por
 * el propio usuario como `afectacionExclusiva: false` ("también uso
 * particular") no es deducible en IRPF (art. 22 RIRPF: o uso exclusivo, o no
 * deducible — sin proporción intermedia) — antes, la interfaz ya avisaba de
 * esto pero el cálculo del Trimestral lo seguía incluyendo igualmente.
 *
 * `null`/`undefined` (el resto de tipos de gasto periódico, que no usan este
 * campo) se consideran deducibles — mismo comportamiento que ya había antes
 * de esta corrección, sin introducir una interpretación nueva.
 */
export function esGastoPeriodicoDeducible(g: { afectacionExclusiva?: boolean | null }): boolean {
  return g.afectacionExclusiva !== false;
}
