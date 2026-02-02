self.addEventListener('push', function(event) {
  console.log('[SW] 🔔 PUSH RECIBIDO', event);

  // Datos por defecto para evitar errores si el payload está vacío
  let data = { title: 'RunOp', body: 'Nueva notificación', url: '/' };

  try {
    if (event.data) {
      // Intentamos leer como texto primero
      const rawText = event.data.text();
      console.log('[SW] Raw Data:', rawText);

      try {
        // Intentamos parsear JSON
        const json = JSON.parse(rawText);
        // Mezclamos con los defaults
        data = { ...data, ...json };
      } catch (e) {
        console.warn('[SW] JSON inválido, usando texto plano como cuerpo');
        data.body = rawText;
      }
    }
  } catch (err) {
    console.error('[SW] Error procesando datos del evento:', err);
  }

  // URL del icono fija para asegurar que siempre cargue
  const iconUrl = 'https://lrnzxrrjcwkmwwldfdaq.supabase.co/storage/v1/object/public/LogoApp/LogoRunop1.jpg';

  const options = {
    body: data.body,
    icon: iconUrl,
    badge: iconUrl,
    data: { url: data.url },
    vibrate: [100, 50, 100],
    tag: 'runop-notification', // Agrupa notificaciones
    renotify: true, // Vuelve a vibrar si llega una nueva con el mismo tag
    requireInteraction: true // Mantiene la notificación en pantalla hasta que el usuario interactúa
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => console.log('[SW] Notificación mostrada visualmente'))
      .catch(err => console.error('[SW] FALLO mostrando notificación:', err))
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Click en notificación');
  event.notification.close();
  
  // Normalizar URL (asegurar que sea absoluta)
  const urlToOpen = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // 1. Si ya hay una pestaña abierta con la app, enfocarla y navegar
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url && 'focus' in client) {
          return client.focus().then(c => c.navigate(urlToOpen));
        }
      }
      // 2. Si no, abrir una nueva ventana
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});