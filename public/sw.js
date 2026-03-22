// Service Worker Robusto para RunOp PWA
// v2.1 - Enhanced Installability

const CACHE_NAME = 'runop-v1';
const DEFAULT_ICON = 'https://lrnzxrrjcwkmwwldfdaq.supabase.co/storage/v1/object/public/LogoApp/LogoRunop1.jpg';

self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activo y controlando clientes.');
  event.waitUntil(self.clients.claim());
});

// Evento fetch requerido para ser una PWA válida
self.addEventListener('fetch', (event) => {
  // Estrategia passthrough: no cacheamos nada por ahora para evitar conflictos
  return;
});

self.addEventListener('push', function(event) {
  console.log('[SW] 🔔 Evento Push Recibido');

  let notificationData = {
    title: 'Nueva Notificación RunOp',
    body: 'Tienes una actualización pendiente.',
    icon: DEFAULT_ICON,
    url: '/',
    tag: 'general'
  };

  if (event.data) {
    try {
      const payloadJson = event.data.json();
      notificationData = { ...notificationData, ...payloadJson };
    } catch (err) {
      const text = event.data.text();
      if (text) notificationData.body = text;
    }
  }

  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.icon,
    data: { url: notificationData.url },
    vibrate: [100, 50, 100],
    requireInteraction: true,
    tag: notificationData.tag,
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(notificationData.title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus().then(c => {
            if (c.url !== targetUrl) return c.navigate(targetUrl);
            return c;
          });
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});