import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * Cifrado en reposo del refresh token de Trimble (Fase "Diseño 3D /
 * SketchUp", 30/08/2026) — primer secreto de un proveedor externo que
 * este backend guarda a largo plazo (a diferencia de `OPENAI_API_KEY`,
 * que es nuestro, no del usuario). AES-256-GCM con una clave derivada de
 * `TRIMBLE_TOKEN_ENCRYPTION_KEY` (variable de entorno, nunca en el
 * repo) — nunca se guarda el refresh token en claro en Mongo.
 *
 * Formato guardado: `iv:tag:datosCifrados`, todo en base64, en un único
 * string — así el documento de Mongo solo tiene un campo de texto, sin
 * estructura adicional que mantener.
 */

const ALGORITMO = 'aes-256-gcm';

/** Se lanza si `TRIMBLE_TOKEN_ENCRYPTION_KEY` no está configurada — el llamante decide cómo responder (nunca se cifra/descifra con una clave por defecto). */
export class ErrorClaveCifradoNoConfigurada extends Error {
  constructor() {
    super('TRIMBLE_TOKEN_ENCRYPTION_KEY no está configurada.');
  }
}

function obtenerClave(): Buffer {
  const raw = process.env.TRIMBLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new ErrorClaveCifradoNoConfigurada();
  // SHA-256 del valor de entorno -> siempre 32 bytes exactos, sea cual sea
  // la longitud del secreto que se haya generado (evita exigir un formato
  // hexadecimal/base64 concreto al configurarla).
  return createHash('sha256').update(raw).digest();
}

export function cifrar(textoPlano: string): string {
  const iv = randomBytes(12); // 96 bits, tamaño recomendado para GCM
  const cifrador = createCipheriv(ALGORITMO, obtenerClave(), iv);
  const cifrado = Buffer.concat([cifrador.update(textoPlano, 'utf8'), cifrador.final()]);
  const tag = cifrador.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${cifrado.toString('base64')}`;
}

/** Se lanza si el texto cifrado no tiene el formato esperado o la autenticación GCM falla (clave equivocada, dato corrompido o manipulado). */
export class ErrorDescifrado extends Error {}

export function descifrar(textoCifrado: string): string {
  const partes = textoCifrado.split(':');
  if (partes.length !== 3) throw new ErrorDescifrado('Formato de dato cifrado inválido.');
  const [ivB64, tagB64, datosB64] = partes;
  try {
    const descifrador = createDecipheriv(ALGORITMO, obtenerClave(), Buffer.from(ivB64, 'base64'));
    descifrador.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plano = Buffer.concat([descifrador.update(Buffer.from(datosB64, 'base64')), descifrador.final()]);
    return plano.toString('utf8');
  } catch (err) {
    if (err instanceof ErrorClaveCifradoNoConfigurada) throw err;
    throw new ErrorDescifrado('No se pudo descifrar el dato — clave equivocada o dato corrompido.');
  }
}
