import { randomUUID, createHash } from 'node:crypto';
import { almacenamiento } from './almacenamiento.service.js';
import { reclamarEspacioAlmacenamiento, liberarEspacioAlmacenamiento } from './almacenamiento-cuota.js';
import type { PlanAcceso } from './usuario.model.js';
import type { RecursoMC } from './documento-modelo.js';

/**
 * Biblioteca de recursos compartida (Incremento 5, sección 6 de
 * ARQUITECTURA-MOTOR-DOCUMENTAL.md) — `RecursoMC` es solo el catálogo;
 * la subida real sigue pasando por `almacenamiento.service.ts`, sin
 * mecanismo nuevo. La pieza propia de este archivo es la deduplicación
 * por hash: subir el mismo archivo dos veces reutiliza la entrada
 * existente en vez de duplicar almacenamiento.
 */

export function calcularHashContenido(datos: Buffer): string {
  return createHash('sha256').update(datos).digest('hex');
}

export interface RepositorioRecursos {
  /** Busca un recurso ya catalogado con el mismo hash para este usuario — la persistencia real vive en el servicio, este archivo no conoce Mongo. */
  buscarPorHash(usuarioId: string, hash: string): Promise<RecursoMC | null>;
}

export interface OpcionesSubidaRecurso {
  nombre: string;
  tipo: RecursoMC['tipo'];
  mimeType: string;
  ambito: RecursoMC['ambito'];
  etiquetas: string[];
}

/**
 * Sube (o reutiliza) un recurso. Devuelve `nuevo:false` cuando ya existía
 * un `RecursoMC` con el mismo contenido para este usuario — en ese caso no
 * se sube nada a almacenamiento externo, se devuelve la entrada existente
 * tal cual. `nuevo:true` significa que el llamante debe persistir el
 * `RecursoMC` devuelto (este módulo no conoce la base de datos).
 *
 * Cuota de almacenamiento (05/09/2026, `contexto` opcional por compatibilidad
 * con los tests existentes que no la usan): la reserva se hace justo antes
 * de subir, y SOLO cuando de verdad hay una subida nueva — el caso
 * deduplicado (`nuevo:false`) reutiliza un archivo que ya se contó la
 * primera vez, así que no consume cuota una segunda vez. Si la subida
 * falla tras reservar, se libera antes de relanzar el error.
 */
export async function subirORecuperarRecurso(
  datos: Buffer,
  opciones: OpcionesSubidaRecurso,
  usuarioId: string,
  repositorio: RepositorioRecursos,
  contexto?: { plan: PlanAcceso }
): Promise<{ recurso: RecursoMC; nuevo: boolean }> {
  const hash = calcularHashContenido(datos);
  const existente = await repositorio.buscarPorHash(usuarioId, hash);
  if (existente) return { recurso: existente, nuevo: false };

  if (contexto) await reclamarEspacioAlmacenamiento(usuarioId, datos.length, contexto.plan);
  let subido;
  try {
    subido = await almacenamiento.subir(datos, { contentType: opciones.mimeType, carpeta: 'recursos' });
  } catch (err) {
    if (contexto) await liberarEspacioAlmacenamiento(usuarioId, datos.length).catch(() => {});
    throw err;
  }
  const recurso: RecursoMC = {
    id: randomUUID(),
    nombre: opciones.nombre,
    tipo: opciones.tipo,
    url: subido.url,
    claveAlmacenamiento: subido.clave,
    mimeType: opciones.mimeType,
    tamano: datos.length,
    hashContenido: hash,
    ambito: opciones.ambito,
    etiquetas: opciones.etiquetas,
    creadoEn: new Date().toISOString(),
  };
  return { recurso, nuevo: true };
}
