import type { CapacidadIA } from './ia-capacidad.js';
import type { ConstructorContexto } from './ia-contexto.js';
import { registrarCapacidad } from './ia-registro-capacidades.js';
import { construirSystemPromptRedactarPresupuesto } from './ia-prompt-redactar-presupuesto.js';
import { PresupuestosService } from './presupuestos-service.js';

const svc = PresupuestosService.from();

/**
 * Contexto de `redactar-presupuesto`: solo el nombre del cliente (si se
 * indica en `referencias.clienteId`), como referencia mínima para que el
 * texto generado pueda mencionarlo si hace falta — nada de cargar el
 * presupuesto ni el historial del cliente, esta capacidad no necesita más.
 */
const contextoRedactarPresupuesto: ConstructorContexto = {
  async construir(referencias, usuarioId) {
    const clienteId = typeof referencias.clienteId === 'string' ? referencias.clienteId : undefined;
    const cliente = clienteId ? await svc.obtenerCliente(clienteId, usuarioId) : null;
    const resumenParaPrompt = cliente ? `CLIENTE: ${(cliente as any).nombre}` : '';
    return { resumenParaPrompt, datosParaHerramientas: {} };
  },
};

/**
 * Manifiesto de la capacidad `redactar-presupuesto` (Fase 6) — usada por el
 * botón "Redactar con IA" del editor de lienzo (`editor-presupuesto-lienzo.tsx`).
 * Sin herramientas (`herramientas: []`): nunca puede proponer una acción,
 * solo generar texto — no hace falta ningún flujo de confirmación para
 * usarla, a diferencia de `asistente-global`.
 */
export const capacidadRedactarPresupuesto: CapacidadIA = {
  nombre: 'redactar-presupuesto',
  descripcion: 'Redacta un párrafo profesional de presupuesto a partir de notas sueltas del usuario — sin acceso de escritura.',
  promptSistema: construirSystemPromptRedactarPresupuesto,
  constructorContexto: contextoRedactarPresupuesto,
  herramientas: [],
  permisosRequeridos: [],
  perfilModelo: 'rapido_economico',
  planMinimo: 'PRO', // Fase 3, 04/09/2026 — "ayuda IA para textos de presupuestos", Estrategia V3.
  activa: true,
};

registrarCapacidad(capacidadRedactarPresupuesto);
