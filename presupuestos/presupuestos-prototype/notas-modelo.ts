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
/** `'lista'` (26/08/2026): checklist con `items` en vez de un `contenido` de texto libre — no se puede tachar una línea suelta dentro de un párrafo, así que "comprar pincel, comprar lijas…" necesita items propios, cada uno con su `hecha`. */
export type TipoNota = 'nota' | 'lista';

/**
 * Un elemento de una nota de tipo `'lista'` — parecido a `Tarea`
 * (`Proyecto.tareas`, `tab-tareas.tsx`), embebido en la nota en vez de en
 * un proyecto, pero CON prioridad (petición explícita del usuario,
 * 26/08/2026, tras quitarla por error al simplificar el checklist): cada
 * tarea suelta puede tener su propia urgencia, igual que una nota normal.
 */
export type ItemLista = { id: string; texto: string; hecha: boolean; prioridad: PrioridadNota };

export type NotaMC = {
  id: string;
  titulo: string;
  contenido: string;
  tipo: TipoNota;
  /** Solo tiene sentido cuando `tipo === 'lista'`; vacío en una nota de texto normal. */
  items: ItemLista[];
  prioridad: PrioridadNota;
  estado: EstadoNota;
  /** Vacío si la nota no está asociada a ningún cliente. */
  clienteId: string;
  /** Reservado para una fase futura con entidad "Proyecto" propia. */
  proyectoId: string;
  /** Reservado — sin interfaz de gestión todavía. */
  etiquetas: string[];
  origen: OrigenNota;
  /** Fecha ISO (AAAA-MM-DD) opcional a la que se "clava" la nota (Calendario, 30/08/2026) — ausente en la inmensa mayoría de notas; solo si se rellena, la nota aparece también en el Calendario. */
  fecha?: string;
  creado: string;
  actualizado: string;
};

export const PRIORIDADES: { id: PrioridadNota; orden: number }[] = [
  { id: 'alta', orden: 0 },
  { id: 'media', orden: 1 },
  { id: 'baja', orden: 2 },
];

function rangoPrioridad(p: PrioridadNota): number {
  return PRIORIDADES.find((x) => x.id === p)?.orden ?? 99;
}

/** Orden por defecto pedido explícitamente: alta prioridad primero, luego el resto por fecha de creación descendente. */
export function ordenarPorDefecto(notas: readonly NotaMC[]): NotaMC[] {
  return [...notas].sort((a, b) => rangoPrioridad(a.prioridad) - rangoPrioridad(b.prioridad) || b.creado.localeCompare(a.creado));
}

/**
 * Orden de los items de una lista: solo por prioridad, con `Array.sort`
 * (estable) — a propósito SIN segundo criterio de fecha, porque un item no
 * tiene `creado` propio. Al no depender de `hecha`, marcar/desmarcar una
 * tarea nunca cambia su posición (petición explícita del usuario: el
 * checklist no debe "saltar" ni reordenarse solo al tocar una casilla).
 */
export function ordenarItemsLista(items: readonly ItemLista[]): ItemLista[] {
  return [...items].sort((a, b) => rangoPrioridad(a.prioridad) - rangoPrioridad(b.prioridad));
}
