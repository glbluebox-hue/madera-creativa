import pino from 'pino';

/**
 * Logger estructurado único de la aplicación (Incremento 1.4) — JSON por
 * stdout siempre, sin agregación ni almacenamiento propio (eso es el
 * Incremento 1.6). `redact` es una defensa adicional, no la única: ningún
 * punto del código debe registrar voluntariamente contraseñas, tokens,
 * cookies o cabeceras de autorización — si algo se filtrara aquí por error,
 * queda oculto igualmente.
 */
export const logger = pino({
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'token',
      '*.token',
      'accessToken',
      '*.accessToken',
      'refreshToken',
      '*.refreshToken',
    ],
    censor: '[REDACTADO]',
  },
});
