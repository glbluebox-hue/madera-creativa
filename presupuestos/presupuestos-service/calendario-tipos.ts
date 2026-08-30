/**
 * Tipos del Calendario (Fase "Calendario", 30/08/2026) — capa temporal
 * transversal, NO una agenda de citas independiente: agrega, en modo
 * lectura, cualquier entidad ya existente que tenga una fecha relevante
 * (proyecto, tarea, nota, factura, cliente) junto con lo genuinamente
 * nuevo que no vivía en ningún otro sitio (evento/cita, recordatorio
 * puntual). Cada `ElementoCalendario` es una PROYECCIÓN de solo lectura —
 * nunca una copia — de su origen real: `origenId` (+ `proyectoId`/
 * `clienteId` cuando aplica) es lo único que hace falta para volver a él.
 */

/** Tipos de elemento que puede mostrar/filtrar el Calendario. */
export type TipoElementoCalendario =
  | 'nota'
  | 'tarea'
  | 'cliente'
  | 'proyecto'
  | 'factura'
  | 'evento'
  | 'recordatorio';

/**
 * Un elemento agregado en el Calendario para un día concreto. Nunca se
 * persiste tal cual — se calcula al vuelo en cada petición a partir de las
 * colecciones reales (`PresupuestosService.obtenerCalendario`).
 */
export type ElementoCalendario = {
  /** Único dentro de una misma respuesta — compuesto a partir del origen, nunca un id de Mongo propio (no hay documento propio para 'nota'/'tarea'/'cliente'/'proyecto'/'factura'). */
  id: string;
  tipo: TipoElementoCalendario;
  titulo: string;
  /** Texto secundario corto — p. ej. "Vencimiento", "Medición", el nombre del proyecto de una tarea… */
  subtitulo?: string;
  /** Fecha ISO (AAAA-MM-DD) a la que pertenece este elemento. */
  fecha: string;
  /** Hora ISO ("HH:mm"), solo relevante para 'evento'/'recordatorio' — ausente en el resto (siempre de día completo). */
  hora?: string;
  todoElDia: boolean;
  /** Minutos de duración — solo 'evento' puede tenerla; 0/ausente en el resto. */
  duracionMin?: number;
  /** Id del documento de origen real (Proyecto, Nota, Factura, Cliente, o el propio EventoCalendario). */
  origenId: string;
  /** Presente cuando el origen pertenece a (o se puede abrir desde) un proyecto. */
  proyectoId?: string;
  /** Presente cuando el origen pertenece a (o se puede abrir desde) un cliente. */
  clienteId?: string;
  /** Solo relevante para 'tarea' — si el checklist ya la tiene marcada como hecha. */
  hecha?: boolean;
  /** Solo presente en 'evento'/'recordatorio' (fecha de creación del propio EventoCalendario) — se conserva al editar desde el Calendario, para no perder ese metadato en el PUT de reemplazo. */
  creado?: string;
  /** Solo relevante para 'nota' (30/08/2026) — el punto de color de la nota en el Calendario refleja su prioridad, igual que en la propia sección Notas. */
  prioridad?: 'alta' | 'media' | 'baja';
};

/**
 * Entidad propia y pequeña para lo que NO vive en ningún otro sitio de la
 * app: un evento/cita puntual, o un recordatorio puntual con fecha propia
 * (distinto de `Usuario.recordatoriosPersonalizados`, que se repite cada
 * día a una hora fija — esto es una fecha concreta, no una repetición).
 */
export type EventoCalendarioMC = {
  id: string;
  tipo: 'evento' | 'recordatorio';
  titulo: string;
  descripcion: string;
  fecha: string;
  hora: string;
  todoElDia: boolean;
  duracionMin: number;
  clienteId: string;
  proyectoId: string;
  creado: string;
  actualizado: string;
};
