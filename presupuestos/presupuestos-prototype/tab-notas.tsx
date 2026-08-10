import type { Cliente } from './types.js';
import { NotasVista } from './notas-vista.js';

/** Props del panel de notas del cliente. */
export type TabNotasProps = {
  /** Cliente con sus notas. */
  cliente: Cliente;
  /** Guarda los cambios. */
  onActualizar: (cliente: Cliente) => void;
};

/**
 * Pestaña "Notas" de la ficha de cliente — usa la vista unificada de Notas
 * (rediseño), fijada a este cliente: sin selector, todo lo que se cree
 * aquí queda asociado automáticamente. Las notas antiguas embebidas en
 * `cliente.notas` (formato previo, sin prioridad) se migran una sola vez al
 * sistema nuevo — nada se pierde, solo cambian de sitio.
 */
export function TabNotas({ cliente, onActualizar }: TabNotasProps) {
  return (
    <NotasVista
      clienteFijo={{ id: cliente.id, nombre: cliente.nombre }}
      notasLegacy={cliente.notas ?? []}
      onLegacyMigrada={() => onActualizar({ ...cliente, notas: [] })}
    />
  );
}
