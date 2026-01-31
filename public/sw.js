self.addEventListener('push', function(event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.error('Error parsing push data', e);
    data = { title: 'Nueva notificación', body: 'Tienes una nueva actividad en Movacheck' };
  }

  const title = data.title || 'Movacheck';
  const options = {
    body: data.body || 'Tienes una nueva notificación.',
    icon: 'https://rnqbvurxhhxjdwarwmch.supabase.co/storage/v1/object/public/LogoMova/movacheck.jpeg?v=4',
    badge: 'https://rnqbvurxhhxjdwarwmch.supabase.co/storage/v1/object/public/LogoMova/movacheck.jpeg?v=4', // Badge monocromático idealmente
    data: {
      url: data.url || '/'
    },
    // Opciones críticas para asegurar atención
    requireInteraction: true, // No desaparece sola
    renotify: true, // Vibra/Suena aunque haya otra notificación
    tag: data.tag || 'movacheck-notification', // Agrupa si es necesario, o usa timestamp para únicas
    vibrate: [200, 100, 200],
    dir: 'auto',
    lang: 'es'
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // 1. Si ya hay una ventana abierta con esa URL, enfocarla
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // 2. Si hay una ventana abierta pero en otra URL, navegar
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('navigate' in client && 'focus' in client) {
          client.focus();
          return client.navigate(urlToOpen);
        }
      }
      // 3. Si no hay ventanas, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});