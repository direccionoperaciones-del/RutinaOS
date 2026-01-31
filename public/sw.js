self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body,
      icon: 'https://rnqbvurxhhxjdwarwmch.supabase.co/storage/v1/object/public/LogoMova/movacheck.jpeg?v=4', // Icono absoluto para asegurar carga
      badge: '/icon-192.png', // Badge monocromático (Android standard)
      
      // --- SONIDO Y VIBRACIÓN AGRESIVA ---
      vibrate: [200, 100, 200, 100, 200], // Vibración larga-corta-larga (SOS style)
      renotify: true, // IMPORTANTE: Fuerza a sonar aunque haya notificaciones previas
      tag: 'movacheck-alert-' + Date.now(), // Tag único fuerza nueva alerta visual y sonora
      silent: false, // Explicito: NO silencioso
      
      // --- VISIBILIDAD ---
      requireInteraction: true, // La notificación no desaparece sola, obliga al usuario a verla
      
      data: {
        url: data.url || '/'
      },
      actions: [
        { action: 'open', title: '👀 Ver Detalles' }
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
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Intentar enfocar ventana existente
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.includes(event.notification.data.url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no, abrir nueva
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});