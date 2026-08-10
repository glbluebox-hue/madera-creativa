// Service Worker — Madera Creativa
// Notificaciones push (ya existía) + red primero con reserva en caché
// (nuevo, Instalación móvil): sin esto, un service worker sin ningún
// `fetch` no ofrece ninguna resiliencia offline y algunos navegadores no
// lo cuentan como señal de instalabilidad completa. Se usa "red primero"
// a propósito, no "caché primero": con la app todavía en desarrollo
// activo, cachear agresivamente mostraría versiones antiguas en el móvil
// después de cada cambio. La caché aquí es solo una reserva para cuando
// no hay red, no una estrategia de rendimiento — eso se revisará aparte,
// con `vite-plugin-pwa`, cuando la parte visual esté más asentada.
const CACHE = 'madera-shell-v2';
const RESERVA = ['/', '/manifest.webmanifest', '/assets/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(RESERVA)));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copia)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', (event) => {
  let datos = { titulo: 'Madera Creativa', cuerpo: 'Nueva notificación' };
  try {
    datos = JSON.parse(event.data.text());
  } catch {}

  event.waitUntil(
    self.registration.showNotification(datos.titulo || 'Madera Creativa', {
      body: datos.cuerpo || '',
      icon: '/assets/logo.png',
      badge: '/assets/logo.png',
      data: datos.datos || {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      if (cs.length > 0) {
        cs[0].focus();
      } else {
        clients.openWindow('/');
      }
    })
  );
});
