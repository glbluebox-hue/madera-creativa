import { formatoEuroPrivado } from './calculos.js';
import * as api from './api.js';
import type { GastoPeriodico } from './types.js';
import { GastosPeriodicos } from './gastos-periodicos.js';
import { esGastoPeriodicoDeducible } from './gasto-periodico-fiscal.js';
import styles from './styles.module.css';

/** Props del resumen trimestral. */
export type TrimestresProps = {
  /** Año a mostrar. Si no se indica, usa el año actual. */
  anio?: number;
  /** Modo privacidad activo — oculta los importes (el interruptor vive en Inicio; ver `use-privacidad.ts`). */
  privado?: boolean;
};

type DatosTrimestre = {
  nombre: string;
  meses: string;
  ingresos: number;
  gastos: number;
  gastosPeriodicos: number;
  beneficio: number;
  irpf: number;
  impuestoIndirecto: number;
  modeloIndirecto: string;
  facturas: number;
};

const NOMBRES_TRIMESTRE = ['1.er Trimestre', '2.º Trimestre', '3.er Trimestre', '4.º Trimestre'];
const MESES_TRIMESTRE = ['Ene – Mar', 'Abr – Jun', 'Jul – Sep', 'Oct – Dic'];
const TIPO_MODELO = ['Modelo 130 (Abril)', 'Modelo 130 (Julio)', 'Modelo 130 (Octubre)', 'Modelo 130 (Enero)'];
const MODELO_INDIRECTO_MES = ['Abril', 'Julio', 'Octubre', 'Enero'];

/** Porcentaje de pago fraccionado de IRPF para autónomos (Modelo 130) — igual en toda España. */
const TIPO_IRPF = 0.20;

/**
 * Tipo general del impuesto indirecto por región fiscal (fuentes oficiales,
 * auditoría 11/08/2026): IGIC 7% (Agencia Tributaria Canaria) / IVA 21%
 * (AEAT). Sirve solo para ESTIMAR el impuesto embebido en el importe de
 * una factura cuando esta no tiene su propio desglose de impuesto — en
 * cuanto una factura sí lo tenga (`importeImpuesto`), se usa ese dato real
 * en vez de esta aproximación.
 */
const TIPO_GENERAL_POR_REGION: Record<'canarias' | 'peninsula', number> = { canarias: 0.07, peninsula: 0.21 };

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
export function Trimestres({ anio, privado = false }: TrimestresProps) {
  const anioActual = anio ?? new Date().getFullYear();
  const [anioSeleccionado, setAnioSeleccionado] = React.useState(anioActual);
  const [aniosDisponibles, setAniosDisponibles] = React.useState<number[]>([anioActual]);
  const [facturasFiltradas, setFacturasFiltradas] = React.useState<import('./types.js').Factura[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [regionFiscal, setRegionFiscal] = React.useState<'canarias' | 'peninsula' | ''>('');
  const [repepActivo, setRepepActivo] = React.useState(false);
  const [gastosPeriodicos, setGastosPeriodicos] = React.useState<GastoPeriodico[]>([]);
  const [descargandoAsesor, setDescargandoAsesor] = React.useState<number | null>(null);
  const [descargandoPdf, setDescargandoPdf] = React.useState<number | null>(null);

  React.useEffect(() => {
    api.obtenerAniosConFacturas().then((anios) => {
      setAniosDisponibles(anios.includes(anioActual) ? anios : [anioActual, ...anios].sort((a, b) => b - a));
    });
    api.obtenerEmpresa().then((e) => { setRegionFiscal(e.regionFiscal); setRepepActivo(e.repepActivo); });
    api.obtenerGastosPeriodicos().then(setGastosPeriodicos);
  }, [anioActual]);

  const recargarGastosPeriodicos = React.useCallback(() => { api.obtenerGastosPeriodicos().then(setGastosPeriodicos); }, []);

  React.useEffect(() => {
    setCargando(true);
    api.obtenerFacturasPorAnio(anioSeleccionado)
      .then(setFacturasFiltradas)
      .finally(() => setCargando(false));
  }, [anioSeleccionado]);

  // El IGIC repercutido/soportado con REPEP activo no aplica: un negocio
  // acogido no repercute IGIC en sus facturas ni se deduce el soportado en
  // sus compras (investigación fiscal 11/08/2026) — así que en ese caso no
  // se calcula ningún impuesto indirecto.
  const calculaIndirecto = !!regionFiscal && !(regionFiscal === 'canarias' && repepActivo);
  const tipoGeneral = regionFiscal ? TIPO_GENERAL_POR_REGION[regionFiscal] : 0;

  /** Impuesto indirecto embebido en el importe de una factura: usa `importeImpuesto` si la factura lo tiene, si no lo estima al tipo general de la región. */
  const impuestoDeFactura = (f: import('./types.js').Factura): number => {
    if (typeof f.importeImpuesto === 'number') return f.importeImpuesto;
    if (!calculaIndirecto) return 0;
    return f.importe - f.importe / (1 + tipoGeneral);
  };

  const trimestresData: DatosTrimestre[] = [0, 1, 2, 3].map((t) => {
    const del = facturasFiltradas.filter((f) => trimestre(f.fecha) === t);
    const ingresos = del.filter((f) => f.tipo === 'ingreso').reduce((s, f) => s + f.importe, 0);
    const gastos = del.filter((f) => f.tipo === 'gasto').reduce((s, f) => s + f.importe, 0);
    const gastosPeriodicosTrimestre = gastosPeriodicos.filter((g) => g.activo && esGastoPeriodicoDeducible(g))
      .reduce((s, g) => s + (g.periodicidad === 'mensual' ? g.importe * 3 : g.importe), 0);
    const beneficio = ingresos - gastos - gastosPeriodicosTrimestre;
    const irpf = beneficio > 0 ? beneficio * TIPO_IRPF : 0;
    const impuestoIndirecto = calculaIndirecto
      ? del.filter((f) => f.tipo === 'ingreso').reduce((s, f) => s + impuestoDeFactura(f), 0)
        - del.filter((f) => f.tipo === 'gasto').reduce((s, f) => s + impuestoDeFactura(f), 0)
      : 0;
    return {
      nombre: NOMBRES_TRIMESTRE[t],
      meses: MESES_TRIMESTRE[t],
      ingresos,
      gastos,
      gastosPeriodicos: gastosPeriodicosTrimestre,
      beneficio,
      irpf,
      impuestoIndirecto,
      modeloIndirecto: regionFiscal === 'canarias' ? `Modelo 420 (${MODELO_INDIRECTO_MES[t]})` : `Modelo 303 (${MODELO_INDIRECTO_MES[t]})`,
      facturas: del.length,
    };
  });

  const totalIngresos = trimestresData.reduce((s, t) => s + t.ingresos, 0);
  const totalGastos = trimestresData.reduce((s, t) => s + t.gastos, 0);
  const totalGastosPeriodicos = trimestresData.reduce((s, t) => s + t.gastosPeriodicos, 0);
  const totalBeneficio = totalIngresos - totalGastos - totalGastosPeriodicos;
  const totalIrpf = trimestresData.reduce((s, t) => s + t.irpf, 0);

  const trimActual = Math.floor(new Date().getMonth() / 3);

  const descargarDocumentacionAsesor = async (indiceTrimestre: number) => {
    setDescargandoAsesor(indiceTrimestre);
    try { await api.descargarDocumentacionAsesor(anioSeleccionado, indiceTrimestre + 1); }
    finally { setDescargandoAsesor(null); }
  };

  /** Solo y exclusivamente las facturas del trimestre, en un único PDF — sin resumen ni ZIP (petición real, 25/08/2026). */
  const descargarPdfFacturas = async (indiceTrimestre: number) => {
    setDescargandoPdf(indiceTrimestre);
    try { await api.descargarPdfCombinadoFacturas(anioSeleccionado, indiceTrimestre + 1); }
    finally { setDescargandoPdf(null); }
  };

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

      {!regionFiscal && (
        <div style={{ background: 'var(--ocre-bg)', border: '1px solid var(--ocre)', borderRadius: 8, padding: '0.85rem 1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ocre)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></svg>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ocre)' }}>
            Sin región fiscal configurada — ve a <strong>Ajustes de empresa</strong> y elige Canarias o Península para que el Trimestral calcule también el IGIC/IVA (el IRPF ya se calcula igualmente).
          </p>
        </div>
      )}
      {regionFiscal === 'canarias' && repepActivo && (
        <div style={{ background: 'var(--verde-bg)', border: '1px solid var(--verde)', borderRadius: 8, padding: '0.7rem 1rem', marginBottom: '1.25rem', fontSize: '0.78rem', color: 'var(--verde-dark)' }}>
          REPEP activo — no repercutes IGIC en tus facturas ni te deduces el soportado en tus compras. No se calcula IGIC en este resumen.
        </div>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        <GastosPeriodicos gastos={gastosPeriodicos} onCambio={recargarGastosPeriodicos} />
      </div>

      {/* Resumen anual */}
      <div className={styles.kpiGrid} style={{ marginBottom: '2rem' }}>
        <div className={styles.kpiTarjeta}>
          <div className={styles.kpiCabecera}>
            <div className={styles.kpiIconoChipVerde} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
            </div>
            <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Ingresos anuales</span>
          </div>
          <span className={`${styles.kpiValor} ${styles.valorVerde}`}>{formatoEuroPrivado(totalIngresos, privado)}</span>
        </div>
        <div className={styles.kpiTarjeta}>
          <div className={styles.kpiCabecera}>
            <div className={styles.kpiIconoChipRojo} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
            </div>
            <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Gastos anuales</span>
          </div>
          <span className={`${styles.kpiValor} ${styles.valorRojo}`}>{formatoEuroPrivado(totalGastos, privado)}</span>
        </div>
        <div className={styles.kpiTarjeta}>
          <div className={styles.kpiCabecera}>
            <div className={totalBeneficio >= 0 ? styles.kpiIconoChipVerde : styles.kpiIconoChipRojo} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>
            </div>
            <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Beneficio neto</span>
          </div>
          <span className={`${styles.kpiValor} ${totalBeneficio >= 0 ? styles.valorVerde : styles.valorRojo}`}>{formatoEuroPrivado(totalBeneficio, privado)}</span>
        </div>
        <div className={styles.kpiTarjeta}>
          <div className={styles.kpiCabecera}>
            <div className={styles.kpiIconoChipOcre} style={{ width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /></svg>
            </div>
            <span className={styles.kpiLabel} style={{ textTransform: 'none', fontSize: '0.86rem', color: 'var(--topo-claro)' }}>Total IRPF estimado</span>
          </div>
          <span className={styles.kpiValor} style={{ color: 'var(--ocre)' }}>{formatoEuroPrivado(totalIrpf, privado)}</span>
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
                  <span style={{ color: 'var(--verde)', fontWeight: 600 }}>{formatoEuroPrivado(t.ingresos, privado)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--topo-claro)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
                    Gastos
                  </span>
                  <span style={{ color: 'var(--rojo)', fontWeight: 600 }}>-{formatoEuroPrivado(t.gastos, privado)}</span>
                </div>
                {t.gastosPeriodicos > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                    <span style={{ color: 'var(--topo-claro)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      Gastos periódicos
                    </span>
                    <span style={{ color: 'var(--rojo)', fontWeight: 600 }}>-{formatoEuroPrivado(t.gastosPeriodicos, privado)}</span>
                  </div>
                )}
                <div style={{ height: 1, background: 'var(--borde)', margin: '0.2rem 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 600, color: 'var(--topo)' }}>Beneficio neto</span>
                  <span style={{ fontWeight: 700, color: t.beneficio >= 0 ? 'var(--verde)' : 'var(--rojo)' }}>
                    {formatoEuroPrivado(t.beneficio, privado)}
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
                    {pagado ? formatoEuroPrivado(t.irpf, privado) : '—'}
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

              {/* Caja IGIC/IVA — solo si hay región fiscal configurada y no aplica REPEP */}
              {calculaIndirecto && (
                <div style={{
                  marginTop: '0.6rem', background: 'var(--fondo)', border: '1px solid var(--borde)', borderRadius: 6, padding: '0.75rem 1rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--topo-muy-claro)', fontWeight: 700 }}>
                        {regionFiscal === 'canarias' ? 'IGIC' : 'IVA'} · {t.modeloIndirecto}
                      </p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: 'var(--topo-claro)' }}>
                        Repercutido − soportado {t.facturas > 0 ? '(estimado al tipo general si la factura no desglosa impuesto)' : ''}
                      </p>
                    </div>
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, color: t.impuestoIndirecto >= 0 ? 'var(--topo)' : 'var(--verde)' }}>
                      {formatoEuroPrivado(t.impuestoIndirecto, privado)}
                    </span>
                  </div>
                </div>
              )}

              {t.facturas > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.75rem' }}>
                  <button
                    className={`${styles.btn} ${styles.btnSecundario}`}
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.78rem' }}
                    onClick={() => descargarDocumentacionAsesor(i)}
                    disabled={descargandoAsesor === i}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    {descargandoAsesor === i ? 'Generando…' : 'Documentación para el asesor'}
                  </button>
                  <button
                    className={`${styles.btn} ${styles.btnSecundario}`}
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.78rem' }}
                    onClick={() => descargarPdfFacturas(i)}
                    disabled={descargandoPdf === i}
                    title="Un único PDF con las páginas de todas las facturas del trimestre, sin resumen ni ZIP"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                    {descargandoPdf === i ? 'Generando…' : 'Solo facturas (PDF único)'}
                  </button>
                </div>
              )}
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
        <span>Estimación orientativa basada en el <strong>Modelo 130</strong> (pago fraccionado IRPF autónomos, igual en toda España). Tipo aplicado: 20% sobre beneficio neto <strong>de cada trimestre por separado</strong> (incluye los gastos periódicos activos).
        {calculaIndirecto && ` El ${regionFiscal === 'canarias' ? 'IGIC' : 'IVA'} se calcula con los datos reales de cada factura cuando están disponibles, o estimado al tipo general (${(tipoGeneral * 100).toFixed(0)}%) cuando no.`}
        {' '}El <strong>Modelo 130 oficial se calcula de forma acumulada desde el 1 de enero</strong>, restando lo ya pagado en trimestres anteriores del mismo año — este resumen no acumula entre trimestres, así que el resultado real puede ser distinto (especialmente si hay pérdidas en algún trimestre). Tampoco incluye retenciones previas, mínimo personal, ni deducciones específicas de tu situación. Esto es una estimación de apoyo, no una liquidación: la liquidación definitiva corresponde a tu asesor fiscal.</span>
      </p>
    </div>
  );
}

// Importación de React necesaria para useState
import React from 'react';
