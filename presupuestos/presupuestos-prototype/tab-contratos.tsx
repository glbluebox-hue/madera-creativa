import type { Cliente, Proyecto } from './types.js';
import type { Empresa } from './use-empresa.js';
import { ContratosVista } from './contratos-vista.js';

export type TabContratosProps = {
  /** Cliente (identidad) al que pertenece el proyecto — solo para el nombre a mostrar. */
  cliente: Cliente;
  proyecto: Proyecto;
  empresa: Empresa;
  onActualizarEmpresa: (cambios: Partial<Empresa>) => void;
};

/**
 * Pestaña "Contratos" de la ficha de proyecto (Motor Documental, Incremento
 * 12 — segundo tipo de documento). Mismo patrón que `TabPresupuestosIA`,
 * envolviendo `ContratosVista` en vez de `PresupuestosVista`. El parámetro
 * `clienteId` de `ContratosVista` sigue llamándose así, pero desde el
 * incremento "Cliente ≠ Proyecto" (20/08/2026) se le pasa el id del
 * PROYECTO — es la clave real de aislamiento entre los distintos trabajos
 * de un mismo cliente.
 */
export function TabContratos({ cliente, proyecto, empresa, onActualizarEmpresa }: TabContratosProps) {
  return (
    <ContratosVista
      clienteId={proyecto.id}
      clienteNombre={proyecto.proyecto || cliente.nombre}
      empresa={empresa}
      onActualizarEmpresa={onActualizarEmpresa}
    />
  );
}
