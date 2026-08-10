import { formatoEuro } from './calculos.js';
import * as api from './api.js';
import styles from './styles.module.css';

/** Props del resumen trimestral. */
export type TrimestresProps = {
  /** Año a mostrar. Si no se indica, usa el año actual. */
  anio?: number;
};

type DatosTrimestre = {
  nombre: string;
  meses: string;
  ingresos: number;
  gastos: number;
  beneficio: number;
  irpf: number;
  facturas: number;
};

const NOMBRES_TRIMESTRE = ['1.er Trimestre', '2.º Trimestre', '3.er Trimestre', '4.º Trimestre'];
const MESES_TRIMESTRE = ['Ene – Mar', 'Abr – Jun', 'Jul – Sep', 'Oct – Dic'];
const TIPO_MODELO = ['Modelo 130 (Abril)', 'Modelo 130 (Julio)', 'Modelo 130 (Octubre)', 'Modelo 130 (Enero)'];

/** Porcentaje de pago fraccionado de IRPF para autónomos (Modelo 130). */
const TIPO_IRPF = 0.20;

/** Devuelve el trimestre (0-3) a partir de una fecha ISO. */
function trimestre(fecha: string): number {
  const mes = new Date(fecha).getMonth(); // 0-11
  return Math.floor(mes / 3);
}

/**
 * Resumen por trimestres del año con cálculo de IRPF estimado (Modelo 130).
 * Muestra ingresos, gastos, beneficio neto y la cuota a ingresar en Hacienda
 * para cada trimestre.
 *
 * Pide sus propios datos al servidor en vez de recibir `facturas` completo
 * por props (Incremento 1.5): necesita el año entero para ser correcto, y
 * como el resto de la app pasó a paginar, ya no hay garantía de que el
 * componente padre tenga cargado un año completo de facturas.
 */
export function Trimestres({ anio }: TrimestresProps) {
  const anioActual = anio ?? new Date().getFullYear();
  const [anioSeleccionado, setAnioSeleccionado] = React.useState(anioActual);
  const [aniosDisponibles, setAniosDisponibles] = React.useState<number[]>([anioActual]);
  const [facturasFiltradas, setFacturasFiltradas] = React.useState<import('./types.js').Factura[]>([]);
  const [cargando, setCargando] = React.useState(true);

  React.useEffect(() => {
    api.obtenerAniosConFacturas().then((anios) => {
      setAniosDisponibles(anios.includes(anioActual) ? anios : [anioActual, ...anios].sort((a, b) => b - a));
    });
  }, [anioActual]);

  React.useEffect(() => {
    setCargando(true);
    api.obtenerFacturasPorAnio(anioSeleccionado)
      .then(setFacturasFiltradas)
      .finally(() => setCargando(false));
  }, [anioSeleccionado]);

  const trimestresData: DatosTrimestre[] = [0, 1, 2, 3].map((t) => {
    const del = facturasFiltradas.filter((f) => trimestre(f.fecha) === t);
    const ingresos = del.filter((f) => f.tipo === 'ingreso').reduce((s, f) => s + f.importe, 0);
    const gastos = del.filter((f) => f.tipo === 'gasto').reduce((s, f) => s + f.importe, 0);
    const beneficio = ingresos - gastos;
    const irpf = beneficio > 0 ? beneficio * TIPO_IRPF : 0;
    return {
      nombre: NOMBRES_TRIMESTRE[t],
      meses: MESES_TRIMESTRE[t],
      ingresos,
      gastos,
      beneficio,
      irpf,
      facturas: del.length,
    };
  });

  const totalIngresos = trimestresData.reduce((s, t) => s + t.ingresos, 0);
  const totalGastos = trimestresData.reduce((s, t) => s + t.gastos, 0);
  const totalBeneficio = totalIngresos - totalGastos;
  const totalIrpf = trimestresData.reduce((s, t) => s + t.irpf, 0);

  const trimActual = Math.floor(new Date().getMonth() / 3);

  return (
    <div>
      {/* Cabecera + selector de año */}
      <div className={styles.barraSeccion} style={{ marginBottom: '1.5rem' }}>
        <div>
          <h2 className={styles.h2} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
            Resumen trimestral
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'var(--topo-claro)' }}>
            Pago fraccionado de IRPF · Modelo 130 · Tipo estimado: 20% sobre beneficio neto
          </p>
        </div>
        <select
          className={styles.select}
          value={anioSeleccionado}
          onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
        >
          {aniosDisponibles.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {cargando && (
        <p style={{ fontSize: '0.85rem', color: 'var(--topo-claro)', marginBottom: '1rem' }}>Cargando facturas del año…</p>
      )}

      {/* Resumen anual */}
      <div className={styles.kpiGrid} style={{ marginBottom: '2rem' }}>
        <div className={styles.kpiTarjeta}>
          <div className={styles.kpiCabecera}>
            <div className={styles.kpiIconoChipVerde} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
            </div>
            <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Ingresos anuales</span>
          </div>
          <span className={`${styles.kpiValor} ${styles.valorVerde}`}>{formatoEuro(totalIngresos)}</span>
        </div>
        <div className={styles.kpiTarjeta}>
          <div className={styles.kpiCabecera}>
            <div className={styles.kpiIconoChipRojo} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
            </div>
            <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Gastos anuales</span>
          </div>
          <span className={`${styles.kpiValor} ${styles.valorRojo}`}>{formatoEuro(totalGastos)}</span>
        </div>
        <div className={styles.kpiTarjeta}>
          <div className={styles.kpiCabecera}>
            <div className={totalBeneficio >= 0 ? styles.kpiIconoChipVerde : styles.kpiIconoChipRojo} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>
            </div>
            <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Beneficio neto</span>
          </div>
          <span className={`${styles.kpiValor} ${totalBeneficio >= 0 ? styles.valorVerde : styles.valorRojo}`}>{formatoEuro(totalBeneficio)}</span>
        </div>
        <div className={styles.kpiTarjeta}>
          <div className={styles.kpiCabecera}>
            <div className={styles.kpiIconoChipOcre} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /></svg>
            </div>
            <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Total IRPF estimado</span>
          </div>
          <span className={styles.kpiValor} style={{ color: 'var(--ocre)' }}>{formatoEuro(totalIrpf)}</span>
          <span className={styles.kpiSub}>20% del beneficio neto</span>
        </div>
      </div>

      {/* Tarjetas por trimestre */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
        {trimestresData.map((t, i) => {
          const esActual = i === trimActual && anioSeleccionado === anioActual;
          const pagado = t.irpf > 0;
          return (
            <div
              key={i}
              className={styles.kpiTarjeta}
              style={{
                borderTop: `4px solid ${t.beneficio > 0 ? 'var(--verde)' : t.beneficio < 0 ? 'var(--rojo)' : 'var(--borde)'}`,
                position: 'relative',
                paddingTop: '1.25rem',
              }}
            >
              {esActual && (
                <span style={{
                  position: 'absolute', top: 10, right: 12,
                  fontSize: '0.65rem', background: 'var(--azul-bg)', color: 'var(--azul)',
                  padding: '2px 7px', borderRadius: 3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  Trimestre actual
                </span>
              )}

              <div style={{ marginBottom: '0.75rem' }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--negro)' }}>{t.nombre}</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--topo-claro)' }}>{t.meses} · {t.facturas} factura{t.facturas !== 1 ? 's' : ''}</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--topo-claro)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
                    Ingresos
                  </span>
                  <span style={{ color: 'var(--verde)', fontWeight: 600 }}>{formatoEuro(t.ingresos)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--topo-claro)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                    Gastos
                  </span>
                  <span style={{ color: 'var(--rojo)', fontWeight: 600 }}>-{formatoEuro(t.gastos)}</span>
                </div>
                <div style={{ height: 1, background: 'var(--borde)', margin: '0.2rem 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--topo)' }}>Beneficio neto</span>
                  <span style={{ fontWeight: 700, color: t.beneficio >= 0 ? 'var(--verde)' : 'var(--rojo)' }}>
                    {formatoEuro(t.beneficio)}
                  </span>
                </div>
              </div>

              {/* Caja IRPF */}
              <div style={{
                background: pagado ? 'var(--ocre-bg)' : 'var(--fondo)',
                border: `1px solid ${pagado ? 'var(--ocre)' : 'var(--borde)'}`,
                borderRadius: 6,
                padding: '0.75rem 1rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: pagado ? 'var(--ocre)' : 'var(--topo-muy-claro)', fontWeight: 700 }}>
                      Hacienda · {TIPO_MODELO[i]}
                    </p>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: 'var(--topo-claro)' }}>
                      IRPF 20% sobre beneficio
                    </p>
                  </div>
                  <span style={{
                    fontSize: '1.15rem', fontWeight: 800,
                    color: pagado ? 'var(--ocre)' : 'var(--topo-muy-claro)',
                  }}>
                    {pagado ? formatoEuro(t.irpf) : '—'}
                  </span>
                </div>
                {!pagado && t.beneficio <= 0 && (
                  <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: 'var(--topo-muy-claro)' }}>
                    Sin beneficio → no se paga IRPF este trimestre
                  </p>
                )}
                {!pagado && t.ingresos === 0 && t.gastos === 0 && (
                  <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: 'var(--topo-muy-claro)' }}>
                    Sin facturas aún
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Aviso legal */}
      <p style={{
        marginTop: '1.75rem', fontSize: '0.72rem', color: 'var(--topo-muy-claro)',
        background: 'var(--fondo)', padding: '0.75rem 1rem', borderRadius: 4,
        borderLeft: '3px solid var(--borde)',
        display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></svg>
        <span>Estimación orientativa basada en el <strong>Modelo 130</strong> (pago fraccionado IRPF autónomos). Tipo aplicado: 20% sobre beneficio neto trimestral.
        No incluye retenciones previas ni deducciones específicas. Consulta con tu asesor para la liquidación definitiva.</span>
      </p>
    </div>
  );
}

// Importación de React necesaria para useState
import React from 'react';
