import { PresupuestosService } from './presupuestos-service.js';
import type { ConstructorContexto } from './ia-contexto.js';
import { obtenerPlanUsuario, planPermiteAcceso, PRO_O_SUPERIOR } from './planes.js';

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
 *
 * Plan (Fase 3, 04/09/2026): esta es, en la práctica, la capacidad que V3
 * llama "asistente IA con cifras reales del negocio" (PRO+) — pero
 * `asistente-global` también es la única capacidad de navegación pura
 * (BASIC). No son dos capacidades separadas en el manifiesto (`ia-capacidad.ts`
 * no distingue "solo navegar" de "con cifras"), así que el gate va aquí, en
 * el propio constructor de contexto, que ya recibe `usuarioId`: para una
 * cuenta sin PRO+, ni se consultan ni se incluyen cifras reales en el
 * prompt — la conversación sigue funcionando (navegar, crear un cliente,
 * abrir un presupuesto), pero sin ingresos/gastos/balance ni el importe de
 * cada presupuesto. Separar esto en dos capacidades de verdad sería un
 * cambio de arquitectura mayor, fuera de alcance de esta fase.
 */
export const contextoAsistenteGlobal: ConstructorContexto = {
  async construir(referencias, usuarioId) {
    const hoy = new Date().toISOString().slice(0, 10);
    const mesActual = hoy.slice(0, 7);
    const anioActual = Number(hoy.slice(0, 4));

    const plan = await obtenerPlanUsuario(usuarioId);
    const tieneCifrasReales = usuarioId === 'admin' || planPermiteAcceso(plan, PRO_O_SUPERIOR);

    // `referencias.clienteAbierto` en realidad ya identifica un PROYECTO
    // (incremento "Cliente ≠ Proyecto", 20/08/2026) — la clave se mantiene
    // sin renombrar porque la fija el frontend en `referencias de pantalla`
    // y no aporta nada cambiarla aquí.
    const proyectoAbiertoId = typeof referencias.clienteAbierto === 'string' ? referencias.clienteAbierto : undefined;

    const [clientes, facturasAnio, resumenTotal, proyectoAbierto] = await Promise.all([
      svc.listarProyectosResumen(usuarioId),
      tieneCifrasReales ? svc.listarFacturasPorAnio(usuarioId, anioActual) : Promise.resolve([]),
      tieneCifrasReales ? svc.resumenFacturas(usuarioId) : Promise.resolve(null),
      proyectoAbiertoId ? svc.obtenerProyecto(proyectoAbiertoId, usuarioId) : Promise.resolve(null),
    ]);
    const clienteDelProyectoAbierto = proyectoAbierto ? await svc.obtenerCliente((proyectoAbierto as any).clienteId, usuarioId) : null;

    const ingresosMes = (facturasAnio as any[])
      .filter((f) => f.tipo === 'ingreso' && String(f.fecha ?? '').startsWith(mesActual))
      .reduce((suma, f) => suma + (f.importe || 0), 0);
    const gastosMes = (facturasAnio as any[])
      .filter((f) => f.tipo === 'gasto' && String(f.fecha ?? '').startsWith(mesActual))
      .reduce((suma, f) => suma + (f.importe || 0), 0);

    // Sin PRO+, el listado de navegación se queda sin `presupuesto` (importe
    // en euros) — es un dato económico, no de navegación.
    const resumenClientes = clientes.map((c) => (
      tieneCifrasReales
        ? { id: c.id, nombre: c.nombre, proyecto: c.proyecto, estado: c.estado, presupuesto: c.presupuesto }
        : { id: c.id, nombre: c.nombre, proyecto: c.proyecto, estado: c.estado }
    ));

    const resumenParaPrompt = [
      `FECHA HOY: ${hoy}`,
      // Dos resúmenes con alcance distinto y explícito — antes solo existía
      // el del mes actual, y una pregunta por el balance "total"/"general"
      // recibía como respuesta 0,00 € en cualquier mes sin facturas
      // todavía, dando la impresión (falsa) de que la app no tenía datos
      // reales. Se etiquetan ambos con su alcance para que el asistente no
      // los confunda al redactar la respuesta.
      tieneCifrasReales && resumenTotal
        ? `RESUMEN FINANCIERO DE TODA LA HISTORIA (todas las facturas, cualquier año): ingresos ${resumenTotal.totalIngresos.toFixed(2)} €, gastos ${resumenTotal.totalGastos.toFixed(2)} €, balance ${resumenTotal.balance.toFixed(2)} € (${resumenTotal.numFacturas} facturas en total)`
        : '',
      tieneCifrasReales
        ? `RESUMEN FINANCIERO SOLO DEL MES ACTUAL (${mesActual}): ingresos ${ingresosMes.toFixed(2)} €, gastos ${gastosMes.toFixed(2)} €, beneficio ${(ingresosMes - gastosMes).toFixed(2)} €`
        : `Esta cuenta es del plan BASIC: no tienes acceso a ninguna cifra real del negocio (ingresos, gastos, balance, importes de presupuestos). Si te preguntan por beneficio, margen, facturación o cualquier importe, responde que esa información está disponible en el plan PRO — nunca inventes ni estimes una cifra.`,
      `CLIENTES Y PROYECTOS (${resumenClientes.length} en total): ${JSON.stringify(resumenClientes)}`,
      proyectoAbierto ? `PROYECTO ACTUALMENTE ABIERTO EN PANTALLA: ${JSON.stringify({ id: proyectoAbierto.id, proyecto: (proyectoAbierto as any).proyecto, cliente: (clienteDelProyectoAbierto as any)?.nombre })}` : '',
      `CONTEXTO DE PANTALLA: ${JSON.stringify(referencias)}`,
    ].filter(Boolean).join('\n');

    return { resumenParaPrompt, datosParaHerramientas: { clientes: resumenClientes } };
  },
};
