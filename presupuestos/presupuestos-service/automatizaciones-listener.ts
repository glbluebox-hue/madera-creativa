import { busEventos, NOMBRES_EVENTO } from './eventos.service.js';
import type { EventoDominio } from './eventos.service.js';
import { logger } from './logger.service.js';
import { PresupuestosService } from './presupuestos-service.js';
import { actualizarContenidoMC } from './documento-comandos.js';
import type { DocumentoMC } from './documento-modelo.js';

/**
 * Automatización por eventos (Motor Documental, sección 11.2 de
 * ARQUITECTURA-MOTOR-DOCUMENTAL.md) — traduce "ocurrió este evento de
 * negocio" a "ejecuta este comando sobre este documento", fuera del
 * núcleo del motor documental (que nunca sabe qué es un `presupuesto.creado`,
 * Regla de Oro 5). Se suscribe al bus de eventos ya existente
 * (`eventos.service.ts`) — no crea infraestructura nueva.
 *
 * Bootstrap explícito (`inicializarAutomatizaciones()`, llamado una vez
 * desde `presupuestos-service.app-root.ts`), idempotente frente a
 * llamadas repetidas — mismo criterio que `documento-motor-inicializar.ts`
 * tras la corrección del Incremento 1: nada de registro implícito por
 * efecto secundario para infraestructura con efectos reales en el servidor.
 */

let inicializado = false;

export function inicializarAutomatizaciones(): void {
  if (inicializado) return;
  inicializado = true;
  for (const nombre of NOMBRES_EVENTO) {
    busEventos.suscribir(nombre, manejarEvento);
  }
}

async function manejarEvento(evento: EventoDominio): Promise<void> {
  const svc = PresupuestosService.from();
  const automatizaciones = await svc.listarAutomatizacionesActivasPorEvento(evento.usuarioId, evento.nombre);
  for (const automatizacion of automatizaciones) {
    if (!coincideCondicion(automatizacion.condicion as Record<string, unknown>, evento.datos)) continue;
    try {
      await ejecutarAccion(automatizacion, evento, svc);
    } catch (err) {
      // Una automatización que falla no debe tumbar el resto ni al emisor
      // del evento — mismo aislamiento que ya ofrece busEventos.publicar()
      // entre distintos manejadores, aplicado aquí entre distintas
      // automatizaciones del mismo manejador.
      logger.error({ err, automatizacionId: automatizacion.id, evento: evento.nombre }, '[automatizaciones] La acción falló.');
    }
  }
}

/** Igualdad exacta por clave — `{}` (por defecto) coincide con cualquier evento de ese nombre. Exportada para test directo (Vitest), sin pasar por Mongo/el bus. */
export function coincideCondicion(condicion: Record<string, unknown>, datos: Record<string, unknown>): boolean {
  return Object.entries(condicion ?? {}).every(([clave, valor]) => datos[clave] === valor);
}

async function ejecutarAccion(
  automatizacion: Record<string, unknown>,
  evento: EventoDominio,
  svc: PresupuestosService
): Promise<void> {
  const accion = automatizacion.accion as string;
  const configuracion = (automatizacion.configuracionAccion ?? {}) as Record<string, unknown>;

  if (accion === 'notificar') {
    const mensaje = typeof configuracion.mensaje === 'string' ? configuracion.mensaje : '(sin mensaje configurado)';
    logger.info(
      { automatizacionId: automatizacion.id, evento: evento.nombre, entidadId: evento.entidadId, usuarioId: evento.usuarioId },
      `[automatizaciones] ${mensaje}`
    );
    return;
  }

  if (accion === 'modificarElemento') {
    const documentoId = typeof configuracion.documentoId === 'string' ? configuracion.documentoId : null;
    const elementoId = typeof configuracion.elementoId === 'string' ? configuracion.elementoId : null;
    const contenido = configuracion.contenido as Record<string, unknown> | undefined;
    if (!documentoId || !elementoId || !contenido) {
      logger.warn({ automatizacionId: automatizacion.id }, '[automatizaciones] "modificarElemento" mal configurada (falta documentoId/elementoId/contenido) — ignorada.');
      return;
    }
    const presupuesto = await svc.obtenerPresupuesto(documentoId, evento.usuarioId);
    if (!presupuesto || presupuesto.formato !== 'documento') {
      logger.warn({ automatizacionId: automatizacion.id, documentoId }, '[automatizaciones] El documento objetivo no existe o no es del Motor Documental — ignorada.');
      return;
    }
    const actualizado = actualizarContenidoMC(presupuesto.contenidoDocumento as DocumentoMC, elementoId, contenido);
    await svc.guardarPresupuesto({ ...presupuesto, contenidoDocumento: actualizado }, evento.usuarioId);
    return;
  }

  if (accion === 'crearDocumento') {
    // Aceptada en el modelo por completitud con la arquitectura (sección
    // 11.2), pero la propia arquitectura la deja como "ejemplo de uso
    // futuro, no se implementa ahora" — se avisa siempre, nunca falla en
    // silencio, para que quede claro por qué esta automatización no hizo nada.
    logger.warn({ automatizacionId: automatizacion.id }, '[automatizaciones] La acción "crearDocumento" todavía no está implementada — automatización ignorada.');
    return;
  }

  logger.warn({ automatizacionId: automatizacion.id, accion }, '[automatizaciones] Acción desconocida — ignorada.');
}
