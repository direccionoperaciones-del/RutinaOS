self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [100, 50, 100],
      // Timestamp como tag fuerza que cada notif sea única y suene
      tag: 'movacheck-' + Date.now(), 
      renotify: true, // Importante: fuerza sonido/vibración de nuevo
      data: {
        url: data.url || '/'
      },
      actions: [
        { action: 'open', title: 'Ver ahora' }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      // Si la app ya está abierta, enfocarla
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no, abrir nueva ventana
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});