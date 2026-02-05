self.addEventListener('push', function(event) {
  console.log('[SW] 🔔 Push Recibido. Raw Data:', event.data ? event.data.text() : 'null');

  // Payload por defecto (Fallback robusto)
  let data = { 
    title: 'RunOp', 
    body: 'Tienes una nueva notificación.', 
    url: '/',
    icon: 'https://lrnzxrrjcwkmwwldfdaq.supabase.co/storage/v1/object/public/LogoApp/LogoRunop1.jpg'
  };

  if (event.data) {
    try {
      const json = event.data.json();
      // Mezclar con defaults para asegurar que title y body nunca sean undefined
      data = { ...data, ...json };
    } catch (e) {
      console.log('[SW] Push es texto plano o JSON inválido');
      data.body = event.data.text() || data.body;
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
      .then(() => console.log('[SW] Notificación mostrada:', data.title))
      .catch(err => console.error('[SW] Error mostrando notificación:', err))
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notificación clickeada');
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