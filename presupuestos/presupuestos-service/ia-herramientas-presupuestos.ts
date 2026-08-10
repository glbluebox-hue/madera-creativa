import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { HerramientaIA } from './ia-herramienta.js';
import { PresupuestosService } from './presupuestos-service.js';

/**
 * Herramientas de escritura del copiloto de Presupuestos (Fase 5 — primera
 * prueba real de IA agente). Permiso `'escritura'`: `ServicioCentralIA`
 * nunca las ejecuta por sí solo — quedan en `propuestas`, pendientes de
 * confirmación explícita (`POST /ia/herramientas/ejecutar`). Solo entonces
 * se llama a `ejecutar()`, que escribe en Mongo a través de
 * `PresupuestosService` — la misma capa de servicio que usan las rutas
 * REST normales, nunca Mongo directo.
 *
 * El modelo nunca conoce ids de Mongo: identifica al cliente por nombre
 * ("Juan"), igual que ya hace `abrirCliente` en las herramientas de
 * interfaz — la resolución real ocurre aquí, en el backend.
 */

const svc = PresupuestosService.from();

const esquemaCrearPresupuesto = z.object({
  clienteNombre: z.string().trim().min(1).max(200),
  titulo: z.string().trim().min(1).max(200),
  descripcion: z.string().trim().min(1).max(10000),
  alcance: z.array(z.string().max(300)).max(50).optional().default([]),
  precioTotal: z.number().finite().nonnegative(),
});

export const herramientaCrearPresupuesto: HerramientaIA<z.infer<typeof esquemaCrearPresupuesto>> = {
  nombre: 'crearPresupuesto',
  descripcion:
    'Crea un presupuesto narrativo nuevo para un cliente existente: título, descripción profesional completa, ' +
    'alcance del trabajo (lista de descriptores, sin precio individual) y precio total. No inventes precios, ' +
    'materiales, medidas ni trabajos que el usuario no haya indicado.',
  permiso: 'escritura',
  esquemaParametros: esquemaCrearPresupuesto,
  async ejecutar(params, ctx) {
    const cliente = await svc.buscarClientePorNombre(ctx.usuarioId, params.clienteNombre);
    if (!cliente) return { error: `No se encontró ningún cliente llamado "${params.clienteNombre}".` };

    const ahora = new Date().toISOString();
    const presupuesto = await svc.guardarPresupuesto({
      id: randomUUID(),
      clienteId: cliente.id,
      titulo: params.titulo,
      descripcion: params.descripcion,
      alcance: params.alcance,
      items: [],
      precioTotal: params.precioTotal,
      creado: ahora,
      actualizado: ahora,
    }, ctx.usuarioId);

    return {
      ok: true,
      presupuestoId: presupuesto.id,
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      titulo: params.titulo,
      precioTotal: params.precioTotal,
    };
  },
};

const esquemaAnadirElementoPresupuesto = z.object({
  clienteNombre: z.string().trim().min(1).max(200),
  concepto: z.string().trim().min(1).max(300),
  precio: z.number().finite(),
});

export const herramientaAnadirElementoPresupuesto: HerramientaIA<z.infer<typeof esquemaAnadirElementoPresupuesto>> = {
  nombre: 'anadirElementoPresupuesto',
  descripcion:
    'Añade un elemento con precio propio al presupuesto más reciente de un cliente (p. ej. "cuatro cajones ' +
    'interiores, 480€") y actualiza el precio total sumándolo. No inventes el precio si el usuario no lo ha dado.',
  permiso: 'escritura',
  esquemaParametros: esquemaAnadirElementoPresupuesto,
  async ejecutar(params, ctx) {
    const cliente = await svc.buscarClientePorNombre(ctx.usuarioId, params.clienteNombre);
    if (!cliente) return { error: `No se encontró ningún cliente llamado "${params.clienteNombre}".` };

    const presupuesto = await svc.obtenerPresupuestoMasRecienteDeCliente(ctx.usuarioId, cliente.id);
    if (!presupuesto) return { error: `${cliente.nombre} no tiene ningún presupuesto todavía.` };

    const itemNuevo = { id: randomUUID(), concepto: params.concepto, precio: params.precio };
    const items = [...((presupuesto.items as unknown[]) ?? []), itemNuevo];
    const precioTotalNuevo = ((presupuesto.precioTotal as number) ?? 0) + params.precio;

    const actualizado = await svc.guardarPresupuesto({
      ...presupuesto,
      items,
      precioTotal: precioTotalNuevo,
      actualizado: new Date().toISOString(),
    }, ctx.usuarioId);

    return {
      ok: true,
      presupuestoId: actualizado.id,
      clienteNombre: cliente.nombre,
      itemAnadido: itemNuevo,
      precioTotalNuevo,
    };
  },
};

export const herramientasPresupuestos: HerramientaIA[] = [
  herramientaCrearPresupuesto,
  herramientaAnadirElementoPresupuesto,
];
