// Service Worker Robusto para RunOp PWA
// v2.0 - Debugging Mode

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

self.addEventListener('push', function(event) {
  console.log('[SW] 🔔 Evento Push Recibido');

  // 1. Datos de Fallback (Por si el payload viene vacío o corrupto)
  let notificationData = {
    title: 'Nueva Notificación RunOp',
    body: 'Tienes una actualización pendiente.',
    icon: DEFAULT_ICON,
    url: '/',
    tag: 'general'
  };

  // 2. Intentar parsear el payload
  if (event.data) {
    try {
      const payloadText = event.data.text();
      console.log('[SW] Raw Payload:', payloadText);
      
      const payloadJson = JSON.parse(payloadText);
      
      // Mezclar con fallback (prioridad al payload)
      notificationData = {
        ...notificationData,
        ...payloadJson
      };
      
      // Asegurar URL absoluta para el ícono si viene relativa
      if (notificationData.icon && !notificationData.icon.startsWith('http')) {
        notificationData.icon = DEFAULT_ICON;
      }

    } catch (err) {
      console.error('[SW] Error parseando JSON, usando texto plano o fallback:', err);
      // Si no es JSON, intentar usar el texto como body
      const text = event.data.text();
      if (text) notificationData.body = text;
    }
  } else {
    console.warn('[SW] Push recibido SIN DATOS. Usando fallback.');
  }

  // 3. Configurar opciones visuales
  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.icon, // Usar mismo icono para badge en Android
    data: { 
      url: notificationData.url,
      timestamp: Date.now()
    },
    vibrate: [100, 50, 100, 50, 100], // Patrón de vibración fuerte
    requireInteraction: true, // Mantiene la notificación visible hasta que el usuario interactúe
    tag: notificationData.tag, // Agrupa notificaciones similares
    renotify: true // Vuelve a vibrar si llega otra con el mismo tag
  };

  console.log('[SW] Mostrando notificación con opciones:', options);

  // 4. Ejecutar showNotification dentro de waitUntil (CRÍTICO)
  const notificationPromise = self.registration.showNotification(
    notificationData.title,
    options
  );

  event.waitUntil(notificationPromise);
});

self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Click en notificación', event.notification.data);
  
  event.notification.close();

  // URL destino o raíz por defecto
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  // Lógica para enfocar ventana existente o abrir nueva
  const clickPromise = clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  }).then((clientList) => {
    // 1. Buscar pestaña ya abierta
    for (const client of clientList) {
      // Si la URL coincide (o es la misma app), enfocar
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        return client.focus().then(c => {
          // Navegar a la URL específica si es diferente
          if (c.url !== targetUrl) {
            return c.navigate(targetUrl);
          }
          return c;
        });
      }
    }
    // 2. Si no hay pestaña, abrir nueva
    if (clients.openWindow) {
      return clients.openWindow(targetUrl);
    }
  });

  event.waitUntil(clickPromise);
});