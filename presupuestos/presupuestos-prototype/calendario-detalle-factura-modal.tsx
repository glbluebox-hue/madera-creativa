import { useState, useEffect } from 'react';
import * as api from './api.js';
import type { Factura, Proveedor } from './types.js';
import { EscanerFactura } from './escaner-factura.js';
import { autoCrearProveedorDeFactura, type DatosProveedorDetectados } from './proveedor-utils.js';
import type { PlanAcceso } from './planes.js';
import styles from './styles.module.css';

/**
 * Ver/editar una factura directamente desde el Calendario — mismo patrón que
 * `CalendarioDetalleNotaModal`/`CalendarioDetalleTareaModal`: el
 * `ElementoCalendario` agregado no trae la factura completa, así que se pide
 * por id justo antes de abrir el editor real (`EscanerFactura`), nunca se
 * duplica su lógica (arregla el bug reportado por el usuario, 24/10/2026:
 * antes caía en la delegación genérica de `onAbrirElemento`, que al no
 * distinguir tipos abría siempre la sección Facturas genérica — o, si la
 * factura tenía `proyectoId`, el proyecto vinculado — en vez de la factura
 * concreta pulsada).
 *
 * La factura se pide completa antes de montar `EscanerFactura` (nunca al
 * revés): ese componente construye su lista de páginas con un estado inicial
 * perezoso que solo se calcula en el montaje — si se montara con
 * `facturaEditar` todavía vacío, la vista quedaría vacía aunque la factura
 * llegase justo después (mismo bug ya documentado en `facturas.tsx`,
 * `abrirEdicion`).
 */
export function CalendarioDetalleFacturaModal({
  facturaId, clientes, proveedores, crearProveedor, actualizarProveedor, plan, esAdmin, onCambio, onCerrar,
}: {
  facturaId: string;
  clientes: { id: string; nombre: string }[];
  proveedores: Proveedor[];
  crearProveedor?: (p: Omit<Proveedor, 'id' | 'creado'>) => Proveedor;
  actualizarProveedor?: (p: Proveedor) => void;
  plan?: PlanAcceso;
  esAdmin?: boolean;
  onCambio: () => void;
  onCerrar: () => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [factura, setFactura] = useState<Factura | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.obtenerFactura(facturaId)
      .then(setFactura)
      .catch(() => setError('No se pudo cargar la factura.'))
      .finally(() => setCargando(false));
  }, [facturaId]);

  const guardar = async (fSinResolver: Factura, datosProveedorDetectados?: DatosProveedorDetectados) => {
    const proveedorId = autoCrearProveedorDeFactura(fSinResolver, proveedores, crearProveedor, actualizarProveedor, datosProveedorDetectados);
    await api.guardarFactura({ ...fSinResolver, proveedorId });
    onCambio();
    onCerrar();
  };

  if (cargando || !factura) {
    return (
      <div className={styles.overlay} onClick={onCerrar}>
        <div className={styles.modal} style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
          <h3 className={styles.modalTitulo}>Factura</h3>
          {cargando ? (
            <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>Cargando…</p>
          ) : (
            <p style={{ color: 'var(--rojo)', fontSize: '0.85rem' }}>{error || 'Esta factura ya no existe.'}</p>
          )}
          <div className={styles.modalAcciones}>
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar}>Cerrar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <EscanerFactura
      clientes={clientes}
      proveedores={proveedores}
      onGuardar={guardar}
      onCerrar={onCerrar}
      facturaEditar={factura}
      plan={plan}
      esAdmin={esAdmin}
    />
  );
}
