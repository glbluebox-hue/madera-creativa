import { almacenamiento } from './almacenamiento.service.js';
import { obtenerTipoElemento, recorrerElementosMC } from './documento-registro-tipos.js';
import type { DocumentoMC } from './documento-modelo.js';

/**
 * Procesado de recursos gráficos de un `DocumentoMC` — sustituye por
 * completo a `procesarArchivosLienzo`/`borrarArchivosLienzoHuerfanos`
 * (`presupuestos-service.ts`), que asumían la forma interna de Excalidraw
 * (`contenidoLienzo.files`, un diccionario por `fileId`). Esta versión no
 * conoce esa forma ni la de ningún tipo de elemento concreto — recorre el
 * documento con `recorrerElementosMC` y, por cada elemento, consulta al
 * registro de tipos si "puede contener un recurso" (`contieneRecurso`) y,
 * si es así, usa los accessors que el propio tipo aportó
 * (`obtenerRecurso`/`establecerRecurso`) para leer y sustituir su `url`.
 *
 * `documento-procesar-recursos.ts` seguiría funcionando igual si mañana
 * se registra un tipo catorce con imágenes — no hay que tocar este
 * archivo (Regla de Oro 6).
 */

function esBase64(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.startsWith('data:');
}

/**
 * Sube a almacenamiento externo cualquier recurso todavía en Base64 dentro
 * del documento, sustituyendo su `url` por la resultante — deja tal cual
 * los que ya son una URL externa (guardado anterior). Devuelve una copia
 * del documento; no muta el original.
 */
export async function procesarRecursosDocumento(documento: DocumentoMC): Promise<DocumentoMC> {
  const copia = structuredClone(documento);
  const subidas: Promise<void>[] = [];
  for (const { elemento, reemplazar } of recorrerElementosMC(copia)) {
    const definicion = obtenerTipoElemento(elemento.tipo);
    if (!definicion.contieneRecurso || !definicion.obtenerRecurso || !definicion.establecerRecurso) continue;
    const recurso = definicion.obtenerRecurso(elemento);
    if (!recurso || !esBase64(recurso.url)) continue;
    const coincide = recurso.url.match(/^data:([^;]+);base64,(.+)$/);
    if (!coincide) continue;
    const [, tipoMime, base64] = coincide;
    const buffer = Buffer.from(base64, 'base64');
    const establecerRecurso = definicion.establecerRecurso;
    subidas.push(
      almacenamiento.subir(buffer, { contentType: tipoMime, carpeta: 'documentos' }).then((subido) => {
        reemplazar(establecerRecurso(elemento, { url: subido.url, claveAlmacenamiento: subido.clave }));
      })
    );
  }
  // Mismo patrón que `procesarArchivosLienzo`: subidas en paralelo. Si
  // cualquiera falla, `Promise.all` rechaza antes de que `guardarPresupuesto`
  // llegue a persistir nada — no queda ninguna referencia a medio sustituir
  // en Mongo (el documento nunca se escribe si esta función lanza).
  await Promise.all(subidas);
  return copia;
}

/**
 * Borra del almacenamiento externo los recursos que estaban en `antes`
 * pero ya no están en `despues` (por `claveAlmacenamiento`) — evita
 * acumular archivos huérfanos cuando se quita una imagen de un documento
 * sin borrar el documento entero. Mismo criterio que
 * `borrarBlobsHuerfanos`/`borrarArchivosLienzoHuerfanos`, generalizado a
 * cualquier tipo de elemento registrado con recurso.
 */
export async function borrarRecursosDocumentoHuerfanos(antes: DocumentoMC | null | undefined, despues: DocumentoMC | null | undefined): Promise<void> {
  if (!antes) return;
  const clavesDespues = new Set<string>();
  if (despues) {
    for (const { elemento } of recorrerElementosMC(despues)) {
      const definicion = obtenerTipoElemento(elemento.tipo);
      if (!definicion.contieneRecurso || !definicion.obtenerRecurso) continue;
      const recurso = definicion.obtenerRecurso(elemento);
      if (recurso?.claveAlmacenamiento) clavesDespues.add(recurso.claveAlmacenamiento);
    }
  }
  for (const { elemento } of recorrerElementosMC(antes)) {
    const definicion = obtenerTipoElemento(elemento.tipo);
    if (!definicion.contieneRecurso || !definicion.obtenerRecurso) continue;
    const recurso = definicion.obtenerRecurso(elemento);
    if (recurso?.claveAlmacenamiento && !clavesDespues.has(recurso.claveAlmacenamiento)) {
      await almacenamiento.borrar(recurso.claveAlmacenamiento).catch(() => {});
    }
  }
}
