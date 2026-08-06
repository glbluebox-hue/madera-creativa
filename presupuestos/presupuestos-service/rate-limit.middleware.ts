import { rateLimit } from 'express-rate-limit';

/**
 * Límite general para toda la API: protege contra abuso masivo sin afectar
 * el uso normal de la app (una sesión activa hace, como mucho, unas pocas
 * decenas de peticiones por minuto).
 */
export const limitadorGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Límite estricto para las rutas de autenticación (`/auth/login`,
 * `/auth/registrar`). Objetivo: frenar fuerza bruta y credential stuffing
 * sin bloquear a un usuario legítimo que falla la contraseña un par de veces.
 */
export const limitadorAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Inténtalo de nuevo en unos minutos.' },
});
