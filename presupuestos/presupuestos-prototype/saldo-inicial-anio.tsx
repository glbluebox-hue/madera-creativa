import { useEffect, useState } from 'react';
import * as api from './api.js';
import type { Empresa } from './use-empresa.js';
import styles from './styles.module.css';

/**
 * Saldo de partida del IRPF acumulado (auditoría Facturas/Trimestral,
 * 13/09/2026) — para un negocio que ya facturaba antes de empezar a usar
 * Madera Creativa: el Trimestral calcula el IRPF sobre el beneficio
 * acumulado desde el 1 de enero, pero solo ve las facturas que están
 * dentro de la app. Sin este saldo, alguien dado de alta a mitad de año
 * vería un acumulado incompleto (le faltarían los meses de antes) y el
 * cálculo sería irreal — reportado por el usuario 13/09/2026.
 *
 * Vive en Facturación (dentro del Resumen trimestral), no en Ajustes de
 * empresa — es un dato del cálculo fiscal de un año concreto, no de la
 * marca. Se aplica SOLO al año exacto guardado (`saldoInicialAnio`); el
 * año siguiente el acumulado real vuelve a 0, como manda Hacienda.
 *
 * Lee y guarda siempre la ficha de empresa COMPLETA (como hace
 * `use-empresa.ts`): `PUT /empresa` valida el cuerpo entero y rellenaría
 * con valores por defecto cualquier campo que no se envíe, borrando datos
 * reales (nombre, logo...) si se mandara un objeto parcial.
 */
export function SaldoInicialAnio({ anioSeleccionado, onCerrar, onGuardado }: { anioSeleccionado: number; onCerrar: () => void; onGuardado: () => void }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [empresaActual, setEmpresaActual] = useState<Empresa | null>(null);
  const [activo, setActivo] = useState(false);
  const [beneficio, setBeneficio] = useState('');
  const [irpf, setIrpf] = useState('');

  useEffect(() => {
    let cancelado = false;
    api.obtenerEmpresa()
      .then((e) => {
        if (cancelado) return;
        setEmpresaActual(e);
        const yaConfigurado = e.saldoInicialAnio === anioSeleccionado;
        setActivo(yaConfigurado);
        setBeneficio(yaConfigurado && e.saldoInicialBeneficio !== null ? String(e.saldoInicialBeneficio) : '');
        setIrpf(yaConfigurado && e.saldoInicialIrpf !== null ? String(e.saldoInicialIrpf) : '');
      })
      .catch(() => { if (!cancelado) setError('No se pudo cargar la configuración actual.'); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [anioSeleccionado]);

  const guardar = async () => {
    if (!empresaActual) return;
    setGuardando(true);
    setError(null);
    try {
      const cambios = activo
        ? { saldoInicialAnio: anioSeleccionado, saldoInicialBeneficio: parseFloat(beneficio.replace(',', '.')) || 0, saldoInicialIrpf: parseFloat(irpf.replace(',', '.')) || 0 }
        : { saldoInicialAnio: null, saldoInicialBeneficio: null, saldoInicialIrpf: null };
      await api.guardarEmpresa({ ...empresaActual, ...cambios });
      onGuardado();
    } catch {
      setError('No se pudo guardar — inténtalo de nuevo.');
      setGuardando(false);
    }
  };

  return (
    <div className={styles.modalFondo} onClick={onCerrar}>
      <div className={styles.modalCaja} style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalCabecera}>
          <h2 className={styles.h2}>Saldo inicial de {anioSeleccionado}</h2>
          <button className={styles.btnIcono} onClick={onCerrar} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {cargando && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--topo-claro)' }}>Cargando…</p>}
          {error && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--rojo)' }}>{error}</p>}
          {!cargando && (
            <>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--topo-claro)' }}>
                Si ya facturabas antes de empezar a usar Madera Creativa en {anioSeleccionado}, indica aquí tu beneficio e IRPF acumulados hasta ese momento — sin esto, el Resumen trimestral solo ve las facturas que has metido en la app y el cálculo del acumulado desde enero sería incompleto.
              </p>

              <label className={styles.label} style={{ display: 'flex', flexDirection: 'row-reverse', justifyContent: 'flex-end', gap: '0.5rem', alignItems: 'center' }}>
                <span>Ya facturaba antes de usar la app en {anioSeleccionado}</span>
                <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
              </label>

              {activo && (
                <>
                  <label className={styles.label}>Beneficio neto acumulado antes de usar la app (€)
                    <input className={styles.input} type="number" value={beneficio} onChange={(e) => setBeneficio(e.target.value)} placeholder="0,00" />
                  </label>
                  <label className={styles.label}>IRPF ya pagado a Hacienda antes de usar la app (€)
                    <input className={styles.input} type="number" value={irpf} onChange={(e) => setIrpf(e.target.value)} placeholder="0,00" />
                  </label>
                  <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--topo-claro)' }}>
                    Estas cifras son las tuyas — de tu propia contabilidad o de tu gestor — de antes de usar Madera Creativa. Se aplican solo a {anioSeleccionado}; el año que viene el acumulado vuelve a empezar en 0, como en Hacienda.
                  </p>
                </>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button className={`${styles.btn} ${styles.btnSecundario}`} onClick={onCerrar} style={{ flex: 1, justifyContent: 'center' }}>
              Cancelar
            </button>
            <button className={`${styles.btn} ${styles.btnPrimario}`} onClick={guardar} disabled={cargando || guardando} style={{ flex: 2, justifyContent: 'center' }}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
