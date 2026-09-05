import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AlmacenamientoArchivos, ResultadoSubida } from './almacenamiento-archivos.js';
import { logger } from './logger.service.js';

/**
 * Implementación real de `AlmacenamientoArchivos` contra Cloudflare R2
 * (Incremento 1.7). Único archivo del proyecto que importa el SDK de S3 —
 * R2 expone una API compatible con S3, así que el SDK oficial de AWS
 * funciona sin cambios apuntando al endpoint de R2. Ningún otro módulo debe
 * importar `@aws-sdk/client-s3` directamente.
 *
 * Bucket privado de facturas (Incremento "Facturas privadas", 27/08/2026):
 * el bucket histórico (`bucket`/`urlPublicaBase`) sigue sirviendo fotos,
 * adjuntos, logos, firmas y dibujos con URL pública permanente — sin
 * cambios, fuera de alcance de este incremento. Las facturas nuevas
 * (`carpeta === 'facturas'`) suben, si está configurado, a un SEGUNDO
 * bucket (`bucketFacturas`) que nunca tiene acceso público activado — no
 * hay ninguna URL pública que construir para él, solo URLs firmadas
 * temporales (`generarUrlTemporal`). Si `bucketFacturas` no está
 * configurado (variable de entorno ausente), las facturas siguen subiendo
 * al bucket histórico exactamente como antes — la función es puramente
 * aditiva, nunca rompe el comportamiento si no se ha creado el bucket nuevo.
 *
 * Credenciales separadas por bucket (petición explícita del usuario,
 * 27/08/2026): el bucket privado de facturas usa su PROPIO token de R2,
 * con permiso de lectura/escritura limitado ÚNICAMENTE a ese bucket
 * (principio de menor privilegio) — una fuga de las credenciales generales
 * (que sí tienen acceso al bucket público de fotos/adjuntos/logos) nunca
 * debe poder tocar las facturas, y viceversa. Si no se indican credenciales
 * dedicadas, se reutilizan las generales — compatible con quien prefiera un
 * único token con permiso sobre los dos buckets.
 */
export class AlmacenamientoR2 implements AlmacenamientoArchivos {
  private cliente: S3Client;
  private clienteFacturas: S3Client;
  private bucket: string;
  private bucketFacturas: string | null;
  private urlPublicaBase: string;

  constructor(opciones: {
    accountId: string; accessKeyId: string; secretAccessKey: string;
    bucket: string; urlPublicaBase: string;
    bucketFacturas?: string;
    accessKeyIdFacturas?: string; secretAccessKeyFacturas?: string;
  }) {
    const endpoint = `https://${opciones.accountId}.r2.cloudflarestorage.com`;
    // `forcePathStyle: true` es imprescindible con R2, no cosmético: sin él,
    // el SDK de AWS construye por defecto una URL "virtual-hosted-style"
    // (el bucket como subdominio, `https://<bucket>.<cuenta>.r2...`) — un
    // formato que R2 NO soporta en su endpoint de cuenta (solo entiende el
    // bucket como primer segmento de la ruta). Para `subir()`/`borrar()` el
    // fallo pasaba desapercibido (el SDK sabe internamente a qué apunta,
    // pese al host "raro"), pero `generarUrlTemporal()` expone esa URL tal
    // cual al navegador — ahí sí es visible: "no carga la imagen" (bug
    // real, 27/08/2026, encontrado tras el primer despliegue del bucket
    // privado de facturas).
    this.cliente = new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: opciones.accessKeyId, secretAccessKey: opciones.secretAccessKey },
    });
    this.clienteFacturas = opciones.accessKeyIdFacturas && opciones.secretAccessKeyFacturas
      ? new S3Client({
          region: 'auto',
          endpoint,
          forcePathStyle: true,
          credentials: { accessKeyId: opciones.accessKeyIdFacturas, secretAccessKey: opciones.secretAccessKeyFacturas },
        })
      : this.cliente;
    this.bucket = opciones.bucket;
    this.bucketFacturas = opciones.bucketFacturas || null;
    this.urlPublicaBase = opciones.urlPublicaBase.replace(/\/$/, '');
  }

  /**
   * Prefijo de clave EXCLUSIVO del bucket privado — a propósito distinto de
   * `'facturas'` (la carpeta lógica que ya usaban las facturas del bucket
   * público desde antes de este incremento). Bug real, 27/08/2026: antes
   * de este prefijo separado, `destinoParaClave()` decidía el bucket
   * mirando solo el nombre de la carpeta ("facturas") — como las facturas
   * ANTIGUAS (bucket público) usan esa misma carpeta, en cuanto
   * `R2_BUCKET_NAME_FACTURAS` quedó configurado, CUALQUIER clave
   * `facturas/<uuid>` (antigua o nueva) se buscaba en el bucket privado,
   * rompiendo la visualización de todas las facturas ya existentes de
   * golpe. Con un prefijo distinto para lo nuevo, la propia clave dice sin
   * ambigüedad a qué bucket pertenece, sin depender de la configuración
   * actual.
   */
  private static readonly PREFIJO_FACTURAS_PRIVADO = 'facturas-privado';

  /** Cliente + bucket + prefijo de clave a usar al SUBIR algo nuevo a una `carpeta` lógica — ver comentario de la clase. */
  private destinoParaCarpeta(carpeta: string): { cliente: S3Client; bucket: string; clavePrefijo: string } {
    if (carpeta === 'facturas' && this.bucketFacturas) {
      return { cliente: this.clienteFacturas, bucket: this.bucketFacturas, clavePrefijo: AlmacenamientoR2.PREFIJO_FACTURAS_PRIVADO };
    }
    return { cliente: this.cliente, bucket: this.bucket, clavePrefijo: carpeta };
  }

  /** Cliente + bucket a partir de una clave YA EXISTENTE — para `borrar()`/`generarUrlTemporal()`/`obtener()`. Mira el prefijo real de la clave, nunca la configuración actual (ver comentario de `PREFIJO_FACTURAS_PRIVADO`). */
  private destinoParaClave(clave: string): { cliente: S3Client; bucket: string } {
    const prefijo = clave.split('/')[0] ?? '';
    if (prefijo === AlmacenamientoR2.PREFIJO_FACTURAS_PRIVADO && this.bucketFacturas) {
      return { cliente: this.clienteFacturas, bucket: this.bucketFacturas };
    }
    return { cliente: this.cliente, bucket: this.bucket };
  }

  async subir(datos: Buffer, opciones: { contentType: string; carpeta: string }): Promise<ResultadoSubida> {
    const { cliente, bucket, clavePrefijo } = this.destinoParaCarpeta(opciones.carpeta);
    const clave = `${clavePrefijo}/${randomUUID()}`;
    await cliente.send(new PutObjectCommand({
      Bucket: bucket,
      Key: clave,
      Body: datos,
      ContentType: opciones.contentType,
    }));
    // Un objeto del bucket privado de facturas no tiene URL pública real —
    // se deja vacía; quien llama debe guardar `clave` y pedir
    // `generarUrlTemporal()` cada vez que necesite mostrarlo (ver
    // `resolverUrlsFactura` en `presupuestos-service.ts`).
    const esPrivado = bucket === this.bucketFacturas;
    return {
      url: esPrivado ? '' : `${this.urlPublicaBase}/${clave}`,
      clave,
      metadatos: { tamano: datos.length, tipoMime: opciones.contentType, subidoEn: new Date().toISOString() },
    };
  }

  async borrar(clave: string): Promise<void> {
    const { cliente, bucket } = this.destinoParaClave(clave);
    await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: clave }));
  }

  claveDesdeUrl(url: string): string | null {
    const prefijo = `${this.urlPublicaBase}/`;
    return url.startsWith(prefijo) ? url.slice(prefijo.length) : null;
  }

  /** Ver contrato en `AlmacenamientoArchivos.claveDesdeUrlPrivada`. */
  claveDesdeUrlPrivada(url: string): string | null {
    if (!this.bucketFacturas) return null;
    let analizada: URL;
    try {
      analizada = new URL(url);
    } catch {
      return null;
    }
    const prefijo = `/${this.bucketFacturas}/`;
    return analizada.pathname.startsWith(prefijo) ? decodeURIComponent(analizada.pathname.slice(prefijo.length)) : null;
  }

  /** TTL por defecto — 15 minutos: suficiente para abrir/revisar/descargar una factura, corto para acotar la exposición si la URL se filtrase (captura de pantalla, historial del navegador…). */
  async generarUrlTemporal(clave: string, ttlSegundos = 900): Promise<string> {
    const { cliente, bucket } = this.destinoParaClave(clave);
    const comando = new GetObjectCommand({ Bucket: bucket, Key: clave });
    return getSignedUrl(cliente, comando, { expiresIn: ttlSegundos });
  }

  /**
   * Nunca se ejercita en la práctica para el bucket público — `subir()` ya
   * devuelve una URL pública de R2 directamente servible para él, así que
   * el frontend nunca pasa por `GET /almacenamiento/...` en ese caso. Sí
   * podría usarse para el bucket privado de facturas si en el futuro hiciera
   * falta un proxy autenticado en vez de una URL firmada — implementado por
   * completitud del contrato de `AlmacenamientoArchivos`.
   */
  async obtener(clave: string): Promise<{ datos: Buffer; contentType: string } | null> {
    try {
      const { cliente, bucket } = this.destinoParaClave(clave);
      const respuesta = await cliente.send(new GetObjectCommand({ Bucket: bucket, Key: clave }));
      const trozos: Buffer[] = [];
      for await (const trozo of respuesta.Body as AsyncIterable<Buffer>) trozos.push(Buffer.from(trozo));
      return { datos: Buffer.concat(trozos), contentType: respuesta.ContentType ?? 'application/octet-stream' };
    } catch {
      return null;
    }
  }

  /**
   * Ver contrato en `AlmacenamientoArchivos.obtenerTamano` — `HeadObject`,
   * nunca `GetObject`: consulta solo los metadatos, sin descargar el
   * archivo entero (que `obtener()` sí hace). `null` tanto si no existe
   * como ante cualquier otro fallo (permiso, red) — el backfill que lo usa
   * ya trata `null` como "no se ha podido calcular, dejar para revisión
   * manual", nunca como "el archivo pesa 0 bytes".
   */
  async obtenerTamano(clave: string): Promise<number | null> {
    try {
      const { cliente, bucket } = this.destinoParaClave(clave);
      const respuesta = await cliente.send(new HeadObjectCommand({ Bucket: bucket, Key: clave }));
      return respuesta.ContentLength ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Ver contrato en `AlmacenamientoArchivos.asegurarCorsPublico`. Solo toca
   * el bucket PÚBLICO (fotos/adjuntos/logos/dibujos/modelos3d) — nunca el
   * privado de facturas, que no se lee nunca por `fetch()` desde el
   * navegador (siempre URLs firmadas de un solo uso, nunca cacheadas por
   * WebGL). Restringido a los orígenes recibidos (nunca `'*'`) — los mismos
   * que ya autoriza CORS/CSP para la propia API (`ALLOWED_ORIGINS`), para no
   * abrir la lectura del bucket a cualquier sitio web. Solo `GET`/`HEAD`;
   * nunca se necesita escribir desde el navegador.
   */
  async asegurarCorsPublico(origenes: string[]): Promise<void> {
    if (origenes.length === 0) return;
    try {
      await this.cliente.send(new PutBucketCorsCommand({
        Bucket: this.bucket,
        CORSConfiguration: {
          CORSRules: [{
            AllowedOrigins: origenes,
            AllowedMethods: ['GET', 'HEAD'],
            AllowedHeaders: ['*'],
            MaxAgeSeconds: 3600,
          }],
        },
      }));
    } catch (err) {
      // No debe tumbar el arranque del servidor: si el token de R2 no tiene
      // permiso de administración del bucket (solo lectura/escritura de
      // objetos), esto fallará siempre — se avisa alto y claro en los logs
      // en vez de reintentar en bucle o crashear.
      logger.warn({ err, bucket: this.bucket }, 'No se pudo configurar CORS en el bucket público de R2 — el visor 3D (y cualquier otra lectura por fetch()) puede fallar hasta configurarlo a mano en el dashboard de Cloudflare (R2 → bucket → Settings → CORS Policy).');
    }
  }
}
