/**
 * Modelo del Calendario (30/08/2026) — capa temporal transversal, NO una
 * agenda de citas independiente: agrega, en modo lectura, cualquier
 * entidad ya existente con fecha relevante (proyecto, tarea, nota,
 * factura, cliente) junto con lo genuinamente nuevo que no vivía en
 * ningún otro sitio (evento/cita, recordatorio puntual). Espejo exacto
 * del backend (`calendario-tipos.ts`) — nunca se copia ningún dato aquí,
 * solo se agrega en caliente en cada petición.
 */

export type TipoElementoCalendario =
  | 'nota' | 'tarea' | 'cliente' | 'proyecto' | 'factura' | 'evento' | 'recordatorio';

/** Un elemento agregado del Calendario para un día concreto — solo lectura, ver comentario del archivo. */
export type ElementoCalendario = {
  id: string;
  tipo: TipoElementoCalendario;
  titulo: string;
  subtitulo?: string;
  /** Fecha ISO (AAAA-MM-DD). */
  fecha: string;
  /** Hora ISO ("HH:mm") — solo 'evento'/'recordatorio'. */
  hora?: string;
  todoElDia: boolean;
  duracionMin?: number;
  origenId: string;
  proyectoId?: string;
  clienteId?: string;
  hecha?: boolean;
  /** Solo presente en 'evento'/'recordatorio' — se conserva al editar desde el Calendario. */
  creado?: string;
};

/** Evento/recordatorio puntual — el único tipo con colección propia (ver `evento-calendario.model.ts` en el backend). */
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

export type VistaCalendario = 'mes' | 'semana' | 'dia';

/** Config visual por tipo — icono, etiqueta y color, en un único sitio para no repetirlo en cada componente. */
export const CONFIG_TIPO_CALENDARIO: Record<TipoElementoCalendario, { etiqueta: string; etiquetaFiltro: string; color: string }> = {
  nota: { etiqueta: 'Nota', etiquetaFiltro: 'Notas', color: 'var(--ocre)' },
  tarea: { etiqueta: 'Tarea', etiquetaFiltro: 'Tareas', color: 'var(--topo)' },
  cliente: { etiqueta: 'Cliente', etiquetaFiltro: 'Clientes', color: '#4d7a4a' },
  proyecto: { etiqueta: 'Proyecto', etiquetaFiltro: 'Proyectos', color: '#2f6f8f' },
  factura: { etiqueta: 'Factura', etiquetaFiltro: 'Facturas', color: '#b3492f' },
  evento: { etiqueta: 'Evento', etiquetaFiltro: 'Eventos', color: '#7a4f9e' },
  recordatorio: { etiqueta: 'Recordatorio', etiquetaFiltro: 'Recordatorios', color: '#b38f2f' },
};

export const TIPOS_CALENDARIO: TipoElementoCalendario[] = ['nota', 'tarea', 'cliente', 'proyecto', 'factura', 'evento', 'recordatorio'];

/** Formatea una `Date` local como AAAA-MM-DD — nunca `toISOString()` (eso da la fecha en UTC, que puede ser el día de al lado según la zona horaria). */
export function aFechaISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parsea "AAAA-MM-DD" a una `Date` local a medianoche — nunca `new Date(iso)` a secas (lo interpreta como UTC y puede desplazar el día). */
export function desdeFechaISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function hoyISO(): string {
  return aFechaISO(new Date());
}

/** Primer día (lunes) de la semana que contiene `fecha`. */
export function inicioSemana(fecha: Date): Date {
  const d = new Date(fecha);
  const diaSemana = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - diaSemana);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Rango [desde, hasta] (ambos ISO, inclusive) que hay que pedir al backend para poder pintar la vista dada en `fecha`. La vista mensual pide también los días de relleno de la semana anterior/siguiente, para que esos días (ya visibles en la rejilla) no aparezcan vacíos por no haberlos pedido. */
export function rangoParaVista(vista: VistaCalendario, fecha: Date): { desde: string; hasta: string } {
  if (vista === 'dia') {
    const iso = aFechaISO(fecha);
    return { desde: iso, hasta: iso };
  }
  if (vista === 'semana') {
    const inicio = inicioSemana(fecha);
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 6);
    return { desde: aFechaISO(inicio), hasta: aFechaISO(fin) };
  }
  // Mes: desde el lunes de la semana del día 1, hasta el domingo de la semana del último día.
  const primerDiaMes = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
  const ultimoDiaMes = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0);
  const desde = inicioSemana(primerDiaMes);
  const hasta = new Date(inicioSemana(ultimoDiaMes));
  hasta.setDate(hasta.getDate() + 6);
  return { desde: aFechaISO(desde), hasta: aFechaISO(hasta) };
}

/** Agrupa una lista de elementos por su `fecha` (clave AAAA-MM-DD), preservando el orden ya recibido dentro de cada día. */
export function agruparPorFecha(elementos: readonly ElementoCalendario[]): Map<string, ElementoCalendario[]> {
  const mapa = new Map<string, ElementoCalendario[]>();
  for (const el of elementos) {
    const lista = mapa.get(el.fecha);
    if (lista) lista.push(el);
    else mapa.set(el.fecha, [el]);
  }
  return mapa;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_SEMANA_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function nombreMes(fecha: Date): string {
  const m = MESES[fecha.getMonth()];
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export function etiquetaCabecera(vista: VistaCalendario, fecha: Date): string {
  if (vista === 'dia') return `${fecha.getDate()} de ${MESES[fecha.getMonth()]} de ${fecha.getFullYear()}`;
  if (vista === 'semana') {
    const inicio = inicioSemana(fecha);
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 6);
    const mismoMes = inicio.getMonth() === fin.getMonth();
    return mismoMes
      ? `${inicio.getDate()}–${fin.getDate()} de ${MESES[inicio.getMonth()]} de ${inicio.getFullYear()}`
      : `${inicio.getDate()} de ${MESES[inicio.getMonth()]} – ${fin.getDate()} de ${MESES[fin.getMonth()]} de ${fin.getFullYear()}`;
  }
  return `${nombreMes(fecha)} de ${fecha.getFullYear()}`;
}

export { DIAS_SEMANA_CORTOS };

/** Desplaza `fecha` una unidad de `vista` hacia delante (o hacia atrás, con `paso: -1`). */
export function desplazar(vista: VistaCalendario, fecha: Date, paso: 1 | -1): Date {
  const d = new Date(fecha);
  if (vista === 'dia') d.setDate(d.getDate() + paso);
  else if (vista === 'semana') d.setDate(d.getDate() + 7 * paso);
  else d.setMonth(d.getMonth() + paso);
  return d;
}
