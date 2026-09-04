import { PresupuestosService } from './presupuestos-service.js';
import type { ConstructorContexto } from './ia-contexto.js';

const svc = PresupuestosService.from();

/**
 * Contexto de navegación del asistente (Fase 3.1, 05/09/2026) — la mitad
 * "IA de navegación" de `asistente-global`, ahora separada como su propia
 * unidad de código: clientes/proyectos (sin ningún importe en euros) y el
 * proyecto actualmente abierto en pantalla, si lo hay. Nunca calcula ni
 * consulta nada financiero — ni falta que hace para navegar, abrir un
 * cliente o crear uno.
 *
 * `contextoAsistenteCifrasReales.ts` reutiliza esta función tal cual y le
 * añade encima las cifras reales del negocio — así la parte de navegación
 * no está duplicada entre las dos.
 */
export async function construirContextoNavegacion(referencias: Record<string, unknown>, usuarioId: string) {
  const hoy = new Date().toISOString().slice(0, 10);

  // `referencias.clienteAbierto` en realidad ya identifica un PROYECTO
  // (incremento "Cliente ≠ Proyecto", 20/08/2026) — la clave se mantiene
  // sin renombrar porque la fija el frontend en "referencias de pantalla"
  // y no aporta nada cambiarla aquí.
  const proyectoAbiertoId = typeof referencias.clienteAbierto === 'string' ? referencias.clienteAbierto : undefined;

  const [clientes, proyectoAbierto] = await Promise.all([
    svc.listarProyectosResumen(usuarioId),
    proyectoAbiertoId ? svc.obtenerProyecto(proyectoAbiertoId, usuarioId) : Promise.resolve(null),
  ]);
  const clienteDelProyectoAbierto = proyectoAbierto ? await svc.obtenerCliente((proyectoAbierto as any).clienteId, usuarioId) : null;

  // Sin `presupuesto` (importe en euros) a propósito — es un dato
  // económico, no de navegación; lo añade `contextoAsistenteCifrasReales`
  // para quien sí tiene PRO+.
  const resumenClientes = clientes.map((c) => ({ id: c.id, nombre: c.nombre, proyecto: c.proyecto, estado: c.estado }));

  const lineas = [
    `FECHA HOY: ${hoy}`,
    // Instrucción explícita para que el modelo nunca invente ni estime una
    // cifra que no tiene — ver el mismo criterio en
    // `contextoAsistenteCifrasReales`, que sí incluye las cifras reales.
    `Esta cuenta es del plan BASIC: no tienes acceso a ninguna cifra real del negocio (ingresos, gastos, balance, importes de presupuestos). Si te preguntan por beneficio, margen, facturación o cualquier importe, responde que esa información está disponible en el plan PRO — nunca inventes ni estimes una cifra.`,
    `CLIENTES Y PROYECTOS (${resumenClientes.length} en total): ${JSON.stringify(resumenClientes)}`,
    proyectoAbierto ? `PROYECTO ACTUALMENTE ABIERTO EN PANTALLA: ${JSON.stringify({ id: proyectoAbierto.id, proyecto: (proyectoAbierto as any).proyecto, cliente: (clienteDelProyectoAbierto as any)?.nombre })}` : '',
    `CONTEXTO DE PANTALLA: ${JSON.stringify(referencias)}`,
  ];

  // Se devuelven también los datos crudos (`clientes` con `presupuesto`
  // incluido, `proyectoAbierto`) para que `contextoAsistenteCifrasReales`
  // pueda enriquecer el mismo resumen con cifras SIN volver a consultar
  // Mongo — reutiliza esta consulta, no la repite.
  return { hoy, resumenClientes, lineas, clientes, proyectoAbierto, clienteDelProyectoAbierto };
}

/**
 * Manifiesto standalone de "solo navegación" — no se usa hoy directamente
 * como capacidad de `POST /ia/generar` (el frontend llama siempre a
 * `asistente-global`, que internamente decide entre esta y
 * `contextoAsistenteCifrasReales` según el plan — ver esa dispatch en
 * `asistente-global.contexto-ia.ts`), pero se deja como `ConstructorContexto`
 * completo y autónomo para que "si existe una capacidad adecuada para
 * navegación, reutilízala" sea literalmente cierto desde ya, sin esperar a
 * una fase futura que sí registre un `POST /ia/generar` de dos capacidades
 * distintas elegidas por el frontend.
 */
export const contextoAsistenteNavegacion: ConstructorContexto = {
  async construir(referencias, usuarioId) {
    const { lineas, resumenClientes } = await construirContextoNavegacion(referencias, usuarioId);
    return { resumenParaPrompt: lineas.filter(Boolean).join('\n'), datosParaHerramientas: { clientes: resumenClientes } };
  },
};
