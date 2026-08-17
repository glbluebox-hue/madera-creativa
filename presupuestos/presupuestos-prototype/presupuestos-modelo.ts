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
};
