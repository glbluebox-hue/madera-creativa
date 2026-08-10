import { useState, useEffect, useCallback } from 'react';
import * as api from './api.js';
import type { PresupuestoMC } from './presupuestos-modelo.js';
import type { Empresa } from './use-empresa.js';
import { EditorPresupuestoLienzo } from './editor-presupuesto-lienzo.js';
import { formatoEuro, formatoFecha } from './calculos.js';
import styles from './styles.module.css';

export type PresupuestosListaGlobalProps = {
  /** Lista ligera de clientes — para el nombre en cada tarjeta y el selector "+ Crear presupuesto". */
  clientes: { id: string; nombre: string }[];
  empresa: Empresa;
  /** Persiste cambios de empresa — usado para el clic-en-el-logo del editor de lienzo. */
  onActualizarEmpresa: (cambios: Partial<Empresa>) => void;
  /** Navega a la ficha de un cliente — usado para abrir presupuestos en modo simple (esta vista no los edita directamente). */
  onAbrirCliente: (clienteId: string) => void;
  /** Abre el selector de cliente automáticamente al montar (nav "Crear presupuesto" del sidebar). */
  abrirSelectorInicial?: boolean;
  /** Se llama una vez consumida la bandera anterior. */
  onSelectorInicialAbierto?: () => void;
};

/**
 * Lista global de presupuestos de todos los clientes (Fase 6 — pestaña
 * "Documentos" de la sección Presupuestos). Los de modo lienzo se abren
 * directamente aquí con `EditorPresupuestoLienzo`; los de modo simple
 * (creados a mano o por el asistente de IA en la ficha de cliente) navegan
 * a esa ficha — esta vista no reimplementa su edición.
 */
export function PresupuestosListaGlobal({ clientes, empresa, onActualizarEmpresa, onAbrirCliente, abrirSelectorInicial, onSelectorInicialAbierto }: PresupuestosListaGlobalProps) {
  const [presupuestos, setPresupuestos] = useState<PresupuestoMC[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [clienteElegido, setClienteElegido] = useState('');
  const [editor, setEditor] = useState<{ presupuesto: PresupuestoMC | null; clienteId: string; clienteNombre: string } | null>(null);

  useEffect(() => {
    if (abrirSelectorInicial) {
      setSelectorAbierto(true);
      onSelectorInicialAbierto?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirSelectorInicial]);

  const cargar = useCallback(() => {
    setCargando(true);
    api.obtenerTodosLosPresupuestos()
      .then(setPresupuestos)
      .catch((e) => setError(String(e).replace(/^Error:\s*/, '')))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const nombreDe = (clienteId: string) => clientes.find((c) => c.id === clienteId)?.nombre ?? 'Cliente';

  const guardarLienzo = async (p: PresupuestoMC) => {
    const guardado = await api.guardarPresupuesto(p);
    setPresupuestos((prev) => {
      const existe = prev.some((x) => x.id === guardado.id);
      return existe ? prev.map((x) => (x.id === guardado.id ? guardado : x)) : [guardado, ...prev];
    });
    setEditor({ presupuesto: guardado, clienteId: guardado.clienteId, clienteNombre: nombreDe(guardado.clienteId) });
  };

  const abrir = (p: PresupuestoMC) => {
    if (p.formato === 'lienzo') {
      setEditor({ presupuesto: p, clienteId: p.clienteId, clienteNombre: nombreDe(p.clienteId) });
    } else {
      onAbrirCliente(p.clienteId);
    }
  };

  const crearNuevo = () => {
    if (!clienteElegido) return;
    setSelectorAbierto(false);
    setEditor({ presupuesto: null, clienteId: clienteElegido, clienteNombre: nombreDe(clienteElegido) });
    setClienteElegido('');
  };

  if (editor) {
    return (
      <EditorPresupuestoLienzo
        presupuesto={editor.presupuesto}
        clienteId={editor.clienteId}
        clienteNombre={editor.clienteNombre}
        empresa={empresa}
        onGuardar={guardarLienzo}
        onVolver={() => setEditor(null)}
        onCambiarLogoEmpresa={(logo) => onActualizarEmpresa({ logo })}
      />
    );
  }

  if (cargando) return <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>Cargando presupuestos…</p>;

  return (
    <div>
      {error && <p style={{ color: 'var(--rojo, #c0392b)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
          {presupuestos.length} presupuesto{presupuestos.length !== 1 ? 's' : ''} de todos los clientes.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className={styles.btn} onClick={cargar} style={{ fontSize: '0.78rem' }}>Actualizar</button>
          <button
            className={`${styles.btn} ${styles.btnPrimario}`}
            onClick={() => setSelectorAbierto(true)}
            style={{ fontSize: '0.78rem' }}
          >
            + Crear presupuesto
          </button>
        </div>
      </div>

      {selectorAbierto && (
        <div className={styles.modalFondo} onClick={() => setSelectorAbierto(false)}>
          <div className={styles.modalCaja} style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalCabecera}>
              <h2 className={styles.h2}>¿Para qué cliente?</h2>
              <button className={styles.btnIcono} onClick={() => setSelectorAbierto(false)} aria-label="Cancelar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <select className={styles.select} value={clienteElegido} onChange={(e) => setClienteElegido(e.target.value)}>
                <option value="">Selecciona un cliente…</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <div className={styles.modalAcciones}>
                <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => setSelectorAbierto(false)}>Cancelar</button>
                <button className={`${styles.btn} ${styles.btnPrimario}`} disabled={!clienteElegido} onClick={crearNuevo}>
                  Crear en lienzo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {presupuestos.length === 0 ? (
        <p style={{ color: 'var(--topo-claro)', fontSize: '0.85rem' }}>
          Todavía no hay ningún presupuesto. Créalo con «+ Crear presupuesto» o desde la ficha de un cliente.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {presupuestos.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
                border: '1px solid var(--borde)', borderRadius: 8, padding: '1rem',
                background: 'var(--fondo-panel)', cursor: 'pointer',
              }}
              onClick={() => abrir(p)}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>{p.titulo}</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
                  {nombreDe(p.clienteId)} · {p.formato === 'lienzo' ? 'Plantilla libre' : 'Narrativo'} · {formatoFecha(p.creado)}
                </p>
              </div>
              <span style={{ fontWeight: 800, fontSize: '1.05rem', whiteSpace: 'nowrap' }}>{formatoEuro(p.precioTotal)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
