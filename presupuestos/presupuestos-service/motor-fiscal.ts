/**
 * Clasificación y agregación real de IVA/IGIC por factura (subfase
 * "Agregación trimestral IVA/IGIC") — mismo criterio que la versión del
 * frontend (`motor-fiscal.ts` en `presupuestos-prototype`, mismo patrón de
 * duplicación ya aceptado en este proyecto para utilidades puras pequeñas
 * sin estado, ver `gasto-periodico-fiscal.ts`). Solo se copia el subconjunto
 * que necesita el PDF del asesor — el cálculo trimestral completo
 * (IRPF, `calcularTrimestres`) sigue viviendo únicamente en el frontend.
 *
 * Regla fundamental: la clasificación usa SOLO `tipoImpuesto` de la propia
 * factura — nunca `regionFiscal` de la empresa. Una factura con IVA real
 * sigue siendo IVA aunque la empresa esté en Canarias con REPEP, y viceversa.
 */

type FacturaImpuesto = {
  tipo: 'ingreso' | 'gasto';
  tipoImpuesto?: 'igic' | 'iva' | 'exento' | 'sin_impuesto' | '';
  importeImpuesto?: number;
  baseImponible?: number;
  porcentajeImpuesto?: number;
  /** Porcentaje (0-100) deducible en IRPF (Fase 3A) — ausente = sin decidir. */
  deducibleIrpf?: number;
  /** Porcentaje (0-100) deducible del IVA/IGIC soportado (Fase 3A) — separado de `importeImpuesto`. */
  ivaIgicDeducible?: number;
  /** Naturaleza del documento (25/09/2026) — ver `signoPorNaturaleza` más abajo y `Factura.naturaleza` en el frontend. Ausente = 'normal'. */
  naturaleza?: 'normal' | 'rectificativa';
};

export type ResumenImpuestosTrimestre = {
  /** Base imponible agregada — solo cuenta cuando `baseImponible` consta en la factura (14/09/2026). */
  ivaBaseRepercutida: number;
  ivaRepercutido: number;
  ivaBaseSoportada: number;
  ivaSoportado: number;
  /** Repercutido − soportado del período — positivo es lo que hay que ingresar en el Modelo 303, negativo lo que queda a compensar (14/09/2026). */
  ivaResultado: number;
  igicBaseRepercutida: number;
  igicRepercutido: number;
  igicBaseSoportada: number;
  igicSoportado: number;
  /** Ver `ivaResultado` — mismo cálculo para el Modelo 420. */
  igicResultado: number;
  /** Factura con importe de impuesto real pero sin `tipoImpuesto` clasificado (`''`) — nunca asignada a IVA/IGIC por región, queda pendiente de revisión. */
  noIdentificado: { repercutido: number; soportado: number; numFacturas: number };
  /** Factura con `tipoImpuesto` real (`'iva'`/`'igic'`) pero sin dato suficiente para calcular su cuota — NO se cuenta como 0€, distinto de una cuota real de 0. */
  noCalculable: { numFacturas: number };
};

export type ClasificacionImpuesto = 'iva' | 'igic' | 'exento' | 'sin_impuesto' | 'no_identificado';

// ── Rectificativas/devoluciones (25/09/2026) ── mismo criterio que la
// versión del frontend (`motor-fiscal.ts` en `presupuestos-prototype`):
// una rectificativa es `Factura.naturaleza`, nunca un tercer `tipo` ni un
// importe negativo tecleado — el importe se introduce siempre en positivo,
// esta función es la única que lo convierte en signo. ──

/** `+1` para una factura normal, `-1` para una rectificativa. */
export function signoPorNaturaleza(f: Pick<FacturaImpuesto, 'naturaleza'>): 1 | -1 {
  return f.naturaleza === 'rectificativa' ? -1 : 1;
}

/**
 * Expresión Mongo equivalente a `signoPorNaturaleza`, para usar dentro de un
 * `$group`/`$sum` de `aggregate()` (`presupuestos-service.ts` →
 * `resumenFacturas`/`resumenEconomico`) — no se puede llamar a una función
 * de JS dentro del pipeline de agregación de Mongo, así que esta es la
 * ÚNICA otra definición de la misma regla, mantenida junto a la de arriba a
 * propósito para que no se desincronicen.
 */
export const SIGNO_NATURALEZA_MONGO = { $cond: [{ $eq: ['$naturaleza', 'rectificativa'] }, -1, 1] };

export type ResultadoValidacionRectificativa = {
  /** `false` = error de integridad del dato (no existe, es de otra cuenta, se referencia a sí misma) — el guardado debe rechazarse. Nunca una cuestión de criterio fiscal. */
  valido: boolean;
  motivo?: string;
  /** Avisos que NO bloquean el guardado — requieren criterio profesional (del usuario/asesor), el sistema nunca los resuelve solo. */
  advertencias: string[];
};

/**
 * Valida una factura rectificativa contra su factura original YA RESUELTA
 * por quien llama. Pura — no hace ninguna consulta a la base de datos, para
 * poder testear las reglas sin red ni mocks (mismo principio que
 * `identificacion-factura.ts`, frontend).
 *
 * `facturaOriginal: null` cubre A LA VEZ "no existe" y "pertenece a otra
 * cuenta" — quien llama debe buscarla siempre filtrando por `usuarioId`
 * (mismo aislamiento multi-tenant que el resto del proyecto), nunca se
 * distingue entre ambos casos para no filtrar qué existe en otras cuentas.
 *
 * `rectificativasHermanas` son las OTRAS rectificativas ya guardadas de esa
 * misma factura original (sin incluir `factura` si se está reeditando).
 */
export function validarRectificativa(
  factura: { id: string; importe: number; facturaOriginalId?: string },
  facturaOriginal: { id: string; importe: number; naturaleza?: 'normal' | 'rectificativa' } | null,
  rectificativasHermanas: { importe: number }[]
): ResultadoValidacionRectificativa {
  const advertencias: string[] = [];
  if (!factura.facturaOriginalId) {
    return { valido: false, motivo: 'Una factura rectificativa debe indicar la factura original a la que corrige.', advertencias };
  }
  if (factura.facturaOriginalId === factura.id) {
    return { valido: false, motivo: 'Una factura rectificativa no puede referenciarse a sí misma como original.', advertencias };
  }
  if (!facturaOriginal) {
    return { valido: false, motivo: 'La factura original indicada no existe o no pertenece a esta cuenta.', advertencias };
  }
  if (facturaOriginal.naturaleza === 'rectificativa') {
    advertencias.push('La factura original de esta rectificativa es a su vez otra rectificativa — revisa la cadena a mano, el sistema no decide automáticamente cómo tratarla.');
  }
  const sumaRectificativas = rectificativasHermanas.reduce((s, r) => s + r.importe, 0) + factura.importe;
  if (sumaRectificativas > facturaOriginal.importe + 0.01) {
    advertencias.push(
      `La suma de las rectificativas de esta factura (${sumaRectificativas.toFixed(2)}€) supera el importe de la ` +
      `original (${facturaOriginal.importe.toFixed(2)}€) — revísalo, el sistema no bloquea este caso porque puede ` +
      'ser correcto según el criterio de tu asesor.'
    );
  }
  return { valido: true, advertencias };
}

const NOMBRES_TRIMESTRE_BACKEND = ['1.er Trimestre', '2.º Trimestre', '3.er Trimestre', '4.º Trimestre'];

/** Trimestre (0-3) a partir de una fecha ISO `AAAA-MM-DD` — por slicing de texto, nunca `Date`, para no depender de zona horaria. */
function trimestreDeFecha(fecha: string): number {
  return Math.floor((Number(fecha.slice(5, 7)) - 1) / 3);
}

export type AvisoRectificativaTrimestre = {
  /** `false` si la rectificativa cae en el mismo trimestre/año que su factura original — nada que avisar. */
  trimestreDistinto: boolean;
  /** Solo presente cuando `trimestreDistinto` es `true`. */
  explicacion?: string;
};

/**
 * Aviso — nunca una corrección — de que una rectificativa cae en un
 * trimestre (o año) distinto al de su factura original (25/09/2026, cierre
 * del riesgo #1 de la revisión de diff: esta misma función ya existía en el
 * frontend, `motor-fiscal.ts` de `presupuestos-prototype`, pero no estaba
 * conectada a ningún flujo real — aquí sí se llama desde `guardarFactura`,
 * en `presupuestos-service.ts`). Mismo criterio exacto que la versión del
 * frontend: el IRPF ya se corrige solo (acumulado real desde enero), pero
 * el Modelo 303/420 se calcula trimestre a trimestre de forma
 * independiente — si la original ya se declaró, corregirla en el trimestre
 * de la rectificativa puede requerir una complementaria del trimestre
 * original. Esta función SOLO detecta el caso y lo explica: no decide, no
 * corrige, no cambia ninguna fecha, no genera ninguna complementaria. Su
 * resultado se adjunta a la respuesta del guardado (campo efímero, no
 * persistido en el documento) para que una interfaz futura pueda mostrarlo.
 */
export function detectarRectificativaTrimestreDistinto(
  rectificativa: { fecha: string },
  facturaOriginal: { fecha: string }
): AvisoRectificativaTrimestre {
  const anioRect = Number(rectificativa.fecha.slice(0, 4));
  const anioOrig = Number(facturaOriginal.fecha.slice(0, 4));
  const trimRect = trimestreDeFecha(rectificativa.fecha);
  const trimOrig = trimestreDeFecha(facturaOriginal.fecha);
  if (anioRect === anioOrig && trimRect === trimOrig) return { trimestreDistinto: false };
  return {
    trimestreDistinto: true,
    explicacion:
      `La factura original es de ${NOMBRES_TRIMESTRE_BACKEND[trimOrig]} de ${anioOrig} y esta rectificativa es de ` +
      `${NOMBRES_TRIMESTRE_BACKEND[trimRect]} de ${anioRect} — si el trimestre de la original ya se declaró, puede ` +
      'hacer falta presentar una complementaria. El sistema no lo decide automáticamente: revísalo con tu asesor.',
  };
}

/**
 * Exportada desde Fase 3C.3 (antes privada de este archivo) — el nuevo
 * `motor-resolucion-fiscal.ts` (backend) la necesita para no duplicarla una
 * tercera vez. Sin cambio de comportamiento: mismo cuerpo que antes.
 */
export function clasificarImpuestoFactura(f: Pick<FacturaImpuesto, 'tipoImpuesto'>): ClasificacionImpuesto {
  if (f.tipoImpuesto === 'iva' || f.tipoImpuesto === 'igic' || f.tipoImpuesto === 'exento' || f.tipoImpuesto === 'sin_impuesto') {
    return f.tipoImpuesto;
  }
  return 'no_identificado';
}

/** `null` = sin dato suficiente para saber la cuota (distinto de una cuota real de 0€). Exportada desde Fase 3C.3, mismo motivo que `clasificarImpuestoFactura`. */
export function cuotaRealDeFactura(f: Pick<FacturaImpuesto, 'importeImpuesto' | 'baseImponible' | 'porcentajeImpuesto'>): number | null {
  if (typeof f.importeImpuesto === 'number') return f.importeImpuesto;
  if (typeof f.baseImponible === 'number' && typeof f.porcentajeImpuesto === 'number') {
    return f.baseImponible * f.porcentajeImpuesto / 100;
  }
  return null;
}

/**
 * Agrega IVA/IGIC repercutido y soportado de un conjunto de facturas (p. ej.
 * las de un trimestre) — mismas reglas que la versión del frontend, incluida
 * la base imponible agregada y `ivaResultado`/`igicResultado` (repercutido
 * − soportado, 14/09/2026).
 */
export function calcularImpuestosPorTipo(facturas: FacturaImpuesto[]): ResumenImpuestosTrimestre {
  const resumen: ResumenImpuestosTrimestre = {
    ivaBaseRepercutida: 0, ivaRepercutido: 0, ivaBaseSoportada: 0, ivaSoportado: 0, ivaResultado: 0,
    igicBaseRepercutida: 0, igicRepercutido: 0, igicBaseSoportada: 0, igicSoportado: 0, igicResultado: 0,
    noIdentificado: { repercutido: 0, soportado: 0, numFacturas: 0 },
    noCalculable: { numFacturas: 0 },
  };
  for (const f of facturas) {
    const clasificacion = clasificarImpuestoFactura(f);
    if (clasificacion === 'exento' || clasificacion === 'sin_impuesto') continue;
    const cuota = cuotaRealDeFactura(f);
    // Signo por naturaleza (25/09/2026) — ver comentario junto a `signoPorNaturaleza`.
    const signo = signoPorNaturaleza(f);
    if (clasificacion === 'no_identificado') {
      if (cuota === null || cuota === 0) continue;
      resumen.noIdentificado.numFacturas += 1;
      if (f.tipo === 'ingreso') resumen.noIdentificado.repercutido += cuota * signo; else resumen.noIdentificado.soportado += cuota * signo;
      continue;
    }
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

// ── Tratamiento fiscal (Fase 3A, infraestructura) ───────────────────────────
// Mismo criterio que la versión del frontend: `Factura` solo guarda un
// número (0-100) o nada; "por_revisar"/"no_aplica" se derivan al leer,
// nunca se escriben en Mongo. Estas funciones reciben ÚNICAMENTE la
// factura — nunca `regionFiscal` ni `repepActivo`.

export type EstadoTratamiento = 'no_aplica' | 'por_revisar' | number;

/** Estado de deducibilidad en IRPF — `'no_aplica'` en ingresos, `'por_revisar'` sin decisión tomada. */
export function estadoDeducibleIrpf(f: Pick<FacturaImpuesto, 'tipo' | 'deducibleIrpf'>): EstadoTratamiento {
  if (f.tipo !== 'gasto') return 'no_aplica';
  if (typeof f.deducibleIrpf === 'number') return f.deducibleIrpf;
  return 'por_revisar';
}

/** Estado de deducibilidad del IVA/IGIC soportado — `'no_aplica'` en ingresos, exento/sin_impuesto/sin tipo, y cuota no calculable. */
export function estadoIvaIgicDeducible(
  f: Pick<FacturaImpuesto, 'tipo' | 'tipoImpuesto' | 'importeImpuesto' | 'baseImponible' | 'porcentajeImpuesto' | 'ivaIgicDeducible'>
): EstadoTratamiento {
  if (f.tipo !== 'gasto') return 'no_aplica';
  const clasificacion = clasificarImpuestoFactura(f);
  if (clasificacion !== 'iva' && clasificacion !== 'igic') return 'no_aplica';
  if (cuotaRealDeFactura(f) === null) return 'no_aplica';
  if (typeof f.ivaIgicDeducible === 'number') return f.ivaIgicDeducible;
  return 'por_revisar';
}

/** Euros deducibles en IRPF del gasto — `null` si no hay decisión numérica resuelta (nunca se trata como 0€). */
export function gastoDeducible(f: Pick<FacturaImpuesto, 'tipo' | 'deducibleIrpf' | 'baseImponible'> & { importe: number }): number | null {
  const estado = estadoDeducibleIrpf(f);
  if (typeof estado !== 'number') return null;
  const base = typeof f.baseImponible === 'number' ? f.baseImponible : f.importe;
  return base * estado / 100;
}

/** Euros deducibles del IVA/IGIC soportado — `null` si no hay decisión numérica resuelta. La cuota real nunca se modifica. */
export function cuotaDeducible(
  f: Pick<FacturaImpuesto, 'tipo' | 'tipoImpuesto' | 'importeImpuesto' | 'baseImponible' | 'porcentajeImpuesto' | 'ivaIgicDeducible'>
): number | null {
  const estado = estadoIvaIgicDeducible(f);
  if (typeof estado !== 'number') return null;
  const cuota = cuotaRealDeFactura(f);
  if (cuota === null) return null;
  return cuota * estado / 100;
}

// ── Desglose fiscal por tramos (auditoría 12/09/2026) — ver el archivo del frontend para el razonamiento completo. ──

export type TipoLineaFiscal = 'igic' | 'iva' | 'exento' | 'sin_impuesto';

export type LineaFiscal = {
  id: string;
  tipo: TipoLineaFiscal;
  porcentaje: number;
  baseImponible: number;
  cuota: number;
};

function redondearEuros(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Suma bases y cuotas de todas las líneas — nunca recalcula una cuota a partir de base×porcentaje, usa el importe real de cada línea. */
export function agregarLineasFiscales(lineas: LineaFiscal[]): { baseImponible: number; importeImpuesto: number } {
  return {
    baseImponible: redondearEuros(lineas.reduce((s, l) => s + l.baseImponible, 0)),
    importeImpuesto: redondearEuros(lineas.reduce((s, l) => s + l.cuota, 0)),
  };
}

/**
 * Tipo de impuesto real (a efectos de `FacturaImpuesto.tipoImpuesto`, y por
 * tanto de `clasificarImpuestoFactura`/el agregado trimestral) de un
 * desglose por tramos — bug real detectado 12/09/2026: `lineasFiscales` se
 * guardaba correctamente pero `tipoImpuesto` se quedaba en `''` si nadie
 * tocaba el desplegable a mano, así que la factura aparecía "con impuesto
 * sin identificar" aunque su desglose ya cuadrara. Con líneas de IVA o de
 * IGIC (nunca ambas, ya lo impide `validarLineasFiscales`) devuelve ese
 * tipo; con solo exentas/sin impuesto, el de la primera; sin líneas, `''`.
 */
export function tipoRealDeLineas(lineas: LineaFiscal[]): TipoLineaFiscal | '' {
  if (lineas.length === 0) return '';
  const tiposReales = new Set(lineas.filter((l) => l.tipo === 'iva' || l.tipo === 'igic').map((l) => l.tipo));
  if (tiposReales.size === 1) return [...tiposReales][0] as TipoLineaFiscal;
  if (tiposReales.size > 1) return ''; // mezcla — no debería llegar aquí si ya se validó antes de guardar
  return lineas[0].tipo;
}

export type ValidacionLineasFiscales = { valido: boolean; motivo?: string };

/** Mismo criterio que la versión del frontend: ninguna mezcla de IVA/IGIC en una misma factura, y la suma de bases+cuotas debe coincidir con el total (margen de 1 céntimo). */
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

// ── Detector de facturas con posible desglose fiscal incorrecto (12/09/2026, puerto backend) ──
// Ver el archivo del frontend para el razonamiento completo. Solo lectura, nunca corrige nada.

export type CategoriaProblemaFiscal = 'descuadre_total' | 'datos_fiscales_incompletos' | 'tipo_exento_con_cuota' | 'mezcla_iva_igic';

export type ProblemaFiscalDetectado = {
  categoria: CategoriaProblemaFiscal;
  baseUtilizada: number | null;
  cuotaUtilizada: number | null;
  diferencia: number | null;
  explicacion: string;
};

type FacturaParaDetectar = {
  importe: number;
  baseImponible?: number;
  importeImpuesto?: number;
  tipoImpuesto?: 'igic' | 'iva' | 'exento' | 'sin_impuesto' | '';
  lineasFiscales?: LineaFiscal[];
};

function esLineaFiscalValida(l: LineaFiscal): boolean {
  return (l.tipo === 'iva' || l.tipo === 'igic' || l.tipo === 'exento' || l.tipo === 'sin_impuesto')
    && typeof l.baseImponible === 'number' && Number.isFinite(l.baseImponible)
    && typeof l.cuota === 'number' && Number.isFinite(l.cuota)
    && typeof l.porcentaje === 'number' && Number.isFinite(l.porcentaje);
}

export function detectarProblemaFiscal(f: FacturaParaDetectar): ProblemaFiscalDetectado | null {
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

  const tieneBase = typeof f.baseImponible === 'number';
  const tieneCuota = typeof f.importeImpuesto === 'number';
  if (!tieneBase && !tieneCuota) return null;
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
