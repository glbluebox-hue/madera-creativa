import { z } from 'zod';
import type { RegistroTipoElemento } from './documento-registro-tipos.js';
import type { ElementoMC } from './documento-modelo.js';

/**
 * Definiciones de los siete tipos de elemento del Incremento 1 del Motor
 * Documental. Este archivo solo describe los tipos — no los registra. El
 * registro real ocurre una única vez, en el bootstrap del servidor, a
 * través de `inicializarMotorDocumental()` (`documento-motor-inicializar.ts`).
 *
 * Deliberadamente NO es una lista cerrada: es exactamente la lista de
 * tipos de HOY — añadir un tipo trece es añadir una entrada más a un
 * array como este (o uno nuevo) y registrarla en el bootstrap, nunca
 * tocar el núcleo (Regla de Oro 6).
 */

const esquemaEstiloTexto = z.object({
  fontFamily: z.string().default('Arial'),
  fontSize: z.number().positive().default(16),
  fontWeight: z.union([z.literal('normal'), z.literal('bold'), z.number()]).default('normal'),
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  textDecoration: z.enum(['none', 'underline', 'line-through']).default('none'),
  color: z.string().default('#18140f'),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).default('left'),
  lineHeight: z.number().positive().default(1.2),
  letterSpacing: z.number().default(0),
});

function obtenerRecursoUrl(elemento: ElementoMC) {
  const c = elemento.contenido as { url: string; claveAlmacenamiento?: string };
  return { url: c.url, claveAlmacenamiento: c.claveAlmacenamiento };
}

function establecerRecursoUrl(elemento: ElementoMC, recurso: { url: string; claveAlmacenamiento?: string }): ElementoMC {
  return { ...elemento, contenido: { ...(elemento.contenido as object), url: recurso.url, claveAlmacenamiento: recurso.claveAlmacenamiento } };
}

export const definicionesTiposIniciales: RegistroTipoElemento[] = [
  {
    tipo: 'texto',
    descripcion: 'Bloque de texto con formato uniforme (fuente, tamaño, negrita/cursiva/subrayado, color, alineación).',
    contieneRecurso: false,
    esquemaContenido: z.object({ texto: z.string() }),
    esquemaPropiedadesEspecificas: z.object({}),
    esquemaEstilo: esquemaEstiloTexto,
  },
  {
    tipo: 'imagen',
    descripcion: 'Imagen subida por el usuario, almacenada externamente.',
    contieneRecurso: true,
    esquemaContenido: z.object({
      url: z.string(),
      claveAlmacenamiento: z.string().optional(),
      recorte: z.object({ x: z.number(), y: z.number(), ancho: z.number(), alto: z.number() }).nullable().default(null),
      /** Referencia a un `RecursoMC` de la biblioteca (Incremento 5) — `null` si la imagen se subió directamente, sin pasar por la biblioteca. */
      recursoId: z.string().nullable().optional().default(null),
    }),
    esquemaPropiedadesEspecificas: z.object({ bordeRadio: z.number().nonnegative().default(0) }),
    esquemaEstilo: z.object({}),
    obtenerRecurso: obtenerRecursoUrl,
    establecerRecurso: establecerRecursoUrl,
  },
  {
    tipo: 'logotipo',
    descripcion: 'Logo de empresa — vinculado (se actualiza solo desde Empresa.logo) o fijo (congelado para este documento).',
    contieneRecurso: true,
    esquemaContenido: z.object({
      modo: z.enum(['vinculado', 'fijo']).default('vinculado'),
      url: z.string(),
      claveAlmacenamiento: z.string().optional(),
      recursoId: z.string().nullable().optional().default(null),
    }),
    esquemaPropiedadesEspecificas: z.object({}),
    esquemaEstilo: z.object({}),
    obtenerRecurso: obtenerRecursoUrl,
    establecerRecurso: establecerRecursoUrl,
  },
  {
    tipo: 'linea',
    descripcion: 'Línea o quiebro de varios puntos (ej. líneas de firma, separadores).',
    contieneRecurso: false,
    esquemaContenido: z.object({ puntos: z.array(z.object({ x: z.number(), y: z.number() })).min(2) }),
    esquemaPropiedadesEspecificas: z.object({}),
    esquemaEstilo: z.object({
      color: z.string().default('#51483f'),
      grosor: z.number().positive().default(1),
      patron: z.enum(['solido', 'discontinuo']).default('solido'),
    }),
  },
  {
    tipo: 'rectangulo',
    descripcion: 'Rectángulo de relleno/trazo — usado como fondo de cajas y filas destacadas.',
    contieneRecurso: false,
    esquemaContenido: z.object({}),
    esquemaPropiedadesEspecificas: z.object({}),
    esquemaEstilo: z.object({
      relleno: z.string().default('transparent'),
      trazoColor: z.string().default('transparent'),
      trazoAncho: z.number().nonnegative().default(0),
      bordeRadio: z.number().nonnegative().default(0),
    }),
  },
  {
    tipo: 'archivoAdjunto',
    descripcion: 'Referencia a un archivo (PDF u otro) adjunto al documento, representado como un chip clicable.',
    contieneRecurso: true,
    esquemaContenido: z.object({
      nombre: z.string(),
      url: z.string(),
      claveAlmacenamiento: z.string().optional(),
      mimeType: z.string(),
      tamano: z.number().nonnegative(),
    }),
    esquemaPropiedadesEspecificas: z.object({}),
    esquemaEstilo: z.object({}),
    obtenerRecurso: obtenerRecursoUrl,
    establecerRecurso: establecerRecursoUrl,
  },
  {
    tipo: 'precioDestacado',
    descripcion: 'Caja de precio total — vinculada (lee el precio real en vivo) o fija (texto congelado).',
    contieneRecurso: false,
    esquemaContenido: z.object({
      modo: z.enum(['vinculado', 'fijo']).default('vinculado'),
      valor: z.string(),
    }),
    esquemaPropiedadesEspecificas: z.object({}),
    esquemaEstilo: z.object({
      colorFondo: z.string().default('#f5ede0'),
      colorTexto: z.string().default('#8a6835'),
    }),
  },
  {
    tipo: 'instanciaComponente',
    descripcion: 'Instancia de un ComponenteMC de la biblioteca (Incremento 6) — no contiene su propia apariencia, se resuelve leyendo el componente referenciado. "Desvincular" la materializa en elementos normales.',
    contieneRecurso: false,
    esquemaContenido: z.object({
      componenteId: z.string().min(1),
      version: z.number().int().nonnegative(),
      overridesLocales: z.record(z.string(), z.unknown()).optional().default({}),
    }),
    esquemaPropiedadesEspecificas: z.object({}),
    esquemaEstilo: z.object({}),
  },
];
