import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AlmacenamientoArchivos, ResultadoSubida } from './almacenamiento-archivos.js';

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
 */
export class AlmacenamientoR2 implements AlmacenamientoArchivos {
  private cliente: S3Client;
  private bucket: string;
  private bucketFacturas: string | null;
  private urlPublicaBase: string;

  constructor(opciones: {
    accountId: string; accessKeyId: string; secretAccessKey: string;
    bucket: string; urlPublicaBase: string; bucketFacturas?: string;
  }) {
    this.cliente = new S3Client({
      region: 'auto',
      endpoint: `https://${opciones.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: opciones.accessKeyId, secretAccessKey: opciones.secretAccessKey },
    });
    this.bucket = opciones.bucket;
    this.bucketFacturas = opciones.bucketFacturas || null;
    this.urlPublicaBase = opciones.urlPublicaBase.replace(/\/$/, '');
  }

  /** A qué bucket real pertenece una `carpeta` lógica — ver comentario de la clase. */
  private bucketParaCarpeta(carpeta: string): string {
    return carpeta === 'facturas' && this.bucketFacturas ? this.bucketFacturas : this.bucket;
  }

  /** Deriva el bucket de una clave ya existente (`<carpeta>/<uuid>`) — para `borrar()`/`generarUrlTemporal()`, que no reciben la carpeta por separado. */
  private bucketParaClave(clave: string): string {
    return this.bucketParaCarpeta(clave.split('/')[0] ?? '');
  }

  async subir(datos: Buffer, opciones: { contentType: string; carpeta: string }): Promise<ResultadoSubida> {
    const clave = `${opciones.carpeta}/${randomUUID()}`;
    const bucket = this.bucketParaCarpeta(opciones.carpeta);
    await this.cliente.send(new PutObjectCommand({
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
    await this.cliente.send(new DeleteObjectCommand({ Bucket: this.bucketParaClave(clave), Key: clave }));
  }

  claveDesdeUrl(url: string): string | null {
    const prefijo = `${this.urlPublicaBase}/`;
    return url.startsWith(prefijo) ? url.slice(prefijo.length) : null;
  }

  /** TTL por defecto — 15 minutos: suficiente para abrir/revisar/descargar una factura, corto para acotar la exposición si la URL se filtrase (captura de pantalla, historial del navegador…). */
  async generarUrlTemporal(clave: string, ttlSegundos = 900): Promise<string> {
    const comando = new GetObjectCommand({ Bucket: this.bucketParaClave(clave), Key: clave });
    return getSignedUrl(this.cliente, comando, { expiresIn: ttlSegundos });
  }

  /**
   * Nunca se ejercita en la práctica — `subir()` ya devuelve una URL pública
   * de R2 directamente servible, así que el frontend nunca pasa por
   * `GET /almacenamiento/...` para un archivo subido a R2. Implementado por
   * completitud del contrato de `AlmacenamientoArchivos`.
   */
  async obtener(clave: string): Promise<{ datos: Buffer; contentType: string } | null> {
    try {
      const respuesta = await this.cliente.send(new GetObjectCommand({ Bucket: this.bucket, Key: clave }));
      const trozos: Buffer[] = [];
      for await (const trozo of respuesta.Body as AsyncIterable<Buffer>) trozos.push(Buffer.from(trozo));
      return { datos: Buffer.concat(trozos), contentType: respuesta.ContentType ?? 'application/octet-stream' };
    } catch {
      return null;
    }
  }
}
