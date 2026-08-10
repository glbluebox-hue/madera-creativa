import type { HerramientaIA, PermisoHerramienta } from './ia-herramienta.js';
import type { ConstructorContexto } from './ia-contexto.js';
import type { PerfilModeloRequerido, ConfiguracionModelo } from './ia-modelo-perfil.js';

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
  activa: boolean;
}
