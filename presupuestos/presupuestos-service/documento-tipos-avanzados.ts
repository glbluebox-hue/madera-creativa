import { z } from 'zod';
import type { RegistroTipoElemento } from './documento-registro-tipos.js';
import type { ElementoMC } from './documento-modelo.js';

/**
 * Tipos avanzados del Incremento 7 (sección 3.2 de ARQUITECTURA-MOTOR-DOCUMENTAL.md):
 * Tabla, Firma, Código QR, Dibujo, Bloque IA — completan los trece tipos
 * de la arquitectura. Mismo patrón que `documento-tipos-iniciales.ts`:
 * este archivo solo describe los tipos (datos, sin registrar) — el
 * registro real ocurre en `inicializarMotorDocumental()`.
 */

function obtenerRecursoUrl(elemento: ElementoMC) {
  const c = elemento.contenido as { url: string; claveAlmacenamiento?: string };
  return { url: c.url, claveAlmacenamiento: c.claveAlmacenamiento };
}

function establecerRecursoUrl(elemento: ElementoMC, recurso: { url: string; claveAlmacenamiento?: string }): ElementoMC {
  return { ...elemento, contenido: { ...(elemento.contenido as object), url: recurso.url, claveAlmacenamiento: recurso.claveAlmacenamiento } };
}

export const definicionesTiposAvanzados: RegistroTipoElemento[] = [
  {
    tipo: 'tabla',
    descripcion: 'Tabla de filas y columnas (ej. desglose de partidas de un presupuesto).',
    contieneRecurso: false,
    esquemaContenido: z.object({
      filas: z.number().int().positive().default(2),
      columnas: z.number().int().positive().default(2),
      celdas: z.array(z.array(z.string())).default([['', ''], ['', '']]),
      encabezadoFila: z.boolean().default(true),
    }),
    esquemaPropiedadesEspecificas: z.object({}),
    esquemaEstilo: z.object({
      colorBorde: z.string().default('#e5e0d8'),
      anchoBorde: z.number().nonnegative().default(1),
      colorFondoCabecera: z.string().default('#f5ede0'),
      colorTextoCabecera: z.string().default('#18140f'),
      fontSize: z.number().positive().default(13),
    }),
  },
  {
    tipo: 'firma',
    descripcion: 'Área de firma manuscrita (ej. aceptación del presupuesto por el cliente) — almacenada externamente como imagen.',
    contieneRecurso: true,
    esquemaContenido: z.object({
      url: z.string().default(''),
      claveAlmacenamiento: z.string().optional(),
      nombreFirmante: z.string().default(''),
      fecha: z.string().nullable().default(null),
    }),
    esquemaPropiedadesEspecificas: z.object({}),
    esquemaEstilo: z.object({
      colorLinea: z.string().default('#51483f'),
    }),
    obtenerRecurso: obtenerRecursoUrl,
    establecerRecurso: establecerRecursoUrl,
  },
  {
    tipo: 'codigoQR',
    descripcion: 'Código QR generado a partir de un texto o URL — se genera en el navegador, no requiere subir ninguna imagen.',
    contieneRecurso: false,
    esquemaContenido: z.object({
      valor: z.string().default(''),
    }),
    esquemaPropiedadesEspecificas: z.object({}),
    esquemaEstilo: z.object({
      colorPrimario: z.string().default('#18140f'),
      colorFondo: z.string().default('#ffffff'),
    }),
  },
  {
    tipo: 'dibujo',
    descripcion: 'Dibujo/boceto (ej. capturado desde la pizarra de medición) — almacenado como imagen renderizada; la escena original de Excalidraw, si existe, se conserva aparte para poder reabrirla en el editor de dibujo (única excepción del núcleo que conoce el formato de Excalidraw, sección 8 de la arquitectura).',
    contieneRecurso: true,
    esquemaContenido: z.object({
      url: z.string().default(''),
      claveAlmacenamiento: z.string().optional(),
      escenaExcalidraw: z.record(z.string(), z.unknown()).nullable().default(null),
    }),
    esquemaPropiedadesEspecificas: z.object({}),
    esquemaEstilo: z.object({}),
    obtenerRecurso: obtenerRecursoUrl,
    establecerRecurso: establecerRecursoUrl,
  },
  {
    tipo: 'bloqueIA',
    descripcion: 'Bloque de contenido generado por IA a partir de instrucciones — el modelo de datos queda listo desde este incremento; la generación real se conecta en el Incremento 9 (IA sobre comandos del documento).',
    contieneRecurso: false,
    esquemaContenido: z.object({
      instrucciones: z.string().default(''),
      textoGenerado: z.string().default(''),
      estado: z.enum(['vacio', 'generando', 'generado']).default('vacio'),
    }),
    esquemaPropiedadesEspecificas: z.object({}),
    esquemaEstilo: z.object({
      fontFamily: z.string().default('Arial'),
      fontSize: z.number().positive().default(14),
      color: z.string().default('#18140f'),
    }),
  },
];
