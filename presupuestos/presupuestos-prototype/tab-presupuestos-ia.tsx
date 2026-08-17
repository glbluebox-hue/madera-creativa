import type { Cliente } from './types.js';
import type { Empresa } from './use-empresa.js';
import { PresupuestosVista } from './presupuestos-vista.js';

export type TabPresupuestosIAProps = {
  cliente: Cliente;
  empresa: Empresa;
  onActualizarEmpresa: (cambios: Partial<Empresa>) => void;
  /** Refresca el cliente en la ficha tras aceptar un presupuesto (Fase 1) — ver `PresupuestosVista`. */
  onActualizarCliente: (cliente: Cliente) => void;
};

/**
 * Pestaña "Presupuestos IA" de la ficha de cliente (Fase 5) — distinta de
 * la pestaña "Presupuestos" ya existente (que muestra ingresos/gastos/margen
 * calculados de los movimientos del cliente, sin tocar). Esta muestra los
 * presupuestos narrativos estructurados que crea y modifica el asistente
 * de IA — es donde se ve, dentro de la propia aplicación, el resultado
 * real de una orden en lenguaje natural. Desde Fase 6 también incluye los
 * presupuestos en modo lienzo (plantilla libre por hojas).
 */
export function TabPresupuestosIA({ cliente, empresa, onActualizarEmpresa, onActualizarCliente }: TabPresupuestosIAProps) {
  return (
    <PresupuestosVista
      clienteId={cliente.id}
      clienteNombre={cliente.nombre}
      empresa={empresa}
      onActualizarEmpresa={onActualizarEmpresa}
      onClienteActualizado={onActualizarCliente}
    />
  );
}
