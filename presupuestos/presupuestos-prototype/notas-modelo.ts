/**
 * Modelo de la nota unificada (rediseño del módulo de Notas) — entidad
 * propia del backend, no un array embebido en el cliente como antes
 * (`Cliente.notas`, ver `types.ts`). Una nota puede existir sola o asociada
 * a un cliente y, en el futuro, a un proyecto — `proyectoId` se deja
 * preparado aunque hoy no exista todavía una entidad "Proyecto" propia en
 * la aplicación (`Cliente.proyecto` es solo un campo de texto).
 */

export type PrioridadNota = 'alta' | 'media' | 'baja';
export type EstadoNota = 'abierta' | 'hecha';
/** Cómo se creó el contenido — deja sitio para distinguir en la interfaz una nota dictada de una escrita. */
export type OrigenNota = 'texto' | 'voz';

export type NotaMC = {
  id: string;
  titulo: string;
  contenido: string;
  prioridad: PrioridadNota;
  estado: EstadoNota;
  /** Vacío si la nota no está asociada a ningún cliente. */
  clienteId: string;
  /** Reservado para una fase futura con entidad "Proyecto" propia. */
  proyectoId: string;
  /** Reservado — sin interfaz de gestión todavía. */
  etiquetas: string[];
  origen: OrigenNota;
  creado: string;
  actualizado: string;
};

export const PRIORIDADES: { id: PrioridadNota; orden: number }[] = [
  { id: 'alta', orden: 0 },
  { id: 'media', orden: 1 },
  { id: 'baja', orden: 2 },
];

/** Orden por defecto pedido explícitamente: alta prioridad primero, luego el resto por fecha de creación descendente. */
export function ordenarPorDefecto(notas: readonly NotaMC[]): NotaMC[] {
  const rango = (p: PrioridadNota) => PRIORIDADES.find((x) => x.id === p)?.orden ?? 99;
  return [...notas].sort((a, b) => rango(a.prioridad) - rango(b.prioridad) || b.creado.localeCompare(a.creado));
}
