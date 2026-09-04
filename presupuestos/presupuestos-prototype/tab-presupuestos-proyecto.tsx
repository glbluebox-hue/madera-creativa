import { useState, useEffect, useCallback } from 'react';
import type { Cliente, Proyecto } from './types.js';
import type { PresupuestoMC } from './presupuestos-modelo.js';
import type { Empresa } from './use-empresa.js';
import { AbrirDocumento } from './abrir-documento.js';
import { VisorPresupuestoFirmado } from './visor-presupuesto-firmado.js';
import { formatoEuroPrivado, formatoFecha } from './calculos.js';
import { analizarPrecioPresupuesto } from './inteligencia-precios.js';
import { AnalisisPrecioPresupuesto } from './analisis-precio-presupuesto.js';
import type { PlanAcceso } from './planes.js';
import * as api from './api.js';
import styles from './styles.module.css';

export type TabPresupuestosProyectoProps = {
  cliente: Cliente;
  proyecto: Proyecto;
  empresa: Empresa;
  onActualizarEmpresa: (cambios: Partial<Empresa>) => void;
  /** Ver `EditorDocumentoProps.plan`/`AnalisisPrecioCompletoProps.plan` (Fase 4, 05/09/2026). */
  plan?: PlanAcceso;
};

/**
 * Lista de solo lectura (+ abrir) de los presupuestos de este proyecto,
 * dentro de la propia ficha del cliente — pedido real, 25/08/2026, tras
 * quitar la pestaña "Presupuestos IA": sin esto no había ninguna forma de
 * ver desde la ficha qué presupuestos tiene un cliente sin ir a la sección
 * global "Presupuestos" y buscar su nombre a mano.
 *
 * A propósito NO reutiliza `PresupuestosVista` (la que usaba la pestaña
 * retirada) — esa vista trae su propio "+ Crear presupuesto" y su propio
 * asistente de IA integrados, exactamente lo que se pidió quitar de la
 * ficha del cliente. Crear presupuestos sigue siendo solo desde la
 * sección "Presupuestos"; aquí solo se listan y se abren los que ya existen.
 */
export function TabPresupuestosProyecto({ cliente, proyecto, empresa, onActualizarEmpresa, plan }: TabPresupuestosProyectoProps) {
  const [presupuestos, setPresupuestos] = useState<PresupuestoMC[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<PresupuestoMC | null>(null);
  /** Un presupuesto ya aceptado abre primero el visor de solo lectura ("el contrato"), no el editor — petición explícita del usuario, 31/08/2026. "Editar" desde ahí sigue llevando al editor de siempre. */
  const [firmadoAVer, setFirmadoAVer] = useState<PresupuestoMC | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    api.obtenerPresupuestosDeProyecto(proyecto.id)
      .then(setPresupuestos)
      .catch((e) => setError(String(e).replace(/^Error:\s*/, '')))
      .finally(() => setCargando(false));
  }, [proyecto.id]);

  useEffect(() => { cargar(); }, [cargar]);

  // Fase 2C ("Trabajos comparables") — tipo de trabajo ya guardado en este
  // proyecto, si lo hay; `null` si nunca se rellenó (2A es opcional).
  const tipoTrabajoProyecto = proyecto.caracteristicas?.find((c) => c.clave === 'tipoTrabajo')?.valor ?? null;

  const guardar = async (p: PresupuestoMC) => {
    const guardado = await api.guardarPresupuesto(p);
    setPresupuestos((prev) => prev.map((x) => (x.id === guardado.id ? guardado : x)));
    setEditor(guardado);
  };

  if (firmadoAVer) {
    return (
      <VisorPresupuestoFirmado
        presupuesto={firmadoAVer}
        empresa={empresa}
        onCerrar={() => setFirmadoAVer(null)}
        onEditar={() => { setEditor(firmadoAVer); setFirmadoAVer(null); }}
      />
    );
  }

  if (editor) {
    return (
      <AbrirDocumento
        presupuesto={editor}
        clienteId={proyecto.id}
        clienteNombre={proyecto.proyecto || cliente.nombre}
        empresa={empresa}
        onGuardar={guardar}
        onVolver={() => { setEditor(null); cargar(); }}
        onCambiarLogoEmpresa={(logo) => onActualizarEmpresa({ logo })}
        plan={plan}
      />
    );
  }

  if (cargando) return <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>Cargando presupuestos…</p>;

  return (
    <div>
      {error && <p style={{ color: 'var(--rojo)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}
      {presupuestos.length === 0 ? (
        <div className={styles.vacio}>
          <div className={styles.vacioIcono} style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          </div>
          <p>Este proyecto todavía no tiene ningún presupuesto. Créalo desde la sección "Presupuestos".</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {presupuestos.map((p) => {
            // Snapshot congelado si ya se aceptó (Inteligencia de Precios,
            // Fase 1) — nunca recalculado; en vivo (con el `proyecto` ya
            // cargado en esta pantalla) mientras sigue en borrador.
            const analisis = p.estado === 'aceptado' && p.analisisPrecio
              ? p.analisisPrecio
              : analizarPrecioPresupuesto(p.precioTotal, proyecto, empresa.margenObjetivoPorcentaje);
            return (
              <div key={p.id} className={styles.filaLista} style={{ padding: '1rem' }}>
                <button
                  onClick={() => (p.estado === 'aceptado' ? setFirmadoAVer(p) : setEditor(p))}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                    border: 'none', padding: 0, background: 'transparent', font: 'inherit', color: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <strong style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {p.titulo}
                      {p.estado === 'aceptado' && (
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--verde)', background: 'var(--verde-bg)', padding: '0.1rem 0.4rem', borderRadius: 'var(--radio-full, 999px)' }}>✓ Aceptado</span>
                      )}
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--topo-muy-claro)' }}>{formatoFecha(p.creado)}</span>
                  </div>
                  <strong style={{ fontSize: '0.95rem' }}>{formatoEuroPrivado(p.precioTotal, false)}</strong>
                </button>
                <div onClick={(e) => e.stopPropagation()}>
                  <AnalisisPrecioPresupuesto
                    analisis={analisis}
                    esSnapshot={p.estado === 'aceptado' && !!p.analisisPrecio}
                    tipoTrabajo={tipoTrabajoProyecto}
                    excluirId={proyecto.id}
                    proyectoEstado={proyecto.estado}
                    ubicacionEmpresa={{ comunidadAutonoma: empresa.comunidadAutonoma, provincia: empresa.provincia, isla: empresa.isla }}
                    estancias={proyecto.estancias}
                    proyectoId={proyecto.id}
                    plan={plan}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
