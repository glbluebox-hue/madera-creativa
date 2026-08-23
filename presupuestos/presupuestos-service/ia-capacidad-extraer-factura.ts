import type { CapacidadIA } from './ia-capacidad.js';
import type { ConstructorContexto } from './ia-contexto.js';
import { registrarCapacidad } from './ia-registro-capacidades.js';
import { construirSystemPromptExtraerFactura } from './ia-prompt-extraer-factura.js';
import { PresupuestosService } from './presupuestos-service.js';

const svc = PresupuestosService.from();

/**
 * Contexto de `extraer-datos-factura` (corrección 23/08/2026, auditoría
 * emisor/receptor): antes no cargaba nada de `PresupuestosService` y la IA
 * no tenía ningún dato de la propia empresa para poder distinguirla del
 * cliente/proveedor del documento. Ahora se le pasa el nombre y el CIF/NIF
 * de la empresa del usuario (si los tiene configurados en Ajustes) como
 * referencia — la IA la usa solo para describir mejor el documento, nunca
 * para decidir ella misma quién es quién; esa decisión determinista la toma
 * `resolverEmisorReceptor()` en el frontend, comparando CIF/NIF.
 */
const contextoExtraerFactura: ConstructorContexto = {
  async construir(_referencias, usuarioId) {
    const empresa = await svc.obtenerEmpresa(usuarioId);
    const resumenParaPrompt = empresa.nombre || empresa.nifCif
      ? `La empresa que usa esta app se llama "${empresa.nombre || '(sin nombre configurado)'}"${empresa.nifCif ? ` con CIF/NIF "${empresa.nifCif}"` : ''}. Puede aparecer en el documento como emisor (si es una factura de ingreso/venta) o como receptor (si es una factura de gasto/compra).`
      : '';
    return { resumenParaPrompt, datosParaHerramientas: {} };
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
  promptSistema: construirSystemPromptExtraerFactura,
  constructorContexto: contextoExtraerFactura,
  herramientas: [],
  permisosRequeridos: [],
  perfilModelo: 'vision',
  activa: true,
};

registrarCapacidad(capacidadExtraerFactura);
