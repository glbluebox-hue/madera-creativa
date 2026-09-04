import type { CapacidadIA } from './ia-capacidad.js';
import type { ConstructorContexto } from './ia-contexto.js';
import { registrarCapacidad } from './ia-registro-capacidades.js';
import { construirSystemPromptCopilotoPresupuesto } from './ia-prompt-copiloto-presupuesto.js';
import { PresupuestosService } from './presupuestos-service.js';

const svc = PresupuestosService.from();

/**
 * Contexto de `copiloto-presupuesto` (IA del Presupuesto, 23/08/2026):
 * cliente (si se indica, igual que `redactar-presupuesto`), más el
 * contenido ya escrito del propio documento y el texto del elemento
 * actualmente seleccionado en el editor — ambos calculados en el frontend
 * (el documento vive en memoria del editor, no siempre está guardado
 * todavía) y enviados como `referencias.contextoDocumento`/`textoSeleccionado`.
 * Solo se usan como contexto de redacción, nunca como origen de datos que la
 * IA pueda "inventar" — el prompt insiste en no mezclar esto con suposiciones.
 */
const contextoCopilotoPresupuesto: ConstructorContexto = {
  async construir(referencias, usuarioId) {
    const clienteId = typeof referencias.clienteId === 'string' ? referencias.clienteId : undefined;
    const cliente = clienteId ? await svc.obtenerCliente(clienteId, usuarioId) : null;
    const contextoDocumento = typeof referencias.contextoDocumento === 'string' ? referencias.contextoDocumento : '';
    const textoSeleccionado = typeof referencias.textoSeleccionado === 'string' ? referencias.textoSeleccionado : '';

    const partes: string[] = [];
    if (cliente) partes.push(`CLIENTE DEL PRESUPUESTO: ${(cliente as any).nombre}`);
    if (contextoDocumento) partes.push(`CONTENIDO YA ESCRITO EN ESTE PRESUPUESTO (no lo repitas ni lo contradigas sin que te lo pidan):\n"""\n${contextoDocumento}\n"""`);
    if (textoSeleccionado) partes.push(`TEXTO ACTUALMENTE SELECCIONADO POR EL USUARIO EN EL EDITOR (si te piden "mejora esto"/"redacta esta partida", se refieren a este texto):\n"""\n${textoSeleccionado}\n"""`);

    return { resumenParaPrompt: partes.join('\n\n'), datosParaHerramientas: {} };
  },
};

/**
 * Manifiesto de la capacidad `copiloto-presupuesto` — "IA del Presupuesto"
 * (23/08/2026), el panel propio del editor (`panel-ia-presupuesto.tsx`),
 * distinto y separado del Asistente IA general (`asistente-global`). Sin
 * herramientas (`herramientas: []`): igual que `generar-bloque-documento`,
 * solo genera texto — nunca escribe en Mongo por su cuenta. El texto
 * propuesto se muestra siempre como propuesta (Aceptar/Editar/Regenerar/
 * Cancelar) antes de aplicarse con `actualizarContenido`, nunca automático.
 *
 * `perfilModelo: 'vision'` desde la Fase 2 — se eligió así, en vez de
 * `'rapido_economico'`, precisamente para que la Fase 3 (IA Visual,
 * 23/08/2026) pudiera empezar a enviar imágenes (`panel-ia-presupuesto.tsx`,
 * `imagenActiva`) sin tener que tocar este manifiesto.
 */
export const capacidadCopilotoPresupuesto: CapacidadIA = {
  nombre: 'copiloto-presupuesto',
  descripcion: 'Copiloto de redacción integrado en el editor de presupuestos — ayuda a redactar, mejorar y organizar el texto del presupuesto actual. No inventa materiales, medidas ni precios.',
  promptSistema: construirSystemPromptCopilotoPresupuesto,
  constructorContexto: contextoCopilotoPresupuesto,
  herramientas: [],
  permisosRequeridos: [],
  perfilModelo: 'vision',
  planMinimo: 'PREMIUM', // Fase 2, 04/09/2026 — Copiloto Visual, Estrategia V3 sección 9.
  activa: true,
};

registrarCapacidad(capacidadCopilotoPresupuesto);
