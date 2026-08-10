import { z } from 'zod';
import type { HerramientaIA } from './ia-herramienta.js';

/**
 * Las 5 herramientas del asistente global — migradas literalmente de las
 * "acciones" que el `/asistente` original parseaba con una regex sobre
 * `<accion>{...}</accion>`. Verificado en `asistente-ia.tsx`: las 5 son de
 * navegación/interfaz pura, ninguna escribe en Mongo (`crearCliente` solo
 * abre el formulario vacío para que el humano lo rellene) — por eso las 5
 * tienen permiso `'interfaz'`: el servidor nunca las ejecuta, se acumulan en
 * `accionesInterfaz` para que el frontend las resuelva, igual que hoy.
 */

/** Nunca se llama en la práctica — `ServicioCentralIA` no invoca `ejecutar()` para herramientas de permiso `'interfaz'`. */
function ejecutarInterfazNuncaLlamado(): Promise<never> {
  return Promise.reject(new Error("Herramienta de permiso 'interfaz': no se ejecuta en el servidor."));
}

export const herramientaNavegarSeccion: HerramientaIA<{ seccion: 'clientes' | 'presupuestos' | 'facturas' }> = {
  nombre: 'navegarSeccion',
  descripcion: 'Navega a una sección principal de la aplicación: clientes, presupuestos o facturas.',
  permiso: 'interfaz',
  esquemaParametros: z.object({ seccion: z.enum(['clientes', 'presupuestos', 'facturas']) }),
  ejecutar: ejecutarInterfazNuncaLlamado,
};

export const herramientaAbrirCliente: HerramientaIA<{ clienteId?: string; clienteNombre?: string }> = {
  nombre: 'abrirCliente',
  descripcion: 'Abre la ficha de un cliente concreto, por id si se conoce o por nombre (búsqueda aproximada) si no.',
  permiso: 'interfaz',
  esquemaParametros: z.object({ clienteId: z.string().optional(), clienteNombre: z.string().optional() }),
  ejecutar: ejecutarInterfazNuncaLlamado,
};

export const herramientaCrearCliente: HerramientaIA<Record<string, never>> = {
  nombre: 'crearCliente',
  descripcion: 'Abre el formulario vacío de creación de un nuevo cliente — no crea nada por sí sola, el humano lo rellena y guarda.',
  permiso: 'interfaz',
  esquemaParametros: z.object({}),
  ejecutar: ejecutarInterfazNuncaLlamado,
};

export const herramientaAbrirFacturas: HerramientaIA<Record<string, never>> = {
  nombre: 'abrirFacturas',
  descripcion: 'Navega a la sección de facturas.',
  permiso: 'interfaz',
  esquemaParametros: z.object({}),
  ejecutar: ejecutarInterfazNuncaLlamado,
};

export const herramientaBuscarCliente: HerramientaIA<{ termino: string }> = {
  nombre: 'buscarCliente',
  descripcion: 'Navega a la sección de clientes para que el usuario busque manualmente un cliente por un término.',
  permiso: 'interfaz',
  esquemaParametros: z.object({ termino: z.string() }),
  ejecutar: ejecutarInterfazNuncaLlamado,
};

export const herramientasAsistenteGlobal: HerramientaIA[] = [
  herramientaNavegarSeccion,
  herramientaAbrirCliente,
  herramientaCrearCliente,
  herramientaAbrirFacturas,
  herramientaBuscarCliente,
];
