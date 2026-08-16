import { z } from 'zod';

/**
 * Modelo de datos del Motor Documental de Madera Creativa (`DocumentoMC`).
 *
 * Ver `presupuestos/presupuestos-platform/ARQUITECTURA-MOTOR-DOCUMENTAL.md`
 * para el diseño completo — este archivo implementa únicamente la
 * envolvente común (Documento/Página/elemento base), deliberadamente
 * independiente de cualquier tipo de elemento concreto. Los tipos de
 * elemento (Texto, Imagen...) se registran aparte, en
 * `documento-tipos-iniciales.ts`, contra el registro de
 * `documento-registro-tipos.ts` — este archivo no los conoce ni los
 * importa, siguiendo la Regla de Oro 6 (todo elemento debe ser extensible
 * sin tocar el núcleo).
 *
 * Nunca contiene el formato interno de ninguna librería de render (Regla
 * de Oro 1) — la única excepción explícita y aislada es el `contenido` del
 * tipo de elemento "Dibujo" (registrado aparte), que delega en Excalidraw
 * a propósito para reutilizar el editor de dibujo ya existente.
 */

// ── Envolvente común de un elemento ─────────────────────────────────────────────

export const esquemaPosicion = z.object({ x: z.number(), y: z.number() });
export const esquemaTamano = z.object({ ancho: z.number().nonnegative(), alto: z.number().nonnegative() });

/**
 * Referencia a un componente reutilizable (Incremento 6) — se reserva el
 * campo desde el primer día en la envolvente común, aunque no exista
 * todavía ningún `ComponenteMC` real, para no tener que romper el esquema
 * de `ElementoMC` cuando llegue ese incremento.
 */
export const esquemaOrigenComponente = z.object({
  componenteId: z.string().min(1),
  version: z.number().int().nonnegative(),
  modo: z.enum(['vinculado', 'independiente']),
});

/** Restricciones de un elemento (motor de restricciones, Incremento 10) — el campo existe desde ya, su efecto real llega en ese incremento. */
export const esquemaRestriccionesElemento = z.object({
  soloLectura: z.boolean().default(false),
  visibilidad: z.enum(['siempre', 'soloEdicion', 'soloImpresion', 'oculto']).default('siempre'),
  obligatorio: z.boolean().default(false),
});

/**
 * Campos que comparten TODOS los tipos de elemento, sin excepción — nunca
 * incluye nada específico de un tipo concreto (eso vive en `contenido`,
 * `propiedadesEspecificas` y `estilo`, cuya forma exacta decide cada tipo
 * registrado, no este esquema).
 */
export const esquemaElementoBaseMC = z.object({
  id: z.string().min(1),
  tipo: z.string().min(1),
  posicion: esquemaPosicion,
  tamano: esquemaTamano,
  rotacion: z.number().default(0),
  capa: z.number().int().default(0),
  grupoId: z.string().nullable().default(null),
  bloqueado: z.boolean().default(false),
  restricciones: esquemaRestriccionesElemento.default({ soloLectura: false, visibilidad: 'siempre', obligatorio: false }),
  opacidad: z.number().min(0).max(1).default(1),
  origenComponente: esquemaOrigenComponente.nullable().default(null),
  /** Referencia a un `EstiloNombradoMC` de `DocumentoMC.estilosGuardados` (Incremento 3) — su `valores` se aplica primero, y `estilo` (más abajo) actúa como override local encima. `null` = solo estilo embebido, sin estilo con nombre. */
  estiloNombradoId: z.string().nullable().default(null),
  // `contenido`/`propiedadesEspecificas`/`estilo`: sin tipar aquí a propósito
  // — cada tipo registrado valida su propia forma (ver documento-registro-tipos.ts).
  contenido: z.unknown(),
  propiedadesEspecificas: z.record(z.string(), z.unknown()).default({}),
  estilo: z.record(z.string(), z.unknown()).default({}),
});

/** Tipo TypeScript de un elemento ya validado — el envelope común es preciso; `contenido`/`propiedadesEspecificas`/`estilo` quedan como `unknown`/genéricos a este nivel porque su forma real depende del tipo, resuelta en tiempo de ejecución por el registro. */
export type ElementoMC = z.infer<typeof esquemaElementoBaseMC>;

// ── Página ───────────────────────────────────────────────────────────────────

export const esquemaConfiguracionPagina = z.object({
  ancho: z.number().positive(),
  alto: z.number().positive(),
  orientacion: z.enum(['vertical', 'horizontal']).default('vertical'),
  margenes: z.object({ arriba: z.number(), abajo: z.number(), izquierda: z.number(), derecha: z.number() }),
});

export const esquemaFondo = z.object({
  tipo: z.enum(['color', 'imagen', 'ninguno']).default('ninguno'),
  color: z.string().optional(),
  imagenUrl: z.string().optional(),
  ajuste: z.enum(['cubrir', 'contener', 'mosaico']).optional(),
});

/**
 * Zona repetida (encabezado/pie) — sus `elementos` se validan igual que
 * los de una página normal, vía `validarElementoMC` (no aquí, porque
 * requiere el registro, y este archivo no depende de él).
 */
export const esquemaZonaMC = z.object({
  altura: z.number().nonnegative(),
  elementos: z.array(esquemaElementoBaseMC).default([]),
});

export const esquemaNumeracionPagina = z.object({
  mostrar: z.boolean().default(false),
  formato: z.string().default('Página {n} de {total}'),
  posicion: z.enum(['izquierda', 'centro', 'derecha']).default('centro'),
});

export const esquemaPaginaMC = z.object({
  id: z.string().min(1),
  indice: z.number().int().nonnegative(),
  nombre: z.string().default(''),
  configuracion: esquemaConfiguracionPagina.nullable().default(null),
  fondo: esquemaFondo.nullable().default(null),
  encabezado: z.union([esquemaZonaMC, z.literal('ninguno')]).nullable().default(null),
  pie: z.union([esquemaZonaMC, z.literal('ninguno')]).nullable().default(null),
  numeracion: esquemaNumeracionPagina.default({ mostrar: false, formato: 'Página {n} de {total}', posicion: 'centro' }),
  elementos: z.array(esquemaElementoBaseMC).default([]),
});

export type PaginaMC = z.infer<typeof esquemaPaginaMC>;

// ── Documento ────────────────────────────────────────────────────────────────

export const esquemaVariablesDocumento = z.object({
  claves: z.record(z.string(), z.string()).default({}),
});

export const esquemaConfiguracionImpresion = z.object({
  sangrado: z.number().nonnegative().default(0),
  escala: z.number().positive().default(1),
});

export const esquemaPlantillaOrigen = z.object({
  plantillaId: z.string().min(1),
  version: z.number().int().nonnegative(),
});

/**
 * Sistema de estilos (Incremento 3, sección 4 de ARQUITECTURA-MOTOR-DOCUMENTAL.md)
 * — jerarquía de cuatro niveles: estilo embebido (`ElementoMC.estilo`, ya
 * existente) → `EstiloNombradoMC` reutilizable dentro del documento →
 * `TemaMC` (paleta + tipografías) → identidad corporativa (`Empresa.temaPorDefecto`,
 * el tema con el que arranca un documento nuevo si no define uno propio).
 */
export const esquemaTema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1),
  colores: z.object({
    primario: z.string().default('#51483f'),
    secundario: z.string().default('#8a6835'),
    fondo: z.string().default('#ffffff'),
    texto: z.string().default('#18140f'),
    textoClaro: z.string().default('#7a7060'),
  }).default({ primario: '#51483f', secundario: '#8a6835', fondo: '#ffffff', texto: '#18140f', textoClaro: '#7a7060' }),
  tipografias: z.object({
    titulos: z.string().default('Georgia'),
    cuerpo: z.string().default('Arial'),
  }).default({ titulos: 'Georgia', cuerpo: 'Arial' }),
});
export type TemaMC = z.infer<typeof esquemaTema>;

/** Estilo con nombre reutilizable dentro de un documento (ej. "Título de bloque", "Condiciones") — `valores` tiene la misma forma que `ElementoMC.estilo` del tipo al que se aplique. Cambiar `valores` aquí actualiza todos los elementos que lo referencian por `estiloNombradoId`, sin tocarlos uno a uno. */
export const esquemaEstiloNombrado = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1),
  valores: z.record(z.string(), z.unknown()).default({}),
});
export type EstiloNombradoMC = z.infer<typeof esquemaEstiloNombrado>;

export const esquemaDocumentoMC = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(1),
  documentoBaseId: z.string().nullable().default(null),
  etiquetaVersion: z.string().nullable().default(null),
  documentVersion: z.number().int().nonnegative().default(1),
  plantillaOrigen: esquemaPlantillaOrigen.nullable().default(null),
  paginas: z.array(esquemaPaginaMC).default([]),
  configuracionPorDefecto: esquemaConfiguracionPagina,
  fondoPorDefecto: esquemaFondo.default({ tipo: 'ninguno' }),
  encabezadoPorDefecto: z.union([esquemaZonaMC, z.literal('ninguno')]).nullable().default(null),
  piePorDefecto: z.union([esquemaZonaMC, z.literal('ninguno')]).nullable().default(null),
  variables: esquemaVariablesDocumento.default({ claves: {} }),
  configuracionImpresion: esquemaConfiguracionImpresion.default({ sangrado: 0, escala: 1 }),
  /** `null` = usa `Empresa.temaPorDefecto` en vivo; un valor propio aquí anula ese tema solo para este documento. */
  tema: esquemaTema.nullable().default(null),
  estilosGuardados: z.array(esquemaEstiloNombrado).default([]),
});

export type DocumentoMC = z.infer<typeof esquemaDocumentoMC>;

/** Tamaño de página A4 a 96dpi — mismo valor ya usado en el editor legado, se mantiene como referencia visual conocida. */
export const PAGINA_A4 = { ancho: 794, alto: 1123 };

/**
 * Plantilla (Incremento 4, sección 5) — catalogada aparte, no vive dentro
 * de ningún documento concreto (mismo nivel que `RecursoMC`/`ComponenteMC`
 * de incrementos futuros). `documentoBase` es donde viven las variables
 * sin resolver (`{{cliente.nombre}}` literal dentro de `contenido.texto`
 * de sus elementos) — ver `documento-registro-variables.ts`.
 */
export const esquemaPlantilla = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1).max(200),
  ambito: z.enum(['corporativa', 'usuario', 'compartida', 'ia']).default('usuario'),
  documentoBase: esquemaDocumentoMC,
  creadoEn: z.string().min(1),
  actualizadoEn: z.string().min(1),
});
export type PlantillaMC = z.infer<typeof esquemaPlantilla>;

/**
 * Recurso de la biblioteca compartida (Incremento 5, sección 6) —
 * catalogado aparte, igual que `PlantillaMC`. `hashContenido` permite
 * deduplicar: subir el mismo archivo dos veces reutiliza la entrada
 * existente en vez de duplicar almacenamiento (ver
 * `documento-recursos-biblioteca.ts` del backend, que calcula el hash).
 */
export const esquemaRecurso = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1).max(200),
  tipo: z.enum(['logo', 'icono', 'imagen', 'fondo', 'sello', 'otro']).default('otro'),
  url: z.string().min(1),
  claveAlmacenamiento: z.string().min(1),
  mimeType: z.string().min(1),
  tamano: z.number().nonnegative(),
  hashContenido: z.string().min(1),
  ambito: z.enum(['corporativa', 'usuario']).default('usuario'),
  etiquetas: z.array(z.string().max(50)).max(20).default([]),
  creadoEn: z.string().min(1),
});
export type RecursoMC = z.infer<typeof esquemaRecurso>;

/**
 * Componente reutilizable (Incremento 6, sección 3.4) — catalogado aparte,
 * igual que `PlantillaMC`/`RecursoMC`. Se inserta en un documento como un
 * elemento de tipo `instanciaComponente` (nunca copiando `elementos`
 * directamente dentro del documento) — ver `documento-tipos-iniciales.ts`.
 * `elementos` usa el mismo esquema de envolvente que cualquier página,
 * validado por el registro de tipos (no aquí, que no depende de él).
 */
export const esquemaComponente = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1).max(200),
  tipo: z.enum(['cabecera', 'pie', 'firma', 'condiciones', 'bloqueCorporativo', 'libre']).default('libre'),
  elementos: z.array(esquemaElementoBaseMC).default([]),
  ambito: z.enum(['corporativa', 'usuario']).default('usuario'),
  creadoEn: z.string().min(1),
  actualizadoEn: z.string().min(1),
});
export type ComponenteMC = z.infer<typeof esquemaComponente>;
