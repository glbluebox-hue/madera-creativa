#!/usr/bin/env node
/**
 * Backup manual de MongoDB Atlas (Incremento 1.6).
 *
 * El clúster de este proyecto está en un tier gratuito/compartido de Atlas
 * (M0/M2/M5), que NO incluye backups automáticos — esa función solo existe
 * desde M10 en adelante. Este script cubre ese hueco con un volcado manual
 * mediante `mongodump`, hasta que el volumen de datos real justifique subir
 * de tier o automatizar esto en un despliegue real.
 *
 * Requisito: tener instaladas las MongoDB Database Tools
 * (https://www.mongodb.com/try/download/database-tools) — `mongodump` es
 * una herramienta separada, no una dependencia de npm.
 *
 * Uso:
 *   node backup-mongo.mjs
 *
 * Genera un archivo `backups/backup-<fecha>.gz` (formato archive+gzip de
 * `mongodump`, restaurable con `mongorestore --gzip --archive=<archivo>`).
 * La carpeta `backups/` está excluida de git (ver `backups/.gitignore`):
 * un volcado completo de la base de datos son datos reales de clientes,
 * nunca debe subirse al repositorio.
 *
 * Deliberadamente solo local por ahora: subir el archivo a almacenamiento
 * en la nube se deja para el Incremento 1.7, que diseñará la capa de
 * almacenamiento desacoplada del proveedor concreto — hacerlo aquí antes
 * significaría construir una integración que ese incremento reemplazaría.
 *
 * Para restaurar un backup, sigue RESTAURAR-BACKUP.md (mismo directorio).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as cargarDotenv } from 'dotenv';

const carpetaScript = dirname(fileURLToPath(import.meta.url));
cargarDotenv({ path: resolve(carpetaScript, '.env'), quiet: true });

const url = process.env.MONGO_URL;
if (!url) {
  console.error('Falta MONGO_URL — revisa presupuestos-platform/.env (ver env.example).');
  process.exit(1);
}

const carpetaBackups = resolve(carpetaScript, 'backups');
if (!existsSync(carpetaBackups)) mkdirSync(carpetaBackups);

const fecha = new Date().toISOString().replace(/[:.]/g, '-');
const archivo = resolve(carpetaBackups, `backup-${fecha}.gz`);

console.log(`Generando backup en: ${archivo}`);
try {
  // stdio 'ignore' en los dos primeros canales y 'inherit' solo en stderr:
  // ni la entrada ni la salida estándar de mongodump pueden contener el URI,
  // pero por seguridad tampoco se vuelca el objeto de error de Node en caso
  // de fallo (sí incluye el comando completo, con la contraseña en claro).
  execFileSync('mongodump', ['--uri', url, `--archive=${archivo}`, '--gzip'], { stdio: ['ignore', 'inherit', 'inherit'] });
} catch {
  console.error(
    'Fallo al ejecutar mongodump. Comprueba que las MongoDB Database Tools están instaladas y en el PATH.'
  );
  process.exit(1);
}
console.log('Backup completado.');
