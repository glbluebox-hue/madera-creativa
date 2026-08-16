import type { DocumentoMC, ElementoMC } from './documento-modelo.js';
import { recorrerElementos } from './documento-comandos.js';

/**
 * Registro de variables inteligentes (Incremento 4) — espejo del backend
 * (`presupuestos-service/documento-registro-variables.ts`); se resuelve en
 * el propio navegador al aplicar una plantilla, usando los datos que la
 * app ya tiene en memoria (cliente/empresa/presupuesto), sin ida y vuelta
 * al servidor.
 */

export type TipoDatoVariable = 'texto' | 'numero' | 'fecha' | 'moneda';

export interface DefinicionVariable {
  clave: string;
  fuente: string;
  etiqueta: string;
  tipoDato: TipoDatoVariable;
  resolver: (contexto: ContextoVariables) => string | undefined;
}

export interface ContextoVariables {
  cliente?: { nombre: string; email?: string; telefono?: string; direccion?: string };
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
    if (!definicion) return coincidencia;
    const valor = definicion.resolver(contexto);
    return valor ?? coincidencia;
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

/** Función pura — nunca muta el documento recibido. Mismo comportamiento que su espejo del backend. */
export function resolverVariables(documento: DocumentoMC, contexto: ContextoVariables): DocumentoMC {
  const copia = structuredClone(documento);
  for (const { elemento, reemplazar } of recorrerElementos(copia)) {
    const nuevoContenido = sustituirEnContenido(elemento.contenido, contexto) as ElementoMC['contenido'];
    if (nuevoContenido !== elemento.contenido) reemplazar({ ...elemento, contenido: nuevoContenido });
  }
  return copia;
}
