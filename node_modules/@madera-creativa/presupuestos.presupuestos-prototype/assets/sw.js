// Service Worker para notificaciones push — Madera Creativa

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
