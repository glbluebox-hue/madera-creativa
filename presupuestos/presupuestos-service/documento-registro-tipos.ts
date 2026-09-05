import type { z } from 'zod';
import { esquemaElementoBaseMC, esquemaPaginaMC, esquemaDocumentoMC, type ElementoMC, type DocumentoMC } from './documento-modelo.js';

/**
 * Registro central de tipos de elemento del Motor Documental — mismo
 * patrón que `ia-registro-capacidades.ts`/`ia-registro-proveedores.ts`:
 * poblado por importación explícita al arrancar (`documento-tipos-iniciales.ts`),
 * nunca por auto-discovery. Es la pieza que hace real la Regla de Oro 6
 * ("todo elemento debe ser extensible sin tocar el núcleo") — este archivo
 * no conoce ni conocerá nunca la lista de tipos que existen, solo sabe
 * consultarla.
 *
 * Recurso gráfico (Regla de Oro 7 / procesado de imágenes, Incremento 1):
 * un tipo que puede contener un recurso subido por el usuario (Imagen,
 * Logotipo, y cualquier tipo futuro que lo necesite) declara
 * `contieneRecurso: true` y aporta `obtenerRecurso`/`establecerRecurso` —
 * así `documento-procesar-recursos.ts` puede subir imágenes Base64 sin
 * conocer la forma interna de ningún tipo concreto.
 */

/** Referencia mínima a un recurso gráfico dentro de un elemento — común a cualquier tipo que declare `contieneRecurso`. */
export interface RecursoDeElemento {
  url: string;
  claveAlmacenamiento?: string;
  /** Tamaño en bytes del recurso en almacenamiento externo (cuota de almacenamiento, 05/09/2026) — `undefined` en elementos guardados antes de esta función. */
  tamano?: number;
}

export interface RegistroTipoElemento {
  tipo: string;
  descripcion: string;
  /** Si `true`, `documento-procesar-recursos.ts` inspecciona este tipo al guardar — debe aportar `obtenerRecurso`/`establecerRecurso`. */
  contieneRecurso: boolean;
  esquemaContenido: z.ZodType;
  esquemaPropiedadesEspecificas: z.ZodType;
  esquemaEstilo: z.ZodType;
  /** Solo obligatorio si `contieneRecurso === true`. Lee la referencia al recurso desde `elemento.contenido`, sin que el llamante conozca su forma. */
  obtenerRecurso?: (elemento: ElementoMC) => RecursoDeElemento | null;
  /** Devuelve una copia del elemento con el recurso reemplazado (tras subirlo a almacenamiento externo). */
  establecerRecurso?: (elemento: ElementoMC, recurso: Required<RecursoDeElemento>) => ElementoMC;
}

const registro = new Map<string, RegistroTipoElemento>();

/** Se lanza al validar un elemento cuyo `tipo` no está registrado (o al pedirlo explícitamente). */
export class ErrorTipoElementoDesconocido extends Error {
  constructor(tipo: string) {
    super(`Tipo de elemento del Motor Documental desconocido: "${tipo}".`);
  }
}

export function registrarTipoElemento(definicion: RegistroTipoElemento): void {
  if (definicion.contieneRecurso && (!definicion.obtenerRecurso || !definicion.establecerRecurso)) {
    throw new Error(`El tipo "${definicion.tipo}" declara contieneRecurso pero no aporta obtenerRecurso/establecerRecurso.`);
  }
  registro.set(definicion.tipo, definicion);
}

export function obtenerTipoElemento(tipo: string): RegistroTipoElemento {
  const definicion = registro.get(tipo);
  if (!definicion) throw new ErrorTipoElementoDesconocido(tipo);
  return definicion;
}

export function listarTiposElemento(): RegistroTipoElemento[] {
  return [...registro.values()];
}

/**
 * Valida un elemento completo: primero la envolvente común (posición,
 * tamaño, capa...), después delega `contenido`/`propiedadesEspecificas`/`estilo`
 * en el esquema que haya aportado su tipo registrado. Es la razón por la
 * que `ElementoMC` no es una única unión discriminada estática de Zod: los
 * tipos se registran en tiempo de ejecución, una unión estática obligaría
 * a conocerlos todos de antemano en este archivo — justo lo que la Regla
 * de Oro 6 prohíbe.
 */
export function validarElementoMC(valor: unknown): ElementoMC {
  const base = esquemaElementoBaseMC.parse(valor);
  const definicion = obtenerTipoElemento(base.tipo);
  return {
    ...base,
    contenido: definicion.esquemaContenido.parse(base.contenido),
    // Cada tipo registra su propiedadesEspecificas/estilo como z.object({...}) — el
    // resultado siempre es un objeto plano, pero `esquemaPropiedadesEspecificas`/
    // `esquemaEstilo` son `z.ZodType` genéricos (Regla de Oro 6: el registro no conoce
    // la forma concreta de ningún tipo), así que TypeScript solo puede ver `unknown`.
    propiedadesEspecificas: definicion.esquemaPropiedadesEspecificas.parse(base.propiedadesEspecificas) as Record<string, unknown>,
    estilo: definicion.esquemaEstilo.parse(base.estilo) as Record<string, unknown>,
  };
}

/** Valida una página completa, incluidos los elementos de sus zonas de encabezado/pie si las tiene. */
export function validarPaginaMC(valor: unknown): ReturnType<typeof esquemaPaginaMC.parse> {
  const pagina = esquemaPaginaMC.parse(valor);
  const elementos = pagina.elementos.map(validarElementoMC);
  const encabezado = pagina.encabezado && pagina.encabezado !== 'ninguno'
    ? { ...pagina.encabezado, elementos: pagina.encabezado.elementos.map(validarElementoMC) }
    : pagina.encabezado;
  const pie = pagina.pie && pagina.pie !== 'ninguno'
    ? { ...pagina.pie, elementos: pagina.pie.elementos.map(validarElementoMC) }
    : pagina.pie;
  return { ...pagina, elementos, encabezado, pie };
}

/** Valida un `DocumentoMC` completo — punto de entrada único para el backend antes de guardar cualquier documento nuevo. */
export function validarDocumentoMC(valor: unknown): DocumentoMC {
  const documento = esquemaDocumentoMC.parse(valor);
  const paginas = documento.paginas.map(validarPaginaMC);
  const encabezadoPorDefecto = documento.encabezadoPorDefecto && documento.encabezadoPorDefecto !== 'ninguno'
    ? { ...documento.encabezadoPorDefecto, elementos: documento.encabezadoPorDefecto.elementos.map(validarElementoMC) }
    : documento.encabezadoPorDefecto;
  const piePorDefecto = documento.piePorDefecto && documento.piePorDefecto !== 'ninguno'
    ? { ...documento.piePorDefecto, elementos: documento.piePorDefecto.elementos.map(validarElementoMC) }
    : documento.piePorDefecto;
  return { ...documento, paginas, encabezadoPorDefecto, piePorDefecto };
}

/** Recorre todos los elementos de un documento (páginas + sus zonas + encabezado/pie por defecto) — base compartida por el procesado de recursos y cualquier futura operación que necesite "todos los elementos, estén donde estén". */
export function* recorrerElementosMC(documento: DocumentoMC): Generator<{ elemento: ElementoMC; reemplazar: (nuevo: ElementoMC) => void }> {
  function* zona(z: { elementos: ElementoMC[] } | 'ninguno' | null) {
    if (!z || z === 'ninguno') return;
    for (let i = 0; i < z.elementos.length; i++) {
      const idx = i;
      yield { elemento: z.elementos[idx], reemplazar: (nuevo: ElementoMC) => { z.elementos[idx] = nuevo; } };
    }
  }
  yield* zona(documento.encabezadoPorDefecto as any);
  yield* zona(documento.piePorDefecto as any);
  for (const pagina of documento.paginas as any[]) {
    yield* zona(pagina.encabezado);
    yield* zona(pagina.pie);
    for (let i = 0; i < pagina.elementos.length; i++) {
      const idx = i;
      yield { elemento: pagina.elementos[idx], reemplazar: (nuevo: ElementoMC) => { pagina.elementos[idx] = nuevo; } };
    }
  }
}
