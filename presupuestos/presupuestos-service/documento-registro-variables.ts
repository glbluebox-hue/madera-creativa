import type { DocumentoMC, ElementoMC } from './documento-modelo.js';
import { recorrerElementosMC } from './documento-registro-tipos.js';

/**
 * Registro de variables inteligentes (Incremento 4, sección 1.2 de
 * ARQUITECTURA-MOTOR-DOCUMENTAL.md) — mismo patrón que el registro de
 * tipos de elemento (Regla de Oro 6): cada "fuente" de datos (cliente,
 * empresa, presupuesto, sistema...) registra qué variables ofrece, sin
 * que este archivo conozca de antemano la lista cerrada.
 */

export type TipoDatoVariable = 'texto' | 'numero' | 'fecha' | 'moneda';

export interface DefinicionVariable {
  /** Identificador punteado, ej. `cliente.nombre`. Único en todo el registro. */
  clave: string;
  fuente: string;
  etiqueta: string;
  tipoDato: TipoDatoVariable;
  /** Dado el contexto real, devuelve el valor ya formateado como texto — o `undefined` si esa fuente no aplica a este contexto (ej. `presupuesto.total` sin un presupuesto en el contexto). */
  resolver: (contexto: ContextoVariables) => string | undefined;
}

/** Datos reales disponibles al resolver una plantilla — cada fuente registrada solo mira la parte del contexto que le corresponde. */
export interface ContextoVariables {
  cliente?: { nombre: string; email?: string; telefono?: string; direccion?: string; dni?: string };
  empresa?: { nombre: string; telefono?: string; email?: string; iban?: string };
  presupuesto?: { titulo: string; precioTotal: number };
  fecha?: Date;
}

const registro = new Map<string, DefinicionVariable>();

export function registrarVariable(definicion: DefinicionVariable): void {
  registro.set(definicion.clave, definicion);
}

export function listarVariables(): DefinicionVariable[] {
  return [...registro.values()];
}

const PATRON_VARIABLE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function sustituirEnTexto(texto: string, contexto: ContextoVariables): string {
  return texto.replace(PATRON_VARIABLE, (coincidencia, clave: string) => {
    const definicion = registro.get(clave);
    if (!definicion) return coincidencia; // clave desconocida: se deja tal cual, no se rompe el documento
    const valor = definicion.resolver(contexto);
    return valor ?? coincidencia; // fuente no aplicable en este contexto: se deja tal cual
  });
}

function sustituirEnContenido(contenido: unknown, contexto: ContextoVariables): unknown {
  if (typeof contenido === 'string') return sustituirEnTexto(contenido, contexto);
  if (Array.isArray(contenido)) return contenido.map((v) => sustituirEnContenido(v, contexto));
  if (contenido && typeof contenido === 'object') {
    return Object.fromEntries(Object.entries(contenido).map(([k, v]) => [k, sustituirEnContenido(v, contexto)]));
  }
  return contenido;
}

/**
 * Sustituye toda ocurrencia de `{{clave}}` en el `contenido` de cada
 * elemento del documento por su valor real, usando el `resolver`
 * registrado de la fuente correspondiente — función pura, nunca muta el
 * documento recibido. Claves desconocidas o sin dato disponible en este
 * contexto se dejan tal cual (nunca se rompe el documento por una
 * variable que no se puede resolver todavía).
 */
export function resolverVariables(documento: DocumentoMC, contexto: ContextoVariables): DocumentoMC {
  const copia = structuredClone(documento);
  for (const { elemento, reemplazar } of recorrerElementosMC(copia)) {
    const nuevoContenido = sustituirEnContenido(elemento.contenido, contexto) as ElementoMC['contenido'];
    if (nuevoContenido !== elemento.contenido) reemplazar({ ...elemento, contenido: nuevoContenido });
  }
  return copia;
}
