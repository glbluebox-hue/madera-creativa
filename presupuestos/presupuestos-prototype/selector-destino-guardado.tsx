import { useState, useEffect } from 'react';
import type { Carpeta } from './types.js';
import { generarId } from './mock.js';
import * as api from './api.js';
import styles from './styles.module.css';

/** A qué cliente/carpeta debe quedar archivado un dibujo. */
export type DestinoDibujo = { clienteId: string; carpetaId: string };

/** Props del selector de destino de guardado. */
export type SelectorDestinoGuardadoProps = {
  /** Lista ligera de clientes para el desplegable. */
  clientes: { id: string; nombre: string }[];
  onConfirmar: (destino: DestinoDibujo) => void;
  onCancelar: () => void;
  /**
   * Cuando el dibujo ya es temporal a propósito (p. ej. "asignar a
   * cliente" desde la bandeja de temporales), no tiene sentido ofrecer de
   * nuevo la opción "guardar como temporal" — se salta directo a elegir
   * cliente.
   */
  soloAsignarCliente?: boolean;
};

const IconoX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
);

const OPCION_NUEVA_CARPETA = '__nueva__';

/**
 * Modal "¿Dónde quieres guardar este dibujo?" (Fase 2.2) — se muestra al
 * guardar un dibujo que todavía no tiene cliente asignado. Cliente
 * existente → carpeta de ese cliente (con opción de crear una nueva ahí
 * mismo) o temporal (sin cliente, va a la bandeja global).
 */
export function SelectorDestinoGuardado({ clientes, onConfirmar, onCancelar, soloAsignarCliente }: SelectorDestinoGuardadoProps) {
  const [paso, setPaso] = useState<'elegir' | 'cliente'>(soloAsignarCliente ? 'cliente' : 'elegir');
  const [clienteId, setClienteId] = useState('');
  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [cargandoCarpetas, setCargandoCarpetas] = useState(false);
  const [carpetaId, setCarpetaId] = useState('');
  const [creandoCarpeta, setCreandoCarpeta] = useState(false);
  const [nombreNuevaCarpeta, setNombreNuevaCarpeta] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (paso !== 'cliente' || !clienteId) return;
    setCargandoCarpetas(true);
    api.listarCarpetas(clienteId)
      .then(setCarpetas)
      .catch(() => setCarpetas([]))
      .finally(() => setCargandoCarpetas(false));
  }, [paso, clienteId]);

  const confirmarNuevaCarpeta = async () => {
    const nombre = nombreNuevaCarpeta.trim();
    if (!nombre) { setCreandoCarpeta(false); return; }
    try {
      const carpeta = await api.crearCarpeta({ id: generarId(), clienteId, nombre });
      setCarpetas((prev) => [carpeta, ...prev]);
      setCarpetaId(carpeta.id);
      setCreandoCarpeta(false);
      setNombreNuevaCarpeta('');
      setError(null);
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    }
  };

  return (
    <div className={styles.modalFondo} onClick={onCancelar}>
      <div className={styles.modalCaja} style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalCabecera}>
          <h2 className={styles.h2}>{soloAsignarCliente ? '¿A qué cliente pertenece este dibujo?' : '¿Dónde quieres guardar este dibujo?'}</h2>
          <button className={styles.btnIcono} onClick={onCancelar} aria-label="Cancelar">
            <IconoX />
          </button>
        </div>

        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {paso === 'elegir' && (
            <>
              <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={() => setPaso('cliente')}>
                Guardar en un cliente existente
              </button>
              <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => onConfirmar({ clienteId: '', carpetaId: '' })}>
                Guardar como dibujo temporal
              </button>
            </>
          )}

          {paso === 'cliente' && (
            <>
              <label className={styles.campo}>
                <span className={styles.campoLabel}>Cliente</span>
                <select
                  className={styles.select}
                  value={clienteId}
                  onChange={(e) => { setClienteId(e.target.value); setCarpetaId(''); setCreandoCarpeta(false); }}
                >
                  <option value="">Selecciona un cliente…</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </label>

              {clienteId && (
                <label className={styles.campo}>
                  <span className={styles.campoLabel}>Carpeta</span>
                  {cargandoCarpetas ? (
                    <p className={styles.dashboardVacio} style={{ margin: 0 }}>Cargando carpetas…</p>
                  ) : creandoCarpeta ? (
                    <input
                      autoFocus
                      className={styles.input}
                      placeholder="Nombre de la nueva carpeta"
                      value={nombreNuevaCarpeta}
                      onChange={(e) => setNombreNuevaCarpeta(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmarNuevaCarpeta(); if (e.key === 'Escape') setCreandoCarpeta(false); }}
                      onBlur={confirmarNuevaCarpeta}
                    />
                  ) : (
                    <select
                      className={styles.select}
                      value={carpetaId}
                      onChange={(e) => (e.target.value === OPCION_NUEVA_CARPETA ? setCreandoCarpeta(true) : setCarpetaId(e.target.value))}
                    >
                      <option value="">Sin carpeta</option>
                      {carpetas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      <option value={OPCION_NUEVA_CARPETA}>+ Crear nueva carpeta…</option>
                    </select>
                  )}
                </label>
              )}

              {error && <div className={styles.loginError}>{error}</div>}

              <div className={styles.modalAcciones}>
                <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={() => (soloAsignarCliente ? onCancelar() : setPaso('elegir'))}>
                  {soloAsignarCliente ? 'Cancelar' : 'Atrás'}
                </button>
                <button
                  className={`${styles.btn} ${styles.btnPrimario}`}
                  disabled={!clienteId}
                  onClick={() => onConfirmar({ clienteId, carpetaId })}
                >
                  Guardar aquí
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
