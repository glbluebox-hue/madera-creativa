import { randomUUID } from 'node:crypto';
import type { AlmacenamientoArchivos, ResultadoSubida } from './almacenamiento-archivos.js';

/**
 * Implementación de prueba de `AlmacenamientoArchivos` — guarda los
 * archivos en memoria, sin ningún proveedor externo (Incremento 1.7).
 * Pensada para validar el flujo completo (subida, borrado, actualización,
 * idempotencia, sustitución de URLs) antes de usar credenciales reales de
 * Cloudflare R2, y como valor por defecto si esas credenciales no están
 * configuradas — para que el servicio nunca falle por su ausencia fuera de
 * producción.
 */
export class AlmacenamientoMemoria implements AlmacenamientoArchivos {
  private archivos = new Map<string, { datos: Buffer; contentType: string }>();

  async subir(datos: Buffer, opciones: { contentType: string; carpeta: string }): Promise<ResultadoSubida> {
    const clave = `${opciones.carpeta}/${randomUUID()}`;
    this.archivos.set(clave, { datos, contentType: opciones.contentType });
    return {
      url: `memoria://${clave}`,
      clave,
      metadatos: { tamano: datos.length, tipoMime: opciones.contentType, subidoEn: new Date().toISOString() },
    };
  }

  async borrar(clave: string): Promise<void> {
    this.archivos.delete(clave);
  }

  claveDesdeUrl(url: string): string | null {
    const prefijo = 'memoria://';
    return url.startsWith(prefijo) ? url.slice(prefijo.length) : null;
  }

  /** Solo para pruebas: comprueba si una clave sigue almacenada. */
  existe(clave: string): boolean {
    return this.archivos.has(clave);
  }

  /** Solo para pruebas: número de archivos actualmente almacenados. */
  get tamano(): number {
    return this.archivos.size;
  }
}
