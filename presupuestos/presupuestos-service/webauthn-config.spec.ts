import type express from 'express';
import { rpID, origenEsperado } from './webauthn-config.js';

function peticionCon(origin: string | undefined): express.Request {
  return { headers: { origin } } as unknown as express.Request;
}

describe('webauthn-config (RP ID / origin — acceso biométrico)', () => {
  const nodeEnvOriginal = process.env.NODE_ENV;
  const allowedOriginsOriginal = process.env.ALLOWED_ORIGINS;

  afterEach(() => {
    process.env.NODE_ENV = nodeEnvOriginal;
    process.env.ALLOWED_ORIGINS = allowedOriginsOriginal;
  });

  describe('rpID', () => {
    it('deriva el host del origen ya validado, sin protocolo ni puerto', () => {
      expect(rpID('https://estudio.maderacreativa.com')).toBe('estudio.maderacreativa.com');
      expect(rpID('http://localhost:3042')).toBe('localhost');
    });
  });

  describe('origenEsperado', () => {
    it('acepta un origen de ALLOWED_ORIGINS incluso fuera de producción — así funciona el túnel de pruebas en local', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOWED_ORIGINS = 'https://estudio.maderacreativa.com';
      expect(origenEsperado(peticionCon('https://estudio.maderacreativa.com'))).toBe('https://estudio.maderacreativa.com');
    });

    it('en desarrollo también acepta cualquier puerto de localhost', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOWED_ORIGINS = '';
      expect(origenEsperado(peticionCon('http://localhost:3042'))).toBe('http://localhost:3042');
    });

    it('rechaza un origen que no está ni en ALLOWED_ORIGINS ni es localhost', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOWED_ORIGINS = 'https://estudio.maderacreativa.com';
      expect(origenEsperado(peticionCon('https://impostor.com'))).toBeNull();
    });

    it('en producción exige coincidencia exacta con ALLOWED_ORIGINS y ya no acepta localhost', () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOWED_ORIGINS = 'https://estudio.maderacreativa.com';
      expect(origenEsperado(peticionCon('https://estudio.maderacreativa.com'))).toBe('https://estudio.maderacreativa.com');
      expect(origenEsperado(peticionCon('http://localhost:3042'))).toBeNull();
    });

    it('devuelve null si la petición no trae cabecera Origin', () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOWED_ORIGINS = 'https://estudio.maderacreativa.com';
      expect(origenEsperado(peticionCon(undefined))).toBeNull();
    });
  });
});
