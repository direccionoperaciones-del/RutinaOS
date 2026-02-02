self.addEventListener('push', function(event) {
  let data = {};
  
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.error('Error parsing push data', e);
    data = { title: 'Movacheck', body: 'Tienes una nueva notificación' };
  }

  const title = data.title || 'Movacheck';
  const options = {
    body: data.body || 'Nueva actividad registrada.',
    icon: 'https://rnqbvurxhhxjdwarwmch.supabase.co/storage/v1/object/public/LogoMova/movacheck.jpeg?v=4',
    badge: 'https://rnqbvurxhhxjdwarwmch.supabase.co/storage/v1/object/public/LogoMova/movacheck.jpeg?v=4',
    data: {
      url: data.url || '/'
    },
    vibrate: [100, 50, 100],
    requireInteraction: false // Evita problemas en algunos navegadores que bloquean notificaciones persistentes
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  // Abrir la URL correspondiente
  const urlToOpen = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // 1. Si la app ya está abierta, enfocarla
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url && 'focus' in client) {
          return client.focus().then(() => client.navigate(urlToOpen));
        }
      }
      // 2. Si no, abrir nueva ventana
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});