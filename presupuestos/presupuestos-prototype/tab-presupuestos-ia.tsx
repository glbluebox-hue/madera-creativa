import type { Cliente, Proyecto } from './types.js';
import type { Empresa } from './use-empresa.js';
import { PresupuestosVista } from './presupuestos-vista.js';

export type TabPresupuestosIAProps = {
  cliente: Cliente;
  proyecto: Proyecto;
  empresa: Empresa;
  onActualizarEmpresa: (cambios: Partial<Empresa>) => void;
  /** Refresca el proyecto en la ficha tras aceptar un presupuesto (Fase 1) — ver `PresupuestosVista`. */
  onActualizarProyecto: (proyecto: Proyecto) => void;
};

/**
 * Pestaña "Presupuestos IA" de la ficha de proyecto (Fase 5) — distinta de
 * la pestaña "Presupuestos" ya existente (que muestra ingresos/gastos/margen
 * calculados de los movimientos del proyecto, sin tocar). Esta muestra los
 * presupuestos narrativos estructurados que crea y modifica el asistente
 * de IA — es donde se ve, dentro de la propia aplicación, el resultado
 * real de una orden en lenguaje natural. Desde Fase 6 también incluye los
 * presupuestos en modo lienzo (plantilla libre por hojas). Enlazados al
 * PROYECTO abierto (incremento "Cliente ≠ Proyecto", 20/08/2026), nunca
 * mezclados con los presupuestos de otro proyecto del mismo cliente.
 */
export function TabPresupuestosIA({ cliente, proyecto, empresa, onActualizarEmpresa, onActualizarProyecto }: TabPresupuestosIAProps) {
  return (
    <PresupuestosVista
      clienteId={cliente.id}
      proyectoId={proyecto.id}
      clienteNombre={cliente.nombre}
      empresa={empresa}
      onActualizarEmpresa={onActualizarEmpresa}
      onProyectoActualizado={onActualizarProyecto}
    />
  );
}
