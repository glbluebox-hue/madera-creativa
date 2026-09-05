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

  /**
   * Deriva la clave interna a partir de una URL FIRMADA del bucket privado
   * (la que devolvía `generarUrlTemporal()` antes de servir facturas
   * privadas por proxy propio), o `null` si la URL no tiene esa forma.
   * Bug real, 29/08/2026: `guardarFactura` guardaba antes esa URL firmada
   * (con TTL de 15 min) directamente en `Factura.imagen` en vez de la
   * clave — cualquier reguardado posterior perdía la clave para siempre
   * (ver `presupuestos-service.ts`, `guardarFactura`). Esto permite
   * recuperar la clave real de las facturas ya afectadas a partir del
   * literal que quedó guardado, sin necesidad de un script de migración.
   */
  claveDesdeUrlPrivada(url: string): string | null;

  /**
   * Recupera el contenido de un archivo por su clave interna, o `null` si no
   * existe. Solo lo usa `GET /almacenamiento/:carpeta/:id` — la ruta que
   * sirve los archivos de `AlmacenamientoMemoria` (que no tiene una URL
   * pública real). `AlmacenamientoR2` ya devuelve URLs públicas directamente
   * servibles desde `subir()`, así que esta ruta nunca se ejercita para R2 en
   * la práctica, pero implementa el método igualmente por completitud del
   * contrato.
   */
  obtener(clave: string): Promise<{ datos: Buffer; contentType: string } | null>;

  /**
   * Genera una URL temporal (firmada) para leer un archivo privado, válida
   * `ttlSegundos` (por defecto 900 = 15 min). Solo tiene sentido para
   * archivos subidos a un almacenamiento privado (Incremento "Facturas
   * privadas") — `AlmacenamientoMemoria` devuelve simplemente su URL
   * relativa de siempre, ya que en desarrollo no hay nada real que firmar.
   */
  generarUrlTemporal(clave: string, ttlSegundos?: number): Promise<string>;

  /**
   * Tamaño en bytes de un archivo ya subido, o `null` si no existe — SIN
   * descargar su contenido (`obtener()` sí lo descarga entero; usarlo solo
   * para conocer un tamaño desperdiciaría ancho de banda en un archivo que
   * puede pesar megabytes). Pensado para el backfill de cuota de
   * almacenamiento (05/09/2026): documentos guardados antes de esa función
   * tienen la clave del archivo pero no su tamaño, y hace falta
   * reconstruirlo sin volver a tocar el archivo en sí.
   */
  obtenerTamano(clave: string): Promise<number | null>;

  /**
   * Asegura que el bucket PÚBLICO tiene una política CORS que permite leer
   * sus archivos vía `fetch()` desde el navegador, solo para los orígenes
   * indicados (Incremento "Diseño 3D", 30/08/2026). Hasta ahora nunca hacía
   * falta: fotos/adjuntos/logos se consumen con `<img src=...>` o
   * `<a href=...>`, que no necesitan CORS. El visor 3D
   * (`@google/model-viewer`) es la primera pieza que necesita leer el
   * archivo con JavaScript (para subirlo a la GPU vía WebGL), y eso SÍ
   * exige que el bucket responda con cabeceras
   * `Access-Control-Allow-Origin` — sin ellas, `fetch()` falla en el
   * navegador con `TypeError: Failed to fetch` aunque la URL cargue bien si
   * se abre directamente (confirmado en vivo 30/08/2026: cabeceras de la
   * respuesta sin ningún `Access-Control-*`). Idempotente — se puede llamar
   * en cada arranque sin efecto secundario. No hace nada en
   * `AlmacenamientoMemoria` (no hay bucket real que configurar).
   * @param origenes Lista de orígenes exactos a autorizar (nunca `'*'` — los
   *   mismos que ya aceptan CORS/CSP para la API, ver `ALLOWED_ORIGINS`).
   */
  asegurarCorsPublico(origenes: string[]): Promise<void>;
}
