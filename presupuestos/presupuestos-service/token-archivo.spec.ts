import { firmarTokenArchivo, verificarTokenArchivo } from './token.service.js';

/**
 * Token de archivo privado (incidencia real, 29/08/2026 — R2 devolviendo
 * 503 de forma intermitente a peticiones directas del navegador tanto al
 * dominio público como a una URL firmada de R2). Este token sustituye la
 * URL firmada de R2 para las facturas privadas: el servidor lo firma solo
 * para una `clave` ya verificada como propiedad del usuario, y la ruta
 * `/almacenamiento-privado` lo vuelve a verificar antes de servir el
 * archivo — nunca confía en una clave que venga directamente del cliente.
 */

beforeAll(() => {
  process.env.JWT_SECRET = 'secreto-de-pruebas-suficientemente-largo-1234567890';
});

describe('firmarTokenArchivo / verificarTokenArchivo', () => {
  it('un token recién firmado se verifica y devuelve la misma clave', () => {
    const token = firmarTokenArchivo('facturas-privado/abc-123');
    expect(verificarTokenArchivo(token)).toBe('facturas-privado/abc-123');
  });

  it('un token caducado no se verifica', () => {
    const token = firmarTokenArchivo('facturas-privado/abc-123', -1); // ya caducado al firmarlo
    expect(verificarTokenArchivo(token)).toBeNull();
  });

  it('un token manipulado (payload alterado sin volver a firmar) no se verifica', () => {
    const token = firmarTokenArchivo('facturas-privado/abc-123');
    const partes = token.split('.');
    // Se cambia el payload (segunda parte) por uno que reclama otra clave, sin volver a firmar.
    const payloadFalso = Buffer.from(JSON.stringify({ clave: 'facturas-privado/otra-factura-ajena' })).toString('base64url');
    const tokenManipulado = `${partes[0]}.${payloadFalso}.${partes[2]}`;
    expect(verificarTokenArchivo(tokenManipulado)).toBeNull();
  });

  it('un token firmado con un secreto distinto (forjado sin conocer JWT_SECRET) no se verifica', () => {
    // Simula que alguien sin el secreto real intenta fabricar su propio token para una clave ajena.
    process.env.JWT_SECRET = 'otro-secreto-completamente-distinto-0987654321';
    const tokenForjado = firmarTokenArchivo('facturas-privado/factura-de-otro-usuario');
    process.env.JWT_SECRET = 'secreto-de-pruebas-suficientemente-largo-1234567890'; // se restaura el secreto real
    expect(verificarTokenArchivo(tokenForjado)).toBeNull();
  });

  it('un texto que no es un JWT en absoluto no se verifica (y no lanza)', () => {
    expect(verificarTokenArchivo('esto-no-es-un-token')).toBeNull();
  });
});
