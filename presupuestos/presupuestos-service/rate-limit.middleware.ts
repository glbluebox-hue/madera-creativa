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

/**
 * Límite específico para las rutas que DISPARAN una llamada a IA
 * (`POST /ia/generar`, `POST /ia/herramientas/ejecutar`) — cada una cuesta
 * dinero real (tokens de proveedor), a diferencia del resto de la API. Más
 * estricto que `limitadorGeneral` sin bloquear un uso normal de chat (unas
 * pocas preguntas por minuto).
 *
 * NO se aplica a `GET /ia/generar/:trabajoId` (sondeo) — ver `limitadorSondeoIA`.
 */
export const limitadorIA = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones a la IA. Inténtalo de nuevo en unos minutos.' },
});

/**
 * Límite para `GET /ia/generar/:trabajoId` (Fase 5) — el sondeo de un
 * trabajo asíncrono es una simple consulta en memoria, no una llamada a IA,
 * pero comparte el budget de `limitadorIA` la dejaría agotada casi al
 * instante: una sola generación puede tardar 30-90s y se sondea cada
 * ~1,2s, lo que ya son 25-75 peticiones de sondeo por cada generación real.
 * Confirmado en la Fase 5: con el límite compartido, dos generaciones
 * seguidas agotaban el budget entero y bloqueaban la tercera con 429 antes
 * de que el sondeo pudiera completarse.
 */
export const limitadorSondeoIA = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Inténtalo de nuevo en unos minutos.' },
});
