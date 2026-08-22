import mongoose from 'mongoose';
import { logger } from './logger.service.js';

/**
 * Punto único de conexión a MongoDB (19/08/2026).
 *
 * Antes, `conectar()` (cliente.model.ts) y `conectarUsuarios()`
 * (usuario.model.ts) llamaban CADA UNA a `mongoose.connect()` por su
 * cuenta, con la misma guarda insuficiente: `if (readyState === 1) return`.
 * Esa guarda solo descarta el caso "ya conectada del todo" — no cubre
 * "conectando ahora mismo" (readyState 2). Justo al arrancar el servidor,
 * varias peticiones llegan casi a la vez a rutas distintas (login, logout,
 * verificar, WebAuthn, empresa…): cada una veía `readyState !== 1` y
 * disparaba su propia llamada a `mongoose.connect()` sobre la misma
 * conexión por defecto, compitiendo entre sí. Confirmado con logs reales
 * de Render (`duracionMs`): varias peticiones que arrancaron casi al mismo
 * segundo tardaron 7-37s en responder, mientras que las que llegaron ya
 * con la conexión asentada tardaron 150-300ms.
 *
 * `promesaConexion` guarda la promesa EN CURSO (no solo el resultado), así
 * que cualquier llamada que llegue mientras la primera conexión todavía se
 * está estableciendo espera esa misma promesa en vez de abrir la suya.
 */
let promesaConexion: Promise<void> | null = null;

/**
 * Host(s) del clúster real de producción — cualquier intento de conectar a
 * uno de ellos fuera de `NODE_ENV=production` se rechaza (ver
 * `verificarAislamientoEntorno`). Aislamiento dev/test/producción,
 * 22/08/2026: hasta ahora el único `.env` de la máquina de desarrollo tenía
 * el `MONGO_URL` real de producción, así que CUALQUIER script o servidor
 * local (pruebas manuales, `bit run`, scripts sueltos) hablaba sin querer
 * con la base de datos real — origen directo de un incidente real esa
 * misma noche (un proceso de pruebas olvidado en segundo plano acumuló
 * 1531 conexiones abiertas contra producción durante 4 días hasta agotar
 * el límite del clúster).
 */
const HOSTS_PRODUCCION = ['qvszsal.mongodb.net'];

function esUrlDeProduccion(url: string): boolean {
  return HOSTS_PRODUCCION.some((host) => url.includes(host));
}

/**
 * Corta la conexión ANTES de intentarla si el destino es producción pero el
 * proceso no se está ejecutando como producción de verdad. `ALLOW_PROD_DB`
 * es el escape explícito para el puñado de casos legítimos (un script de
 * migración que declara a propósito que va a tocar producción, como ya
 * hace `migracion-proyectos.mjs` con `--confirmar-produccion`) — nunca
 * pensado para dejarse puesto en un `.env` de desarrollo habitual.
 */
export function verificarAislamientoEntorno(
  url: string,
  entorno: { nodeEnv?: string; allowProdDb?: string } = { nodeEnv: process.env.NODE_ENV, allowProdDb: process.env.ALLOW_PROD_DB }
): void {
  const esProduccion = entorno.nodeEnv === 'production';
  const permitidoExplicitamente = entorno.allowProdDb === 'true';
  if (!esProduccion && esUrlDeProduccion(url) && !permitidoExplicitamente) {
    throw new Error(
      'MONGO_URL apunta al clúster de PRODUCCIÓN (qvszsal.mongodb.net) pero NODE_ENV no es "production". ' +
        'Esto casi siempre es un .env de desarrollo/pruebas mal configurado — usa una base de datos separada ' +
        '(otro nombre de base dentro del mismo clúster, como mínimo). Si de verdad necesitas conectar a ' +
        'producción desde aquí a propósito, pon ALLOW_PROD_DB=true explícitamente.'
    );
  }
}

/**
 * Cuenta los intentos de conexión fallidos consecutivos — un servidor que
 * lleva minutos sin lograr conectar (Atlas caído, credenciales rotas, límite
 * de conexiones agotado…) debe quedar bien visible en los logs como algo
 * crítico, no colarse como un `warn` más entre miles de líneas. No reinicia
 * el proceso por sí solo (eso puede empeorar un incidente real si el propio
 * reinicio en bucle es lo que agota el límite de conexiones) — solo hace
 * imposible no darse cuenta.
 */
let fallosConsecutivos = 0;
const UMBRAL_ALERTA_CRITICA = 5;

export async function conectarMongo(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  if (promesaConexion) { await promesaConexion; return; }
  const url = process.env.MONGO_URL || 'mongodb://localhost:27017/madera-creativa';
  verificarAislamientoEntorno(url);
  promesaConexion = mongoose
    .connect(url, {
      maxPoolSize: 10,
      // Antes en 0: sin ninguna conexión mantenida viva, cada ráfaga de
      // peticiones tras >30s de inactividad (uso normal de un solo usuario
      // abriendo la app de vez en cuando) pagaba el coste completo de abrir
      // conexión nueva desde cero. Con 2 de mínimo, siempre hay conexiones
      // ya establecidas listas para usar.
      minPoolSize: 2,
      maxIdleTimeMS: 30_000,
      // Por defecto el driver espera hasta 30s intentando seleccionar
      // servidor antes de rendirse — encaja sospechosamente con varios
      // duracionMs reales vistos en los logs de Render (29-38s). Bajarlo
      // hace que un problema de conectividad real falle rápido y quede
      // claro en los logs, en vez de colarse como "lento" en silencio.
      serverSelectionTimeoutMS: 8_000,
    })
    .then(() => { fallosConsecutivos = 0; })
    .catch((err) => {
      fallosConsecutivos++;
      if (fallosConsecutivos >= UMBRAL_ALERTA_CRITICA) {
        logger.fatal(
          { fallosConsecutivos, err: err?.message },
          `[mongo] ${fallosConsecutivos} intentos de conexión fallidos seguidos — revisa el estado del clúster ` +
            'y el número de conexiones abiertas (ver scripts/diagnosticar-conexiones-mongo.ps1) antes de que se agoten.'
        );
      }
      throw err;
    })
    .finally(() => { promesaConexion = null; });
  await promesaConexion;
}

mongoose.connection.on('disconnected', () => {
  logger.warn('[mongo] Conexión perdida — Mongoose reintentará automáticamente en la próxima petición.');
});
mongoose.connection.on('error', (err) => {
  logger.error({ err: err?.message }, '[mongo] Error en la conexión ya establecida.');
});
