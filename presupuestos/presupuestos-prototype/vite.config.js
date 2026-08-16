import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * En desarrollo, la app web y el backend corren por separado. El gateway de
 * la plataforma escucha en el puerto 5000 y enruta /<servicio>/... a cada
 * servicio. Redirigimos las llamadas /api/* del navegador al gateway,
 * quitando el prefijo /api (igual que hace el proxy de producción).
 */
export default defineConfig({
  define: {
    __dirname: JSON.stringify('/'),
    __filename: JSON.stringify('/index.js'),
  },
  plugins: [react()],
  server: {
    proxy: {
      // Solo rutas tipo /api/... (con barra) van al gateway; así evitamos
      // capturar módulos como /api.ts que sirve el propio Vite.
      '^/api/.*': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        // Reenvía la IP real del cliente (X-Forwarded-For) al backend —
        // sin esto, `app.set('trust proxy', 1)` no tiene nada que leer y
        // los limitadores por IP siguen viendo siempre 127.0.0.1.
        xfwd: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
