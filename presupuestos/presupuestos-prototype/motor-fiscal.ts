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
};

/** Naturaleza real de una factura a efectos de agregación IVA/IGIC — se decide SOLO por `tipoImpuesto`, nunca por `regionFiscal`. */
export type ClasificacionImpuesto = 'iva' | 'igic' | 'exento' | 'sin_impuesto' | 'no_identificado';

export type ResumenImpuestosTrimestre = {
  ivaRepercutido: number;
  ivaSoportado: number;
  igicRepercutido: number;
  igicSoportado: number;
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

// El IGIC repercutido/soportado con REPEP activo no aplica: un negocio
// acogido no repercute IGIC en sus facturas ni se deduce el soportado en
// sus compras (investigación fiscal 11/08/2026) — así que en ese caso no
// se calcula ningún impuesto indirecto.
export function calculaIndirecto(regionFiscal: RegionFiscal, repepActivo: boolean): boolean {
  return !!regionFiscal && !(regionFiscal === 'canarias' && repepActivo);
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
 */
export function calcularImpuestosPorTipo(facturas: Factura[]): ResumenImpuestosTrimestre {
  const resumen: ResumenImpuestosTrimestre = {
    ivaRepercutido: 0, ivaSoportado: 0, igicRepercutido: 0, igicSoportado: 0,
    noIdentificado: { repercutido: 0, soportado: 0, numFacturas: 0 },
    noCalculable: { numFacturas: 0 },
  };
  for (const f of facturas) {
    const clasificacion = clasificarImpuestoFactura(f);
    if (clasificacion === 'exento' || clasificacion === 'sin_impuesto') continue;
    const cuota = cuotaRealDeFactura(f);
    if (clasificacion === 'no_identificado') {
      if (cuota === null || cuota === 0) continue; // sin ningún dato real de impuesto — no aporta a "no identificado", ya es "sin desglose" (Fase 1)
      resumen.noIdentificado.numFacturas += 1;
      if (f.tipo === 'ingreso') resumen.noIdentificado.repercutido += cuota; else resumen.noIdentificado.soportado += cuota;
      continue;
    }
    // A partir de aquí, clasificacion es 'iva' o 'igic' — tipo real conocido.
    if (cuota === null) {
      resumen.noCalculable.numFacturas += 1;
      continue;
    }
    if (clasificacion === 'iva') {
      if (f.tipo === 'ingreso') resumen.ivaRepercutido += cuota; else resumen.ivaSoportado += cuota;
    } else {
      if (f.tipo === 'ingreso') resumen.igicRepercutido += cuota; else resumen.igicSoportado += cuota;
    }
  }
  return resumen;
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
 */
export function calcularTrimestres(
  facturas: Factura[],
  gastosPeriodicos: GastoPeriodico[],
  config: { regionFiscal: RegionFiscal; repepActivo: boolean }
): DatosTrimestre[] {
  const indirectoActivo = calculaIndirecto(config.regionFiscal, config.repepActivo);
  const tipoGeneral = tipoGeneralDeRegion(config.regionFiscal);

  let beneficioAcumulado = 0;
  let irpfYaCalculado = 0;

  return [0, 1, 2, 3].map((t) => {
    const del = facturas.filter((f) => trimestreDeFecha(f.fecha) === t);
    const ingresos = del.filter((f) => f.tipo === 'ingreso').reduce((s, f) => s + f.importe, 0);
    const gastos = del.filter((f) => f.tipo === 'gasto').reduce((s, f) => s + f.importe, 0);
    const gastosPeriodicosTrimestre = gastosPeriodicos.filter((g) => g.activo && esGastoPeriodicoDeducible(g))
      .reduce((s, g) => s + (g.periodicidad === 'mensual' ? g.importe * 3 : g.importe), 0);
    const beneficio = ingresos - gastos - gastosPeriodicosTrimestre;
    beneficioAcumulado = redondearEuros(beneficioAcumulado + beneficio);
    const irpfTeoricoAcumulado = beneficioAcumulado > 0 ? redondearEuros(beneficioAcumulado * TIPO_IRPF) : 0;
    const irpf = Math.max(0, redondearEuros(irpfTeoricoAcumulado - irpfYaCalculado));
    irpfYaCalculado = redondearEuros(irpfYaCalculado + irpf);
    const impuestoIndirecto = indirectoActivo
      ? del.filter((f) => f.tipo === 'ingreso').reduce((s, f) => s + impuestoDeFactura(f, indirectoActivo, tipoGeneral), 0)
        - del.filter((f) => f.tipo === 'gasto').reduce((s, f) => s + impuestoDeFactura(f, indirectoActivo, tipoGeneral), 0)
      : 0;
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
      impuestos: calcularImpuestosPorTipo(del),
    };
  });
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
