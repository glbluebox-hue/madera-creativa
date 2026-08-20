/**
 * Genera un identificador único simple.
 */
export function generarId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
