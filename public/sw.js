self.addEventListener('push', function(event) {
  console.log('[SW] PUSH RECEIVED', event); // <-- EVIDENCIA EN CONSOLA

  let data = { title: 'RunOp', body: 'Nueva notificación', url: '/' };

  try {
    if (event.data) {
      const textData = event.data.text();
      try {
        data = JSON.parse(textData);
      } catch (e) {
        console.warn('[SW] JSON inválido, usando texto plano');
        data.body = textData;
      }
    }
  } catch (e) {
    console.error('[SW] Error leyendo datos:', e);
  }

  const title = data.title || 'RunOp';
  
  // Icono seguro
  const iconUrl = 'https://lrnzxrrjcwkmwwldfdaq.supabase.co/storage/v1/object/public/LogoApp/LogoRunop1.jpg';

  const options = {
    body: data.body,
    icon: iconUrl,
    badge: iconUrl,
    data: { url: data.url },
    vibrate: [100, 50, 100],
    tag: 'runop-notification',
    renotify: true,
    requireInteraction: true 
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => console.log('[SW] showNotification resuelto exitosamente'))
      .catch(err => console.error('[SW] FALLO showNotification:', err))
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Click en notificación');
  event.notification.close();
  const urlToOpen = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url && 'focus' in client) {
          return client.focus().then(c => c.navigate(urlToOpen));
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});