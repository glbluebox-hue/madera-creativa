import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Config de build para el despliegue combinado fuera de Bit (Render) — NO se
 * usa en desarrollo local, donde `bit run` sigue usando `vite.config.js` con
 * su propio proxy hacia el gateway de la plataforma. Aquí no hace falta
 * ningún proxy: en producción el frontend compilado lo sirve el mismo
 * proceso Express que atiende la API, mismo origen, sin gateway de por
 * medio (ver `FRONTEND_DIST_DIR` en `presupuestos-service.app-root.ts`).
 *
 * `publicDir` apunta a `public-render/` (generada por el script de build,
 * nunca versionada) en vez de a `assets/` — `assets/` mezcla imágenes que el
 * código importa como módulo ES (`import logo from './assets/logo.png'`,
 * que Vite ya procesa solo) con archivos que deben sevirse tal cual en rutas
 * absolutas (manifest.webmanifest, iconos PWA, sw.js). Usar `assets/`
 * directamente como publicDir copiaría también las imágenes importadas sin
 * necesidad; `public-render/` contiene únicamente la réplica exacta de lo
 * que debe quedar servible en la raíz.
 */
export default defineConfig({
  define: {
    __dirname: JSON.stringify('/'),
    __filename: JSON.stringify('/index.js'),
  },
  plugins: [react()],
  publicDir: 'public-render',
  build: {
    outDir: 'dist-render',
    emptyOutDir: true,
  },
});
