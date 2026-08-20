import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { HerramientaIA } from './ia-herramienta.js';
import { PresupuestosService } from './presupuestos-service.js';
import { generarDocumentoPresupuesto, generarDocumentoPresupuestoDesdePlantilla } from './documento-generador-presupuesto.js';
import { resolverVariables } from './documento-registro-variables.js';
import type { DocumentoMC, ElementoMC } from './documento-modelo.js';

/**
 * Herramientas de escritura del copiloto de Presupuestos (Fase 5 — primera
 * prueba real de IA agente). Permiso `'escritura'`: `ServicioCentralIA`
 * nunca las ejecuta por sí solo — quedan en `propuestas`, pendientes de
 * confirmación explícita (`POST /ia/herramientas/ejecutar`). Solo entonces
 * se llama a `ejecutar()`, que escribe en Mongo a través de
 * `PresupuestosService` — la misma capa de servicio que usan las rutas
 * REST normales, nunca Mongo directo.
 *
 * El modelo nunca conoce ids de Mongo: identifica al cliente por nombre
 * ("Juan"), igual que ya hace `abrirCliente` en las herramientas de
 * interfaz — la resolución real ocurre aquí, en el backend.
 */

const svc = PresupuestosService.from();

const esquemaCrearPresupuesto = z.object({
  clienteNombre: z.string().trim().min(1).max(200),
  titulo: z.string().trim().min(1).max(200),
  descripcion: z.string().trim().min(1).max(10000),
  alcance: z.array(z.string().max(300)).max(50).optional().default([]),
  precioTotal: z.number().finite().nonnegative(),
});

export const herramientaCrearPresupuesto: HerramientaIA<z.infer<typeof esquemaCrearPresupuesto>> = {
  nombre: 'crearPresupuesto',
  descripcion:
    'Crea un presupuesto narrativo nuevo para un cliente existente: título, descripción profesional completa, ' +
    'alcance del trabajo (lista de descriptores, sin precio individual) y precio total. No inventes precios, ' +
    'materiales, medidas ni trabajos que el usuario no haya indicado.',
  permiso: 'escritura',
  esquemaParametros: esquemaCrearPresupuesto,
  async ejecutar(params, ctx) {
    const cliente = await svc.buscarClientePorNombre(ctx.usuarioId, params.clienteNombre);
    if (!cliente) return { error: `No se encontró ningún cliente llamado "${params.clienteNombre}".` };

    const ahora = new Date().toISOString();
    const presupuesto = await svc.guardarPresupuesto({
      id: randomUUID(),
      clienteId: cliente.id,
      titulo: params.titulo,
      descripcion: params.descripcion,
      alcance: params.alcance,
      items: [],
      precioTotal: params.precioTotal,
      creado: ahora,
      actualizado: ahora,
    }, ctx.usuarioId);

    return {
      ok: true,
      presupuestoId: presupuesto.id,
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      titulo: params.titulo,
      precioTotal: params.precioTotal,
    };
  },
};

const esquemaAnadirElementoPresupuesto = z.object({
  clienteNombre: z.string().trim().min(1).max(200),
  concepto: z.string().trim().min(1).max(300),
  precio: z.number().finite(),
});

export const herramientaAnadirElementoPresupuesto: HerramientaIA<z.infer<typeof esquemaAnadirElementoPresupuesto>> = {
  nombre: 'anadirElementoPresupuesto',
  descripcion:
    'Añade un elemento con precio propio al presupuesto más reciente de un cliente (p. ej. "cuatro cajones ' +
    'interiores, 480€") y actualiza el precio total sumándolo. No inventes el precio si el usuario no lo ha dado.',
  permiso: 'escritura',
  esquemaParametros: esquemaAnadirElementoPresupuesto,
  async ejecutar(params, ctx) {
    const cliente = await svc.buscarClientePorNombre(ctx.usuarioId, params.clienteNombre);
    if (!cliente) return { error: `No se encontró ningún cliente llamado "${params.clienteNombre}".` };

    const presupuesto = await svc.obtenerPresupuestoMasRecienteDeCliente(ctx.usuarioId, cliente.id);
    if (!presupuesto) return { error: `${cliente.nombre} no tiene ningún presupuesto todavía.` };

    const itemNuevo = { id: randomUUID(), concepto: params.concepto, precio: params.precio };
    const items = [...((presupuesto.items as unknown[]) ?? []), itemNuevo];
    const precioTotalNuevo = ((presupuesto.precioTotal as number) ?? 0) + params.precio;

    const actualizado = await svc.guardarPresupuesto({
      ...presupuesto,
      items,
      precioTotal: precioTotalNuevo,
      actualizado: new Date().toISOString(),
    }, ctx.usuarioId);

    return {
      ok: true,
      presupuestoId: actualizado.id,
      clienteNombre: cliente.nombre,
      itemAnadido: itemNuevo,
      precioTotalNuevo,
    };
  },
};

const esquemaSeccionPresupuesto = z.object({
  titulo: z.string().trim().min(1).max(150),
  descripcion: z.string().trim().min(1).max(2000),
  precio: z.number().finite().nonnegative(),
});

const esquemaCrearPresupuestoDocumento = z.object({
  clienteNombre: z.string().trim().min(1).max(200),
  titulo: z.string().trim().min(1).max(200),
  secciones: z.array(esquemaSeccionPresupuesto).min(1).max(30),
  condicionesPago: z.string().trim().max(500).optional(),
  condicionesGenerales: z.string().trim().max(2000).optional(),
  /**
   * Dirección/teléfono del cliente TAL COMO los haya dado el usuario en su
   * mensaje — el documento los usa aunque la ficha del cliente en la app
   * no los tenga guardados todavía (reporte real, 19/08/2026: "quiero que
   * la IA entienda que si le doy la dirección la ponga ahí"). No se
   * escriben en la ficha del cliente, solo se usan para este documento.
   */
  clienteDireccion: z.string().trim().max(300).optional(),
  clienteTelefono: z.string().trim().max(60).optional(),
  /**
   * Id de una `PlantillaMC` real del usuario a rellenar, en vez de generar
   * el documento desde cero (ver `generarDocumentoPresupuestoDesdePlantilla`).
   * SIEMPRE lo añade la propia pantalla al confirmar la propuesta (nunca lo
   * decide el modelo) — se declara `optional` en el esquema solo porque el
   * chat general (sin selector de plantilla) sigue pudiendo usar esta
   * herramienta sin él, generando el documento por defecto.
   */
  plantillaId: z.string().trim().min(1).optional(),
});

/**
 * Presupuesto profesional con membrete y varias secciones con precio
 * propio (Motor Documental) — la IA descompone el trabajo en partidas en
 * vez de un único párrafo con un precio total (`crearPresupuesto`, más
 * arriba). El documento real (páginas, membrete, paginación automática)
 * lo construye `generarDocumentoPresupuesto` — la IA nunca ve ni decide
 * coordenadas ni maquetación, solo el contenido de cada sección.
 */
export const herramientaCrearPresupuestoDocumento: HerramientaIA<z.infer<typeof esquemaCrearPresupuestoDocumento>> = {
  nombre: 'crearPresupuestoDocumento',
  descripcion:
    'Crea un presupuesto profesional con membrete de empresa, dividido en secciones (una por cada parte diferenciada ' +
    'del trabajo, ej. "Cocina a medida", "Mueble de salón", "Rodapié"), cada una con su propia descripción y precio. ' +
    'Úsala cuando el trabajo tenga varias partes claramente distintas con precio propio cada una; para un presupuesto ' +
    'de una sola partida con un único precio, usa crearPresupuesto en su lugar. No inventes secciones, precios, ' +
    'materiales ni medidas que el usuario no haya indicado — si falta el precio de alguna parte, pregúntalo antes de llamar a esta herramienta. ' +
    'Si el usuario menciona en su mensaje la dirección o el teléfono del cliente (aunque la ficha del cliente no los tenga guardados), ' +
    'pásalos en clienteDireccion/clienteTelefono tal cual los haya dado — no los inventes si no los ha dado.',
  permiso: 'escritura',
  esquemaParametros: esquemaCrearPresupuestoDocumento,
  async ejecutar(params, ctx) {
    const cliente = await svc.buscarClientePorNombre(ctx.usuarioId, params.clienteNombre);
    if (!cliente) return { error: `No se encontró ningún cliente llamado "${params.clienteNombre}".` };

    const empresa = await svc.obtenerEmpresa(ctx.usuarioId);
    const condicionesPago = params.condicionesPago ?? empresa.condicionesPagoDefecto;
    const condicionesGenerales = params.condicionesGenerales ?? '';

    const datosCliente = {
      nombre: (cliente as any).nombre,
      email: (cliente as any).email,
      telefono: params.clienteTelefono || (cliente as any).telefono,
      direccion: params.clienteDireccion || (cliente as any).direccion,
    };

    let documento: DocumentoMC;
    let precioTotal: number;

    if (params.plantillaId) {
      const plantillas = await svc.listarPlantillas(ctx.usuarioId);
      const plantilla = plantillas.find((p) => p.id === params.plantillaId);
      if (!plantilla) return { error: 'No se encontró la plantilla seleccionada — puede que se haya borrado. Elige otra o genera el documento sin plantilla.' };

      const componentes = await svc.listarComponentes(ctx.usuarioId);
      const componenteSeccion = componentes.find((c) => String(c.nombre).trim() === 'Sección de presupuesto');
      if (!componenteSeccion) {
        return {
          error: 'No existe ningún componente llamado exactamente "Sección de presupuesto" — créalo en el editor ' +
            '(un texto con "{{seccion.titulo}}", otro con "{{seccion.descripcion}}", y un elemento de Precio destacado), ' +
            'guárdalo como componente con ese nombre exacto, y colócalo en tu plantilla.',
        };
      }

      const resultado = generarDocumentoPresupuestoDesdePlantilla(
        plantilla.documentoBase as unknown as DocumentoMC,
        { id: String(componenteSeccion.id), nombre: String(componenteSeccion.nombre), elementos: componenteSeccion.elementos as unknown as ElementoMC[] },
        params.secciones
      );
      if (resultado.error) return { error: resultado.error };

      precioTotal = resultado.precioTotal;
      documento = resolverVariables(resultado.documento, {
        cliente: datosCliente,
        empresa: { nombre: empresa.nombre, telefono: empresa.telefono, email: empresa.email, iban: empresa.iban },
        presupuesto: { titulo: params.titulo, precioTotal },
        fecha: new Date(),
      });
    } else {
      const generado = generarDocumentoPresupuesto(params.secciones, {
        cliente: datosCliente,
        empresa: { nombre: empresa.nombre, telefono: empresa.telefono, email: empresa.email, iban: empresa.iban, logo: empresa.logo },
        titulo: params.titulo,
        condicionesPago,
        condicionesGenerales,
      });
      documento = generado.documento;
      precioTotal = generado.precioTotal;
    }

    const ahora = new Date().toISOString();
    const presupuesto = await svc.guardarPresupuesto({
      id: randomUUID(),
      clienteId: cliente.id,
      titulo: params.titulo,
      formato: 'documento',
      descripcion: '',
      alcance: [],
      items: [],
      contenidoLienzo: {},
      contenidoDocumento: documento as unknown as Record<string, unknown>,
      condicionesPago,
      validezDias: empresa.validezDiasDefecto,
      condicionesGenerales,
      precioTotal,
      creado: ahora,
      actualizado: ahora,
    } as any, ctx.usuarioId);

    return {
      ok: true,
      presupuestoId: presupuesto.id,
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      titulo: params.titulo,
      precioTotal,
      numeroSecciones: params.secciones.length,
    };
  },
};

export const herramientasPresupuestos: HerramientaIA[] = [
  herramientaCrearPresupuesto,
  herramientaAnadirElementoPresupuesto,
  herramientaCrearPresupuestoDocumento,
];
