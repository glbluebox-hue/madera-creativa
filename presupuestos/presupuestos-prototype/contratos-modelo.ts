/**
 * Contrato (Motor Documental, Incremento 12 — segundo tipo de documento).
 * A diferencia de `PresupuestoMC`, nace ya como `DocumentoMC` puro: sin
 * `formato` ni `contenidoLienzo` (esa dualidad es transición histórica
 * propia de Presupuesto, ver ARQUITECTURA-MOTOR-DOCUMENTAL.md) — cumple
 * igualmente la forma `DocumentoContenedorMC` que pide `editor-documento.tsx`,
 * sin que el editor necesite saber que existe un tipo "Contrato".
 */
export type ContratoMC = {
  id: string;
  clienteId: string;
  titulo: string;
  /** `DocumentoMC` (ver documento-modelo.ts). */
  contenidoDocumento: Record<string, unknown>;
  creado: string;
  actualizado: string;
};
