import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { PresupuestosPrototype } from './presupuestos-prototype.js';
import { PortalPresupuesto } from './portal-presupuesto.js';
import { ErrorBoundary } from './error-boundary.js';

// El manifest y los apple-touch-icon se sirven ESTÁTICOS desde index.html
// (/manifest.webmanifest, /assets/icon-*.png) — hasta ahora este archivo
// además generaba un segundo manifest en memoria (URL `blob:`) y
// sobrescribía con él el <link rel="manifest"> real, con la excusa de
// resolver los iconos a URL absoluta para un bug de Chrome ya no
// reproducible con el manifest estático servido por el propio backend.
// Ese manifest duplicado quedó desincronizado del real (seguía diciendo
// `background_color: '#ffffff'` cuando el real ya se cambió a crema) y es
// la causa raíz más probable de que Chrome nunca reconociera del todo la
// app como instalable — un manifest `blob:` inyectado tras la carga es un
// caso mucho menos fiable para la detección de instalabilidad que un
// `<link>` estático presente desde el primer HTML. Se elimina: el manifest
// estático ya trae los 4 iconos con rutas absolutas de sobra (`/assets/...`).

// Registrar el service worker cuanto antes (Instalación móvil) — antes solo
// se registraba tras iniciar sesión, como parte del flujo de notificaciones
// push. La instalación como app y la reserva offline no deben depender de
// que el usuario haya aceptado notificaciones. `register()` es seguro de
// llamar dos veces: si `use-push.ts` ya lo registró, devuelve el mismo
// registro sin duplicar nada.
if ('serviceWorker' in navigator) {
  // `scope: '/'` es imprescindible: el script vive en /assets/sw.js, y sin
  // scope explícito el navegador lo limita por defecto al directorio del
  // propio archivo (/assets/) — un service worker que no controla la raíz
  // de la app no cumple los requisitos de instalación como PWA, así que
  // Chrome ofrecía solo "Añadir a pantalla de inicio" (un acceso directo
  // simple) en vez de "Instalar", con un icono de repuesto genérico en vez
  // del icono real del manifest.
  navigator.serviceWorker.register('/assets/sw.js', { scope: '/' }).catch(() => { /* no crítico */ });
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
        {/* `/portal/:token` es la única ruta pública real de la app — el
            resto sigue navegando por estado interno (`seccion`), sin URLs
            propias. El catch-all ('*') es intencional: preserva el
            comportamiento de siempre para cualquier otra ruta. */}
        <Routes>
          <Route path="/portal/:token" element={<PortalPresupuesto />} />
          <Route path="*" element={<PresupuestosPrototype />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
