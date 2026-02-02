self.addEventListener('push', function(event) {
  let data = {};
  
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.error('Error parsing push data', e);
    // Fallback básico si el JSON falla
    data = { 
      title: 'RunOp', 
      body: event.data ? event.data.text() : 'Nueva notificación recibida' 
    };
  }

  const title = data.title || 'RunOp';
  
  // URL del icono corregida al proyecto actual (lrnzxrrjcwkmwwldfdaq)
  // Usamos el mismo logo que en el manifest para consistencia
  const iconUrl = 'https://lrnzxrrjcwkmwwldfdaq.supabase.co/storage/v1/object/public/LogoApp/LogoRunop1.jpg';

  const options = {
    body: data.body || 'Nueva actividad registrada.',
    icon: iconUrl,
    badge: iconUrl, // En Android el badge debe ser monocromático idealmente, pero la URL válida evita el crash
    data: {
      url: data.url || '/'
    },
    vibrate: [100, 50, 100],
    tag: 'runop-notification', // Agrupa notificaciones similares
    renotify: true, // Vuelve a vibrar si hay una nueva
    requireInteraction: false,
    actions: [
      { action: 'open', title: 'Ver' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
      .catch(err => console.error('Error mostrando notificación:', err))
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  // Abrir la URL correspondiente
  const urlToOpen = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // 1. Si la app ya está abierta, enfocarla y navegar
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url && 'focus' in client) {
          return client.focus().then(c => c.navigate(urlToOpen));
        }
      }
      // 2. Si no, abrir nueva ventana
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Evento activate para limpiar cachés antiguos si fuera necesario
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});