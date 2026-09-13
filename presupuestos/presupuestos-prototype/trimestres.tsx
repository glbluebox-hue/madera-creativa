import { formatoEuroPrivado } from './calculos.js';
import * as api from './api.js';
import type { GastoPeriodico } from './types.js';
import { GastosPeriodicos } from './gastos-periodicos.js';
import { puedeUsar, PRO_O_SUPERIOR, type PlanAcceso } from './planes.js';
import { CandadoPlan } from './candado-plan.js';
import {
  NOMBRES_TRIMESTRE, MESES_TRIMESTRE, TIPO_MODELO, MODELO_INDIRECTO_MES,
  calcularTrimestres,
  type DatosTrimestre, type RegionFiscal,
} from './motor-fiscal.js';
import styles from './styles.module.css';

/** Props del resumen trimestral. */
export type TrimestresProps = {
  /** Año a mostrar. Si no se indica, usa el año actual. */
  anio?: number;
  /** Modo privacidad activo — oculta los importes (el interruptor vive en Inicio; ver `use-privacidad.ts`). */
  privado?: boolean;
  /** Plan de la sesión actual (05/09/2026) — descargar/exportar la documentación del asesor y el PDF combinado exige PRO+; consultar el resumen sigue siendo BASIC. */
  plan?: PlanAcceso;
  /** Bypass administrativo — ver `puedeUsar()` en `planes.ts`. */
  esAdmin?: boolean;
};

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
export function Trimestres({ anio, privado = false, plan, esAdmin }: TrimestresProps) {
  const tienePlanDescarga = puedeUsar(plan, PRO_O_SUPERIOR, esAdmin);
  const anioActual = anio ?? new Date().getFullYear();
  const [anioSeleccionado, setAnioSeleccionado] = React.useState(anioActual);
  const [aniosDisponibles, setAniosDisponibles] = React.useState<number[]>([anioActual]);
  const [facturasFiltradas, setFacturasFiltradas] = React.useState<import('./types.js').Factura[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [regionFiscal, setRegionFiscal] = React.useState<RegionFiscal>('');
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

  // Cálculo fiscal (IRPF/IGIC/IVA) delegado en `motor-fiscal.ts` (Fase 2.0,
  // extracción) — mismas fórmulas, ver ese fichero para el detalle.
  const trimestresData: DatosTrimestre[] = calcularTrimestres(facturasFiltradas, gastosPeriodicos, { regionFiscal, repepActivo });

  const totalIngresos = trimestresData.reduce((s, t) => s + t.ingresos, 0);
  const totalGastos = trimestresData.reduce((s, t) => s + t.gastos, 0);
  const totalGastosPeriodicos = trimestresData.reduce((s, t) => s + t.gastosPeriodicos, 0);
  const totalBeneficio = totalIngresos - totalGastos - totalGastosPeriodicos;
  const totalIrpf = trimestresData.reduce((s, t) => s + t.irpf, 0);

  const trimActual = Math.floor(new Date().getMonth() / 3);

  const descargarDocumentacionAsesor = async (indiceTrimestre: number) => {
    if (!tienePlanDescarga) return;
    setDescargandoAsesor(indiceTrimestre);
    try { await api.descargarDocumentacionAsesor(anioSeleccionado, indiceTrimestre + 1); }
    finally { setDescargandoAsesor(null); }
  };

  /** Solo y exclusivamente las facturas del trimestre, en un único PDF — sin resumen ni ZIP (petición real, 25/08/2026). */
  const descargarPdfFacturas = async (indiceTrimestre: number) => {
    if (!tienePlanDescarga) return;
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
            Sin región fiscal configurada — el IVA/IGIC de tus facturas ya se calcula con el tipo real de cada una. Configura tu región en <strong>Ajustes de empresa</strong> solo para estimar el impuesto de las facturas que no traigan ese dato (el IRPF ya se calcula igualmente).
          </p>
        </div>
      )}
      {regionFiscal === 'canarias' && repepActivo && (
        <div style={{ background: 'var(--verde-bg)', border: '1px solid var(--verde)', borderRadius: 8, padding: '0.7rem 1rem', marginBottom: '1.25rem', fontSize: '0.78rem', color: 'var(--verde-dark)' }}>
          REPEP activo — no repercutes IGIC en tus facturas ni te deduces el soportado en tus compras. El IGIC/IVA de cada trimestre, más abajo, muestra el dato real de tus facturas; su tratamiento fiscal bajo REPEP corresponde a tu asesor.
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
                background: pagado ? 'var(--ocre-bg)' : 'var(--fondo-caja)',
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
                      IRPF 20% sobre beneficio acumulado
                    </p>
                  </div>
                  <span style={{
                    fontSize: '1.15rem', fontWeight: 800,
                    color: pagado ? 'var(--ocre)' : 'var(--topo-muy-claro)',
                  }}>
                    {pagado ? formatoEuroPrivado(t.irpf, privado) : '—'}
                  </span>
                </div>
                {pagado && (
                  <p style={{ margin: '0.3rem 0 0', fontSize: '0.7rem', color: 'var(--topo-claro)' }}>
                    Sobre {formatoEuroPrivado(t.beneficioAcumulado, privado)} acumulados desde enero
                  </p>
                )}
                {!pagado && t.beneficioAcumulado <= 0 && (
                  <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: 'var(--topo-muy-claro)' }}>
                    Sin beneficio acumulado desde enero → no se paga IRPF este trimestre
                  </p>
                )}
                {!pagado && t.beneficioAcumulado > 0 && (
                  <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: 'var(--topo-muy-claro)' }}>
                    Ya cubierto por lo calculado en trimestres anteriores de este año
                  </p>
                )}
                {!pagado && t.ingresos === 0 && t.gastos === 0 && (
                  <p style={{ margin: '0.4rem 0 0', fontSize: '0.72rem', color: 'var(--topo-muy-claro)' }}>
                    Sin facturas aún
                  </p>
                )}
              </div>

              {/* IVA/IGIC repercutido y soportado — dato REAL de cada factura (tipoImpuesto), nunca decidido por la región de la empresa. Siempre visible, con o sin REPEP. */}
              <div style={{
                marginTop: '0.6rem', background: 'var(--fondo-caja)', border: '1px solid var(--borde)', borderRadius: 6, padding: '0.75rem 1rem',
                display: 'flex', flexDirection: 'column', gap: '0.6rem',
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <p style={{ margin: 0, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--topo-muy-claro)', fontWeight: 700 }}>
                      IVA · Modelo 303 ({MODELO_INDIRECTO_MES[i]})
                    </p>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                    <span style={{ color: 'var(--topo-claro)' }}>Repercutido</span>
                    <span style={{ fontWeight: 600 }}>{formatoEuroPrivado(t.impuestos.ivaRepercutido, privado)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--topo-claro)' }}>Soportado</span>
                    <span style={{ fontWeight: 600 }}>{formatoEuroPrivado(t.impuestos.ivaSoportado, privado)}</span>
                  </div>
                </div>

                <div style={{ height: 1, background: 'var(--borde)' }} />

                <div>
                  <p style={{ margin: 0, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--topo-muy-claro)', fontWeight: 700 }}>
                    IGIC · Modelo 420 ({MODELO_INDIRECTO_MES[i]})
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                    <span style={{ color: 'var(--topo-claro)' }}>Repercutido</span>
                    <span style={{ fontWeight: 600 }}>{formatoEuroPrivado(t.impuestos.igicRepercutido, privado)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--topo-claro)' }}>Soportado</span>
                    <span style={{ fontWeight: 600 }}>{formatoEuroPrivado(t.impuestos.igicSoportado, privado)}</span>
                  </div>
                </div>

                {t.impuestos.noIdentificado.numFacturas > 0 && (
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--ocre)' }}>
                    {t.impuestos.noIdentificado.numFacturas} factura{t.impuestos.noIdentificado.numFacturas !== 1 ? 's' : ''} con impuesto sin identificar
                    ({formatoEuroPrivado(t.impuestos.noIdentificado.repercutido + t.impuestos.noIdentificado.soportado, privado)}) — revisa el tipo de impuesto.
                  </p>
                )}
                {t.impuestos.noCalculable.numFacturas > 0 && (
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--ocre)' }}>
                    {t.impuestos.noCalculable.numFacturas} factura{t.impuestos.noCalculable.numFacturas !== 1 ? 's' : ''} con IVA/IGIC identificado pero sin importe de impuesto calculable
                    — no {t.impuestos.noCalculable.numFacturas !== 1 ? 'están sumadas' : 'está sumada'} arriba, revísa{t.impuestos.noCalculable.numFacturas !== 1 ? 'las' : 'la'} y completa la base y el importe del impuesto.
                  </p>
                )}
              </div>

              {t.facturas > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.75rem' }}>
                  <button
                    className={`${styles.btn} ${styles.btnSecundario}`}
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.78rem' }}
                    onClick={() => descargarDocumentacionAsesor(i)}
                    disabled={descargandoAsesor === i || !tienePlanDescarga}
                    title={tienePlanDescarga ? undefined : 'Descargar/exportar informes es una función PRO'}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                    {descargandoAsesor === i ? 'Generando…' : 'Documentación para el asesor'} {!tienePlanDescarga && <CandadoPlan planMinimo="PRO" compacto />}
                  </button>
                  <button
                    className={`${styles.btn} ${styles.btnSecundario}`}
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.78rem' }}
                    onClick={() => descargarPdfFacturas(i)}
                    disabled={descargandoPdf === i || !tienePlanDescarga}
                    title={tienePlanDescarga ? 'Un único PDF con las páginas de todas las facturas del trimestre, sin resumen ni ZIP' : 'Descargar/exportar informes es una función PRO'}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                    {descargandoPdf === i ? 'Generando…' : 'Solo facturas (PDF único)'} {!tienePlanDescarga && <CandadoPlan planMinimo="PRO" compacto />}
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
        background: 'var(--fondo-caja)', padding: '0.75rem 1rem', borderRadius: 4,
        borderLeft: '3px solid var(--borde)',
        display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></svg>
        <span>Estimación orientativa basada en el <strong>Modelo 130</strong> (pago fraccionado IRPF autónomos, igual en toda España). Tipo aplicado: 20% sobre el beneficio neto <strong>acumulado desde el 1 de enero</strong>, restando lo ya calculado por este mismo resumen en los trimestres anteriores del año (incluye los gastos periódicos activos) — igual que hace Hacienda, así que si hay una pérdida en algún trimestre, no pagas de más en el siguiente.
        {' '}El IVA y el IGIC de cada trimestre se calculan con el tipo de impuesto real de cada factura (nunca según tu región fiscal) — las facturas sin ese dato identificado, o con el tipo identificado pero sin importe calculable, aparecen aparte, pendientes de revisión.
        {' '}No incluye retenciones soportadas, mínimo personal, ni deducciones específicas de tu situación. Esto es una estimación de apoyo, no una liquidación: la liquidación definitiva corresponde a tu asesor fiscal.</span>
      </p>
    </div>
  );
}

// Importación de React necesaria para useState
import React from 'react';
