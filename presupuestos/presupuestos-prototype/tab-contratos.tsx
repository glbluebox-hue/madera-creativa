import type { Cliente } from './types.js';
import type { Empresa } from './use-empresa.js';
import { ContratosVista } from './contratos-vista.js';

export type TabContratosProps = {
  cliente: Cliente;
  empresa: Empresa;
  onActualizarEmpresa: (cambios: Partial<Empresa>) => void;
};

/**
 * Pestaña "Contratos" de la ficha de cliente (Motor Documental, Incremento
 * 12 — segundo tipo de documento). Mismo patrón que `TabPresupuestosIA`,
 * envolviendo `ContratosVista` en vez de `PresupuestosVista`.
 */
export function TabContratos({ cliente, empresa, onActualizarEmpresa }: TabContratosProps) {
  return (
    <ContratosVista
      clienteId={cliente.id}
      clienteNombre={cliente.nombre}
      empresa={empresa}
      onActualizarEmpresa={onActualizarEmpresa}
    />
  );
}
