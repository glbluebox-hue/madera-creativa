import { logger } from './logger.service.js';

/**
 * Bus de eventos internos de dominio — infraestructura genérica, no
 * específica de IA (por eso no lleva el prefijo `ia-`): debe poder
 * importarse desde `presupuestos-service.ts` (capa de negocio pura) sin que
 * esa capa dependa de nada de IA, misma dirección de dependencia que ya
 * existe con `logger.service.ts`. Quien reaccione a un evento (hoy nadie) es
 * responsabilidad exclusiva de quien se suscribe — el emisor nunca sabe ni
 * le importa si hay algo escuchando.
 *
 * Implementación in-process (un `Map` en memoria): no sobrevive a un
 * reinicio ni a un futuro escalado multi-proceso, sin garantía de entrega.
 * Aceptable mientras el despliegue sea un único proceso Node (`app.listen`
 * monolítico, sin clúster) — si se necesita multi-instancia en el futuro, la
 * migración cambia esta implementación interna (p. ej. una cola durable)
 * manteniendo la misma firma `publicar`/`suscribir`, sin tocar a los
 * emisores ni a los consumidores.
 */

/**
 * Eventos conocidos. `presupuesto.creado` se publica desde
 * `PresupuestosService.guardarPresupuesto` (Fase 5). `presupuesto.aprobado`
 * y `tarea.finalizada` siguen reservados: no existe todavía un estado de
 * aprobación de presupuesto ni una entidad "Tarea" propia — nadie los
 * publica hoy. No asumas que ya funcionan solo porque el nombre está en el tipo.
 */
export type NombreEvento =
  | 'cliente.creado'
  | 'cliente.actualizado'
  | 'presupuesto.creado'
  | 'presupuesto.aprobado'
  | 'factura.guardada'
  | 'dibujo.modificado'
  | 'nota.creada'
  | 'tarea.finalizada'
  | 'proveedor.actualizado';

export type EventoDominio<T = Record<string, unknown>> = {
  nombre: NombreEvento;
  usuarioId: string;
  entidadId: string;
  datos: T;
  emitidoEn: string;
};

type ManejadorEvento = (evento: EventoDominio) => void | Promise<void>;

class BusEventos {
  private manejadores = new Map<NombreEvento, ManejadorEvento[]>();

  suscribir(nombre: NombreEvento, manejador: ManejadorEvento): void {
    const lista = this.manejadores.get(nombre) ?? [];
    lista.push(manejador);
    this.manejadores.set(nombre, lista);
  }

  /**
   * Publica un evento de forma fire-and-forget: nunca bloquea ni puede
   * hacer fallar al llamante. Cada manejador se ejecuta de forma aislada —
   * si uno lanza o rechaza, se registra el error y el resto de manejadores
   * (y el flujo que emitió el evento) no se ven afectados.
   */
  publicar(evento: Omit<EventoDominio, 'emitidoEn'>): void {
    const completo: EventoDominio = { ...evento, emitidoEn: new Date().toISOString() };
    const lista = this.manejadores.get(completo.nombre) ?? [];
    for (const manejador of lista) {
      try {
        Promise.resolve(manejador(completo)).catch((err) =>
          logger.error({ err, evento: completo.nombre, usuarioId: completo.usuarioId }, '[eventos] Manejador falló')
        );
      } catch (err) {
        logger.error({ err, evento: completo.nombre, usuarioId: completo.usuarioId }, '[eventos] Manejador falló de forma síncrona');
      }
    }
  }
}

export const busEventos = new BusEventos();
