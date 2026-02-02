self.addEventListener('push', function(event) {
  console.log('[SW] Push recibido', event);

  let data = { title: 'RunOp', body: 'Nueva notificación', url: '/' };

  try {
    if (event.data) {
      const textData = event.data.text();
      console.log('[SW] Data raw:', textData);
      try {
        data = JSON.parse(textData);
      } catch (e) {
        console.warn('[SW] No es JSON válido, usando texto plano');
        data.body = textData;
      }
    }
  } catch (e) {
    console.error('[SW] Error parseando datos:', e);
  }

  const title = data.title || 'RunOp';
  
  // Icono seguro (bucket público verificado)
  const iconUrl = 'https://lrnzxrrjcwkmwwldfdaq.supabase.co/storage/v1/object/public/LogoApp/LogoRunop1.jpg';

  const options = {
    body: data.body,
    icon: iconUrl,
    badge: iconUrl,
    data: { url: data.url },
    vibrate: [100, 50, 100],
    tag: 'runop-notification',
    renotify: true,
    requireInteraction: true // Fuerza a que el usuario la cierre (ayuda en debug)
  };

  console.log('[SW] Mostrando notificación:', title, options);

  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => console.log('[SW] Notificación mostrada exitosamente'))
      .catch(err => {
        console.error('[SW] FALLO CRÍTICO mostrando notificación:', err);
        // Intento desesperado sin icono por si es error de red de imagen
        return self.registration.showNotification(title, { body: data.body });
      })
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Click en notificación', event);
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