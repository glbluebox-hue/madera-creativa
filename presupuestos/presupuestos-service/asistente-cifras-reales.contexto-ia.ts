import { PresupuestosService } from './presupuestos-service.js';
import type { ConstructorContexto } from './ia-contexto.js';
import { construirContextoNavegacion } from './asistente-navegacion.contexto-ia.js';

const svc = PresupuestosService.from();

/**
 * Contexto de "cifras reales del negocio" del asistente (Fase 3.1,
 * 05/09/2026) — la mitad PRO+ de `asistente-global`, separada de la
 * navegación como su propia unidad de código, con su propio gate de plan
 * (ver `capacidadPermitidaParaPlan(usuarioId, 'PRO')` en el dispatcher,
 * `asistente-global.contexto-ia.ts`).
 *
 * Reutiliza `construirContextoNavegacion` para clientes/proyecto abierto en
 * vez de repetir esas mismas consultas — solo añade lo que la navegación no
 * necesita: ingresos/gastos/balance y el importe de cada presupuesto.
 */
export const contextoAsistenteCifrasReales: ConstructorContexto = {
  async construir(referencias, usuarioId) {
    const { hoy, clientes, proyectoAbierto, clienteDelProyectoAbierto } = await construirContextoNavegacion(referencias, usuarioId);
    const mesActual = hoy.slice(0, 7);
    const anioActual = Number(hoy.slice(0, 4));

    const [facturasAnio, resumenTotal] = await Promise.all([
      svc.listarFacturasPorAnio(usuarioId, anioActual),
      svc.resumenFacturas(usuarioId),
    ]);

    const ingresosMes = (facturasAnio as any[])
      .filter((f) => f.tipo === 'ingreso' && String(f.fecha ?? '').startsWith(mesActual))
      .reduce((suma, f) => suma + (f.importe || 0), 0);
    const gastosMes = (facturasAnio as any[])
      .filter((f) => f.tipo === 'gasto' && String(f.fecha ?? '').startsWith(mesActual))
      .reduce((suma, f) => suma + (f.importe || 0), 0);

    // Aquí sí se incluye `presupuesto` (importe en euros) — a diferencia del
    // resumen de navegación, esta capacidad ya está gateada a PRO+.
    const resumenClientes = clientes.map((c: any) => ({ id: c.id, nombre: c.nombre, proyecto: c.proyecto, estado: c.estado, presupuesto: c.presupuesto }));

    const resumenParaPrompt = [
      `FECHA HOY: ${hoy}`,
      // Dos resúmenes con alcance distinto y explícito — antes solo existía
      // el del mes actual, y una pregunta por el balance "total"/"general"
      // recibía como respuesta 0,00 € en cualquier mes sin facturas
      // todavía, dando la impresión (falsa) de que la app no tenía datos
      // reales. Se etiquetan ambos con su alcance para que el asistente no
      // los confunda al redactar la respuesta.
      resumenTotal
        ? `RESUMEN FINANCIERO DE TODA LA HISTORIA (todas las facturas, cualquier año): ingresos ${resumenTotal.totalIngresos.toFixed(2)} €, gastos ${resumenTotal.totalGastos.toFixed(2)} €, balance ${resumenTotal.balance.toFixed(2)} € (${resumenTotal.numFacturas} facturas en total)`
        : '',
      `RESUMEN FINANCIERO SOLO DEL MES ACTUAL (${mesActual}): ingresos ${ingresosMes.toFixed(2)} €, gastos ${gastosMes.toFixed(2)} €, beneficio ${(ingresosMes - gastosMes).toFixed(2)} €`,
      `CLIENTES Y PROYECTOS (${resumenClientes.length} en total): ${JSON.stringify(resumenClientes)}`,
      proyectoAbierto ? `PROYECTO ACTUALMENTE ABIERTO EN PANTALLA: ${JSON.stringify({ id: proyectoAbierto.id, proyecto: (proyectoAbierto as any).proyecto, cliente: (clienteDelProyectoAbierto as any)?.nombre })}` : '',
      `CONTEXTO DE PANTALLA: ${JSON.stringify(referencias)}`,
    ].filter(Boolean).join('\n');

    return { resumenParaPrompt, datosParaHerramientas: { clientes: resumenClientes } };
  },
};
