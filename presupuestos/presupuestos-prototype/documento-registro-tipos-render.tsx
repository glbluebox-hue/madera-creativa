import type { ComponentType } from 'react';
import type { ElementoMC, ComponenteMC } from './documento-modelo.js';

/**
 * Registro de RENDER de tipos de elemento — contraparte en frontend del
 * registro de VALIDACIÓN del backend (`documento-registro-tipos.ts`),
 * mismo patrón (Regla de Oro 6: todo tipo se registra, el núcleo del
 * editor nunca contiene una lista cerrada de tipos). Deliberadamente un
 * registro aparte del de validación: uno resuelve "¿es válido este
 * contenido?" (backend, Zod), el otro resuelve "¿cómo se pinta y cómo se
 * edita esto en pantalla?" (frontend, React) — Regla de Oro 8: el
 * adaptador de render es la única pieza que sabe pintar, `editor-documento.tsx`
 * nunca decide por tipo con un switch propio.
 */

export type RenderElementoProps = {
  elemento: ElementoMC;
  /** true mientras el elemento está en modo edición de contenido (doble clic) — false si solo está seleccionado/movido. */
  editando: boolean;
  onCambiarContenido: (contenido: Record<string, unknown>) => void;
  onSalirEdicion: () => void;
  /** Solo lo usa `instanciaComponente` (Incremento 6) — resuelve un componente de la biblioteca por id, para pintar sus elementos hijos. `undefined` mientras no esté cacheado todavía. */
  resolverComponente?: (componenteId: string) => ComponenteMC | undefined;
};

export type PanelPropiedadesProps = {
  elemento: ElementoMC;
  onCambiarContenido: (contenido: Record<string, unknown>) => void;
  onCambiarEstilo: (estilo: Record<string, unknown>) => void;
  onCambiarPropiedades: (propiedades: Record<string, unknown>) => void;
  /** Solo para tipos con recurso (imagen/logotipo/archivoAdjunto) — sustituye el archivo subiéndolo directamente (embebido en el documento). */
  onSustituirArchivo?: (file: File) => void;
  /** Solo para tipos con recurso — abre el selector de la biblioteca compartida (Incremento 5). */
  onElegirDeBiblioteca?: () => void;
  /** Solo imagen/logotipo — sube el archivo directamente a la biblioteca compartida (con deduplicación), en vez de embeberlo en el documento. */
  onSubirABiblioteca?: (file: File) => void;
  /** Solo bloqueIA (Incremento 9) — genera texto con IA a partir de `instrucciones` y lo aplica con `actualizarContenido`, el mismo comando que usaría un humano. */
  onGenerarConIA?: (instrucciones: string) => void;
  /** Solo bloqueIA — mensaje de la última generación fallida, si la hay (transitorio, no se persiste en el documento). */
  errorGenerarConIA?: string | null;
};

export interface DefinicionTipoRender {
  tipo: string;
  etiqueta: string;
  /** Se muestra como botón en la barra de herramientas — false para tipos que no se insertan a mano (ej. instancia de componente, incrementos futuros). */
  insertableDesdeBarra: boolean;
  tamanoInicial: { ancho: number; alto: number };
  crearContenidoInicial: () => Record<string, unknown>;
  crearEstiloInicial: () => Record<string, unknown>;
  crearPropiedadesIniciales: () => Record<string, unknown>;
  Render: ComponentType<RenderElementoProps>;
  PanelPropiedades: ComponentType<PanelPropiedadesProps>;
  /** true si el doble clic debe entrar en modo edición de contenido (texto) en vez de solo seleccionar. */
  editableEnLienzo: boolean;
}

const registro = new Map<string, DefinicionTipoRender>();

export class ErrorTipoRenderDesconocido extends Error {
  constructor(tipo: string) {
    super(`Tipo de elemento sin adaptador de render registrado: "${tipo}".`);
  }
}

export function registrarTipoRender(definicion: DefinicionTipoRender): void {
  registro.set(definicion.tipo, definicion);
}

export function obtenerTipoRender(tipo: string): DefinicionTipoRender {
  const definicion = registro.get(tipo);
  if (!definicion) throw new ErrorTipoRenderDesconocido(tipo);
  return definicion;
}

export function listarTiposRenderInsertables(): DefinicionTipoRender[] {
  return [...registro.values()].filter((t) => t.insertableDesdeBarra);
}

/**
 * Motor de restricciones (Incremento 10) — `restricciones.obligatorio` no
 * bloquea nada por sí mismo (sección 3.1 de la arquitectura), su efecto
 * real es esta comprobación previa a exportar (`editor-documento.tsx`,
 * `exportarPDF`). Un elemento "incompleto" es uno cuyo `contenido` sigue
 * siendo exactamente el inicial de su tipo — una heurística genérica y
 * válida para cualquier tipo (Regla de Oro 6: este registro no conoce la
 * forma interna de `contenido`, así que no puede saber qué campo concreto
 * rellenar; comparar contra `crearContenidoInicial()` no necesita saberlo).
 */
export function elementoObligatorioIncompleto(elemento: ElementoMC): boolean {
  if (!elemento.restricciones.obligatorio) return false;
  const inicial = obtenerTipoRender(elemento.tipo).crearContenidoInicial();
  return JSON.stringify(elemento.contenido) === JSON.stringify(inicial);
}
