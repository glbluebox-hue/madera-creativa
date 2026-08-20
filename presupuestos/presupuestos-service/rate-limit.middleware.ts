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
 * Límite para el login biométrico (WebAuthn) — deliberadamente más generoso
 * que `limitadorAuth`. Ese límite (10/15min) está pensado para frenar fuerza
 * bruta de contraseña, donde cada intento es barato de automatizar; una
 * aserción WebAuthn exige posesión física del autenticador del dispositivo,
 * así que no hay fuerza bruta real que frenar aquí. Además cada intento de
 * login biométrico cuesta DOS peticiones (`/login/opciones` +
 * `/login/verificar`), así que compartir el budget de 10 con el de
 * contraseña deja solo 4-5 intentos reales antes de bloquear al usuario
 * legítimo durante 15 minutos — confirmado en producción: varios reintentos
 * normales del usuario agotaron el budget compartido y le dejaron sin poder
 * entrar con huella, aunque la credencial en sí era válida.
 */
export const limitadorWebAuthnLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
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

/**
 * Ver un presupuesto público (Portal del cliente) — por IP, generoso: la
 * vista previa de enlaces de WhatsApp/redes la dispara automáticamente
 * (bots que "visitan" el enlace para generar la miniatura), y eso no debe
 * agotar el cupo del cliente real.
 */
export const limitadorPortalVer = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Inténtalo de nuevo en unos minutos.' },
});

/**
 * Aceptar un presupuesto público — por TOKEN, no por IP: el cliente firma
 * desde el móvil, casi siempre detrás de CGNAT (IP compartida con otros
 * clientes de la misma operadora) — un límite por IP bloquearía a
 * desconocidos entre sí. Un cupo bajo por token es suficiente: aceptar es
 * una sola acción, no algo que se reintente decenas de veces de forma
 * legítima.
 */
export const limitadorPortalAceptar = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.params.token || req.ip),
  message: { error: 'Demasiados intentos. Inténtalo de nuevo en unos minutos.' },
});

/**
 * Resolver un enlace de solicitud de reseña (`GET /resena/:token`) — por
 * IP, generoso como `limitadorPortalVer`: el enlace se comparte en un QR
 * físico o por WhatsApp, y una vista previa de enlace también dispara esta
 * ruta sin que sea el cliente real escaneando. No hay nada sensible detrás
 * (siempre redirige al mismo perfil público de Google), así que el límite
 * solo está para frenar abuso automatizado, no para proteger datos.
 */
export const limitadorResena = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Inténtalo de nuevo en unos minutos.' },
});
