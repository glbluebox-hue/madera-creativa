import { BrowserRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { PresupuestosPrototype } from './presupuestos-prototype.js';
import { ErrorBoundary } from './error-boundary.js';
// Importar iconos PWA para que Vite los incluya en el build
import _icon192 from './assets/icon-192.png';
import _icon512 from './assets/icon-512.png';
import _icon180 from './assets/icon-180.png';
import _iconMaskable512 from './assets/icon-maskable-512.png';

// El manifest se entrega como URL `blob:` (más abajo) para poder usar las
// rutas de icono ya resueltas por Vite (con hash en producción) — pero un
// `blob:` no tiene una base válida para resolver rutas relativas: Chrome
// descartaba los 4 iconos con "URL is invalid" (comprobado con
// `Page.getAppManifest`) aunque los archivos en sí fueran correctos. Por
// eso cada `src` se convierte aquí a una URL absoluta.
const absoluta = (ruta: string) => new URL(ruta, window.location.origin).href;

// Inyectar manifest dinámico con las rutas reales de los iconos
const manifestData = {
  name: 'Madera Creativa Estudio',
  short_name: 'Madera Creativa',
  description: 'Gestión de clientes, proyectos y presupuestos de carpintería',
  start_url: 'https://estudio.maderacreativa.com',
  display: 'standalone',
  orientation: 'portrait-primary',
  background_color: '#ffffff',
  theme_color: '#51483F',
  lang: 'es',
  icons: [
    { src: absoluta(_icon192), sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: absoluta(_icon512), sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: absoluta(_iconMaskable512), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: absoluta(_icon180), sizes: '180x180', type: 'image/png', purpose: 'any' },
  ],
};
const blob = new Blob([JSON.stringify(manifestData)], { type: 'application/manifest+json' });
const manifestUrl = URL.createObjectURL(blob);
const existingManifest = document.querySelector('link[rel="manifest"]');
if (existingManifest) existingManifest.setAttribute('href', manifestUrl);

// Apple touch icon dinámico
const appleIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
if (appleIcon) appleIcon.href = _icon180;

// Registrar el service worker cuanto antes (Instalación móvil) — antes solo
// se registraba tras iniciar sesión, como parte del flujo de notificaciones
// push. La instalación como app y la reserva offline no deben depender de
// que el usuario haya aceptado notificaciones. `register()` es seguro de
// llamar dos veces: si `use-push.ts` ya lo registró, devuelve el mismo
// registro sin duplicar nada.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/assets/sw.js').catch(() => { /* no crítico */ });
}

if (import.meta.hot) {
  import.meta.hot.accept();
}

/**
 * Punto de entrada client-side — sin SSR.
 */
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <BrowserRouter>
      <ErrorBoundary>
        <PresupuestosPrototype />
      </ErrorBoundary>
    </BrowserRouter>
  );
}
