/**
 * Regla fiscal de deducibilidad de un gasto periódico (auditoría
 * Facturas/Trimestral, 23/08/2026) — mismo criterio que la versión del
 * frontend (`gasto-periodico-fiscal.ts` en `presupuestos-prototype`, mismo
 * patrón de duplicación ya aceptado en este proyecto para utilidades
 * puras pequeñas sin estado). Un vehículo de amortización marcado como
 * `afectacionExclusiva: false` ("también uso particular") no es deducible
 * en IRPF (art. 22 RIRPF) — se excluye del documento para el asesor, sin
 * borrar ni modificar el gasto periódico en sí.
 */
export function esGastoPeriodicoDeducible(g: { afectacionExclusiva?: boolean | null }): boolean {
  return g.afectacionExclusiva !== false;
}
