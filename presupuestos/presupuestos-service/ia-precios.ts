/**
 * Precio por millón de tokens (USD) de cada modelo — mantenimiento manual,
 * a actualizar cuando el proveedor cambie tarifas. El registro de tokens en
 * `IaUsoModel` (la fuente de verdad) no depende de esta tabla: si un modelo
 * falta aquí, `costeEstimadoUsd` simplemente sale a 0, nunca se pierde el
 * dato de tokens real.
 */
const PRECIOS_POR_MILLON_TOKENS: Record<string, { entrada: number; salida: number }> = {
  'gpt-4o-mini': { entrada: 0.15, salida: 0.60 },
  'gpt-4o': { entrada: 2.50, salida: 10.00 },
};

export function calcularCosteUsd(modelo: string, tokensEntrada: number, tokensSalida: number): number {
  const precio = PRECIOS_POR_MILLON_TOKENS[modelo];
  if (!precio) return 0;
  return (tokensEntrada / 1_000_000) * precio.entrada + (tokensSalida / 1_000_000) * precio.salida;
}
