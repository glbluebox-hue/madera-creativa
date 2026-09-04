import type { HerramientaIA, PermisoHerramienta } from './ia-herramienta.js';
import type { ConstructorContexto } from './ia-contexto.js';
import type { PerfilModeloRequerido, ConfiguracionModelo } from './ia-modelo-perfil.js';
import type { PlanComercial } from './planes.js';

/**
 * Manifiesto completo de una capacidad de IA (p. ej. `asistente-global`,
 * y en el futuro `copiloto-clientes`, `copiloto-dibujos`, etc.). No
 * reimplementa nada: referencia por instancia las piezas ya construidas en
 * otros archivos (`HerramientaIA[]`, `ConstructorContexto`) — es un punto
 * único donde describir una capacidad de principio a fin, para que añadir
 * una nueva sea "registrar un manifiesto más" sin tocar `ServicioCentralIA`.
 */
export interface CapacidadIA {
  /** Identificador estable, el que manda el frontend en `POST /ia/generar`. */
  nombre: string;
  descripcion: string;
  /** Cadena fija, o función que la construye a partir del contexto ya resuelto (`ConstructorContexto.construir()`). */
  promptSistema: string | ((contexto: { resumenParaPrompt: string; datosParaHerramientas: Record<string, unknown> }) => string);
  constructorContexto: ConstructorContexto;
  herramientas: HerramientaIA[];
  /** Documental: qué niveles de permiso puede llegar a proponer esta capacidad. */
  permisosRequeridos: PermisoHerramienta[];
  perfilModelo: PerfilModeloRequerido;
  /**
   * Allowlist opcional — si se indica, `ia-selector-modelo.ts` exige que la
   * configuración resuelta para `perfilModelo` esté entre estas. Salvaguarda
   * ante un cambio futuro en la tabla global de perfiles que arrastraría
   * silenciosamente a todas las capacidades que usan ese perfil.
   */
  modelosPermitidos?: ConfiguracionModelo[];
  /** Reservado para desempate entre capacidades — sin consumidor mientras exista una sola capacidad registrada. */
  prioridad?: number;
  /**
   * Plan comercial mínimo para poder llamar a esta capacidad (Fase 2,
   * 04/09/2026) — comprobado en `ia-rutas.ts` antes de crear el trabajo
   * (`POST /generar`) o de ejecutar una herramienta pendiente
   * (`POST /herramientas/ejecutar`), nunca dentro de `ServicioCentralIA`
   * (agnóstico a quién llama). `undefined` = sin restricción de plan
   * (disponible desde BASIC) — es el caso de `asistente-global`, que hoy
   * mezcla herramientas de navegación (pensadas para BASIC) con las de
   * escritura de presupuestos/notas (pensadas para PRO): separarlas en dos
   * capacidades es trabajo de una fase posterior, no de esta — mientras
   * tanto se deja sin gate entero, nunca a medias.
   */
  planMinimo?: PlanComercial;
  activa: boolean;
}
