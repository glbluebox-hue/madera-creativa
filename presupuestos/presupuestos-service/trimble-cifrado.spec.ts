import { cifrar, descifrar, ErrorClaveCifradoNoConfigurada, ErrorDescifrado } from './trimble-cifrado.js';

/**
 * Cifrado del refresh token de Trimble (Fase "Diseño 3D", 30/08/2026) —
 * nunca se guarda un secreto de un proveedor externo en claro. AES-256-GCM,
 * autenticado (detecta manipulación, no solo la descifra mal).
 */

const CLAVE_ORIGINAL = process.env.TRIMBLE_TOKEN_ENCRYPTION_KEY;

beforeEach(() => { process.env.TRIMBLE_TOKEN_ENCRYPTION_KEY = 'clave-de-pruebas-no-real-1234567890'; });
afterAll(() => { process.env.TRIMBLE_TOKEN_ENCRYPTION_KEY = CLAVE_ORIGINAL; });

describe('cifrar/descifrar', () => {
  it('round-trip: lo que se cifra se recupera exacto', () => {
    const original = 'refresh-token-real-de-trimble-abc123';
    expect(descifrar(cifrar(original))).toBe(original);
  });

  it('dos cifrados del mismo texto son distintos (IV aleatorio) pero ambos descifran igual', () => {
    const a = cifrar('mismo-texto');
    const b = cifrar('mismo-texto');
    expect(a).not.toBe(b);
    expect(descifrar(a)).toBe('mismo-texto');
    expect(descifrar(b)).toBe('mismo-texto');
  });

  it('un dato manipulado (un carácter cambiado) falla al descifrar en vez de devolver basura silenciosamente', () => {
    const cifrado = cifrar('dato-sensible');
    const manipulado = cifrado.slice(0, -4) + 'AAAA';
    expect(() => descifrar(manipulado)).toThrow(ErrorDescifrado);
  });

  it('un formato inválido (sin las 3 partes iv:tag:datos) se rechaza explícitamente', () => {
    expect(() => descifrar('esto-no-es-un-dato-cifrado-valido')).toThrow(ErrorDescifrado);
  });

  it('sin TRIMBLE_TOKEN_ENCRYPTION_KEY configurada, lanza un error explícito en vez de cifrar con una clave por defecto', () => {
    delete process.env.TRIMBLE_TOKEN_ENCRYPTION_KEY;
    expect(() => cifrar('algo')).toThrow(ErrorClaveCifradoNoConfigurada);
  });

  it('descifrar con una clave distinta a la que cifró falla (nunca descifra "a medias")', () => {
    const cifrado = cifrar('secreto');
    process.env.TRIMBLE_TOKEN_ENCRYPTION_KEY = 'otra-clave-completamente-distinta';
    expect(() => descifrar(cifrado)).toThrow(ErrorDescifrado);
  });
});
