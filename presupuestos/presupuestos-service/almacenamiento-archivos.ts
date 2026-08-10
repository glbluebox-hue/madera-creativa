/**
 * Interfaz de almacenamiento de archivos (Incremento 1.7) — la lógica de
 * negocio (`presupuestos-service.ts`) depende únicamente de este contrato,
 * nunca de un SDK de proveedor concreto. Cambiar de proveedor en el futuro
 * significa escribir una nueva implementación de esta interfaz, sin tocar
 * ningún método de negocio.
 */

/** Metadatos conservados junto a cada archivo subido, para administración futura. */
export type MetadatosArchivo = {
  tamano: number;
  tipoMime: string;
  /** Fecha ISO de subida al almacenamiento (no la fecha de la foto/documento en sí, que puede ser distinta). */
  subidoEn: string;
};

/** Resultado de subir un archivo. */
export type ResultadoSubida = {
  /** URL pública desde la que se puede servir el archivo. */
  url: string;
  /** Clave interna del proveedor, necesaria para poder borrarlo después. */
  clave: string;
  metadatos: MetadatosArchivo;
};

export interface AlmacenamientoArchivos {
  /**
   * Sube un archivo y devuelve su URL pública, clave interna y metadatos.
   * @param datos Contenido binario del archivo.
   * @param opciones Tipo MIME y carpeta lógica (p. ej. `'fotos'`, `'adjuntos'`).
   */
  subir(datos: Buffer, opciones: { contentType: string; carpeta: string }): Promise<ResultadoSubida>;

  /** Borra un archivo por su clave interna. No debe fallar si ya no existe. */
  borrar(clave: string): Promise<void>;

  /**
   * Deriva la clave interna a partir de una URL devuelta antes por `subir()`,
   * o `null` si la URL no pertenece a este almacenamiento (p. ej. ya era una
   * URL externa de otro proveedor, o un Base64 antiguo). Existe para poder
   * limpiar archivos huérfanos en campos que solo guardan la URL, sin un
   * sitio propio donde conservar la clave por separado (p. ej. `Factura.imagen`).
   */
  claveDesdeUrl(url: string): string | null;
}
