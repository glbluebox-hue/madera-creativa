import type { CapacidadIA } from './ia-capacidad.js';
import { registrarCapacidad } from './ia-registro-capacidades.js';
import { contextoAsistenteGlobal } from './asistente-global.contexto-ia.js';
import { construirSystemPromptAsistenteGlobal } from './asistente-global.prompt-ia.js';
import { herramientasAsistenteGlobal } from './ia-herramientas-asistente-global.js';
import { herramientasPresupuestos } from './ia-herramientas-presupuestos.js';
import { herramientasNotas } from './ia-herramientas-notas.js';

/**
 * Manifiesto de la capacidad `asistente-global` — sustituye al endpoint
 * monolítico `POST /asistente`. Se registra como efecto de importar este
 * módulo (mismo patrón que el auto-registro de modelos Mongoose vía
 * `models.X || model(...)`): quien monte el router de IA (`ia-rutas.ts`)
 * debe importar este archivo antes de atender peticiones.
 *
 * Incluye las herramientas de escritura del copiloto de Presupuestos
 * (Fase 5) — se reutiliza esta misma capacidad en vez de crear una nueva,
 * ya que el objetivo de esta fase es demostrar el patrón agente completo
 * (intención → tool call → confirmación → Mongo → resultado real), no
 * construir el copiloto de Presupuestos como producto aparte.
 */
export const capacidadAsistenteGlobal: CapacidadIA = {
  nombre: 'asistente-global',
  descripcion: 'Asistente conversacional general: responde preguntas sobre clientes/proyectos/facturas, navega por la aplicación y puede crear/modificar presupuestos.',
  promptSistema: construirSystemPromptAsistenteGlobal,
  constructorContexto: contextoAsistenteGlobal,
  herramientas: [...herramientasAsistenteGlobal, ...herramientasPresupuestos, ...herramientasNotas],
  permisosRequeridos: ['interfaz', 'escritura'],
  perfilModelo: 'rapido_economico',
  activa: true,
};

registrarCapacidad(capacidadAsistenteGlobal);
