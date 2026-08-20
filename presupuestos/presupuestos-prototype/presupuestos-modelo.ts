import type { ComponenteMC } from './documento-modelo.js';

/** Un elemento con precio propio dentro de un presupuesto (añadido tras la creación inicial). */
export type ElementoPresupuesto = {
  id: string;
  concepto: string;
  precio: number;
};

/**
 * Presupuesto narrativo (Fase 5 — copiloto de Presupuestos): descripción
 * profesional completa + alcance del trabajo (descriptores sin precio) +
 * items con precio propio + precio total. Se crea y modifica a través del
 * asistente de IA (herramientas `crearPresupuesto`/`anadirElementoPresupuesto`)
 * — esta vista es de solo lectura.
 */
export type PresupuestoMC = {
  id: string;
  clienteId: string;
  /** Proyecto/expediente al que pertenece (incremento "Cliente ≠ Proyecto", 20/08/2026) — vacío si se creó fuera de la ficha de un proyecto. */
  proyectoId?: string;
  titulo: string;
  /**
   * 'simple' (formulario/IA conversacional), 'lienzo' (editor legado sobre
   * Excalidraw — en transición, sin documentos nuevos, ver
   * ARQUITECTURA-MOTOR-DOCUMENTAL.md) o 'documento' (Motor Documental,
   * formato definitivo desde el Incremento 1).
   */
  formato: 'simple' | 'lienzo' | 'documento';
  descripcion: string;
  alcance: string[];
  items: ElementoPresupuesto[];
  /** LEGADO — escena de Excalidraw ({ elements, files }), solo relevante si formato==='lienzo'. */
  contenidoLienzo: Record<string, unknown>;
  /** `DocumentoMC` (ver documento-modelo.ts), solo relevante si formato==='documento'. */
  contenidoDocumento: Record<string, unknown>;
  condicionesPago: string;
  validezDias: number;
  condicionesGenerales: string;
  precioTotal: number;
  creado: string;
  actualizado: string;
  /**
   * Estado de aceptación (Fase 1 — automatización "presupuesto aceptado").
   * Opcional: los presupuestos creados antes de esta fase no lo tienen
   * guardado — tratar como 'borrador' cuando esté ausente, nunca asumir
   * que un valor vacío significa "aceptado".
   */
  estado?: 'borrador' | 'enviado' | 'aceptado' | 'rechazado';
  /** URL de la firma del cliente al aceptar desde el Portal del cliente — vacío si no se aceptó (o se aceptó antes de esta función) desde ahí. */
  firmaClienteUrl?: string;
  /** Fecha ISO de la firma — vacío si no hay firma. */
  firmaClienteFecha?: string;
  /** Hitos de cobro (roadmap "cobros pendientes", 18/08/2026) — generados al aceptar, editables a mano. Ausente en presupuestos creados antes de esta función. */
  cobros?: import('./api.js').Cobro[];
};

/** Vista pública de un presupuesto (Portal del cliente) — lista blanca, ver `obtenerPresupuestoPublico` en el backend. */
export type PresupuestoPublico = {
  titulo: string;
  formato: 'simple' | 'lienzo' | 'documento';
  descripcion: string;
  alcance: string[];
  items: ElementoPresupuesto[];
  contenidoDocumento?: Record<string, unknown>;
  /** Componentes reutilizables (Incremento 6) referenciados por el documento, ya resueltos por el servidor — el Portal no tiene sesión con la que pedirlos por su cuenta. */
  componentesResueltos?: ComponenteMC[];
  condicionesPago: string;
  validezDias: number;
  condicionesGenerales: string;
  precioTotal: number;
  estado: 'borrador' | 'enviado' | 'aceptado' | 'rechazado';
  clienteNombre: string;
  empresa: { nombre: string; eslogan: string; logo: string; telefono: string; email: string };
  expiraEn: string;
  firmaClienteUrl: string;
  firmaClienteFecha: string;
};
