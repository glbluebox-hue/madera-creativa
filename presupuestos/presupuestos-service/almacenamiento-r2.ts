import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { AlmacenamientoArchivos, ResultadoSubida } from './almacenamiento-archivos.js';

/**
 * Implementación real de `AlmacenamientoArchivos` contra Cloudflare R2
 * (Incremento 1.7). Único archivo del proyecto que importa el SDK de S3 —
 * R2 expone una API compatible con S3, así que el SDK oficial de AWS
 * funciona sin cambios apuntando al endpoint de R2. Ningún otro módulo debe
 * importar `@aws-sdk/client-s3` directamente.
 */
export class AlmacenamientoR2 implements AlmacenamientoArchivos {
  private cliente: S3Client;
  private bucket: string;
  private urlPublicaBase: string;

  constructor(opciones: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; urlPublicaBase: string }) {
    this.cliente = new S3Client({
      region: 'auto',
      endpoint: `https://${opciones.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: opciones.accessKeyId, secretAccessKey: opciones.secretAccessKey },
    });
    this.bucket = opciones.bucket;
    this.urlPublicaBase = opciones.urlPublicaBase.replace(/\/$/, '');
  }

  async subir(datos: Buffer, opciones: { contentType: string; carpeta: string }): Promise<ResultadoSubida> {
    const clave = `${opciones.carpeta}/${randomUUID()}`;
    await this.cliente.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: clave,
      Body: datos,
      ContentType: opciones.contentType,
    }));
    return {
      url: `${this.urlPublicaBase}/${clave}`,
      clave,
      metadatos: { tamano: datos.length, tipoMime: opciones.contentType, subidoEn: new Date().toISOString() },
    };
  }

  async borrar(clave: string): Promise<void> {
    await this.cliente.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: clave }));
  }

  claveDesdeUrl(url: string): string | null {
    const prefijo = `${this.urlPublicaBase}/`;
    return url.startsWith(prefijo) ? url.slice(prefijo.length) : null;
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
