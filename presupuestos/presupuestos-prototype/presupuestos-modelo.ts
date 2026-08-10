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
  /** 'simple' (formulario/IA conversacional) o 'lienzo' (editor libre por hojas, Fase 6). */
  formato: 'simple' | 'lienzo';
  descripcion: string;
  alcance: string[];
  items: ElementoPresupuesto[];
  /** Escena de Excalidraw ({ elements, files }) — solo relevante si formato==='lienzo'. */
  contenidoLienzo: Record<string, unknown>;
  condicionesPago: string;
  validezDias: number;
  condicionesGenerales: string;
  precioTotal: number;
  creado: string;
  actualizado: string;
};
