import { clasificarImpuestoFactura, cuotaRealDeFactura } from './motor-fiscal.js';
import type { CategoriaFiscal } from './categoria-fiscal.js';
import { aplicarSugerenciaCategoriaFiscal } from './categoria-fiscal.js';
import { identificarTipoGasto, type HechoFiscalRequerido } from './identificacion-gasto.js';
import { generarPreguntaFiscal, TEXTO_DATOS_FISCALES_AUSENTES, type PreguntaFiscalPendiente } from './preguntas-fiscales.js';

/**
 * Motor de resolución fiscal automática (Fase 3C.2/3C.3, puerto backend) —
 * mismo contenido y mismas reglas que `presupuestos-prototype/motor-resolucion-fiscal.ts`
 * (patrón de duplicación ya aceptado en este proyecto). Se ejecuta aquí,
 * dentro de `guardarFactura()`, porque desde 3C.3 el backend es el punto
 * autoritativo (sirve a cualquier cliente, tiene `EmpresaModel` para
 * `repepActivo`, y separa completamente la IA del resultado fiscal).
 *
 * Ver el archivo del frontend para el razonamiento jurídico completo de
 * cada regla — aquí solo se repite lo necesario para no duplicar en exceso
 * los comentarios.
 */

type FacturaFiscal = {
  tipo: 'ingreso' | 'gasto';
  categoriaFiscal?: CategoriaFiscal;
  baseImponible?: number;
  importe: number;
  tipoImpuesto?: 'igic' | 'iva' | 'exento' | 'sin_impuesto' | '';
  importeImpuesto?: number;
  porcentajeImpuesto?: number;
  proveedor?: string;
  concepto?: string;
  categoria?: string;
  hechosFiscales?: HechosFiscales;
};

/** Origen de una decisión de deducibilidad (Fase 3C.3). */
export type OrigenDecisionFiscal = 'automatico' | 'usuario';

export type HechosFiscales = {
  vehiculoUsoExclusivo?: boolean;
  dispositivoUsoExclusivo?: boolean;
  gestoriaSoloActividad?: boolean;
};

export type EstadoResolucion = 'resuelto_automatico' | 'pendiente_confirmacion' | 'pendiente_respuesta' | 'revision_manual' | 'no_aplica';
export type Confianza = 'alta' | 'media' | 'insuficiente';
export type FuenteOficial = { organismo: 'AEAT' | 'ATC' | 'BOE'; referencia: string };

export type ResolucionEje = {
  estado: EstadoResolucion;
  porcentaje?: number;
  importe?: number;
  confianza: Confianza;
  explicacion: string;
  reglaId?: string;
  reglaVersion?: string;
  reglaVigenteDesde?: string;
  fuenteOficial?: FuenteOficial;
  preguntaId?: HechoFiscalRequerido;
};

const FECHA_IMPLEMENTACION = '2026-09-12';

type ReglaFiscal = { id: string; version: string; vigenteDesde: string; fuente: FuenteOficial; explicacion: string };

const CATEGORIAS_SIN_RESTRICCION: readonly CategoriaFiscal[] = [
  'materiales', 'herramienta_pequena', 'mantenimiento', 'servicios_profesionales',
  'software', 'publicidad', 'bancos', 'material_oficina',
];

const REGLA_IRPF_SIN_RESTRICCION: ReglaFiscal = {
  id: 'irpf-categorias-sin-restriccion',
  version: '1.0.0',
  vigenteDesde: FECHA_IMPLEMENTACION,
  fuente: { organismo: 'AEAT', referencia: 'Principio de correlación de ingresos y gastos de la actividad económica (art. 28 LIRPF; arts. 22-23 RIRPF)' },
  explicacion: 'Gasto directamente relacionado con tu actividad, deducible en su totalidad.',
};

const REGLA_IVA_SIN_RESTRICCION: ReglaFiscal = {
  id: 'iva-deduccion-general-sin-restriccion',
  version: '1.0.0',
  vigenteDesde: FECHA_IMPLEMENTACION,
  fuente: { organismo: 'AEAT', referencia: 'Ley 37/1992, de 28 de diciembre, del IVA — arts. 92 y 94 (deducción de cuotas soportadas afectas a la actividad)' },
  explicacion: 'El IVA de esta factura es deducible en su totalidad.',
};

const REGLA_IGIC_SIN_RESTRICCION: ReglaFiscal = {
  id: 'igic-deduccion-general-sin-restriccion-sin-repep',
  version: '1.0.0',
  vigenteDesde: FECHA_IMPLEMENTACION,
  fuente: { organismo: 'ATC', referencia: 'Ley 20/1991, de 7 de junio, art. 28.1 (Título II, Deducciones y devoluciones)' },
  explicacion: 'El IGIC de esta factura es deducible en su totalidad.',
};

const REGLA_IRPF_VEHICULO_NO_EXCLUSIVO: ReglaFiscal = {
  id: 'irpf-vehiculo-uso-no-exclusivo',
  version: '1.0.0',
  vigenteDesde: FECHA_IMPLEMENTACION,
  fuente: {
    organismo: 'AEAT',
    referencia: 'art. 22.4 Reglamento del IRPF (RD 439/2007) — un vehículo con uso particular, además del profesional, no se considera afecto a la actividad, salvo las excepciones tasadas del propio artículo, no aplicables a esta actividad',
  },
  explicacion: 'Un vehículo con uso particular, además del profesional, no se considera afecto a tu actividad — no es deducible en IRPF.',
};

const REGLA_IRPF_DISPOSITIVO_NO_EXCLUSIVO: ReglaFiscal = {
  id: 'irpf-dispositivo-uso-no-exclusivo',
  version: '1.0.0',
  vigenteDesde: FECHA_IMPLEMENTACION,
  fuente: {
    organismo: 'AEAT',
    referencia: 'art. 29.2 LIRPF (Ley 35/2006) — no se entienden afectos a la actividad los elementos patrimoniales que se utilicen simultáneamente para la actividad y para necesidades privadas, salvo uso privado accesorio y notoriamente irrelevante',
  },
  explicacion: 'Un dispositivo con uso particular, además del profesional, no se considera afecto a tu actividad — no es deducible en IRPF.',
};

function esCategoriaSinRestriccion(categoriaFiscal: CategoriaFiscal | undefined): boolean {
  return !!categoriaFiscal && (CATEGORIAS_SIN_RESTRICCION as readonly string[]).includes(categoriaFiscal);
}

function importeDeducible(base: number, porcentaje: number): number {
  return base * porcentaje / 100;
}

function resolucionAutomaticaDesdeRegla(porcentaje: number, importe: number, regla: ReglaFiscal): ResolucionEje {
  return {
    estado: 'resuelto_automatico', porcentaje, importe, confianza: 'alta',
    explicacion: regla.explicacion, reglaId: regla.id, reglaVersion: regla.version,
    reglaVigenteDesde: regla.vigenteDesde, fuenteOficial: regla.fuente,
  };
}

function pendienteRespuesta(hechoRequerido: HechoFiscalRequerido): ResolucionEje {
  return {
    estado: 'pendiente_respuesta', confianza: 'insuficiente',
    explicacion: 'Identificamos el tipo de gasto, pero falta un dato que solo tú puedes confirmar.',
    preguntaId: hechoRequerido,
  };
}

const REVISION_FACTURA_MIXTA: ResolucionEje = {
  estado: 'revision_manual', confianza: 'insuficiente',
  explicacion: 'Esta factura mezcla la gestión de tu actividad con tu declaración personal — el reparto exacto requiere el criterio de tu asesor.',
};

export type ContextoHecho = { hechoRequerido?: HechoFiscalRequerido; hechosFiscales?: HechosFiscales };

export function resolverIrpf(
  f: Pick<FacturaFiscal, 'tipo' | 'categoriaFiscal' | 'baseImponible' | 'importe'>,
  contexto?: ContextoHecho
): ResolucionEje {
  if (f.tipo !== 'gasto') {
    return { estado: 'no_aplica', confianza: 'alta', explicacion: 'La deducibilidad en IRPF no aplica a un ingreso.' };
  }
  const base = typeof f.baseImponible === 'number' ? f.baseImponible : f.importe;
  const hechoRequerido = contexto?.hechoRequerido;

  if (hechoRequerido) {
    const hecho = contexto?.hechosFiscales?.[hechoRequerido];
    if (hecho === undefined) return pendienteRespuesta(hechoRequerido);
    if (hecho === true) return resolucionAutomaticaDesdeRegla(100, importeDeducible(base, 100), REGLA_IRPF_SIN_RESTRICCION);
    if (hechoRequerido === 'gestoriaSoloActividad') return REVISION_FACTURA_MIXTA;
    const regla = hechoRequerido === 'vehiculoUsoExclusivo' ? REGLA_IRPF_VEHICULO_NO_EXCLUSIVO : REGLA_IRPF_DISPOSITIVO_NO_EXCLUSIVO;
    return resolucionAutomaticaDesdeRegla(0, 0, regla);
  }

  if (esCategoriaSinRestriccion(f.categoriaFiscal)) {
    return resolucionAutomaticaDesdeRegla(100, importeDeducible(base, 100), REGLA_IRPF_SIN_RESTRICCION);
  }
  return {
    estado: 'revision_manual', confianza: 'insuficiente',
    explicacion: 'Todavía no tenemos una regla automática de IRPF para este tipo de gasto — revísalo tú o con tu asesor.',
  };
}

function resolverEjeIndirecto(
  cuota: number | null,
  categoriaFiscal: CategoriaFiscal | undefined,
  regla: ReglaFiscal,
  repepBloquea: boolean,
  contexto?: ContextoHecho
): ResolucionEje {
  if (repepBloquea) {
    return { estado: 'revision_manual', confianza: 'insuficiente', explicacion: 'Tu empresa está en REPEP — todavía no tenemos una regla confirmada y vigente para esto, requiere revisión.' };
  }
  if (cuota === null) {
    return { estado: 'revision_manual', confianza: 'insuficiente', explicacion: TEXTO_DATOS_FISCALES_AUSENTES };
  }

  const hechoRequerido = contexto?.hechoRequerido;
  if (hechoRequerido) {
    const hecho = contexto?.hechosFiscales?.[hechoRequerido];
    if (hecho === undefined) return pendienteRespuesta(hechoRequerido);
    if (hecho === true) return resolucionAutomaticaDesdeRegla(100, importeDeducible(cuota, 100), regla);
    return {
      estado: 'revision_manual', confianza: 'insuficiente',
      explicacion: 'Ya sabemos que no tiene uso exclusivo, pero no existe un único porcentaje que podamos aplicar con seguridad — requiere el criterio de tu asesor.',
    };
  }

  if (!esCategoriaSinRestriccion(categoriaFiscal)) {
    return { estado: 'revision_manual', confianza: 'insuficiente', explicacion: 'Todavía no tenemos una regla automática para este tipo de gasto — revísalo tú o con tu asesor.' };
  }
  return resolucionAutomaticaDesdeRegla(100, importeDeducible(cuota, 100), regla);
}

export function resolverIndirecto(
  f: Pick<FacturaFiscal, 'tipoImpuesto' | 'importeImpuesto' | 'baseImponible' | 'porcentajeImpuesto' | 'categoriaFiscal'>,
  contexto: { repepActivo: boolean } & ContextoHecho
): { iva: ResolucionEje; igic: ResolucionEje } {
  const clasificacion = clasificarImpuestoFactura(f);
  const cuota = cuotaRealDeFactura(f);

  const NO_APLICA_IVA: ResolucionEje = { estado: 'no_aplica', confianza: 'alta', explicacion: 'Esta factura no es de IVA.' };
  const NO_APLICA_IGIC: ResolucionEje = { estado: 'no_aplica', confianza: 'alta', explicacion: 'Esta factura no es de IGIC.' };

  if (clasificacion === 'exento' || clasificacion === 'sin_impuesto') {
    const explicacion = 'Esta factura no lleva impuesto indirecto (exenta o sin impuesto) — dato real de la propia factura.';
    return { iva: { estado: 'no_aplica', confianza: 'alta', explicacion }, igic: { estado: 'no_aplica', confianza: 'alta', explicacion } };
  }
  if (clasificacion === 'no_identificado') {
    const explicacion = 'Todavía no se ha identificado si esta factura lleva IVA o IGIC.';
    return { iva: { estado: 'revision_manual', confianza: 'insuficiente', explicacion }, igic: { estado: 'revision_manual', confianza: 'insuficiente', explicacion } };
  }
  if (clasificacion === 'iva') {
    return { iva: resolverEjeIndirecto(cuota, f.categoriaFiscal, REGLA_IVA_SIN_RESTRICCION, false, contexto), igic: NO_APLICA_IGIC };
  }
  return { iva: NO_APLICA_IVA, igic: resolverEjeIndirecto(cuota, f.categoriaFiscal, REGLA_IGIC_SIN_RESTRICCION, contexto.repepActivo, contexto) };
}

export function aplicarResolucionAPorcentaje(actual: number | undefined, resolucion: ResolucionEje): number | undefined {
  if (typeof actual === 'number') return actual;
  return resolucion.estado === 'resuelto_automatico' ? resolucion.porcentaje : actual;
}

export type ResultadoResolucionCompleta = {
  categoriaFiscalSugerida?: CategoriaFiscal;
  irpf: ResolucionEje;
  iva: ResolucionEje;
  igic: ResolucionEje;
  preguntasFiscalesPendientes: PreguntaFiscalPendiente[];
};

/** Ver `presupuestos-prototype/motor-resolucion-fiscal.ts` — mismo comportamiento exacto, es el punto de entrada que llama `guardarFactura()`. */
export function resolverTratamientoFiscal(
  f: FacturaFiscal,
  contexto: { repepActivo: boolean }
): ResultadoResolucionCompleta {
  const categoriaValida = f.categoriaFiscal && f.categoriaFiscal !== 'por_clasificar' ? f.categoriaFiscal : undefined;
  const identificacion = identificarTipoGasto(f);
  const categoriaFinal = aplicarSugerenciaCategoriaFiscal(categoriaValida, identificacion.categoriaFiscal) ?? 'por_clasificar';
  const categoriaFiscalSugerida = categoriaFinal !== f.categoriaFiscal ? categoriaFinal : undefined;

  const hechoRequerido =
    categoriaFinal === 'vehiculo'
      ? 'vehiculoUsoExclusivo'
      : categoriaFinal === identificacion.categoriaFiscal
        ? identificacion.hechoRequerido
        : undefined;

  const contextoHecho: ContextoHecho = { hechoRequerido, hechosFiscales: f.hechosFiscales };
  const irpf = resolverIrpf({ ...f, categoriaFiscal: categoriaFinal }, contextoHecho);
  const { iva, igic } = resolverIndirecto({ ...f, categoriaFiscal: categoriaFinal }, { repepActivo: contexto.repepActivo, ...contextoHecho });

  const preguntasFiscalesPendientes: PreguntaFiscalPendiente[] = [];
  for (const [eje, resolucion] of [['irpf', irpf], ['iva', iva], ['igic', igic]] as const) {
    if (resolucion.estado === 'pendiente_respuesta' && resolucion.preguntaId) {
      preguntasFiscalesPendientes.push(generarPreguntaFiscal(resolucion.preguntaId, eje));
    }
  }

  return { categoriaFiscalSugerida, irpf, iva, igic, preguntasFiscalesPendientes };
}
