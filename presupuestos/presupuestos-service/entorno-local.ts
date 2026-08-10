import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as cargarDotenv } from 'dotenv';
import { logger } from './logger.service.js';

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
 * En producción no hace nada: las variables deben inyectarse directamente en
 * el entorno del proceso (paneles de Railway, Render, etc., tal como ya
 * documenta `MIGRACION.md`). Tampoco sobrescribe variables que el entorno ya
 * tuviera puestas — `dotenv.config()` nunca pisa un `process.env` existente.
 *
 * Debe llamarse antes de leer cualquier `process.env.*` en el arranque del
 * servicio (primera línea de `presupuestos-service.app-root.ts`).
 */
export function cargarVariablesEntornoLocal(): void {
  if (process.env.NODE_ENV === 'production') return;

  const candidatos = [
    resolve(process.cwd(), 'presupuestos/presupuestos-platform/.env'),
    resolve(process.cwd(), '.env'),
  ];
  const ruta = candidatos.find(existsSync);
  if (ruta) {
    cargarDotenv({ path: ruta, quiet: true });
  } else {
    logger.warn(
      { rutasProbadas: candidatos },
      '[entorno-local] No se encontró ningún .env en desarrollo local.'
    );
  }
}
