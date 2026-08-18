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
const CACHE = 'madera-shell-v4';
const RESERVA = ['/', '/manifest.webmanifest', '/assets/icon-192.png'];

// `skipWaiting` + `clients.claim()` (18/08/2026): sin esto, un service
// worker nuevo se queda "esperando" hasta que se cierran TODAS las
// pestañas/instancias que controlaba el anterior — con la app instalada
// como PWA en el móvil, eso en la práctica significa que un despliegue
// nuevo no se nota hasta cerrar la app del todo y reabrirla, y mientras
// tanto la pestaña ya abierta sigue sirviendo JS/CSS de la versión
// anterior de en medio de una sesión activa. Esto explica dos síntomas
// reales reportados el mismo día: un botón nuevo ("Generar enlace") que
// no aparecía tras desplegarlo, y el logo mostrándose un instante con un
// tamaño y luego cambiando a otro (contenido nuevo y viejo mezclado
// mientras la pestaña seguía bajo el control del service worker
// anterior). Con esto, cada despliegue nuevo toma el control de
// inmediato, sin esperar a un cierre completo.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(RESERVA)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
    ])
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Ahora que el service worker controla toda la app (antes su alcance
  // quedaba accidentalmente limitado a /assets/, ver registro en
  // presupuestos-prototype.app-root.tsx), este handler pasaría por aquí
  // también las llamadas `fetch()` de la propia app a la API (clientes,
  // facturas, usuarios...) — el despliegue combinado no usa ningún prefijo
  // que las distinga por URL. Solo se reserva la carcasa de la app
  // (navegación + JS/CSS/imágenes/fuentes); cualquier otra petición GET
  // (la API) va directa a red, sin pasar nunca por la caché, para que no
  // quede ningún dato de cliente/factura guardado en el dispositivo.
  const esNavegacion = event.request.mode === 'navigate';
  const esRecursoEstatico = ['style', 'script', 'image', 'font'].includes(event.request.destination);
  if (!esNavegacion && !esRecursoEstatico) return;

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
      // `logo.png` es el rótulo horizontal de la marca (1540×554) — pensado
      // para la barra lateral, no para un icono. `icon-512` es el icono
      // grande a color que se ve dentro de la notificación ya desplegada.
      //
      // `badge` es distinto: es el icono pequeño de la barra de estado de
      // Android, y el sistema lo pinta SIEMPRE monocromo a partir del canal
      // alfa — cualquier píxel opaco se vuelve blanco sólido, sea cual sea
      // su color, y lo transparente desaparece. `icon-192.png` tiene fondo
      // opaco (crema): ese fondo entero se pintaba blanco sólido, un
      // cuadrado en blanco sin forma. `icono-huella.png`/`d-huella.png`
      // tampoco sirven pese a estar en formato RGBA: comprobado píxel a
      // píxel, el 100% de su canal alfa es 255 (opacos del todo, sin
      // transparencia real) — mismo problema, un rectángulo blanco liso
      // (reportado 18/08/2026, dos capturas reales: tablet y móvil).
      // `icono-huella-badge.png` es nuevo, generado a partir de
      // `icon-512.png` calculando el alfa por luminancia (fondo crema →
      // transparente, tinta oscura → opaco) — con transparencia real
      // comprobada, Android ya puede recortar la silueta de verdad.
      icon: '/assets/icon-512.png',
      badge: '/assets/icono-huella-badge.png',
      data: datos.datos || {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // El recordatorio de horas es genérico ("N proyectos sin horas hoy"),
  // sin un cliente concreto al que llevar directamente — se lleva a
  // Clientes para que el usuario elija cuál (petición del usuario,
  // 18/08/2026: "que se vaya a clientes... donde yo elijo el cliente").
  // Con una pestaña ya abierta no sirve `clients.openWindow` (abriría una
  // segunda), así que se le manda un mensaje a la pestaña existente en vez
  // de navegarla directamente aquí.
  const irAClientes = event.notification.data?.tipo === 'recordatorio-horas';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      if (cs.length > 0) {
        if (irAClientes) cs[0].postMessage({ tipo: 'ir-a-clientes' });
        cs[0].focus();
      } else {
        clients.openWindow(irAClientes ? '/?accion=clientes' : '/');
      }
    })
  );
});
