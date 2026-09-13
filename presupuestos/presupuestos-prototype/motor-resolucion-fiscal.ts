import { clasificarImpuestoFactura, cuotaRealDeFactura } from './motor-fiscal.js';
import type { CategoriaFiscal } from './categoria-fiscal.js';
import { aplicarSugerenciaCategoriaFiscal } from './categoria-fiscal.js';
import { identificarTipoGasto, type HechoFiscalRequerido } from './identificacion-gasto.js';
import { generarPreguntaFiscal, TEXTO_DATOS_FISCALES_AUSENTES, type PreguntaFiscalPendiente } from './preguntas-fiscales.js';
import type { Factura, HechosFiscales } from './types.js';

/**
 * Motor de resolución fiscal automática (Fase 3C.2, ampliado en 3C.3).
 * Resuelve dos ejes SIEMPRE independientes: IRPF (`resolverIrpf`) e
 * IVA/IGIC (`resolverIndirecto`). Ninguno de los dos modifica jamás
 * `tipoImpuesto`, ni convierte IVA en IGIC o viceversa, ni consulta
 * `regionFiscal` — el territorio no decide la naturaleza del impuesto
 * (eso ya lo protege la Fase 2), y aquí tampoco decide su tratamiento
 * salvo `repepActivo`, que solo interviene en el eje IGIC.
 *
 * Principio de no inferencia: si falta un dato necesario para afirmar una
 * resolución con seguridad, el resultado es `revision_manual` (ambigüedad
 * real / no automatizable) o `pendiente_respuesta` (falta un HECHO que solo
 * el usuario conoce) — nunca se inventa, estima, ni se usa un valor por
 * defecto. La cuota real de IVA/IGIC nunca se recalcula aquí: se reutiliza
 * `cuotaRealDeFactura` (Fase 2), tal cual.
 *
 * `resolverTratamientoFiscal` (Fase 3C.3) es el punto de entrada que ata
 * las tres capas — identificación (`identificacion-gasto.ts`), reglas (este
 * archivo) y preguntas (`preguntas-fiscales.ts`) — sin mezclarlas: la
 * identificación nunca decide un porcentaje, las reglas nunca leen
 * proveedor/concepto directamente.
 */

export type EstadoResolucion = 'resuelto_automatico' | 'pendiente_confirmacion' | 'pendiente_respuesta' | 'revision_manual' | 'no_aplica';
export type Confianza = 'alta' | 'media' | 'insuficiente';

export type FuenteOficial = { organismo: 'AEAT' | 'ATC' | 'BOE'; referencia: string };

export type ResolucionEje = {
  estado: EstadoResolucion;
  /** Solo presente si `estado === 'resuelto_automatico'`. */
  porcentaje?: number;
  /** Euros deducibles de este eje — SIEMPRE `base × porcentaje / 100` con datos reales, nunca una cuota recalculada. */
  importe?: number;
  confianza: Confianza;
  /** Explicación en lenguaje llano — lo que vería el usuario. */
  explicacion: string;
  reglaId?: string;
  reglaVersion?: string;
  /** ISO — desde cuándo esta VERSIÓN de la regla se aplica en Madera Creativa Estudio. */
  reglaVigenteDesde?: string;
  fuenteOficial?: FuenteOficial;
  /** Presente cuando `estado === 'pendiente_respuesta'` — qué hecho hace falta confirmar (ver `identificacion-gasto.ts`). */
  preguntaId?: HechoFiscalRequerido;
};

/**
 * Reglas como datos, no lógica dispersa — cada una con su propio
 * identificador, versión, fecha de vigencia y fuente oficial (auditoría
 * Fase 3C.2/3C.3). `vigenteDesde` es la fecha desde la que ESTA versión de
 * la regla se aplica dentro de Madera Creativa Estudio, no la fecha de
 * promulgación de la norma subyacente — el versionado protege futuros
 * cambios de criterio de la app, no reconstruye el historial legislativo.
 */
const FECHA_IMPLEMENTACION = '2026-09-12';

type ReglaFiscal = { id: string; version: string; vigenteDesde: string; fuente: FuenteOficial; explicacion: string };

/**
 * Las 8 categorías sin ningún régimen fiscal alternativo conocido
 * (auditoría Fase 3C.2: quedaron fuera `seguros`, `alquiler`,
 * `suministros_taller` y el resto por tener una excepción real que el
 * motor no puede comprobar hoy). Misma lista para IRPF y para el filtro
 * de IVA/IGIC — es la misma pregunta ("¿esta categoría tiene alguna
 * restricción legal conocida?"), aplicada a cada eje por separado.
 */
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

/**
 * Ley 20/1991, de 7 de junio, de modificación de los aspectos fiscales del
 * Régimen Económico y Fiscal de Canarias — art. 28.1 (Título II,
 * "Deducciones y devoluciones"): reconoce el derecho a deducir, de las
 * cuotas de IGIC devengadas, las soportadas en adquisiciones/importaciones
 * de bienes o servicios utilizados en operaciones sujetas y no exentas.
 * Verificado (11/09/2026) contra fuentes jurídicas — no queda pendiente.
 */
const REGLA_IGIC_SIN_RESTRICCION: ReglaFiscal = {
  id: 'igic-deduccion-general-sin-restriccion-sin-repep',
  version: '1.0.0',
  vigenteDesde: FECHA_IMPLEMENTACION,
  fuente: { organismo: 'ATC', referencia: 'Ley 20/1991, de 7 de junio, art. 28.1 (Título II, Deducciones y devoluciones)' },
  explicacion: 'El IGIC de esta factura es deducible en su totalidad.',
};

/**
 * Fase 3C.3 — un vehículo/dispositivo con uso particular, además del
 * profesional, no se considera afecto a la actividad (doctrina de
 * afectación exclusiva): 0% en IRPF. Se aplica SOLO cuando el usuario ya ha
 * confirmado el hecho ("no, no es de uso exclusivo") — nunca se asume.
 * No se extiende al eje IVA/IGIC: la LIVA sí admite una deducción parcial
 * en determinados supuestos de uso mixto (p. ej. la presunción del 50% del
 * art. 95.Tres LIVA para turismos, o un régimen distinto para vehículos
 * mixtos de transporte de mercancías) y no existe un único porcentaje
 * universal que se pueda aplicar aquí sin inventarlo — ver la explicación
 * de "decisión pendiente de tu confirmación" en el informe de esta fase.
 */
const REGLA_IRPF_VEHICULO_NO_EXCLUSIVO: ReglaFiscal = {
  id: 'irpf-vehiculo-uso-no-exclusivo',
  version: '1.0.0',
  vigenteDesde: FECHA_IMPLEMENTACION,
  fuente: {
    organismo: 'AEAT',
    referencia: 'art. 22.4 Reglamento del IRPF (RD 439/2007) — un vehículo con uso particular, además del profesional, no se considera afecto a la actividad, salvo las excepciones tasadas del propio artículo (transporte de mercancías por cuenta ajena, autoescuelas, agentes o representantes comerciales, vigilancia, etc.), no aplicables a esta actividad',
  },
  explicacion: 'Un vehículo con uso particular, además del profesional, no se considera afecto a tu actividad — no es deducible en IRPF.',
};

/** Ver `REGLA_IRPF_VEHICULO_NO_EXCLUSIVO` — mismo principio de afectación exclusiva, aplicado por la regla general del IRPF (no la específica de vehículos) a cualquier otro elemento patrimonial de uso dual, como un dispositivo electrónico reutilizable. */
const REGLA_IRPF_DISPOSITIVO_NO_EXCLUSIVO: ReglaFiscal = {
  id: 'irpf-dispositivo-uso-no-exclusivo',
  version: '1.0.0',
  vigenteDesde: FECHA_IMPLEMENTACION,
  fuente: {
    organismo: 'AEAT',
    referencia: 'art. 29.2 LIRPF (Ley 35/2006) — no se entienden afectos a la actividad los elementos patrimoniales que se utilicen simultáneamente para la actividad y para necesidades privadas, salvo que el uso privado sea accesorio y notoriamente irrelevante',
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
    estado: 'resuelto_automatico',
    porcentaje,
    importe,
    confianza: 'alta',
    explicacion: regla.explicacion,
    reglaId: regla.id,
    reglaVersion: regla.version,
    reglaVigenteDesde: regla.vigenteDesde,
    fuenteOficial: regla.fuente,
  };
}

function pendienteRespuesta(hechoRequerido: HechoFiscalRequerido): ResolucionEje {
  return {
    estado: 'pendiente_respuesta',
    confianza: 'insuficiente',
    explicacion: 'Identificamos el tipo de gasto, pero falta un dato que solo tú puedes confirmar.',
    preguntaId: hechoRequerido,
  };
}

const REVISION_FACTURA_MIXTA: ResolucionEje = {
  estado: 'revision_manual',
  confianza: 'insuficiente',
  explicacion: 'Esta factura mezcla la gestión de tu actividad con tu declaración personal — el reparto exacto requiere el criterio de tu asesor.',
};

/** Contexto opcional que exige un hecho factual ya identificado por `identificacion-gasto.ts` para ESTA factura, y la respuesta (si el usuario ya la dio). */
export type ContextoHecho = { hechoRequerido?: HechoFiscalRequerido; hechosFiscales?: HechosFiscales };

/**
 * Resuelve el eje IRPF — depende de `categoriaFiscal` (y de `tipo`), nunca
 * de `tipoImpuesto`/`regionFiscal`/`repepActivo`. Un ingreso siempre es
 * `no_aplica`. Cuando la identificación exige un hecho (`contexto.hechoRequerido`)
 * y todavía no se ha respondido, el resultado es `pendiente_respuesta`, no
 * `revision_manual` — ver el flujo completo en `resolverTratamientoFiscal`.
 */
export function resolverIrpf(
  f: Pick<Factura, 'tipo' | 'categoriaFiscal' | 'baseImponible' | 'importe'>,
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
    estado: 'revision_manual',
    confianza: 'insuficiente',
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
    return {
      estado: 'revision_manual',
      confianza: 'insuficiente',
      explicacion: 'Tu empresa está en REPEP — todavía no tenemos una regla confirmada y vigente para esto, requiere revisión.',
    };
  }
  if (cuota === null) {
    return { estado: 'revision_manual', confianza: 'insuficiente', explicacion: TEXTO_DATOS_FISCALES_AUSENTES };
  }

  const hechoRequerido = contexto?.hechoRequerido;
  if (hechoRequerido) {
    const hecho = contexto?.hechosFiscales?.[hechoRequerido];
    if (hecho === undefined) return pendienteRespuesta(hechoRequerido);
    if (hecho === true) return resolucionAutomaticaDesdeRegla(100, importeDeducible(cuota, 100), regla);
    // hecho === false: ni la LIVA presume un único porcentaje universal para uso mixto de
    // vehículos/dispositivos (art. 95.Tres LIVA distingue turismos de vehículos mixtos de
    // mercancías, con presunciones distintas y siempre corregibles con prueba), ni existe
    // un reparto seguro para una gestoría que mezcla actividad y renta personal — inventar
    // un número aquí sería precisamente lo que esta fase prohíbe expresamente.
    return {
      estado: 'revision_manual',
      confianza: 'insuficiente',
      explicacion: 'Ya sabemos que no tiene uso exclusivo, pero no existe un único porcentaje que podamos aplicar con seguridad — requiere el criterio de tu asesor.',
    };
  }

  if (!esCategoriaSinRestriccion(categoriaFiscal)) {
    return {
      estado: 'revision_manual',
      confianza: 'insuficiente',
      explicacion: 'Todavía no tenemos una regla automática para este tipo de gasto — revísalo tú o con tu asesor.',
    };
  }
  return resolucionAutomaticaDesdeRegla(100, importeDeducible(cuota, 100), regla);
}

/**
 * Resuelve los dos ejes de impuesto indirecto — IVA e IGIC son SIEMPRE
 * resultados separados, cada uno con su propia regla y fuente. Solo UNO
 * de los dos puede resolverse por factura (una factura es de IVA o de
 * IGIC, nunca de ambos): el eje que no corresponde al `tipoImpuesto` real
 * de la factura es siempre `no_aplica` — nunca se reclasifica una factura
 * de un impuesto al otro. `regionFiscal` no se consulta en ningún punto;
 * `repepActivo` solo bloquea el eje IGIC (nunca el IVA — una factura con
 * IVA real de Península sigue resolviéndose con normalidad aunque la
 * empresa esté en Canarias con REPEP).
 */
export function resolverIndirecto(
  f: Pick<Factura, 'tipoImpuesto' | 'importeImpuesto' | 'baseImponible' | 'porcentajeImpuesto' | 'categoriaFiscal'>,
  contexto: { repepActivo: boolean } & ContextoHecho
): { iva: ResolucionEje; igic: ResolucionEje } {
  const clasificacion = clasificarImpuestoFactura(f);
  const cuota = cuotaRealDeFactura(f); // nunca recalculada ni estimada — el dato real de la Fase 2, tal cual

  const NO_APLICA_IVA: ResolucionEje = { estado: 'no_aplica', confianza: 'alta', explicacion: 'Esta factura no es de IVA.' };
  const NO_APLICA_IGIC: ResolucionEje = { estado: 'no_aplica', confianza: 'alta', explicacion: 'Esta factura no es de IGIC.' };

  if (clasificacion === 'exento' || clasificacion === 'sin_impuesto') {
    const explicacion = 'Esta factura no lleva impuesto indirecto (exenta o sin impuesto) — dato real de la propia factura.';
    return {
      iva: { estado: 'no_aplica', confianza: 'alta', explicacion },
      igic: { estado: 'no_aplica', confianza: 'alta', explicacion },
    };
  }

  if (clasificacion === 'no_identificado') {
    const explicacion = 'Todavía no se ha identificado si esta factura lleva IVA o IGIC.';
    return {
      iva: { estado: 'revision_manual', confianza: 'insuficiente', explicacion },
      igic: { estado: 'revision_manual', confianza: 'insuficiente', explicacion },
    };
  }

  if (clasificacion === 'iva') {
    return {
      iva: resolverEjeIndirecto(cuota, f.categoriaFiscal, REGLA_IVA_SIN_RESTRICCION, false, contexto),
      igic: NO_APLICA_IGIC,
    };
  }

  // clasificacion === 'igic'
  return {
    iva: NO_APLICA_IVA,
    igic: resolverEjeIndirecto(cuota, f.categoriaFiscal, REGLA_IGIC_SIN_RESTRICCION, contexto.repepActivo, contexto),
  };
}

/**
 * Aplica una resolución automática a un campo de deducibilidad
 * (`deducibleIrpf`/`ivaIgicDeducible`) — mismo criterio que
 * `aplicarSugerenciaCategoriaFiscal` (Fase 3C.1) y `sugerirTipoImpuesto`
 * (Fase 2.1): NUNCA sobrescribe un valor ya presente. Si el usuario ya
 * fijó 0, 50, 100 o cualquier otro porcentaje a mano, esa decisión humana
 * se respeta siempre, sea cual sea el resultado del motor.
 */
export function aplicarResolucionAPorcentaje(actual: number | undefined, resolucion: ResolucionEje): number | undefined {
  if (typeof actual === 'number') return actual;
  return resolucion.estado === 'resuelto_automatico' ? resolucion.porcentaje : actual;
}

// ── Orquestación (Fase 3C.3) ─────────────────────────────────────────────

export type ResultadoResolucionCompleta = {
  /** Sugerencia de `categoriaFiscal` a aplicar con `aplicarSugerenciaCategoriaFiscal` — `undefined` si ya había una categoría fiable y no hace falta sugerir nada. */
  categoriaFiscalSugerida?: CategoriaFiscal;
  irpf: ResolucionEje;
  iva: ResolucionEje;
  igic: ResolucionEje;
  preguntasFiscalesPendientes: PreguntaFiscalPendiente[];
};

/**
 * Punto de entrada único que ata identificación + reglas + preguntas para
 * UNA factura de gasto, sin mezclar las capas entre sí (Fase 3C.3, apartado
 * 2 de la auditoría). No persiste nada — quien llama decide qué guardar
 * (ver `aplicarResolucionAPorcentaje` para los porcentajes, y el propio
 * `categoriaFiscalSugerida` con `aplicarSugerenciaCategoriaFiscal`).
 *
 * El "hecho requerido" de la identificación solo se aplica cuando la
 * categoría vigente de la factura (la ya guardada, o la recién sugerida)
 * coincide con la identificada aquí, o cuando esa categoría es `'vehiculo'`
 * o `'combustible'` — una categoría `vehiculo`/`combustible` elegida de
 * cualquier forma (IA, identificación automática o el propio usuario) exige
 * siempre el hecho de exclusividad, estructuralmente, sin depender de qué
 * texto la sugirió.
 *
 * `'combustible'` reutiliza la MISMA pregunta y la MISMA regla que
 * `'vehiculo'` (auditoría Facturas/Trimestral, 13/09/2026: era la categoría
 * más repetida en revisión manual real de un usuario, sin ninguna regla
 * propia) — el combustible de un vehículo no afecto en exclusiva a la
 * actividad tampoco es deducible (mismo art. 22.4 RIRPF: un gasto asociado
 * a un elemento patrimonial no afecto sigue sin afectar), y si el vehículo
 * SÍ es de uso exclusivo, su combustible lo es igual de plenamente. No es
 * una regla nueva ni un porcentaje inventado, es la consecuencia directa de
 * la misma regla del vehículo aplicada a su gasto asociado.
 */
export function resolverTratamientoFiscal(
  f: Pick<
    Factura,
    | 'tipo' | 'categoriaFiscal' | 'baseImponible' | 'importe' | 'tipoImpuesto'
    | 'importeImpuesto' | 'porcentajeImpuesto' | 'proveedor' | 'concepto' | 'categoria' | 'hechosFiscales'
  >,
  contexto: { repepActivo: boolean }
): ResultadoResolucionCompleta {
  const categoriaValida = f.categoriaFiscal && f.categoriaFiscal !== 'por_clasificar' ? f.categoriaFiscal : undefined;
  const identificacion = identificarTipoGasto(f);
  // `categoriaValida` (no `f.categoriaFiscal`) como "actual": así una categoría todavía en
  // `'por_clasificar'` (un intento anterior sin evidencia suficiente) puede reintentarse con
  // la identificación de hoy — `aplicarSugerenciaCategoriaFiscal` solo protege una categoría
  // YA decidida de verdad, nunca sobrescribe la de esta llamada si `categoriaValida` existe.
  const categoriaFinal = aplicarSugerenciaCategoriaFiscal(categoriaValida, identificacion.categoriaFiscal) ?? 'por_clasificar';
  const categoriaFiscalSugerida = categoriaFinal !== f.categoriaFiscal ? categoriaFinal : undefined;

  const hechoRequerido =
    categoriaFinal === 'vehiculo' || categoriaFinal === 'combustible'
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
