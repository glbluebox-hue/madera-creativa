import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { HerramientaIA } from './ia-herramienta.js';
import { PresupuestosService } from './presupuestos-service.js';

/**
 * Herramienta de escritura "crear nota" para el asistente global — hueco
 * real encontrado en la auditoría del 12/08/2026: el usuario pedía "apunta
 * esta nota" y no ocurría nada porque esta herramienta no existía. Mismo
 * patrón que `ia-herramientas-presupuestos.ts` (permiso `'escritura'`,
 * pendiente de confirmación explícita antes de escribir en Mongo).
 */

const svc = PresupuestosService.from();

const esquemaCrearNota = z.object({
  // Antes exigía contenido no vacío — pero "crea una nota que se llame
  // prueba uno" (solo título, sin cuerpo) es una petición legítima y
  // común; la IA proponía `contenido: ''` para encajar, y la confirmación
  // fallaba con un 400 que el usuario solo veía como "no se pudo
  // confirmar", sin ninguna pista de por qué. Ahora contenido es opcional
  // — el único caso realmente inválido (ni título ni contenido) se
  // rechaza más abajo, en `ejecutar`, con un mensaje claro.
  contenido: z.string().trim().max(5000).optional().default(''),
  titulo: z.string().trim().max(200).optional().default(''),
  /** Si se indica, se busca el cliente por nombre y la nota queda asociada a él — si no, es una nota suelta. */
  clienteNombre: z.string().trim().max(200).optional(),
  prioridad: z.enum(['alta', 'media', 'baja']).optional().default('media'),
});

export const herramientaCrearNota: HerramientaIA<z.infer<typeof esquemaCrearNota>> = {
  nombre: 'crearNota',
  descripcion:
    'Apunta/guarda una nota nueva con el texto que diga el usuario (p. ej. "apunta que hay que comprar tornillos"). ' +
    'Si el usuario menciona un cliente, la nota queda asociada a él; si no, es una nota suelta. No inventes contenido que el usuario no haya dicho.',
  permiso: 'escritura',
  esquemaParametros: esquemaCrearNota,
  async ejecutar(params, ctx) {
    if (!params.titulo.trim() && !params.contenido.trim()) {
      return { error: 'La nota necesita al menos un título o un contenido — no se ha guardado.' };
    }
    let clienteId = '';
    let clienteNombreResuelto: string | undefined;
    if (params.clienteNombre) {
      const cliente = await svc.buscarClientePorNombre(ctx.usuarioId, params.clienteNombre);
      if (!cliente) return { error: `No se encontró ningún cliente llamado "${params.clienteNombre}" — la nota no se ha guardado.` };
      clienteId = cliente.id as string;
      clienteNombreResuelto = cliente.nombre as string;
    }

    const ahora = new Date().toISOString();
    const nota = await svc.guardarNota({
      id: randomUUID(),
      titulo: params.titulo ?? '',
      contenido: params.contenido,
      prioridad: params.prioridad,
      estado: 'abierta',
      clienteId,
      proyectoId: '',
      etiquetas: [],
      origen: 'texto',
      creado: ahora,
      actualizado: ahora,
    }, ctx.usuarioId);

    return { ok: true, notaId: nota.id, contenido: params.contenido, clienteNombre: clienteNombreResuelto };
  },
};

export const herramientasNotas: HerramientaIA[] = [herramientaCrearNota];
