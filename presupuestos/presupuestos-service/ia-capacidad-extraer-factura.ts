import type { CapacidadIA } from './ia-capacidad.js';
import type { ConstructorContexto } from './ia-contexto.js';
import { registrarCapacidad } from './ia-registro-capacidades.js';
import { construirSystemPromptExtraerFactura } from './ia-prompt-extraer-factura.js';

/**
 * Sin contexto propio: esta capacidad lee únicamente la imagen adjunta al
 * mensaje del usuario (`MensajeIA.imagenes`), no necesita cargar nada de
 * `PresupuestosService` — a diferencia de `redactar-presupuesto`, que sí
 * consulta el nombre del cliente.
 */
const contextoExtraerFactura: ConstructorContexto = {
  async construir() {
    return { resumenParaPrompt: '', datosParaHerramientas: {} };
  },
};

/**
 * Manifiesto de la capacidad `extraer-datos-factura` (Fase Facturas
 * Profesional) — usada por el paso de revisión del escáner de facturas
 * para proponer proveedor/importe/fecha/impuesto a partir de la imagen del
 * documento. Sin herramientas (`herramientas: []`): nunca escribe en
 * Mongo por su cuenta, solo devuelve el JSON que el frontend muestra en
 * una pantalla de revisión — el usuario confirma antes de guardar nada
 * (regla explícita del encargo: "la IA propone, el usuario confirma").
 */
export const capacidadExtraerFactura: CapacidadIA = {
  nombre: 'extraer-datos-factura',
  descripcion: 'Propone los datos de una factura (proveedor, importe, fecha, impuesto…) a partir de su imagen escaneada — nunca escribe nada, solo propone.',
  promptSistema: construirSystemPromptExtraerFactura(),
  constructorContexto: contextoExtraerFactura,
  herramientas: [],
  permisosRequeridos: [],
  perfilModelo: 'vision',
  activa: true,
};

registrarCapacidad(capacidadExtraerFactura);
