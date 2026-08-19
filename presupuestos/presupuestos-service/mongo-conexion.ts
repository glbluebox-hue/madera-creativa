import mongoose from 'mongoose';

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

export async function conectarMongo(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  if (promesaConexion) { await promesaConexion; return; }
  const url = process.env.MONGO_URL || 'mongodb://localhost:27017/madera-creativa';
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
    .then(() => undefined)
    .finally(() => { promesaConexion = null; });
  await promesaConexion;
}
