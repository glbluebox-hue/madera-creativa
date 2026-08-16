import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as cargarDotenv } from 'dotenv';
import { logger } from './logger.service.js';

/**
 * Busca `presupuestos/presupuestos-platform/.env` subiendo desde `desde`
 * directorio a directorio (hasta `maxNiveles`) — cubre tanto el caso de
 * ejecutar desde la raíz del workspace como desde cualquier subcarpeta.
 */
function buscarEnvHaciaArriba(desde: string, maxNiveles = 8): string | null {
  let dir = desde;
  for (let i = 0; i < maxNiveles; i++) {
    const candidato = resolve(dir, 'presupuestos/presupuestos-platform/.env');
    if (existsSync(candidato)) return candidato;
    const directo = resolve(dir, '.env');
    if (existsSync(directo) && dir.endsWith('presupuestos-platform')) return directo;
    const padre = dirname(dir);
    if (padre === dir) break; // raíz del sistema de archivos
    dir = padre;
  }
  return null;
}

/**
 * Carga variables de entorno desde un archivo `.env` para desarrollo local.
 *
 * La plataforma Bit (`@bitdev/platforms.platform`) no ofrece ningún mecanismo
 * propio para cargar `.env`: su orquestador solo propaga el `process.env` que
 * ya tenía el proceso que ejecutó `bit run` (confirmado leyendo su código
 * fuente, `backend-orchestrator-source.js` — `const baseEnv = { ...process.env }`,
 * sin ninguna lectura de `.env` en ningún punto). Esta función rellena ese
 * hueco únicamente en desarrollo local.
 *
 * Bug real encontrado y corregido (auditoría 12/08/2026, "IA lentísima"):
 * las dos rutas candidatas originales eran relativas a `process.cwd()` — pero
 * el runner de `bit run` (`bitdev.node/node-server`) NO ejecuta el proceso
 * con `cwd` en la raíz del workspace, así que ambas rutas fallaban en
 * silencio, `OPENAI_API_KEY` nunca se cargaba, cada llamada a OpenAI fallaba
 * de inmediato ("OPENAI_API_KEY no está configurada."), y el sistema caía
 * en el siguiente candidato de la cadena de fallback — Ollama local en CPU,
 * 40-120 segundos por respuesta (confirmado revisando `IaUsoModel` en
 * Mongo: 100% de las llamadas reales fallaban en OpenAI y acababan en
 * Ollama). Ahora se busca también subiendo desde `process.cwd()` y desde la
 * carpeta del propio módulo (`import.meta.url`), cubriendo el caso real.
 *
 * En producción no hace nada: las variables deben inyectarse directamente en
 * el entorno del proceso (paneles de Railway, Render, etc., tal como ya
 * documenta `MIGRACION.md`). Tampoco sobrescribe variables que el entorno ya
 * tuviera puestas — `dotenv.config()` nunca pisa un `process.env` existente.
 *
 * Debe llamarse antes de leer cualquier `process.env.*` en el arranque del
 * servicio (primera línea de `presupuestos-service.app-root.ts`).
 *
 * Deliberadamente sin `import.meta.url`/`__dirname`: este módulo se compila
 * a veces a CommonJS (`.cjs`, el runtime real de `bit run`) — `import.meta.url`
 * no existe ahí y hacía CRASHEAR el arranque del servidor por completo
 * ("TypeError: Received undefined" en `fileURLToPath`), bug real introducido
 * en la corrección anterior de este mismo archivo y encontrado el 12/08/2026
 * al diagnosticar por qué el backend se quedaba sin arrancar nunca. Todo el
 * cuerpo va en un `try/catch` además, para que cargar el `.env` (una
 * comodidad de desarrollo) nunca pueda tirar abajo el arranque del servicio
 * real por ningún motivo inesperado.
 */
export function cargarVariablesEntornoLocal(): void {
  if (process.env.NODE_ENV === 'production') return;

  try {
    const ruta =
      buscarEnvHaciaArriba(process.cwd()) ??
      [resolve(process.cwd(), 'presupuestos/presupuestos-platform/.env'), resolve(process.cwd(), '.env')].find(existsSync);

    if (ruta) {
      cargarDotenv({ path: ruta, quiet: true });
    } else {
      logger.warn(
        { cwd: process.cwd() },
        '[entorno-local] No se encontró ningún .env en desarrollo local — se buscó subiendo desde cwd.'
      );
    }
  } catch (err) {
    logger.warn({ err }, '[entorno-local] Fallo al buscar/cargar el .env local — se continúa sin él.');
  }
}
