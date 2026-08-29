import { AlmacenamientoR2 } from './almacenamiento-r2.js';

/**
 * `claveDesdeUrlPrivada` (bug real, 29/08/2026): antes de corregir
 * `guardarFactura`, cualquier reguardado de una factura con imagen en el
 * bucket privado borraba `imagenClave`, dejando solo el literal de la URL
 * firmada de R2 en `Factura.imagen` — sin este método, esas facturas ya
 * afectadas se quedarían mostrando esa URL caducada para siempre, aunque el
 * objeto siga existiendo en el bucket. No hace falta una conexión real a R2
 * para probarlo: es solo parseo de URL, así que el cliente S3 nunca llega a
 * usarse.
 */
const almacenamiento = new AlmacenamientoR2({
  accountId: 'cuenta-test',
  accessKeyId: 'x',
  secretAccessKey: 'x',
  bucket: 'madera-creativa-publico',
  urlPublicaBase: 'https://pub-test.r2.dev',
  bucketFacturas: 'madera-creativa-facturas-privado',
});

describe('claveDesdeUrlPrivada', () => {
  it('deriva la clave de una URL firmada real del bucket privado', () => {
    const url = 'https://cuenta.r2.cloudflarestorage.com/madera-creativa-facturas-privado/facturas-privado/815e0e46-83ab-412c-a3ba-4ec2b7d3ffaa?X-Amz-Signature=abc';
    expect(almacenamiento.claveDesdeUrlPrivada(url)).toBe('facturas-privado/815e0e46-83ab-412c-a3ba-4ec2b7d3ffaa');
  });

  it('devuelve null para una URL del bucket público (no es del bucket privado)', () => {
    expect(almacenamiento.claveDesdeUrlPrivada('https://pub-test.r2.dev/facturas/algo.jpg')).toBeNull();
  });

  it('devuelve null para una URL que no es de R2 en absoluto', () => {
    expect(almacenamiento.claveDesdeUrlPrivada('https://ejemplo.com/foo')).toBeNull();
  });

  it('devuelve null para un valor que no es una URL válida (sin lanzar)', () => {
    expect(almacenamiento.claveDesdeUrlPrivada('')).toBeNull();
    expect(almacenamiento.claveDesdeUrlPrivada('no-es-una-url')).toBeNull();
  });

  it('sin bucket privado configurado, siempre devuelve null', () => {
    const sinPrivado = new AlmacenamientoR2({
      accountId: 'cuenta-test', accessKeyId: 'x', secretAccessKey: 'x',
      bucket: 'madera-creativa-publico', urlPublicaBase: 'https://pub-test.r2.dev',
    });
    const url = 'https://cuenta.r2.cloudflarestorage.com/madera-creativa-facturas-privado/facturas-privado/abc';
    expect(sinPrivado.claveDesdeUrlPrivada(url)).toBeNull();
  });
});
