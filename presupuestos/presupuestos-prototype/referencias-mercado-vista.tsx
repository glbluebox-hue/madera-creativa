import { useState } from 'react';
import type { NivelGeografico, ReferenciaMercado, UbicacionEmpresa } from './mercado-local.js';
import { formatoEuro } from './calculos.js';
import * as api from './api.js';
import styles from './styles.module.css';

export type ReferenciasMercadoVistaProps = {
  tipoTrabajo: string;
  ubicacion: UbicacionEmpresa;
  /** Referencias YA guardadas de este tipo de trabajo, para poder borrarlas desde aquí mismo. */
  referencias: ReferenciaMercado[];
  onCambio: () => void;
};

/** La zona de cada nivel sale SIEMPRE de la ubicación de la Empresa, nunca se escribe a mano — evita cualquier error de coincidencia con `resolverMercadoLocal` (comparación por igualdad exacta de texto). */
function zonaParaNivel(nivel: NivelGeografico, ubicacion: UbicacionEmpresa): string | null {
  if (nivel === 'nacional') return 'España';
  if (nivel === 'regional') return ubicacion.comunidadAutonoma || null;
  return ubicacion.isla || ubicacion.provincia || null;
}

const ETIQUETA_NIVEL: Record<NivelGeografico, string> = { local: 'Local', regional: 'Regional', nacional: 'Nacional' };

/**
 * Añadir/listar/borrar referencias de mercado manuales (Fase 2F, "Consenso
 * de Precio") — deliberadamente simple (autorización, condición 9: "no
 * quiero una pantalla financiera complicada"): la zona nunca se escribe a
 * mano, sale siempre de la ubicación ya configurada en Ajustes de empresa.
 * Nunca scraping, nunca IA — el usuario anota lo que él mismo conoce.
 */
export function ReferenciasMercadoVista({ tipoTrabajo, ubicacion, referencias, onCambio }: ReferenciasMercadoVistaProps) {
  const [abierto, setAbierto] = useState(false);
  const [nivel, setNivel] = useState<NivelGeografico>('local');
  const [precioMin, setPrecioMin] = useState('');
  const [precioMax, setPrecioMax] = useState('');
  const [fuente, setFuente] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const zona = zonaParaNivel(nivel, ubicacion);
  const sinUbicacion = !ubicacion.comunidadAutonoma;

  const guardar = async () => {
    const min = Number(precioMin);
    const max = Number(precioMax);
    if (!zona) { setError('Configura primero la ubicación de tu empresa en Ajustes de empresa.'); return; }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) { setError('Revisa los precios — el máximo no puede ser menor que el mínimo.'); return; }
    setError('');
    setGuardando(true);
    try {
      await api.crearReferenciaMercado({ tipoTrabajo, nivelGeografico: nivel, zona, precioMin: min, precioMax: max, fuente: fuente.trim(), fecha });
      setPrecioMin(''); setPrecioMax(''); setFuente('');
      setAbierto(false);
      onCambio();
    } catch {
      setError('No se pudo guardar. Comprueba tu conexión e inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (id: string) => {
    await api.borrarReferenciaMercado(id).catch(() => {});
    onCambio();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {referencias.map((r) => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', fontSize: '0.78rem', padding: '0.35rem 0.6rem', background: 'var(--fondo-panel)', borderRadius: 8 }}>
          <span>
            <strong>{ETIQUETA_NIVEL[r.nivelGeografico]} · {r.zona}</strong>: {formatoEuro(r.precioMin)}–{formatoEuro(r.precioMax)}
            {r.fuente && <span style={{ color: 'var(--topo-claro)' }}> · {r.fuente}</span>}
          </span>
          <button type="button" onClick={() => borrar(r.id)} style={{ background: 'none', border: 'none', color: 'var(--topo-claro)', cursor: 'pointer', fontSize: '0.78rem' }}>Borrar</button>
        </div>
      ))}

      {!abierto ? (
        <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.76rem', padding: '0.35rem 0.7rem', alignSelf: 'flex-start' }} onClick={() => setAbierto(true)}>
          + Añadir referencia de mercado
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.6rem', border: '1px dashed var(--borde)', borderRadius: 8 }}>
          {sinUbicacion && <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--topo-claro)' }}>Configura primero la ubicación de tu empresa en Ajustes de empresa.</p>}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {(['local', 'regional', 'nacional'] as NivelGeografico[]).map((n) => (
              <button
                key={n}
                type="button"
                className={`${styles.btn} ${nivel === n ? styles.btnPrimario : styles.btnSecundario}`}
                style={{ flex: 1, fontSize: '0.74rem', padding: '0.3rem 0.5rem', justifyContent: 'center' }}
                onClick={() => setNivel(n)}
              >
                {ETIQUETA_NIVEL[n]}
              </button>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--topo-claro)' }}>Zona: {zona ?? '—'} · Tipo de trabajo: {tipoTrabajo}</p>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <input className={styles.input} type="number" min={0} placeholder="Precio mínimo" value={precioMin} onChange={(e) => setPrecioMin(e.target.value)} />
            <input className={styles.input} type="number" min={0} placeholder="Precio máximo" value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} />
          </div>
          <input className={styles.input} placeholder="Fuente (ej. Habitissimo, competidor visto en Instagram…)" value={fuente} onChange={(e) => setFuente(e.target.value)} />
          <input className={styles.input} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          {error && <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--rojo)' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="button" className={`${styles.btn} ${styles.btnSecundario}`} style={{ fontSize: '0.76rem' }} onClick={() => setAbierto(false)} disabled={guardando}>Cancelar</button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimario}`} style={{ fontSize: '0.76rem' }} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
