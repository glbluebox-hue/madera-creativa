import { desdeFechaISO } from './calendario-modelo.js';
import { esGastoPeriodicoDeducible } from './gasto-periodico-fiscal.js';
import type { Factura, GastoPeriodico, LineaFiscal } from './types.js';

/**
 * Motor fiscal (Fase 2.0, extracción) — mismas fórmulas y comportamiento
 * que vivían en `trimestres.tsx` antes de esta fase, movidas aquí sin
 * reescribirlas para que el cálculo trimestral tenga una única fuente de
 * verdad (antes también se duplicaba, parcialmente, en `facturas.tsx`).
 * Único cambio de comportamiento autorizado en esta extracción: el cálculo
 * de trimestre usa `desdeFechaISO` (fecha local a medianoche) en vez de
 * `new Date(fecha)` a secas, que interpreta la fecha como UTC y puede
 * desplazarla — ver `calendario-modelo.ts`.
 */

export type RegionFiscal = 'canarias' | 'peninsula' | '';

/** Naturaleza real del impuesto indirecto de una factura — ver `Factura.tipoImpuesto` en `types.ts`. */
export type TipoImpuestoFactura = 'igic' | 'iva' | 'exento' | 'sin_impuesto' | '';

export type DatosTrimestre = {
  nombre: string;
  meses: string;
  ingresos: number;
  gastos: number;
  gastosPeriodicos: number;
  beneficio: number;
  irpf: number;
  /** Neto repercutido−soportado, agnóstico al tipo (compatibilidad, ver auditoría subfase IVA/IGIC) — se mantiene sin cambios; usar `impuestos` para el detalle real por tipo. */
  impuestoIndirecto: number;
  /** Beneficio acumulado desde el 1 de enero hasta el final de este trimestre (auditoría 13/09/2026) — base real sobre la que Hacienda calcula el Modelo 130 de este trimestre, ver `irpf`. */
  beneficioAcumulado: number;
  modeloIndirecto: string;
  facturas: number;
  /** Detalle real de IVA/IGIC por tipo de factura (subfase "Agregación trimestral IVA/IGIC") — nunca deriva del `impuestoIndirecto` de arriba ni de la región fiscal. */
  impuestos: ResumenImpuestosTrimestre;
  /** Arrastre de compensación de IVA entre trimestres (Fase A-C, saldos IVA/IGIC, 25/09/2026) — ver `ArrastreImpuesto`. IVA e IGIC son circuitos completamente independientes, nunca se mezclan. */
  ivaArrastre: ArrastreImpuesto;
  /** Ver `ivaArrastre` — mismo mecanismo, saldo propio e independiente para IGIC. */
  igicArrastre: ArrastreImpuesto;
};

/** Naturaleza real de una factura a efectos de agregación IVA/IGIC — se decide SOLO por `tipoImpuesto`, nunca por `regionFiscal`. */
export type ClasificacionImpuesto = 'iva' | 'igic' | 'exento' | 'sin_impuesto' | 'no_identificado';

export type ResumenImpuestosTrimestre = {
  /** Suma de `baseImponible` de las facturas de ingreso con IVA real — solo cuenta cuando `baseImponible` consta, ver `calcularImpuestosPorTipo`. */
  ivaBaseRepercutida: number;
  ivaRepercutido: number;
  ivaBaseSoportada: number;
  ivaSoportado: number;
  /**
   * Repercutido − soportado de IVA del período (petición explícita del
   * usuario, 14/09/2026: "el informe tiene que decir qué tienes que
   * pagar", no solo repercutido/soportado por separado) — positivo es lo
   * que hay que ingresar en el Modelo 303, negativo lo que queda a
   * compensar. Cálculo directo, nunca una estimación nueva.
   */
  ivaResultado: number;
  igicBaseRepercutida: number;
  igicRepercutido: number;
  igicBaseSoportada: number;
  igicSoportado: number;
  /** Ver `ivaResultado` — mismo cálculo para el Modelo 420. */
  igicResultado: number;
  /** Factura con importe de impuesto real pero sin `tipoImpuesto` clasificado (`''`) — nunca asignada a IVA/IGIC por región, queda pendiente de revisión. */
  noIdentificado: { repercutido: number; soportado: number; numFacturas: number };
  /** Factura con `tipoImpuesto` real (`'iva'`/`'igic'`) pero sin dato suficiente para calcular su cuota (ni `importeImpuesto`, ni `baseImponible`+`porcentajeImpuesto`) — NO se cuenta como 0€ en su impuesto, distinto de una cuota real de 0. */
  noCalculable: { numFacturas: number };
};

export const NOMBRES_TRIMESTRE = ['1.er Trimestre', '2.º Trimestre', '3.er Trimestre', '4.º Trimestre'];
export const MESES_TRIMESTRE = ['Ene – Mar', 'Abr – Jun', 'Jul – Sep', 'Oct – Dic'];
export const TIPO_MODELO = ['Modelo 130 (Abril)', 'Modelo 130 (Julio)', 'Modelo 130 (Octubre)', 'Modelo 130 (Enero)'];
export const MODELO_INDIRECTO_MES = ['Abril', 'Julio', 'Octubre', 'Enero'];

/** Porcentaje de pago fraccionado de IRPF para autónomos (Modelo 130) — igual en toda España. */
export const TIPO_IRPF = 0.20;

/**
 * Tipo general del impuesto indirecto por región fiscal (fuentes oficiales,
 * auditoría 11/08/2026): IGIC 7% (Agencia Tributaria Canaria) / IVA 21%
 * (AEAT). Sirve solo para ESTIMAR el impuesto embebido en el importe de
 * una factura cuando esta no tiene su propio desglose de impuesto — en
 * cuanto una factura sí lo tenga (`importeImpuesto`), se usa ese dato real
 * en vez de esta aproximación.
 */
export const TIPO_GENERAL_POR_REGION: Record<'canarias' | 'peninsula', number> = { canarias: 0.07, peninsula: 0.21 };

/** Devuelve el trimestre (0-3) a partir de una fecha ISO `AAAA-MM-DD`. */
export function trimestreDeFecha(fecha: string): number {
  const mes = desdeFechaISO(fecha).getMonth(); // 0-11
  return Math.floor(mes / 3);
}

// ── Rectificativas/devoluciones (25/09/2026) ────────────────────────────────
//
// Una rectificativa es una NATURALEZA del documento (`Factura.naturaleza`),
// nunca un tercer valor de `tipo` (que sigue siendo únicamente 'ingreso'/
// 'gasto') ni un importe negativo tecleado a mano — el importe de una
// rectificativa se introduce siempre en positivo, igual que cualquier otra
// factura. Esta es la ÚNICA función que traduce `naturaleza` a un signo;
// todo cálculo que sume `importe`/cuotas de impuesto por trimestre debe
// multiplicar por este signo en vez de repetir la condición.

/** `+1` para una factura normal, `-1` para una rectificativa — único punto de esta regla, ver comentario de arriba. */
export function signoPorNaturaleza(f: Pick<Factura, 'naturaleza'>): 1 | -1 {
  return f.naturaleza === 'rectificativa' ? -1 : 1;
}

/**
 * Aviso — nunca una corrección — de que una rectificativa cae en un
 * trimestre (o año) distinto al de su factura original (25/09/2026). El
 * IRPF ya se corrige solo (usa el acumulado real desde enero, no trimestres
 * aislados — auditoría 13/09/2026), pero el Modelo 303/420 SÍ se calcula
 * trimestre a trimestre de forma independiente: si la original ya se
 * declaró, corregirla en el trimestre de la rectificativa puede no ser lo
 * correcto (podría hacer falta una complementaria del trimestre original).
 * Esta función SOLO detecta el caso y lo explica — no decide ni corrige
 * nada, mismo principio que `detectarProblemaFiscal`/
 * `detectarDatosIdentificacionFaltantes`. Queda preparada para que un
 * tratamiento posterior (fuera de esta fase) decida qué hacer.
 */
export type AvisoRectificativaTrimestre = {
  /** `false` si la rectificativa cae en el mismo trimestre/año que su factura original — nada que avisar. */
  trimestreDistinto: boolean;
  /** Solo presente cuando `trimestreDistinto` es `true`. */
  explicacion?: string;
};

export function detectarRectificativaTrimestreDistinto(
  rectificativa: Pick<Factura, 'fecha'>,
  facturaOriginal: Pick<Factura, 'fecha'>
): AvisoRectificativaTrimestre {
  const anioRect = Number(rectificativa.fecha.slice(0, 4));
  const anioOrig = Number(facturaOriginal.fecha.slice(0, 4));
  const trimRect = trimestreDeFecha(rectificativa.fecha);
  const trimOrig = trimestreDeFecha(facturaOriginal.fecha);
  if (anioRect === anioOrig && trimRect === trimOrig) return { trimestreDistinto: false };
  return {
    trimestreDistinto: true,
    explicacion:
      `La factura original es de ${NOMBRES_TRIMESTRE[trimOrig]} de ${anioOrig} y esta rectificativa es de ` +
      `${NOMBRES_TRIMESTRE[trimRect]} de ${anioRect} — si el trimestre de la original ya se declaró, puede hacer ` +
      `falta presentar una complementaria. El sistema no lo decide automáticamente: revísalo con tu asesor.`,
  };
}

// El IGIC repercutido/soportado con REPEP activo no aplica: un negocio
// acogido no repercute IGIC en sus facturas ni se deduce el soportado en
// sus compras (investigación fiscal 11/08/2026) — así que en ese caso no
// se calcula ningún impuesto indirecto.
export function calculaIndirecto(regionFiscal: RegionFiscal, repepActivo: boolean): boolean {
  return !!regionFiscal && !(regionFiscal === 'canarias' && repepActivo);
}

/**
 * Si el IGIC repercutido/soportado de una factura debe entrar en el
 * agregado real del Modelo 420 (`calcularImpuestosPorTipo`) — bug real
 * detectado 25/09/2026: esa función clasifica cada factura únicamente por
 * su propio `tipoImpuesto`, sin mirar nunca REPEP, así que una factura de
 * gasto con `tipoImpuesto:'igic'` se sumaba como soportado "a compensar"
 * aunque la empresa estuviera en REPEP — donde ese IGIC pagado NO es un
 * crédito fiscal, ya es GASTO íntegro (vía `Factura.importe`, en
 * `calcularTrimestres`, que no cambia). A diferencia de `calculaIndirecto`
 * (pensada solo para la estimación antigua por región, `impuestoIndirecto`),
 * esta función NUNCA depende de que `regionFiscal` esté vacía — el IVA/IGIC
 * real de una factura con `tipoImpuesto` propio siempre se calcula, tenga
 * la empresa la región que tenga; `false` únicamente con Canarias+REPEP.
 * El IVA nunca se ve afectado por REPEP (régimen exclusivo de IGIC).
 */
export function igicDeclarable(regionFiscal: RegionFiscal, repepActivo: boolean): boolean {
  return !(regionFiscal === 'canarias' && repepActivo);
}

/** Tipo general del impuesto indirecto de la región (0 si no hay región configurada). */
export function tipoGeneralDeRegion(regionFiscal: RegionFiscal): number {
  return regionFiscal ? TIPO_GENERAL_POR_REGION[regionFiscal] : 0;
}

/**
 * Sugerencia de `tipoImpuesto` para una factura NUEVA, basada en la región
 * fiscal de la empresa — es solo un valor por defecto que el usuario puede
 * cambiar libremente antes de guardar. NUNCA debe usarse para sobrescribir
 * un `tipoImpuesto` ya presente (escrito a mano o detectado en el propio
 * documento): la región de la empresa no determina la naturaleza real del
 * impuesto de una factura concreta (p. ej. una compra en Península de una
 * empresa canaria sigue siendo IVA) — ver auditoría Fase 2/subfase IVA-IGIC.
 */
export function sugerirTipoImpuesto(regionFiscal: RegionFiscal): 'iva' | 'igic' | null {
  if (regionFiscal === 'canarias') return 'igic';
  if (regionFiscal === 'peninsula') return 'iva';
  return null;
}

/**
 * Impuesto indirecto embebido en el importe de una factura: usa
 * `importeImpuesto` si la factura lo tiene, si no lo estima al tipo
 * general de la región (solo si `indirectoActivo`, si no devuelve 0).
 */
export function impuestoDeFactura(f: Pick<Factura, 'importe' | 'importeImpuesto'>, indirectoActivo: boolean, tipoGeneral: number): number {
  if (typeof f.importeImpuesto === 'number') return f.importeImpuesto;
  if (!indirectoActivo) return 0;
  return f.importe - f.importe / (1 + tipoGeneral);
}

/**
 * Clasifica una factura por la naturaleza REAL de su impuesto — lee
 * únicamente `tipoImpuesto`, nunca `regionFiscal`: una factura de Península
 * con `tipoImpuesto: 'iva'` es IVA aunque la empresa sea de Canarias con
 * REPEP, y viceversa (regla fundamental de la subfase IVA/IGIC). `''`
 * (no configurado, el caso de la mayoría de facturas históricas) es
 * `'no_identificado'`, nunca se decide por región.
 */
export function clasificarImpuestoFactura(f: Pick<Factura, 'tipoImpuesto'>): ClasificacionImpuesto {
  if (f.tipoImpuesto === 'iva' || f.tipoImpuesto === 'igic' || f.tipoImpuesto === 'exento' || f.tipoImpuesto === 'sin_impuesto') {
    return f.tipoImpuesto;
  }
  return 'no_identificado';
}

/**
 * Cuota de impuesto REAL de una factura — nunca una estimación por región.
 * Usa `importeImpuesto` si está informado; si no, pero `baseImponible` y
 * `porcentajeImpuesto` sí lo están, la deriva de esos dos datos (siguen
 * siendo reales de la propia factura, solo que calculados en vez de
 * leídos directamente). Sin ninguno de los dos, devuelve `null` — NO es lo
 * mismo que una cuota real de 0€ (p. ej. un tipo al 0%): `null` significa
 * "no hay dato suficiente para saberlo", `0` significa "se sabe y es cero"
 * (`impuestoDeFactura` es quien estima por región, y esa estimación nunca
 * alimenta los contadores de IVA/IGIC por tipo).
 */
export function cuotaRealDeFactura(f: Pick<Factura, 'importeImpuesto' | 'baseImponible' | 'porcentajeImpuesto'>): number | null {
  if (typeof f.importeImpuesto === 'number') return f.importeImpuesto;
  if (typeof f.baseImponible === 'number' && typeof f.porcentajeImpuesto === 'number') {
    return f.baseImponible * f.porcentajeImpuesto / 100;
  }
  return null;
}

/**
 * Agrega IVA/IGIC repercutido y soportado de un conjunto de facturas,
 * clasificando cada una SOLO por su `tipoImpuesto` real. Las facturas
 * `exento`/`sin_impuesto` se reconocen pero aportan cuota 0 a todo. Las
 * facturas sin tipo identificado (`''`) que sí traigan una cuota real
 * (directa o derivada) se cuentan aparte en `noIdentificado`, nunca se
 * asignan a IVA o IGIC por adivinanza. Una factura con tipo REAL (`'iva'`/
 * `'igic'`) pero sin cuota calculable (`cuotaRealDeFactura` → `null`) NO se
 * suma como 0€ a ese impuesto — se cuenta aparte en `noCalculable`, para no
 * confundir "no hay dato" con "el impuesto es cero".
 *
 * También agrega la base imponible de cada tramo (`ivaBaseRepercutida`, etc.
 * — petición explícita del usuario, 14/09/2026: el informe debe dar base,
 * cuota Y el resultado a pagar/compensar, no solo la cuota suelta) y calcula
 * `ivaResultado`/`igicResultado` = repercutido − soportado. La base solo se
 * suma cuando `baseImponible` consta en la factura — con una cuota derivada
 * directamente de `importeImpuesto` sin `baseImponible` (caso raro), esa
 * factura no aporta a la base agregada, aunque sí a la cuota.
 *
 * `igicActivo` (25/09/2026, fix REPEP): si es `false` (empresa en REPEP),
 * ninguna factura con `tipoImpuesto:'igic'` aporta nada a este resumen —
 * ni repercutido, ni soportado, ni base, ni siquiera a `noCalculable` — se
 * ignora por completo, porque bajo REPEP esa cuota no se declara en el
 * Modelo 420 en absoluto (ver `igicDeclarable`). El gasto/ingreso económico
 * de esas facturas no cambia — sigue contándose con normalidad en otro
 * sitio (`calcularTrimestres`, vía `Factura.importe`). Por defecto `true`
 * (comportamiento de siempre) para no romper llamadas que solo quieren
 * probar la agregación en sí, sin régimen fiscal de por medio.
 */
export function calcularImpuestosPorTipo(facturas: Factura[], igicActivo: boolean = true): ResumenImpuestosTrimestre {
  const resumen: ResumenImpuestosTrimestre = {
    ivaBaseRepercutida: 0, ivaRepercutido: 0, ivaBaseSoportada: 0, ivaSoportado: 0, ivaResultado: 0,
    igicBaseRepercutida: 0, igicRepercutido: 0, igicBaseSoportada: 0, igicSoportado: 0, igicResultado: 0,
    noIdentificado: { repercutido: 0, soportado: 0, numFacturas: 0 },
    noCalculable: { numFacturas: 0 },
  };
  for (const f of facturas) {
    const clasificacion = clasificarImpuestoFactura(f);
    if (clasificacion === 'exento' || clasificacion === 'sin_impuesto') continue;
    // REPEP (25/09/2026) — ver `igicActivo` arriba: esta factura ya está
    // bien contada como gasto/ingreso económico en otro sitio, aquí no debe
    // entrar en el Modelo 420 en absoluto. Nunca afecta al IVA.
    if (clasificacion === 'igic' && !igicActivo) continue;
    const cuota = cuotaRealDeFactura(f);
    // Signo por naturaleza (25/09/2026) — una rectificativa resta de la
    // cuota/base de SU MISMO impuesto real (IVA resta de IVA, IGIC resta de
    // IGIC), nunca se convierte ni se mueve al otro impuesto. El importe
    // sigue introduciéndose en positivo; es este signo el que la resta.
    const signo = signoPorNaturaleza(f);
    if (clasificacion === 'no_identificado') {
      if (cuota === null || cuota === 0) continue; // sin ningún dato real de impuesto — no aporta a "no identificado", ya es "sin desglose" (Fase 1)
      resumen.noIdentificado.numFacturas += 1;
      if (f.tipo === 'ingreso') resumen.noIdentificado.repercutido += cuota * signo; else resumen.noIdentificado.soportado += cuota * signo;
      continue;
    }
    // A partir de aquí, clasificacion es 'iva' o 'igic' — tipo real conocido.
    if (cuota === null) {
      resumen.noCalculable.numFacturas += 1;
      continue;
    }
    const base = (typeof f.baseImponible === 'number' ? f.baseImponible : 0) * signo;
    const cuotaConSigno = cuota * signo;
    if (clasificacion === 'iva') {
      if (f.tipo === 'ingreso') { resumen.ivaRepercutido += cuotaConSigno; resumen.ivaBaseRepercutida += base; }
      else { resumen.ivaSoportado += cuotaConSigno; resumen.ivaBaseSoportada += base; }
    } else {
      if (f.tipo === 'ingreso') { resumen.igicRepercutido += cuotaConSigno; resumen.igicBaseRepercutida += base; }
      else { resumen.igicSoportado += cuotaConSigno; resumen.igicBaseSoportada += base; }
    }
  }
  resumen.ivaBaseRepercutida = redondearEuros(resumen.ivaBaseRepercutida);
  resumen.ivaRepercutido = redondearEuros(resumen.ivaRepercutido);
  resumen.ivaBaseSoportada = redondearEuros(resumen.ivaBaseSoportada);
  resumen.ivaSoportado = redondearEuros(resumen.ivaSoportado);
  resumen.ivaResultado = redondearEuros(resumen.ivaRepercutido - resumen.ivaSoportado);
  resumen.igicBaseRepercutida = redondearEuros(resumen.igicBaseRepercutida);
  resumen.igicRepercutido = redondearEuros(resumen.igicRepercutido);
  resumen.igicBaseSoportada = redondearEuros(resumen.igicBaseSoportada);
  resumen.igicSoportado = redondearEuros(resumen.igicSoportado);
  resumen.igicResultado = redondearEuros(resumen.igicRepercutido - resumen.igicSoportado);
  return resumen;
}

// ── Arrastre de compensación IVA/IGIC entre trimestres (Fase A-C, 25/09/2026) ──
//
// Hasta ahora `ivaResultado`/`igicResultado` (ver `ResumenImpuestosTrimestre`)
// eran siempre del propio trimestre, sin memoria de lo que quedó a compensar
// en trimestres anteriores — a diferencia del IRPF, que sí arrastra el
// beneficio acumulado real. Esta es la pieza que faltaba (auditoría
// 25/09/2026, confirmada de nuevo en esta fase): un saldo negativo de un
// trimestre se convierte en saldo pendiente de compensar, que reduce lo que
// hay que ingresar en el siguiente trimestre en que el resultado sea
// positivo — sin inventar ninguna compensación entre IVA e IGIC, cada uno
// mantiene su propio saldo, completamente independiente del otro (regla
// general de esta fase, no se reabre).
//
// `iva.resultado`/`igic.resultado` de `ResumenImpuestosTrimestre` NO cambian
// de significado: siguen siendo el resultado propio del trimestre. El
// arrastre vive aparte, en `DatosTrimestre.ivaArrastre`/`igicArrastre`.

/** Arrastre de compensación de un impuesto indirecto (IVA o IGIC) en un trimestre — ver comentario de arriba. */
export type ArrastreImpuesto = {
  /** Resultado propio de este trimestre (repercutido − soportado) — mismo valor que `ResumenImpuestosTrimestre.ivaResultado`/`igicResultado`, repetido aquí para tener todo el detalle de la compensación junto. */
  resultadoTrimestre: number;
  /** Saldo pendiente de compensar heredado de trimestres (o años) anteriores, ANTES de aplicar este trimestre. Siempre ≥ 0 — es un crédito a favor, nunca una deuda. */
  saldoAnterior: number;
  /** Parte de `saldoAnterior` que se ha compensado con el resultado positivo de este trimestre. `0` si el trimestre es negativo (no hay nada que compensar, al contrario, se suma al saldo) o si no había saldo previo. */
  compensacionAplicada: number;
  /** Importe real a ingresar este trimestre, ya descontada la compensación. `0` cuando el trimestre queda a compensar (resultado negativo, o positivo pero íntegramente cubierto por `saldoAnterior`). */
  aIngresar: number;
  /** Saldo pendiente de compensar que queda para el trimestre siguiente — nunca se pierde, se traslada tal cual (incluso de un año al siguiente, ver `calcularSaldoEntradaAnio`). */
  saldoPendiente: number;
};

/**
 * Aplica el arrastre de un trimestre: si el resultado es positivo, primero
 * compensa el saldo pendiente heredado (hasta donde llegue) y solo el resto
 * se ingresa; si es negativo, se suma íntegro al saldo pendiente (nunca hay
 * nada que ingresar ni que compensar ese mismo trimestre). Pura — no sabe si
 * es IVA o IGIC, ni en qué trimestre está; ver los ejemplos numéricos de la
 * auditoría/encargo 25/09/2026, replicados en los tests.
 */
function aplicarArrastreImpuesto(resultadoTrimestre: number, saldoAnterior: number): ArrastreImpuesto {
  if (resultadoTrimestre >= 0) {
    const compensacionAplicada = redondearEuros(Math.min(saldoAnterior, resultadoTrimestre));
    const aIngresar = redondearEuros(resultadoTrimestre - compensacionAplicada);
    const saldoPendiente = redondearEuros(saldoAnterior - compensacionAplicada);
    return { resultadoTrimestre, saldoAnterior, compensacionAplicada, aIngresar, saldoPendiente };
  }
  const saldoPendiente = redondearEuros(saldoAnterior + Math.abs(resultadoTrimestre));
  return { resultadoTrimestre, saldoAnterior, compensacionAplicada: 0, aIngresar: 0, saldoPendiente };
}

/**
 * Resumen por trimestres del año con cálculo de IRPF estimado (Modelo 130)
 * e impuesto indirecto (IGIC/IVA) — mismo cálculo que hacía `Trimestres`
 * directamente. `facturas` debe ser el año completo del período a calcular.
 *
 * IRPF acumulado (auditoría 13/09/2026): el Modelo 130 real de Hacienda no
 * se calcula trimestre a trimestre por separado — se calcula el 20% del
 * beneficio ACUMULADO desde el 1 de enero hasta el final de ese trimestre,
 * y se resta lo ya calculado (por este mismo resumen) en los trimestres
 * anteriores del año. Antes cada trimestre se calculaba de forma aislada,
 * lo que daba un resultado distinto al real en cuanto había una pérdida en
 * algún trimestre. El resultado de cada trimestre nunca baja de 0€ (si el
 * acumulado teórico es menor que lo ya "pagado" según este resumen, no se
 * resta ni se devuelve nada aquí — el ajuste real ocurre en la declaración
 * anual de la Renta, fuera del alcance de este resumen). Sigue sin incluir
 * retenciones soportadas, mínimo personal, ni deducciones específicas.
 *
 * `saldoInicial` (auditoría 13/09/2026): para un negocio que ya facturaba
 * antes de empezar a usar la app, el acumulado no puede empezar en 0 — solo
 * ve las facturas que están dentro de la app. Quien llama decide si aplica
 * (comparando el año que se está mostrando contra el año guardado del saldo,
 * ver `Empresa.saldoInicialAnio`); esta función solo sabe sumarlo como punto
 * de partida, nunca decide a qué año pertenece.
 *
 * `saldoInicial.iva`/`igic` (Fase A-C, 25/09/2026): mismo mecanismo de punto
 * de partida, pero para el arrastre de compensación IVA/IGIC (ver
 * `ArrastreImpuesto`) — a diferencia de `beneficio`/`irpf`, que SÍ resetean
 * a 0 cada año natural (así funciona el Modelo 130 real), el saldo pendiente
 * de IVA/IGIC NO se resetea nunca automáticamente: quien llama es
 * responsable de pasar aquí el saldo pendiente real al empezar el año
 * (heredado del cierre del año anterior, o de un saldo inicial manual si es
 * el primer año en la app) — ver `calcularSaldoEntradaAnio`.
 */
export function calcularTrimestres(
  facturas: Factura[],
  gastosPeriodicos: GastoPeriodico[],
  config: {
    regionFiscal: RegionFiscal; repepActivo: boolean;
    saldoInicial?: { beneficio: number; irpf: number; iva?: number; igic?: number };
  }
): DatosTrimestre[] {
  const indirectoActivo = calculaIndirecto(config.regionFiscal, config.repepActivo);
  const tipoGeneral = tipoGeneralDeRegion(config.regionFiscal);

  let beneficioAcumulado = config.saldoInicial?.beneficio ?? 0;
  let irpfYaCalculado = config.saldoInicial?.irpf ?? 0;
  let saldoIvaPendiente = config.saldoInicial?.iva ?? 0;
  let saldoIgicPendiente = config.saldoInicial?.igic ?? 0;

  return [0, 1, 2, 3].map((t) => {
    const del = facturas.filter((f) => trimestreDeFecha(f.fecha) === t);
    // Signo por naturaleza (25/09/2026) — el importe de una rectificativa se
    // introduce en positivo; es `signoPorNaturaleza` quien lo resta de su
    // mismo `tipo` (una rectificativa de gasto sigue restando de GASTOS,
    // nunca se mueve a ingresos). La corrección se aplica en el trimestre en
    // que se registra la rectificativa, no en el de la factura original —
    // ver aviso de trimestre distinto más abajo.
    const ingresos = del.filter((f) => f.tipo === 'ingreso').reduce((s, f) => s + f.importe * signoPorNaturaleza(f), 0);
    const gastos = del.filter((f) => f.tipo === 'gasto').reduce((s, f) => s + f.importe * signoPorNaturaleza(f), 0);
    const gastosPeriodicosTrimestre = gastosPeriodicos.filter((g) => g.activo && esGastoPeriodicoDeducible(g))
      .reduce((s, g) => s + (g.periodicidad === 'mensual' ? g.importe * 3 : g.importe), 0);
    const beneficio = ingresos - gastos - gastosPeriodicosTrimestre;
    beneficioAcumulado = redondearEuros(beneficioAcumulado + beneficio);
    const irpfTeoricoAcumulado = beneficioAcumulado > 0 ? redondearEuros(beneficioAcumulado * TIPO_IRPF) : 0;
    const irpf = Math.max(0, redondearEuros(irpfTeoricoAcumulado - irpfYaCalculado));
    irpfYaCalculado = redondearEuros(irpfYaCalculado + irpf);
    const impuestoIndirecto = indirectoActivo
      ? del.filter((f) => f.tipo === 'ingreso').reduce((s, f) => s + impuestoDeFactura(f, indirectoActivo, tipoGeneral) * signoPorNaturaleza(f), 0)
        - del.filter((f) => f.tipo === 'gasto').reduce((s, f) => s + impuestoDeFactura(f, indirectoActivo, tipoGeneral) * signoPorNaturaleza(f), 0)
      : 0;
    const impuestos = calcularImpuestosPorTipo(del, igicDeclarable(config.regionFiscal, config.repepActivo));
    // Arrastre IVA/IGIC (Fase A-C) — circuitos completamente independientes,
    // cada uno con su propia variable de estado; nunca se compensa uno con
    // otro. Con REPEP activo, `impuestos.igicResultado` ya viene en 0 desde
    // `calcularImpuestosPorTipo` (que ignora las facturas de IGIC por completo
    // en ese caso, ver `igicDeclarable` — bug real corregido 25/09/2026: antes
    // esas facturas SÍ se sumaban como soportado "a compensar" aunque bajo
    // REPEP ese IGIC ya es gasto, nunca un crédito fiscal), así que el
    // arrastre tampoco genera ni consume saldo — no hace falta ninguna
    // condición especial aquí, sale solo de la aritmética (ver test "REPEP no
    // genera arrastre indebido").
    const ivaArrastre = aplicarArrastreImpuesto(impuestos.ivaResultado, saldoIvaPendiente);
    saldoIvaPendiente = ivaArrastre.saldoPendiente;
    const igicArrastre = aplicarArrastreImpuesto(impuestos.igicResultado, saldoIgicPendiente);
    saldoIgicPendiente = igicArrastre.saldoPendiente;
    return {
      nombre: NOMBRES_TRIMESTRE[t],
      meses: MESES_TRIMESTRE[t],
      ingresos,
      gastos,
      gastosPeriodicos: gastosPeriodicosTrimestre,
      beneficio,
      irpf,
      beneficioAcumulado,
      impuestoIndirecto,
      modeloIndirecto: config.regionFiscal === 'canarias' ? `Modelo 420 (${MODELO_INDIRECTO_MES[t]})` : `Modelo 303 (${MODELO_INDIRECTO_MES[t]})`,
      facturas: del.length,
      impuestos,
      ivaArrastre,
      igicArrastre,
    };
  });
}

/**
 * Saldo de entrada de IVA/IGIC de un año, a partir del histórico YA OBTENIDO
 * de años anteriores (Fase A-C, 25/09/2026) — pura, nunca hace ninguna
 * petición de red; quien llama (`trimestres.tsx`) decide hasta qué año hace
 * falta retroceder (usando los años que ya tiene disponibles,
 * `api.obtenerAniosConFacturas()`) y trae las facturas de cada uno.
 *
 * `historico` debe venir ORDENADO de más antiguo a más reciente, empezando
 * en el año del saldo inicial manual (`saldoInicial`, si existe — mismo
 * patrón que `Empresa.saldoInicialIva`/`saldoInicialIgic`) o en el año más
 * antiguo disponible, y llegando hasta el año INMEDIATAMENTE ANTERIOR al que
 * se quiere calcular. Con `historico` vacío (sin años anteriores, o el año a
 * calcular es el propio año del saldo inicial), devuelve directamente
 * `saldoInicial` (o `{iva:0, igic:0}` si tampoco hay saldo inicial — primer
 * uso de la app, sin ningún dato anterior).
 *
 * A diferencia del IRPF (que resetea su acumulado cada año, ver
 * `beneficioAcumulado`), el saldo de IVA/IGIC nunca se pierde entre años —
 * por eso hace falta recorrer el histórico entero en vez de solo el año
 * anterior: el cierre de cada año depende, en cadena, del cierre del
 * anterior.
 */
export function calcularSaldoEntradaAnio(
  historico: { facturas: Factura[] }[],
  gastosPeriodicos: GastoPeriodico[],
  config: { regionFiscal: RegionFiscal; repepActivo: boolean },
  saldoInicial?: { iva: number; igic: number }
): { iva: number; igic: number } {
  let iva = saldoInicial?.iva ?? 0;
  let igic = saldoInicial?.igic ?? 0;
  for (const anio of historico) {
    const trimestres = calcularTrimestres(anio.facturas, gastosPeriodicos, {
      ...config,
      saldoInicial: { beneficio: 0, irpf: 0, iva, igic },
    });
    const q4 = trimestres[3];
    iva = q4.ivaArrastre.saldoPendiente;
    igic = q4.igicArrastre.saldoPendiente;
  }
  return { iva, igic };
}

// ── Posición fiscal trimestral (Bloque B, 25/09/2026) ───────────────────────
//
// REESTRUCTURA el resultado que ya calcula `calcularTrimestres` — nunca
// recalcula nada por su cuenta. El motor ya calcula ingresos/gastos/
// beneficio, IRPF acumulado, IVA e IGIC; esta función solo les da una forma
// clara y separada para responder "¿cuánto tengo que pagar a Hacienda?".
//
// IVA e IGIC se devuelven SIEMPRE por separado, nunca sumados ni
// convertidos entre sí — una empresa puede tener ambos en el mismo
// trimestre a la vez (p. ej. una compra en Península con IVA real, aunque
// la empresa sea de Canarias con IGIC — regla fundamental de la subfase
// IVA/IGIC, ver `clasificarImpuestoFactura`) y sumarlos sería fiscalmente
// incorrecto. Por el mismo motivo esta función NO calcula todavía un
// `totalAIngresar` combinado — queda para una fase posterior.
//
// Modelo 130 (IRPF): mismo cálculo de siempre (acumulado real desde enero,
// ver `calcularTrimestres`) — esta función NO añade retenciones, mínimo
// personal ni deducciones específicas: la auditoría del 25/09/2026 confirmó
// que el motor actual no las tiene implementadas, y simularlas aquí sería
// inventar un dato que no existe. `irpf.importe` es una estimación basada
// únicamente en lo que el motor conoce hoy.
//
// Modelo 303 (IVA) / Modelo 420 (IGIC): repercutido − soportado del propio
// trimestre, MÁS el arrastre de compensación entre trimestres (y entre años,
// Fase A-C, 25/09/2026) que ya calcula `calcularTrimestres` en
// `DatosTrimestre.ivaArrastre`/`igicArrastre` — esta función sigue sin
// recalcular nada, solo reestructura lo que ya viene calculado en el
// trimestre. `resultado` NUNCA cambia de significado (sigue siendo el
// resultado propio del trimestre, sin compensar) — la cifra ya compensada es
// `aIngresar`, un campo nuevo y separado.
//
// Sigue sin existir aquí ningún `totalAIngresar` que combine IRPF+IVA/IGIC —
// queda para una fase posterior, y esta función sigue recibiendo un único
// `DatosTrimestre` (nunca el año completo ni la `Empresa`): el estado
// cronológico entre trimestres/años vive en `calcularTrimestres`/
// `calcularSaldoEntradaAnio`, nunca aquí.

/** Posición fiscal de un trimestre — ver comentario de arriba. */
export type PosicionFiscalTrimestre = {
  /** Ingresos − gastos (económico puro, sin impuestos) de este trimestre — mismo valor que `DatosTrimestre.beneficio`. */
  resultadoEconomico: number;
  irpf: { importe: number; tipoModelo: '130' };
  /** `resultado` es siempre el del propio trimestre, sin compensar (mismo valor que antes de esta fase) — usa `aIngresar`/`saldoPendiente` para la cifra ya compensada con el arrastre. */
  iva: { resultado: number; tipoModelo: '303' } & ArrastreImpuesto;
  /** Ver `iva` — mismos campos, circuito completamente independiente. */
  igic: { resultado: number; tipoModelo: '420' } & ArrastreImpuesto;
};

/** Reestructura un `DatosTrimestre` ya calculado — ver comentario de arriba. Nunca recibe facturas ni recalcula nada. */
export function calcularPosicionFiscal(trimestre: DatosTrimestre): PosicionFiscalTrimestre {
  return {
    resultadoEconomico: trimestre.beneficio,
    irpf: { importe: trimestre.irpf, tipoModelo: '130' },
    iva: { resultado: trimestre.impuestos.ivaResultado, tipoModelo: '303', ...trimestre.ivaArrastre },
    igic: { resultado: trimestre.impuestos.igicResultado, tipoModelo: '420', ...trimestre.igicArrastre },
  };
}

// ── Total estimado a ingresar (Fase Total, 25/09/2026) ──────────────────────
//
// Última capa, encima de `calcularPosicionFiscal` — sigue sin recalcular
// nada, solo COMBINA lo que ya está calculado. Suma únicamente lo que de
// verdad hay que ingresar de cada impuesto:
//   - `irpf.importe`            (Modelo 130, ya neto del acumulado del año)
//   - `iva.aIngresar`           (Modelo 303, ya neto del arrastre de saldo)
//   - `igic.aIngresar`          (Modelo 420, ya neto del arrastre de saldo)
// NUNCA `iva.resultado`/`igic.resultado` a secas — esos son el bruto del
// propio trimestre, sin compensar con el saldo pendiente heredado.
//
// `iva.saldoPendiente`/`igic.saldoPendiente` (lo que queda SIN compensar,
// cuando el trimestre no llega a cubrir el saldo anterior) NO entran en el
// total — son puramente informativos, se muestran aparte. Ejemplo del
// encargo: un IGIC con 200€ pendientes de compensar no resta ni suma nada al
// total, solo se informa como "IGIC pendiente: 200€".
//
// IVA e IGIC nunca se compensan entre sí — cada uno aporta solo su propio
// `aIngresar`, ya neto de SU PROPIO arrastre (circuito independiente, regla
// de toda esta fase, no se reabre aquí).
//
// Pura — recibe la `PosicionFiscalTrimestre` ya calculada de UN trimestre,
// nunca el año completo ni la `Empresa`: el estado cronológico (arrastre
// entre trimestres/años) sigue viviendo únicamente en `calcularTrimestres`/
// `calcularSaldoEntradaAnio`, nunca aquí ni en `calcularPosicionFiscal`.

/** Desglose del total estimado a ingresar de un trimestre — ver comentario de arriba. */
export type TotalAIngresar = {
  irpf: number;
  iva: number;
  igic: number;
  /** Suma de los tres — nunca incluye `saldoPendiente` de IVA/IGIC. */
  total: number;
};

/**
 * Combina IRPF + IVA (`aIngresar`) + IGIC (`aIngresar`) de una posición
 * fiscal ya calculada. `irpf.importe`, `iva.aIngresar` e `igic.aIngresar` ya
 * están garantizados ≥0 por quienes los calculan (`Math.max(0, ...)` en
 * `calcularTrimestres`/`aplicarArrastreImpuesto`) — el `Math.max` de aquí es
 * una defensa adicional, no estrictamente necesaria hoy, para que esta
 * función siga siendo correcta aunque esa garantía cambiara en el futuro.
 */
export function calcularTotalAIngresar(posicion: PosicionFiscalTrimestre): TotalAIngresar {
  const irpf = Math.max(0, posicion.irpf.importe);
  const iva = Math.max(0, posicion.iva.aIngresar);
  const igic = Math.max(0, posicion.igic.aIngresar);
  return { irpf, iva, igic, total: redondearEuros(irpf + iva + igic) };
}

// ── Tratamiento fiscal (Fase 3A, infraestructura) ───────────────────────────
//
// Registra la decisión de deducibilidad que ya ha tomado el usuario/asesor
// para una factura — NO establece ninguna regla fiscal nueva. `Factura`
// solo guarda un número (0-100) o nada; los estados "por_revisar"/
// "no_aplica" se derivan siempre al leer, nunca se escriben en Mongo (así
// no pueden quedar desincronizados si la factura se edita después). Estas
// funciones reciben ÚNICAMENTE la factura — nunca `regionFiscal` ni
// `repepActivo` — para que sea estructuralmente imposible que una regla
// automática por región se cuele aquí.

/** Estado derivado de un tratamiento fiscal: un número (0-100) es una decisión real ya tomada. */
export type EstadoTratamiento = 'no_aplica' | 'por_revisar' | number;

/**
 * Estado de deducibilidad en IRPF de una factura de gasto. Un ingreso
 * siempre es `'no_aplica'` — la deducibilidad de IRPF no tiene sentido en
 * un ingreso. Sin decisión tomada (`deducibleIrpf` ausente) → `'por_revisar'`.
 */
export function estadoDeducibleIrpf(f: Pick<Factura, 'tipo' | 'deducibleIrpf'>): EstadoTratamiento {
  if (f.tipo !== 'gasto') return 'no_aplica';
  if (typeof f.deducibleIrpf === 'number') return f.deducibleIrpf;
  return 'por_revisar';
}

/**
 * Estado de deducibilidad del IVA/IGIC soportado de una factura de gasto.
 * `'no_aplica'` en ingresos, en facturas exentas/sin impuesto/sin tipo
 * identificado, y cuando la cuota no es calculable (`cuotaRealDeFactura`
 * → `null`): sin un importe real conocido no hay nada que deducir todavía,
 * no es una pregunta pendiente de responder sino una que aún no se puede
 * formular. Sin decisión tomada (`ivaIgicDeducible` ausente, pero sí hay
 * cuota real) → `'por_revisar'`.
 */
export function estadoIvaIgicDeducible(
  f: Pick<Factura, 'tipo' | 'tipoImpuesto' | 'importeImpuesto' | 'baseImponible' | 'porcentajeImpuesto' | 'ivaIgicDeducible'>
): EstadoTratamiento {
  if (f.tipo !== 'gasto') return 'no_aplica';
  const clasificacion = clasificarImpuestoFactura(f);
  if (clasificacion !== 'iva' && clasificacion !== 'igic') return 'no_aplica';
  if (cuotaRealDeFactura(f) === null) return 'no_aplica';
  if (typeof f.ivaIgicDeducible === 'number') return f.ivaIgicDeducible;
  return 'por_revisar';
}

/**
 * Euros deducibles en IRPF del gasto económico de una factura —
 * `base × deducibleIrpf/100`. `null` si no hay una decisión numérica
 * resuelta (`'por_revisar'`/`'no_aplica'`) — NUNCA se trata como 0€: un
 * pendiente de revisar no es lo mismo que "no deducible".
 */
export function gastoDeducible(f: Pick<Factura, 'tipo' | 'deducibleIrpf' | 'baseImponible' | 'importe'>): number | null {
  const estado = estadoDeducibleIrpf(f);
  if (typeof estado !== 'number') return null;
  const base = typeof f.baseImponible === 'number' ? f.baseImponible : f.importe;
  return base * estado / 100;
}

/**
 * Euros deducibles del IVA/IGIC soportado de una factura —
 * `cuotaReal × ivaIgicDeducible/100`. `null` si no hay una decisión
 * numérica resuelta. La cuota real (`importeImpuesto`/derivada) nunca se
 * modifica — esto es una cifra nueva y separada, calculada al leer.
 */
export function cuotaDeducible(
  f: Pick<Factura, 'tipo' | 'tipoImpuesto' | 'importeImpuesto' | 'baseImponible' | 'porcentajeImpuesto' | 'ivaIgicDeducible'>
): number | null {
  const estado = estadoIvaIgicDeducible(f);
  if (typeof estado !== 'number') return null;
  const cuota = cuotaRealDeFactura(f);
  if (cuota === null) return null; // defensivo — estadoIvaIgicDeducible ya lo garantiza como 'no_aplica'
  return cuota * estado / 100;
}

// ── Desglose fiscal por tramos (auditoría 12/09/2026) ───────────────────────
//
// Una factura real puede tener varias bases/cuotas de IGIC o IVA a distinto
// porcentaje (p. ej. un albarán con partidas al 3% y al 7% de IGIC) — antes
// el formulario y la IA solo podían representar un único tramo, así que
// cualquier factura con más de uno perdía datos en silencio. `lineasFiscales`
// guarda el detalle real; estas funciones son las únicas que sabe sumarlo o
// validarlo, para no duplicar esa lógica en el formulario y en el backend.

/** Redondeo a céntimos — para que sumar varias líneas nunca arrastre errores de coma flotante (p. ej. 0.1 + 0.2). */
function redondearEuros(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Suma las bases y las cuotas de todas las líneas — nunca recalcula la
 * cuota de una línea a partir de su base y porcentaje, usa el importe real
 * de cada línea tal cual. Es la única fuente para `Factura.baseImponible`/
 * `importeImpuesto` cuando hay más de un tramo.
 */
export function agregarLineasFiscales(lineas: LineaFiscal[]): { baseImponible: number; importeImpuesto: number } {
  return {
    baseImponible: redondearEuros(lineas.reduce((s, l) => s + l.baseImponible, 0)),
    importeImpuesto: redondearEuros(lineas.reduce((s, l) => s + l.cuota, 0)),
  };
}

/**
 * Tipo de impuesto real (a efectos de `Factura.tipoImpuesto`, y por tanto de
 * `clasificarImpuestoFactura`/el agregado trimestral de IVA e IGIC) de un
 * desglose por tramos — bug real detectado 12/09/2026: `lineasFiscales` se
 * guardaba correctamente pero `tipoImpuesto` (el único campo que usa el
 * trimestral para clasificar) se quedaba en `''` si nadie tocaba el
 * desplegable a mano, así que la factura aparecía "con impuesto sin
 * identificar" aunque su desglose ya cuadrara. Con líneas de IVA o de IGIC
 * (nunca ambas a la vez, ya lo impide `validarLineasFiscales`) devuelve ese
 * tipo; con solo exentas/sin impuesto, devuelve el de la primera; sin
 * líneas, `''` (nada que derivar).
 */
export function tipoRealDeLineas(lineas: LineaFiscal[]): TipoImpuestoFactura {
  if (lineas.length === 0) return '';
  const tiposReales = new Set(lineas.filter((l) => l.tipo === 'iva' || l.tipo === 'igic').map((l) => l.tipo));
  if (tiposReales.size === 1) return [...tiposReales][0] as TipoImpuestoFactura;
  if (tiposReales.size > 1) return ''; // mezcla — no debería llegar aquí si ya se validó antes de guardar
  return lineas[0].tipo;
}

/**
 * Resultado de validar el desglose fiscal — `motivo` es un aviso en
 * lenguaje llano para mostrar en el formulario, nunca un código interno.
 */
export type ValidacionLineasFiscales = { valido: boolean; motivo?: string };

/**
 * Comprueba el desglose fiscal de una factura: (1) todas las líneas con un
 * impuesto real (no exentas/sin impuesto) deben compartir la misma
 * naturaleza — nunca IVA y IGIC a la vez en la misma factura (auditoría
 * Fase 2); (2) la suma de bases + la suma de cuotas debe coincidir con el
 * importe total, con un margen de 1 céntimo para redondeos. Sin líneas
 * (factura sin desglose fiscal todavía) se considera válido — esta función
 * no obliga a rellenar nada, solo avisa cuando lo que YA hay no cuadra.
 */
export function validarLineasFiscales(lineas: LineaFiscal[], importeTotal: number): ValidacionLineasFiscales {
  if (lineas.length === 0) return { valido: true };
  const tiposReales = new Set(lineas.filter((l) => l.tipo === 'iva' || l.tipo === 'igic').map((l) => l.tipo));
  if (tiposReales.size > 1) {
    return { valido: false, motivo: 'Esta factura mezcla tramos de IVA y de IGIC — revísala a mano, una factura solo puede llevar uno de los dos.' };
  }
  const { baseImponible, importeImpuesto } = agregarLineasFiscales(lineas);
  const diferencia = redondearEuros(baseImponible + importeImpuesto - importeTotal);
  if (Math.abs(diferencia) > 0.01) {
    return {
      valido: false,
      motivo: `La suma de las bases (${baseImponible.toFixed(2)}€) más los impuestos (${importeImpuesto.toFixed(2)}€) no coincide con el importe total (${importeTotal.toFixed(2)}€) — revisa si falta o sobra algún tramo.`,
    };
  }
  return { valido: true };
}

// ── Detector de datos de identificación incompletos (13/09/2026) ───────────
//
// Petición explícita del usuario: marcar en la lista de Facturas cualquiera
// a la que le falte el número de factura, el CIF/NIF o el nombre (razón
// social) del proveedor/cliente — y que el aviso diga EXACTAMENTE qué dato
// falta, nunca un genérico "revisar". Solo detecta, de solo lectura, igual
// que `detectarProblemaFiscal` — no corrige ni completa nada por su cuenta.

export type DatoIdentificacionFaltante = 'numero_factura' | 'cif_nif' | 'razon_social';

const ETIQUETA_DATO_FALTANTE: Record<DatoIdentificacionFaltante, string> = {
  numero_factura: 'el número de factura',
  cif_nif: 'el CIF/NIF',
  razon_social: 'el nombre (razón social)',
};

export type ProblemaIdentificacionDetectado = {
  faltantes: DatoIdentificacionFaltante[];
  /** En lenguaje llano, nombrando explícitamente cada dato que falta — nunca un aviso genérico. */
  explicacion: string;
};

/**
 * `null` si no falta nada. Con algo que falta, devuelve la lista exacta de
 * qué campos son (para poder tratarlos por separado si hiciera falta más
 * adelante) y una frase ya construida con todos ellos nombrados.
 */
export function detectarDatosIdentificacionFaltantes(
  f: Pick<Factura, 'proveedor' | 'numeroFactura' | 'cifNif'>
): ProblemaIdentificacionDetectado | null {
  const faltantes: DatoIdentificacionFaltante[] = [];
  if (!f.numeroFactura?.trim()) faltantes.push('numero_factura');
  if (!f.cifNif?.trim()) faltantes.push('cif_nif');
  if (!f.proveedor?.trim()) faltantes.push('razon_social');
  if (faltantes.length === 0) return null;

  const etiquetas = faltantes.map((d) => ETIQUETA_DATO_FALTANTE[d]);
  const explicacion = etiquetas.length === 1
    ? `Falta ${etiquetas[0]}.`
    : `Faltan ${etiquetas.slice(0, -1).join(', ')} y ${etiquetas[etiquetas.length - 1]}.`;
  return { faltantes, explicacion };
}

// ── Detector de facturas con posible desglose fiscal incorrecto (12/09/2026) ──
//
// Auditoría de SOLO LECTURA sobre facturas ya guardadas (nuevas o de antes de
// que existiera `lineasFiscales`) — nunca corrige nada, nunca reextrae con
// IA, nunca escribe en Mongo. Sirve para que el usuario sepa qué facturas
// revisar a mano tras el bug real de extracción con varios tramos de IGIC/IVA
// (p. ej. 25,08€ al 3% + 112,88€ al 7% de una misma factura).

export type CategoriaProblemaFiscal = 'descuadre_total' | 'datos_fiscales_incompletos' | 'tipo_exento_con_cuota' | 'mezcla_iva_igic';

export type ProblemaFiscalDetectado = {
  categoria: CategoriaProblemaFiscal;
  /** `null` cuando la categoría no permite calcular una base/cuota fiable (mezcla o líneas corruptas). */
  baseUtilizada: number | null;
  cuotaUtilizada: number | null;
  diferencia: number | null;
  /** Explicación en lenguaje llano, lista para mostrar en el panel — nunca un código interno. */
  explicacion: string;
};

function esLineaFiscalValida(l: LineaFiscal): boolean {
  return (l.tipo === 'iva' || l.tipo === 'igic' || l.tipo === 'exento' || l.tipo === 'sin_impuesto')
    && typeof l.baseImponible === 'number' && Number.isFinite(l.baseImponible)
    && typeof l.cuota === 'number' && Number.isFinite(l.cuota)
    && typeof l.porcentaje === 'number' && Number.isFinite(l.porcentaje);
}

/**
 * Detecta si una factura tiene un problema en su desglose fiscal — nunca lo
 * corrige. Con `lineasFiscales` (válidas), la base/cuota SIEMPRE se calculan
 * sumando las líneas — los campos antiguos (`baseImponible`/`importeImpuesto`)
 * se ignoran por completo para esta comprobación, nunca se usan como fuente
 * cuando hay líneas. Sin `lineasFiscales` (factura de antes de esta fase), se
 * usan los campos antiguos tal cual, si ambos están informados. Una factura
 * sin ningún dato fiscal en absoluto NO se considera un problema — es su
 * estado normal, nunca se ha rellenado nada, nada que revisar aquí.
 *
 * Devuelve como mucho UNA categoría por factura (la más específica, en este
 * orden de prioridad): líneas corruptas → mezcla de IVA/IGIC → tramo exento
 * con cuota → descuadre con el importe total. `null` = sin problema.
 */
export function detectarProblemaFiscal(
  f: Pick<Factura, 'importe' | 'baseImponible' | 'importeImpuesto' | 'tipoImpuesto' | 'lineasFiscales'>
): ProblemaFiscalDetectado | null {
  const lineas = Array.isArray(f.lineasFiscales) ? f.lineasFiscales : [];

  if (lineas.length > 0) {
    if (!lineas.every(esLineaFiscalValida)) {
      return {
        categoria: 'datos_fiscales_incompletos', baseUtilizada: null, cuotaUtilizada: null, diferencia: null,
        explicacion: 'El desglose guardado tiene tramos incompletos o con datos no válidos — revísalo a mano.',
      };
    }
    const tiposReales = new Set(lineas.filter((l) => l.tipo === 'iva' || l.tipo === 'igic').map((l) => l.tipo));
    if (tiposReales.size > 1) {
      return {
        categoria: 'mezcla_iva_igic', baseUtilizada: null, cuotaUtilizada: null, diferencia: null,
        explicacion: 'El desglose mezcla tramos de IVA y de IGIC en la misma factura — una factura solo puede llevar uno de los dos.',
      };
    }
    const lineaExentaConCuota = lineas.find((l) => (l.tipo === 'exento' || l.tipo === 'sin_impuesto') && l.cuota !== 0);
    if (lineaExentaConCuota) {
      return {
        categoria: 'tipo_exento_con_cuota', baseUtilizada: null, cuotaUtilizada: null, diferencia: null,
        explicacion: `Un tramo marcado como "${lineaExentaConCuota.tipo === 'exento' ? 'exento' : 'sin impuesto'}" tiene una cuota de ${lineaExentaConCuota.cuota.toFixed(2)}€ — debería ser 0€.`,
      };
    }
    const { baseImponible, importeImpuesto } = agregarLineasFiscales(lineas);
    const diferencia = redondearEuros(baseImponible + importeImpuesto - f.importe);
    if (Math.abs(diferencia) > 0.01) {
      return {
        categoria: 'descuadre_total', baseUtilizada: baseImponible, cuotaUtilizada: importeImpuesto, diferencia,
        explicacion: `La suma de las bases (${baseImponible.toFixed(2)}€) más los impuestos (${importeImpuesto.toFixed(2)}€) no coincide con el importe total (${f.importe.toFixed(2)}€).`,
      };
    }
    return null;
  }

  // Sin lineasFiscales — factura de antes de esta fase, con los campos de siempre.
  const tieneBase = typeof f.baseImponible === 'number';
  const tieneCuota = typeof f.importeImpuesto === 'number';
  if (!tieneBase && !tieneCuota) return null; // nunca se rellenó nada — estado normal, no es un problema
  if (tieneBase !== tieneCuota) {
    return {
      categoria: 'datos_fiscales_incompletos',
      baseUtilizada: tieneBase ? (f.baseImponible as number) : null,
      cuotaUtilizada: tieneCuota ? (f.importeImpuesto as number) : null,
      diferencia: null,
      explicacion: tieneBase ? 'Tiene base imponible pero falta la cuota del impuesto.' : 'Tiene cuota de impuesto pero falta la base imponible.',
    };
  }
  const base = f.baseImponible as number;
  const cuota = f.importeImpuesto as number;
  if ((f.tipoImpuesto === 'exento' || f.tipoImpuesto === 'sin_impuesto') && cuota !== 0) {
    return {
      categoria: 'tipo_exento_con_cuota', baseUtilizada: base, cuotaUtilizada: cuota, diferencia: redondearEuros(base + cuota - f.importe),
      explicacion: `Está marcada como "${f.tipoImpuesto === 'exento' ? 'exenta' : 'sin impuesto'}" pero tiene una cuota de ${cuota.toFixed(2)}€ — debería ser 0€.`,
    };
  }
  const diferencia = redondearEuros(base + cuota - f.importe);
  if (Math.abs(diferencia) > 0.01) {
    return {
      categoria: 'descuadre_total', baseUtilizada: base, cuotaUtilizada: cuota, diferencia,
      explicacion: `La suma de la base (${base.toFixed(2)}€) más la cuota (${cuota.toFixed(2)}€) no coincide con el importe total (${f.importe.toFixed(2)}€).`,
    };
  }
  return null;
}
