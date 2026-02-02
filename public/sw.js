self.addEventListener('push', function(event) {
  console.log('[SW] 🔔 Push Recibido');

  // Payload por defecto
  let data = { 
    title: 'RunOp', 
    body: 'Tienes una nueva notificación.', 
    url: '/',
    icon: 'https://lrnzxrrjcwkmwwldfdaq.supabase.co/storage/v1/object/public/LogoApp/LogoRunop1.jpg'
  };

  if (event.data) {
    try {
      const json = event.data.json();
      data = { ...data, ...json };
    } catch (e) {
      console.log('[SW] Push es texto plano');
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.icon,
    data: { url: data.url },
    vibrate: [100, 50, 100],
    requireInteraction: true // Importante para que no desaparezca sola en algunos Android
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  // URL destino
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // 1. Enfocar pestaña existente si hay
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url && 'focus' in client) {
          return client.focus().then(c => c.navigate(targetUrl));
        }
      }
      // 2. Abrir nueva
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});