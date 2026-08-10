import { randomUUID } from 'node:crypto';

/**
 * Registro en memoria de trabajos asíncronos de IA (Fase 5). El proxy de
 * desarrollo que sirve la app corta cualquier petición que tarde más de
 * ~3s (medido empíricamente, no configurable desde este repo — es
 * infraestructura de la plataforma Bit) — muy por debajo de lo que tarda
 * Ollama en hardware sin GPU (29-93s por respuesta real, medido). La
 * solución no es alargar un timeout que no existe en nuestro código: es
 * que ninguna respuesta de IA viaje en una única petición HTTP bloqueante.
 *
 * `POST /ia/generar` (y la confirmación de una propuesta de escritura)
 * responden en milisegundos con un `trabajoId`; el cliente sondea
 * `GET /ia/generar/:trabajoId` hasta que el trabajo termina. Sobrevive a
 * cualquier proxy intermedio (incluido el túnel de producción) sin
 * depender de su comportamiento interno — a diferencia de streaming/SSE,
 * que si el proxy corta por duración total en vez de por inactividad no
 * lo arregla igualmente.
 *
 * En memoria, no en Mongo: es un estado puramente transitorio (minutos),
 * no un dato de negocio que deba sobrevivir a un reinicio del proceso.
 */

export type EstadoTrabajo = 'pendiente' | 'completado' | 'error';

export type TrabajoIA<T = unknown> = {
  id: string;
  usuarioId: string;
  estado: EstadoTrabajo;
  resultado?: T;
  error?: string;
  creado: number;
};

/** Los trabajos se sondean en segundos, nunca en minutos — un TTL de 10 min es generoso para no acumular basura. */
const TTL_MS = 10 * 60 * 1000;

const trabajos = new Map<string, TrabajoIA<any>>();

function podarAntiguos(): void {
  const limite = Date.now() - TTL_MS;
  for (const [id, t] of trabajos) {
    if (t.creado < limite) trabajos.delete(id);
  }
}

/** Crea un trabajo en estado `'pendiente'` y devuelve su id. */
export function crearTrabajo(usuarioId: string): string {
  podarAntiguos();
  const id = randomUUID();
  trabajos.set(id, { id, usuarioId, estado: 'pendiente', creado: Date.now() });
  return id;
}

export function completarTrabajo<T>(id: string, resultado: T): void {
  const t = trabajos.get(id);
  if (t) { t.estado = 'completado'; t.resultado = resultado; }
}

export function fallarTrabajo(id: string, error: string): void {
  const t = trabajos.get(id);
  if (t) { t.estado = 'error'; t.error = error; }
}

/** Devuelve el trabajo solo si pertenece al usuario que pregunta — mismo aislamiento por `usuarioId` que el resto de la app. */
export function obtenerTrabajo(id: string, usuarioId: string): TrabajoIA | undefined {
  const t = trabajos.get(id);
  if (!t || t.usuarioId !== usuarioId) return undefined;
  return t;
}
