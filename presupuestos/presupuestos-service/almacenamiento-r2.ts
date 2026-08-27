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
    this.cliente = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId: opciones.accessKeyId, secretAccessKey: opciones.secretAccessKey },
    });
    this.clienteFacturas = opciones.accessKeyIdFacturas && opciones.secretAccessKeyFacturas
      ? new S3Client({
          region: 'auto',
          endpoint,
          credentials: { accessKeyId: opciones.accessKeyIdFacturas, secretAccessKey: opciones.secretAccessKeyFacturas },
        })
      : this.cliente;
    this.bucket = opciones.bucket;
    this.bucketFacturas = opciones.bucketFacturas || null;
    this.urlPublicaBase = opciones.urlPublicaBase.replace(/\/$/, '');
  }

  /** Cliente + bucket real a usar para una `carpeta` lógica — ver comentario de la clase. */
  private destinoParaCarpeta(carpeta: string): { cliente: S3Client; bucket: string } {
    if (carpeta === 'facturas' && this.bucketFacturas) {
      return { cliente: this.clienteFacturas, bucket: this.bucketFacturas };
    }
    return { cliente: this.cliente, bucket: this.bucket };
  }

  /** Igual que `destinoParaCarpeta`, pero a partir de una clave ya existente (`<carpeta>/<uuid>`) — para `borrar()`/`generarUrlTemporal()`/`obtener()`, que no reciben la carpeta por separado. */
  private destinoParaClave(clave: string): { cliente: S3Client; bucket: string } {
    return this.destinoParaCarpeta(clave.split('/')[0] ?? '');
  }

  async subir(datos: Buffer, opciones: { contentType: string; carpeta: string }): Promise<ResultadoSubida> {
    const clave = `${opciones.carpeta}/${randomUUID()}`;
    const { cliente, bucket } = this.destinoParaCarpeta(opciones.carpeta);
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
}
