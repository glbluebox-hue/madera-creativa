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
      // No hay CDN externo en memoria — se sirve desde el propio backend
      // mediante `GET /almacenamiento/:carpeta/:id` (ver `obtener()` más
      // abajo). Ruta relativa con el mismo prefijo `/api/presupuestos-service`
      // que usa el resto del frontend para llegar a este servicio, tanto en
      // el proxy de Vite en desarrollo como a través del túnel en producción.
      url: `/api/presupuestos-service/almacenamiento/${clave}`,
      clave,
      metadatos: { tamano: datos.length, tipoMime: opciones.contentType, subidoEn: new Date().toISOString() },
    };
  }

  async borrar(clave: string): Promise<void> {
    this.archivos.delete(clave);
  }

  claveDesdeUrl(url: string): string | null {
    const prefijo = '/api/presupuestos-service/almacenamiento/';
    if (url.startsWith(prefijo)) return url.slice(prefijo.length);
    // Compatibilidad con documentos guardados antes de servir estas URLs por
    // HTTP (esquema interno `memoria://`, nunca servible desde el navegador).
    const prefijoAntiguo = 'memoria://';
    return url.startsWith(prefijoAntiguo) ? url.slice(prefijoAntiguo.length) : null;
  }

  /** En desarrollo nunca se generan URLs firmadas de bucket privado. */
  claveDesdeUrlPrivada(): string | null {
    return null;
  }

  async obtener(clave: string): Promise<{ datos: Buffer; contentType: string } | null> {
    const archivo = this.archivos.get(clave);
    return archivo ? { datos: archivo.datos, contentType: archivo.contentType } : null;
  }

  /** En desarrollo no hay nada real que firmar — la propia URL relativa ya solo la sirve este backend. */
  async generarUrlTemporal(clave: string): Promise<string> {
    return `/api/presupuestos-service/almacenamiento/${clave}`;
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
