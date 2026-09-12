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
};

export type ResumenImpuestosTrimestre = {
  ivaRepercutido: number;
  ivaSoportado: number;
  igicRepercutido: number;
  igicSoportado: number;
  /** Factura con importe de impuesto real pero sin `tipoImpuesto` clasificado (`''`) — nunca asignada a IVA/IGIC por región, queda pendiente de revisión. */
  noIdentificado: { repercutido: number; soportado: number; numFacturas: number };
  /** Factura con `tipoImpuesto` real (`'iva'`/`'igic'`) pero sin dato suficiente para calcular su cuota — NO se cuenta como 0€, distinto de una cuota real de 0. */
  noCalculable: { numFacturas: number };
};

export type ClasificacionImpuesto = 'iva' | 'igic' | 'exento' | 'sin_impuesto' | 'no_identificado';

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

/** Agrega IVA/IGIC repercutido y soportado de un conjunto de facturas (p. ej. las de un trimestre) — mismas reglas que la versión del frontend. */
export function calcularImpuestosPorTipo(facturas: FacturaImpuesto[]): ResumenImpuestosTrimestre {
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
      if (cuota === null || cuota === 0) continue;
      resumen.noIdentificado.numFacturas += 1;
      if (f.tipo === 'ingreso') resumen.noIdentificado.repercutido += cuota; else resumen.noIdentificado.soportado += cuota;
      continue;
    }
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
