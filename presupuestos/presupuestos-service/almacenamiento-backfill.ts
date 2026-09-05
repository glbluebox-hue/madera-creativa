import {
  ClienteModel, ProyectoModel, PresupuestoModel, ContratoModel, FacturaModel, DibujoModel, RecursoModel, conectar,
} from './cliente.model.js';
import { UsuarioModel, conectarUsuarios } from './usuario.model.js';
import { ContadorAlmacenamientoModel } from './contador-almacenamiento.model.js';
import { almacenamiento } from './almacenamiento.service.js';
import { tamanoContenidoJson } from './almacenamiento-cuota.js';
import { obtenerTipoElemento, recorrerElementosMC } from './documento-registro-tipos.js';
import { logger } from './logger.service.js';
import type { DocumentoMC } from './documento-modelo.js';

/**
 * Backfill de cuota de almacenamiento (05/09/2026) — rellena `tamano` en
 * los documentos guardados ANTES de esta función (que no lo tenían) y
 * recalcula desde cero el contador agregado de cada usuario
 * (`ContadorAlmacenamientoModel`). Pensado para ejecutarse UNA vez tras
 * desplegar esta fase (y, sin ningún problema, más veces si hiciera
 * falta) — nunca se ejecuta automáticamente en cada arranque del servidor
 * (mismo criterio que llevó a retirar `migrarDatosAdmin()`, ver
 * `MIGRACION.md` § Puntos abiertos: un escaneo completo en cada arranque
 * es coste innecesario para algo que solo hace falta una vez).
 *
 * Idempotente por construcción:
 * - Cada campo `*Tamano` individual solo se toca cuando está REALMENTE
 *   ausente (`== null` en el objeto `.lean()` — un documento guardado
 *   antes de que existiera ese campo en el esquema no lo trae en absoluto
 *   en el BSON; `.lean()` nunca aplica el `default` del esquema como sí
 *   haría un documento hidratado). Una vez calculado y guardado, una
 *   segunda pasada lo encuentra ya presente y lo deja tal cual.
 * - El contador agregado, en cambio, SE RECALCULA POR COMPLETO cada vez
 *   (nunca `$inc`) — sumar de cero es idempotente sin importar cuántas
 *   veces se ejecute, y además autocorrige cualquier desviación que
 *   hubiera podido acumularse.
 * - NUNCA modifica el contenido de ningún archivo ni sube/borra nada en
 *   el almacenamiento — solo LEE tamaños (`obtenerTamano`, `HeadObject`
 *   en R2, sin descargar el archivo) y escribe el número en Mongo.
 *
 * Si un archivo referenciado ya no existe en el almacenamiento (huérfano
 * de un borrado a medias antiguo) o su URL no pertenece a este proveedor
 * (dominio externo/legado), `obtenerTamano`/`claveDesdeUrl` devuelven
 * `null` — se cuenta como 0 y se anota en `pendientesRevisionManual` del
 * resumen, nunca se lanza ni se detiene el resto del backfill por ello.
 */

export type ResumenBackfill = {
  facturasActualizadas: number;
  dibujosActualizados: number;
  presupuestosActualizados: number;
  contratosActualizados: number;
  usuariosRecalculados: number;
  pendientesRevisionManual: string[];
};

/** Tamaño real de un archivo por su URL ya subida — `null` si no se puede resolver (dominio externo, o ya no existe). */
async function tamanoDesdeUrl(url: string | undefined | null): Promise<number | null> {
  if (!url) return 0;
  const clave = almacenamiento.claveDesdeUrl(url) ?? almacenamiento.claveDesdeUrlPrivada(url);
  if (!clave) return null; // URL externa/legada — no es de este almacenamiento, no se puede medir
  return almacenamiento.obtenerTamano(clave);
}

async function backfillFacturas(pendientes: string[]): Promise<number> {
  const facturas = await FacturaModel.find({}).lean().exec() as any[];
  let actualizadas = 0;
  for (const f of facturas) {
    const cambios: Record<string, unknown> = {};

    if (f.imagenTamano == null) {
      const t = f.imagenClave ? await almacenamiento.obtenerTamano(f.imagenClave) : await tamanoDesdeUrl(f.imagen);
      if (t == null) pendientes.push(`Factura ${f.id}: imagen no medible (URL externa o ya no existe)`);
      cambios.imagenTamano = t ?? 0;
    }
    if (f.pdfOriginalTamano == null) {
      const t = f.pdfOriginalClave ? await almacenamiento.obtenerTamano(f.pdfOriginalClave) : await tamanoDesdeUrl(f.pdfOriginalUrl);
      if (t == null) pendientes.push(`Factura ${f.id}: PDF original no medible`);
      cambios.pdfOriginalTamano = t ?? 0;
    }
    if (Array.isArray(f.imagenes) && f.imagenes.length && f.imagenesTamanos == null) {
      const tamanos = await Promise.all(f.imagenes.map(async (url: string, i: number) => {
        const clave = f.imagenesClaves?.[i];
        const t = clave ? await almacenamiento.obtenerTamano(clave) : await tamanoDesdeUrl(url);
        if (t == null) pendientes.push(`Factura ${f.id}: imagenes[${i}] no medible`);
        return t ?? 0;
      }));
      cambios.imagenesTamanos = tamanos;
    }
    if (Array.isArray(f.paginas) && f.paginas.length && f.paginas.some((p: any) => p.tamano == null)) {
      const paginas = await Promise.all(f.paginas.map(async (p: any) => {
        if (p.tamano != null) return p;
        const t = p.clave ? await almacenamiento.obtenerTamano(p.clave) : await tamanoDesdeUrl(p.url);
        if (t == null) pendientes.push(`Factura ${f.id}: una página no medible`);
        return { ...p, tamano: t ?? 0 };
      }));
      cambios.paginas = paginas;
    }

    if (Object.keys(cambios).length > 0) {
      await FacturaModel.updateOne({ id: f.id, usuarioId: f.usuarioId }, { $set: cambios }).exec();
      actualizadas++;
    }
  }
  return actualizadas;
}

async function backfillDibujos(pendientes: string[]): Promise<number> {
  const dibujos = await DibujoModel.find({}).lean().exec() as any[];
  let actualizados = 0;
  for (const d of dibujos) {
    const cambios: Record<string, unknown> = {};
    if (d.miniaturaTamano == null) {
      const t = await tamanoDesdeUrl(d.miniatura);
      if (t == null) pendientes.push(`Dibujo ${d.id}: miniatura no medible`);
      cambios.miniaturaTamano = t ?? 0;
    }
    if (d.contenidoTamano == null) {
      // Nunca sube a R2 — se recalcula directamente del propio JSON ya
      // guardado en Mongo, sin ninguna llamada al almacenamiento.
      cambios.contenidoTamano = tamanoContenidoJson(d.contenido);
    }
    if (Object.keys(cambios).length > 0) {
      await DibujoModel.updateOne({ id: d.id, usuarioId: d.usuarioId }, { $set: cambios }).exec();
      actualizados++;
    }
  }
  return actualizados;
}

/** Rellena `tamano` en los recursos embebidos (Motor Documental) de un `DocumentoMC` — usado tanto para `Presupuesto.contenidoDocumento` como `Contrato.contenidoDocumento`. Devuelve `null` si no hizo falta ningún cambio. */
async function backfillContenidoDocumento(contenidoDocumento: unknown, pendientes: string[], etiqueta: string): Promise<DocumentoMC | null> {
  if (!contenidoDocumento || typeof contenidoDocumento !== 'object') return null;
  const copia = structuredClone(contenidoDocumento) as DocumentoMC;
  let huboCambios = false;
  for (const { elemento, reemplazar } of recorrerElementosMC(copia)) {
    const definicion = obtenerTipoElemento(elemento.tipo);
    if (!definicion.contieneRecurso || !definicion.obtenerRecurso || !definicion.establecerRecurso) continue;
    const recurso = definicion.obtenerRecurso(elemento);
    if (!recurso?.url || recurso.tamano != null) continue;
    const t = recurso.claveAlmacenamiento ? await almacenamiento.obtenerTamano(recurso.claveAlmacenamiento) : await tamanoDesdeUrl(recurso.url);
    if (t == null) pendientes.push(`${etiqueta}: un recurso embebido no medible`);
    reemplazar(definicion.establecerRecurso(elemento, { url: recurso.url, claveAlmacenamiento: recurso.claveAlmacenamiento ?? '', tamano: t ?? 0 }));
    huboCambios = true;
  }
  return huboCambios ? copia : null;
}

async function backfillPresupuestos(pendientes: string[]): Promise<number> {
  const presupuestos = await PresupuestoModel.find({}).lean().exec() as any[];
  let actualizados = 0;
  for (const p of presupuestos) {
    const cambios: Record<string, unknown> = {};
    if (p.firmaClienteUrl && p.firmaClienteTamano == null) {
      const t = await tamanoDesdeUrl(p.firmaClienteUrl);
      if (t == null) pendientes.push(`Presupuesto ${p.id}: firma del cliente no medible`);
      cambios.firmaClienteTamano = t ?? 0;
    }
    if (p.formato === 'documento') {
      const nuevo = await backfillContenidoDocumento(p.contenidoDocumento, pendientes, `Presupuesto ${p.id}`);
      if (nuevo) cambios.contenidoDocumento = nuevo;
    }
    if (Object.keys(cambios).length > 0) {
      await PresupuestoModel.updateOne({ id: p.id, usuarioId: p.usuarioId }, { $set: cambios }).exec();
      actualizados++;
    }
  }
  return actualizados;
}

async function backfillContratos(pendientes: string[]): Promise<number> {
  const contratos = await ContratoModel.find({}).lean().exec() as any[];
  let actualizados = 0;
  for (const c of contratos) {
    const nuevo = await backfillContenidoDocumento(c.contenidoDocumento, pendientes, `Contrato ${c.id}`);
    if (nuevo) {
      await ContratoModel.updateOne({ id: c.id, usuarioId: c.usuarioId }, { $set: { contenidoDocumento: nuevo } }).exec();
      actualizados++;
    }
  }
  return actualizados;
}

/**
 * Recalcula desde cero `ContadorAlmacenamientoModel.bytesUsados` de un
 * usuario, sumando TODO lo que cuenta contra su cuota — llamar solo
 * DESPUÉS de que las funciones de arriba hayan rellenado los `tamano`
 * ausentes, o la suma incluiría ceros que en realidad no lo son.
 */
async function recalcularContador(usuarioId: string): Promise<number> {
  const [proyectos, presupuestos, contratos, facturas, dibujos, recursos] = await Promise.all([
    ProyectoModel.find({ usuarioId }).select('fotos adjuntos modelo3D').lean().exec() as Promise<any[]>,
    PresupuestoModel.find({ usuarioId }).select('contenidoLienzo contenidoDocumento formato firmaClienteTamano').lean().exec() as Promise<any[]>,
    ContratoModel.find({ usuarioId }).select('contenidoDocumento').lean().exec() as Promise<any[]>,
    FacturaModel.find({ usuarioId }).select('imagenTamano imagenesTamanos pdfOriginalTamano paginas').lean().exec() as Promise<any[]>,
    DibujoModel.find({ usuarioId }).select('miniaturaTamano contenidoTamano').lean().exec() as Promise<any[]>,
    RecursoModel.find({ usuarioId }).select('tamano').lean().exec() as Promise<any[]>,
  ]);

  const sumaRecursosDocumento = (doc: unknown): number => {
    if (!doc || typeof doc !== 'object') return 0;
    let total = 0;
    for (const { elemento } of recorrerElementosMC(doc as DocumentoMC)) {
      const definicion = obtenerTipoElemento(elemento.tipo);
      if (!definicion.contieneRecurso || !definicion.obtenerRecurso) continue;
      total += definicion.obtenerRecurso(elemento)?.tamano || 0;
    }
    return total;
  };

  let total = 0;
  for (const p of proyectos) {
    total += (p.fotos ?? []).reduce((s: number, f: any) => s + (f.tamano || 0), 0);
    total += (p.adjuntos ?? []).reduce((s: number, a: any) => s + (a.tamano || 0), 0);
    if (p.modelo3D?.proveedor === 'manual') total += p.modelo3D.tamano || 0;
  }
  for (const p of presupuestos) {
    const files = p.contenidoLienzo?.files as Record<string, any> | undefined;
    if (files) total += Object.values(files).reduce((s: number, f: any) => s + (f?.tamano || 0), 0);
    if (p.formato === 'documento') total += sumaRecursosDocumento(p.contenidoDocumento);
    total += p.firmaClienteTamano || 0;
  }
  for (const c of contratos) total += sumaRecursosDocumento(c.contenidoDocumento);
  for (const f of facturas) {
    total += f.imagenTamano || 0;
    total += f.pdfOriginalTamano || 0;
    total += (f.imagenesTamanos ?? []).reduce((s: number, t: number) => s + (t || 0), 0);
    total += (f.paginas ?? []).reduce((s: number, p: any) => s + (p.tamano || 0), 0);
  }
  for (const d of dibujos) total += (d.miniaturaTamano || 0) + (d.contenidoTamano || 0);
  for (const r of recursos) total += r.tamano || 0;

  await ContadorAlmacenamientoModel.findOneAndUpdate(
    { usuarioId },
    { $set: { bytesUsados: total } },
    { upsert: true }
  ).exec();
  return total;
}

/**
 * Punto de entrada único del backfill — rellena los `tamano` que falten y
 * recalcula el contador de TODOS los usuarios reales (más `admin`, que
 * también puede tener archivos propios aunque nunca se le aplique límite).
 * Devuelve un resumen para dejar constancia de lo hecho (pensado para
 * imprimirse en consola desde el script de un solo uso que la invoque).
 */
export async function ejecutarBackfillAlmacenamiento(): Promise<ResumenBackfill> {
  await conectar();
  await conectarUsuarios();
  const pendientesRevisionManual: string[] = [];

  const [facturasActualizadas, dibujosActualizados, presupuestosActualizados, contratosActualizados] = [
    await backfillFacturas(pendientesRevisionManual),
    await backfillDibujos(pendientesRevisionManual),
    await backfillPresupuestos(pendientesRevisionManual),
    await backfillContratos(pendientesRevisionManual),
  ];

  const usuarioIds = new Set<string>([
    ...(await UsuarioModel.find({}).select('id').lean().exec() as any[]).map((u) => u.id),
    'admin',
  ]);
  let usuariosRecalculados = 0;
  for (const usuarioId of usuarioIds) {
    await recalcularContador(usuarioId);
    usuariosRecalculados++;
  }

  if (pendientesRevisionManual.length > 0) {
    logger.warn({ pendientesRevisionManual }, '[backfill-almacenamiento] Algunos archivos no se pudieron medir (URL externa o ya inexistente) — contados como 0, revisar a mano.');
  }

  return { facturasActualizadas, dibujosActualizados, presupuestosActualizados, contratosActualizados, usuariosRecalculados, pendientesRevisionManual };
}
