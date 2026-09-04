import type { CapacidadIA } from './ia-capacidad.js';
import type { ConstructorContexto } from './ia-contexto.js';
import { registrarCapacidad } from './ia-registro-capacidades.js';
import { construirSystemPromptGenerarBloqueDocumento } from './ia-prompt-generar-bloque-documento.js';
import { PresupuestosService } from './presupuestos-service.js';

const svc = PresupuestosService.from();

/**
 * Contexto de `generar-bloque-documento`: solo el nombre del cliente (si se
 * indica en `referencias.clienteId`), igual que `redactar-presupuesto` —
 * esta capacidad es del Motor Documental, no de un tipo de documento
 * concreto, así que no asume nada más allá de esa referencia mínima.
 */
const contextoGenerarBloqueDocumento: ConstructorContexto = {
  async construir(referencias, usuarioId) {
    const clienteId = typeof referencias.clienteId === 'string' ? referencias.clienteId : undefined;
    const cliente = clienteId ? await svc.obtenerCliente(clienteId, usuarioId) : null;
    const resumenParaPrompt = cliente ? `CLIENTE: ${(cliente as any).nombre}` : '';
    return { resumenParaPrompt, datosParaHerramientas: {} };
  },
};

/**
 * Manifiesto de la capacidad `generar-bloque-documento` (Incremento 9 del
 * Motor Documental) — usada por el botón "Generar con IA" del elemento
 * `bloqueIA` (`documento-tipos-avanzados-render.tsx`). Sin herramientas
 * (`herramientas: []`): solo genera texto, nunca escribe en Mongo — el
 * texto resultante se aplica en el frontend con el mismo comando
 * `actualizarContenido` que usaría un humano (Regla de Oro 3).
 */
export const capacidadGenerarBloqueDocumento: CapacidadIA = {
  nombre: 'generar-bloque-documento',
  descripcion: 'Genera el texto de un bloque de un documento (presupuesto, contrato, informe…) a partir de instrucciones libres del usuario — sin acceso de escritura.',
  promptSistema: construirSystemPromptGenerarBloqueDocumento,
  constructorContexto: contextoGenerarBloqueDocumento,
  herramientas: [],
  permisosRequeridos: [],
  perfilModelo: 'rapido_economico',
  // Fase 3, 04/09/2026 — misma categoría que "redactar-presupuesto" (ayuda
  // IA para textos, PRO en V3): el Motor Documental es el editor compartido
  // de presupuestos y contratos, así que se aplica el mismo criterio aquí,
  // no solo al presupuesto en sí.
  planMinimo: 'PRO',
  activa: true,
};

registrarCapacidad(capacidadGenerarBloqueDocumento);
