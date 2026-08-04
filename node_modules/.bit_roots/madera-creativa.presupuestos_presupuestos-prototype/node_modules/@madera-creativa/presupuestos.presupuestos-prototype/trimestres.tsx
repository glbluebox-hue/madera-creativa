import type { Factura } from './types.js';
import { formatoEuro } from './calculos.js';
import styles from './styles.module.css';

/** Props del resumen trimestral. */
export type TrimestresProps = {
  facturas: Factura[];
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

/** Devuelve el año de una fecha ISO. */
function anioFecha(fecha: string): number {
  return new Date(fecha).getFullYear();
}

/**
 * Resumen por trimestres del año con cálculo de IRPF estimado (Modelo 130).
 * Muestra ingresos, gastos, beneficio neto y la cuota a ingresar en Hacienda
 * para cada trimestre.
 */
export function Trimestres({ facturas, anio }: TrimestresProps) {
  const anioActual = anio ?? new Date().getFullYear();
  const aniosDisponibles = [...new Set(facturas.map((f) => anioFecha(f.fecha)))].sort((a, b) => b - a);
  if (!aniosDisponibles.includes(anioActual)) aniosDisponibles.unshift(anioActual);

  const [anioSeleccionado, setAnioSeleccionado] = React.useState(anioActual);

  const facturasFiltradas = facturas.filter((f) => anioFecha(f.fecha) === anioSeleccionado);

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
          <h2 className={styles.h2}>📊 Resumen trimestral</h2>
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

      {/* Resumen anual */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className={styles.kpiTarjeta} style={{ borderTop: '3px solid var(--verde)' }}>
          <span className={styles.kpiLabel}>Ingresos anuales</span>
          <span className={`${styles.kpiValor} ${styles.valorVerde}`}>{formatoEuro(totalIngresos)}</span>
        </div>
        <div className={styles.kpiTarjeta} style={{ borderTop: '3px solid var(--rojo)' }}>
          <span className={styles.kpiLabel}>Gastos anuales</span>
          <span className={`${styles.kpiValor} ${styles.valorRojo}`}>{formatoEuro(totalGastos)}</span>
        </div>
        <div className={styles.kpiTarjeta} style={{ borderTop: `3px solid ${totalBeneficio >= 0 ? 'var(--verde)' : 'var(--rojo)'}` }}>
          <span className={styles.kpiLabel}>Beneficio neto</span>
          <span className={`${styles.kpiValor} ${totalBeneficio >= 0 ? styles.valorVerde : styles.valorRojo}`}>{formatoEuro(totalBeneficio)}</span>
        </div>
        <div className={styles.kpiTarjeta} style={{ borderTop: '3px solid var(--ocre)', background: 'var(--ocre-bg)' }}>
          <span className={styles.kpiLabel}>Total IRPF estimado</span>
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
                  <span style={{ color: 'var(--topo-claro)' }}>💰 Ingresos</span>
                  <span style={{ color: 'var(--verde)', fontWeight: 600 }}>{formatoEuro(t.ingresos)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--topo-claro)' }}>🧾 Gastos</span>
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
      }}>
        ⚠️ Estimación orientativa basada en el <strong>Modelo 130</strong> (pago fraccionado IRPF autónomos). Tipo aplicado: 20% sobre beneficio neto trimestral.
        No incluye retenciones previas ni deducciones específicas. Consulta con tu asesor para la liquidación definitiva.
      </p>
    </div>
  );
}

// Importación de React necesaria para useState
import React from 'react';
