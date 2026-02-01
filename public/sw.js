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
      title: 'Nueva notificación', 
      body: 'Tienes una nueva actividad en Movacheck',
      url: '/'
    };
  }

  const title = data.title || 'Movacheck';
  
  // Configuración base segura
  const options = {
    body: data.body || 'Revisa tu actividad reciente.',
    // Icono principal (Logo app)
    icon: 'https://rnqbvurxhhxjdwarwmch.supabase.co/storage/v1/object/public/LogoMova/movacheck.jpeg?v=4',
    // Badge pequeño para barra de estado (Android) - Debe ser monocromático idealmente, o usa el mismo icono pequeño
    badge: 'https://rnqbvurxhhxjdwarwmch.supabase.co/storage/v1/object/public/LogoMova/movacheck.jpeg?v=4',
    data: {
      url: data.url || '/'
    },
    tag: 'movacheck-notification', // Reemplaza notificaciones viejas para no llenar la barra
    renotify: true, // Vuelve a sonar/vibrar si llega una nueva con el mismo tag
    vibrate: [100, 50, 100], // Patrón estándar
    requireInteraction: false, // Permitir que desaparezca sola para evitar bloqueos en algunos OS
    actions: [
      { action: 'open', title: 'Ver ahora' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
      .catch(err => {
        console.error('Error mostrando notificación con opciones completas, intentando modo simple:', err);
        // Fallback a modo texto puro si falla por imágenes
        return self.registration.showNotification(title, {
          body: options.body,
          data: options.data
        });
      })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  // URL destino
  const urlToOpen = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // 1. Si la app ya está abierta, enfocarla y navegar
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url && 'focus' in client) {
          // Si es la misma URL o interna, navegar
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