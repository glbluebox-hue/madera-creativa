import type { Cliente, Proyecto } from './types.js';
import { NotasVista } from './notas-vista.js';

/** Props del panel de notas del proyecto. */
export type TabNotasProps = {
  /** Cliente (identidad) al que pertenece el proyecto — solo para el nombre a mostrar. */
  cliente: Cliente;
  /** Proyecto con sus notas. */
  proyecto: Proyecto;
  /** Guarda los cambios del proyecto (legado de notas migrado). */
  onActualizar: (proyecto: Proyecto) => void;
};

/**
 * Pestaña "Notas" de la ficha de proyecto — usa la vista unificada de
 * Notas (rediseño), fijada a este PROYECTO (incremento "Cliente ≠
 * Proyecto", 20/08/2026: antes se fijaba al cliente, mezclando las notas
 * de todos sus proyectos entre sí): sin selector, todo lo que se cree aquí
 * queda asociado automáticamente. Las notas antiguas embebidas en
 * `proyecto.notas` (formato previo, sin prioridad) se migran una sola vez
 * al sistema nuevo — nada se pierde, solo cambian de sitio.
 */
export function TabNotas({ cliente, proyecto, onActualizar }: TabNotasProps) {
  return (
    <NotasVista
      clienteFijo={{ id: proyecto.id, nombre: proyecto.proyecto || cliente.nombre }}
      notasLegacy={proyecto.notas ?? []}
      onLegacyMigrada={() => onActualizar({ ...proyecto, notas: [] })}
    />
  );
}
