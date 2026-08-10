import webpush from 'web-push';
import { logger } from './logger.service.js';

/**
 * Configura las claves VAPID para el envío de notificaciones push.
 * Las claves se leen de las variables de entorno VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY.
 */
/** Limpia una clave VAPID eliminando caracteres no válidos (espacios, comas, signos =). */
function limpiarClave(clave: string): string {
  return clave.trim().replace(/[=,\s]/g, '');
}

export function configurarVapid(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;
  try {
    webpush.setVapidDetails(
      'mailto:holamaderacreativa@gmail.com',
      limpiarClave(publicKey),
      limpiarClave(privateKey)
    );
  } catch (err) {
    logger.warn({ err }, 'VAPID no configurado');
  }
}

/** Tipo de suscripción push compatible con web-push. */
export type PushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

/**
 * Envía una notificación push a una suscripción.
 * @param sub Suscripción del dispositivo destino.
 * @param titulo Título de la notificación.
 * @param cuerpo Cuerpo del mensaje.
 * @param datos Datos adicionales opcionales.
 */
export async function enviarNotificacion(
  sub: PushSub,
  titulo: string,
  cuerpo: string,
  datos?: Record<string, unknown>
): Promise<void> {
  try {
    await webpush.sendNotification(
      sub,
      JSON.stringify({ titulo, cuerpo, datos })
    );
  } catch (err: any) {
    // 410 Gone = suscripción expirada, ignorar
    if (err?.statusCode !== 410) {
      logger.error({ err }, 'Error enviando push');
    }
  }
}

/**
 * Genera un par de claves VAPID nuevas.
 * Usar solo una vez para generar las claves y guardarlas en las variables de entorno.
 */
export function generarClaves(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}
