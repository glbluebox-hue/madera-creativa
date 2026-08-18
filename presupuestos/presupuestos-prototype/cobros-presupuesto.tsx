import { useState } from 'react';
import type { Cobro } from './api.js';
import { formatoEuro } from './calculos.js';
import styles from './styles.module.css';

/** Genera un id de cliente sin depender de Node (`crypto.randomUUID` también existe en el navegador). */
function idNuevo(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

export type CobrosPresupuestoProps = {
  cobros: Cobro[];
  /** Guarda la lista completa — el propio padre decide cómo persistirla (API) y actualizar su estado. */
  onGuardar: (cobros: Cobro[]) => Promise<void>;
};

/**
 * Hitos de cobro de un presupuesto aceptado (roadmap "cobros pendientes",
 * 18/08/2026) — generados automáticamente al aceptar, pero editables en
 * todo momento (pedido explícito del usuario: el alcance del presupuesto
 * cambia durante la obra). Edición local hasta pulsar "Guardar cambios",
 * igual que el resto de formularios de esta vista — evita una llamada a la
 * API por cada tecla.
 */
export function CobrosPresupuesto({ cobros, onGuardar }: CobrosPresupuestoProps) {
  const [editando, setEditando] = useState<Cobro[] | null>(null);
  const [guardando, setGuardando] = useState(false);

  const lista = editando ?? cobros;
  const totalPendiente = lista.filter((c) => !c.cobradoEn).reduce((s, c) => s + c.importe, 0);

  if (!editando && cobros.length === 0) return null;

  const empezar = () => setEditando(cobros.map((c) => ({ ...c })));
  const cancelar = () => setEditando(null);

  const actualizarFila = (id: string, cambios: Partial<Cobro>) => {
    setEditando((prev) => (prev ?? []).map((c) => (c.id === id ? { ...c, ...cambios } : c)));
  };
  const quitarFila = (id: string) => {
    setEditando((prev) => (prev ?? []).filter((c) => c.id !== id));
  };
  const anadirFila = () => {
    setEditando((prev) => [...(prev ?? []), { id: idNuevo(), concepto: '', importe: 0, cobradoEn: '' }]);
  };
  const alternarCobrado = (id: string) => {
    const c = lista.find((x) => x.id === id);
    if (!c) return;
    const cambios = { cobradoEn: c.cobradoEn ? '' : new Date().toISOString() };
    if (editando) actualizarFila(id, cambios);
    else onGuardar(cobros.map((x) => (x.id === id ? { ...x, ...cambios } : x)));
  };

  const guardar = async () => {
    if (!editando) return;
    setGuardando(true);
    try {
      await onGuardar(editando.filter((c) => c.concepto.trim()));
      setEditando(null);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--fondo)', borderRadius: 'var(--radio)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--topo)' }}>
          Cobros{totalPendiente > 0 ? ` · ${formatoEuro(totalPendiente)} pendiente` : ' · todo cobrado'}
        </span>
        {!editando && (
          <button className={styles.btnIcono} title="Editar cobros" onClick={empezar}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
        {lista.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={!!c.cobradoEn}
              title={c.cobradoEn ? `Cobrado` : 'Marcar como cobrado'}
              onChange={() => alternarCobrado(c.id)}
            />
            {editando ? (
              <>
                <input className={styles.input} style={{ flex: 1 }} value={c.concepto} placeholder="Concepto" onChange={(e) => actualizarFila(c.id, { concepto: e.target.value })} />
                <input className={styles.input} style={{ width: '100px' }} type="number" value={c.importe} onChange={(e) => actualizarFila(c.id, { importe: Number(e.target.value) })} />
                <button className={styles.btnIcono} title="Quitar" onClick={() => quitarFila(c.id)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </>
            ) : (
              <span style={{ fontSize: '0.82rem', flex: 1, textDecoration: c.cobradoEn ? 'line-through' : 'none', color: c.cobradoEn ? 'var(--topo-muy-claro)' : 'var(--negro)' }}>
                {c.concepto} — {formatoEuro(c.importe)}
              </span>
            )}
          </div>
        ))}
      </div>

      {editando && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
          <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={anadirFila}>+ Añadir cobro</button>
          <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
          <button className={styles.btn} onClick={cancelar} disabled={guardando}>Cancelar</button>
        </div>
      )}
    </div>
  );
}
