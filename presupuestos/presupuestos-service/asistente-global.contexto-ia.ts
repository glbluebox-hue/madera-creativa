import { PresupuestosService } from './presupuestos-service.js';
import type { ConstructorContexto } from './ia-contexto.js';

const svc = PresupuestosService.from();

/**
 * Contexto acotado del asistente global — sustituye la carga de hasta 1000
 * clientes + 1000 facturas del `/asistente` original por:
 * - resumen ligero de todos los clientes (`svc.listarClientesResumen`, ya
 *   excluye campos pesados);
 * - ingresos/gastos del mes actual, calculados sobre las facturas del AÑO en
 *   curso (`svc.listarFacturasPorAnio`, acotado por diseño — mismo criterio
 *   que ya usa `Trimestres` en el frontend), no sobre el histórico completo;
 * - la ficha del cliente actualmente abierto, si lo hay (`referencias.clienteAbierto`),
 *   en vez de mandar el detalle de todos los clientes por delante.
 */
export const contextoAsistenteGlobal: ConstructorContexto = {
  async construir(referencias, usuarioId) {
    const hoy = new Date().toISOString().slice(0, 10);
    const mesActual = hoy.slice(0, 7);
    const anioActual = Number(hoy.slice(0, 4));

    const [clientes, facturasAnio, resumenTotal] = await Promise.all([
      svc.listarClientesResumen(usuarioId),
      svc.listarFacturasPorAnio(usuarioId, anioActual),
      svc.resumenFacturas(usuarioId),
    ]);

    const ingresosMes = (facturasAnio as any[])
      .filter((f) => f.tipo === 'ingreso' && String(f.fecha ?? '').startsWith(mesActual))
      .reduce((suma, f) => suma + (f.importe || 0), 0);
    const gastosMes = (facturasAnio as any[])
      .filter((f) => f.tipo === 'gasto' && String(f.fecha ?? '').startsWith(mesActual))
      .reduce((suma, f) => suma + (f.importe || 0), 0);

    const clienteAbiertoId = typeof referencias.clienteAbierto === 'string' ? referencias.clienteAbierto : undefined;
    const clienteAbierto = clienteAbiertoId ? await svc.obtenerCliente(clienteAbiertoId, usuarioId) : null;

    const resumenClientes = clientes.map((c) => ({
      id: c.id, nombre: c.nombre, proyecto: c.proyecto, estado: c.estado, presupuesto: c.presupuesto,
    }));

    const resumenParaPrompt = [
      `FECHA HOY: ${hoy}`,
      // Dos resúmenes con alcance distinto y explícito — antes solo existía
      // el del mes actual, y una pregunta por el balance "total"/"general"
      // recibía como respuesta 0,00 € en cualquier mes sin facturas
      // todavía, dando la impresión (falsa) de que la app no tenía datos
      // reales. Se etiquetan ambos con su alcance para que el asistente no
      // los confunda al redactar la respuesta.
      `RESUMEN FINANCIERO DE TODA LA HISTORIA (todas las facturas, cualquier año): ingresos ${resumenTotal.totalIngresos.toFixed(2)} €, gastos ${resumenTotal.totalGastos.toFixed(2)} €, balance ${resumenTotal.balance.toFixed(2)} € (${resumenTotal.numFacturas} facturas en total)`,
      `RESUMEN FINANCIERO SOLO DEL MES ACTUAL (${mesActual}): ingresos ${ingresosMes.toFixed(2)} €, gastos ${gastosMes.toFixed(2)} €, beneficio ${(ingresosMes - gastosMes).toFixed(2)} €`,
      `CLIENTES Y PROYECTOS (${resumenClientes.length} en total): ${JSON.stringify(resumenClientes)}`,
      clienteAbierto ? `CLIENTE ACTUALMENTE ABIERTO EN PANTALLA: ${JSON.stringify({ id: clienteAbierto.id, nombre: (clienteAbierto as any).nombre })}` : '',
      `CONTEXTO DE PANTALLA: ${JSON.stringify(referencias)}`,
    ].filter(Boolean).join('\n');

    return { resumenParaPrompt, datosParaHerramientas: { clientes: resumenClientes } };
  },
};
