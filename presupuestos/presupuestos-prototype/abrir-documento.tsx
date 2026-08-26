import type { PresupuestoMC } from './presupuestos-modelo.js';
import type { Empresa } from './use-empresa.js';
import { EditorPresupuestoLienzo } from './editor-presupuesto-lienzo.js';
import { EditorDocumento } from './editor-documento.js';

/**
 * Punto único de entrada para abrir un presupuesto con editor en pantalla
 * completa (`formato:'lienzo'` o `formato:'documento'`) — ningún otro
 * componente de la aplicación debe importar `EditorPresupuestoLienzo` ni
 * `EditorDocumento` directamente.
 *
 * Ver `ARQUITECTURA-MOTOR-DOCUMENTAL.md`, sección "Transición desde el
 * editor legado": este componente es la pieza que hace que el resto de la
 * aplicación nunca necesite saber que existen dos motores distintos —
 * solo sabe pedir "abre este presupuesto", y aquí se decide con qué editor.
 */
export type AbrirDocumentoProps = {
  presupuesto: PresupuestoMC;
  clienteId: string;
  clienteNombre: string;
  empresa: Empresa;
  onGuardar: (p: PresupuestoMC) => Promise<void>;
  onVolver: () => void;
  onCambiarLogoEmpresa?: (logo: string) => void;
  /** Reasignar el cliente de un presupuesto en `formato:'documento'` — ver `EditorDocumentoProps.onCambiarCliente`. El editor legado (`formato:'lienzo'`) no lo ofrece. */
  clientesDisponibles?: { id: string; nombre: string }[];
  onCambiarCliente?: (nuevoClienteId: string) => Promise<void>;
};

export function AbrirDocumento({ presupuesto, clienteId, clienteNombre, empresa, onGuardar, onVolver, onCambiarLogoEmpresa, clientesDisponibles, onCambiarCliente }: AbrirDocumentoProps) {
  if (presupuesto.formato === 'lienzo') {
    return (
      <EditorPresupuestoLienzo
        presupuesto={presupuesto}
        clienteId={clienteId}
        clienteNombre={clienteNombre}
        empresa={empresa}
        onGuardar={onGuardar}
        onVolver={onVolver}
        onCambiarLogoEmpresa={onCambiarLogoEmpresa}
      />
    );
  }

  if (presupuesto.formato === 'documento') {
    return (
      <EditorDocumento
        contenedor={presupuesto}
        precioVinculado={presupuesto.precioTotal}
        firmaClienteUrl={presupuesto.firmaClienteUrl}
        firmaClienteFecha={presupuesto.firmaClienteFecha}
        clienteId={clienteId}
        clienteNombre={clienteNombre}
        empresa={empresa}
        onGuardar={(c) => onGuardar({ ...presupuesto, ...c })}
        onVolver={onVolver}
        onCambiarLogoEmpresa={onCambiarLogoEmpresa}
        clientesDisponibles={clientesDisponibles}
        onCambiarCliente={onCambiarCliente}
      />
    );
  }

  return null;
}
